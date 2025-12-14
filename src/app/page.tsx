/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import {
  AlertTriangle, // Icon for error messages
  Brain,
  Calendar,
  ChevronRight,
  Film,
  Loader2, // [滚动恢复整合] 引入加载图标
  Play,
  Sparkles,
  Tv,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation'; // [滚动恢复整合] 引入 usePathname
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
// 客户端收藏 API
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanCategories, getDoubanDetails } from '@/lib/douban.client'; // 引入 getDoubanDetails
// 引入 Zod Schema 用于数据校验
import { BangumiItemSchema } from '@/lib/schemas';
import { cleanExpiredCache } from '@/lib/shortdrama-cache';
import { getRecommendedShortDramas } from '@/lib/shortdrama.client';
import { DoubanItem, ShortDramaItem, ReleaseCalendarItem } from '@/lib/types'; // 引入 ReleaseCalendarItem
// [滚动恢复整合] 引入核心Hook
import {
  RestorableData,
  useScrollRestoration,
} from '@/lib/useScrollRestoration';

import AIRecommendModal from '@/components/AIRecommendModal';
import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import HeroBanner from '@/components/HeroBanner'; // 引入HeroBanner组件
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import SectionTitle from '@/components/SectionTitle';
import ShortDramaCard from '@/components/ShortDramaCard';
import { useSite } from '@/components/SiteProvider';
import SkeletonCard from '@/components/SkeletonCard';
import { TelegramWelcomeModal } from '@/components/TelegramWelcomeModal'; // 引入Telegram欢迎弹窗
import VideoCard from '@/components/VideoCard';

// Type definition for favorite items
type FavoriteItem = {
  id: string;
  source: string;
  title: string;
  poster: string;
  episodes: number;
  source_name: string;
  currentEpisode?: number;
  search_title?: string;
  origin?: 'vod' | 'live';
  year?: string;
};

// [滚动恢复整合] 定义需要缓存的状态接口
interface RestorableHomeData extends RestorableData {
  activeTab: 'home' | 'favorites';
  favoriteItems: FavoriteItem[];
  items: any[];
  hasNextPage: boolean;
  primarySelection: string;
  secondarySelection: string;
  multiLevelValues: Record<string, string>;
  selectedWeekday: string;
}

// Constants for better maintainability
const SKELETON_CARD_COUNT = 8;
const TAB_OPTIONS = [
  { label: '首页', value: 'home' },
  { label: '收藏夹', value: 'favorites' },
];

// Sub-component for rendering the "Favorites" tab view
const FavoritesView = ({
  items,
  onNavigate, // [滚动恢复整合] 接收 onNavigate 回调
}: {
  items: FavoriteItem[];
  onNavigate: () => void; // [滚动恢复整合] 定义 onNavigate 类型
}) => {
  const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'movie' | 'tv' | 'anime' | 'shortdrama' | 'live' | 'variety'>('all');
  const [favoriteSortBy, setFavoriteSortBy] = useState<'recent' | 'title' | 'rating'>('recent');

  const handleClearFavorites = useCallback(async () => {
    // A confirmation could be added here in a real app
    if (confirm('确定要清空所有收藏吗？')) {
      await clearAllFavorites();
      // The parent component will receive the update via subscription, no need to setItems here
    }
  }, []);

  const filteredAndSortedItems = (() => {
    let filtered = items;
    if (favoriteFilter === 'movie') {
      filtered = items.filter(item => {
        if (item.type) return item.type === 'movie';
        if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
        if (item.source === 'bangumi') return false;
        if (item.origin === 'live') return false;
        return item.episodes === 1;
      });
    } else if (favoriteFilter === 'tv') {
      filtered = items.filter(item => {
        if (item.type) return item.type === 'tv';
        if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
        if (item.source === 'bangumi') return false;
        if (item.origin === 'live') return false;
        return item.episodes > 1;
      });
    } else if (favoriteFilter === 'anime') {
      filtered = items.filter(item => {
        if (item.type) return item.type === 'anime';
        return item.source === 'bangumi';
      });
    } else if (favoriteFilter === 'shortdrama') {
      filtered = items.filter(item => {
        if (item.type) return item.type === 'shortdrama';
        return item.source === 'shortdrama' || item.source_name === '短剧';
      });
    } else if (favoriteFilter === 'live') {
      filtered = items.filter(item => item.origin === 'live');
    } else if (favoriteFilter === 'variety') {
      filtered = items.filter(item => {
        if (item.type) return item.type === 'variety';
        return false;
      });
    }

    if (favoriteSortBy === 'title') {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    }
    // 'recent' is the default sort (by save_time), so no extra sorting needed.
    return filtered;
  })();

  const stats = {
    total: items.length,
    movie: items.filter(item => {
      if (item.type) return item.type === 'movie';
      if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
      if (item.source === 'bangumi') return false;
      if (item.origin === 'live') return false;
      return item.episodes === 1;
    }).length,
    tv: items.filter(item => {
      if (item.type) return item.type === 'tv';
      if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
      if (item.source === 'bangumi') return false;
      if (item.origin === 'live') return false;
      return item.episodes > 1;
    }).length,
    anime: items.filter(item => {
      if (item.type) return item.type === 'anime';
      return item.source === 'bangumi';
    }).length,
    shortdrama: items.filter(item => {
      if (item.type) return item.type === 'shortdrama';
      return item.source === 'shortdrama' || item.source_name === '短剧';
    }).length,
    live: items.filter(item => item.origin === 'live').length,
    variety: items.filter(item => {
      if (item.type) return item.type === 'variety';
      return false;
    }).length,
  };

  return (
    <section className='mb-8'>
      <div className='mb-6 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          我的收藏
        </h2>
        {items.length > 0 && (
          <button
            className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
            onClick={handleClearFavorites}
          >
            清空收藏
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className='mb-4 flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400'>
          <span className='px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full'>
            共 <strong className='text-gray-900 dark:text-gray-100'>{stats.total}</strong> 项
          </span>
          {stats.movie > 0 && (
            <span className='px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full'>
              电影 {stats.movie}
            </span>
          )}
          {stats.tv > 0 && (
            <span className='px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-full'>
              剧集 {stats.tv}
            </span>
          )}
          {stats.anime > 0 && (
            <span className='px-3 py-1 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 rounded-full'>
              动漫 {stats.anime}
            </span>
          )}
          {stats.shortdrama > 0 && (
            <span className='px-3 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 rounded-full'>
              短剧 {stats.shortdrama}
            </span>
          )}
          {stats.live > 0 && (
            <span className='px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-full'>
              直播 {stats.live}
            </span>
          )}
          {stats.variety > 0 && (
            <span className='px-3 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-full'>
              综艺 {stats.variety}
            </span>
          )}
        </div>
      )}
      
      {items.length > 0 && (
        <div className='mb-4 flex flex-wrap gap-2'>
          {[
            { key: 'all' as const, label: '全部', icon: '📚' },
            { key: 'movie' as const, label: '电影', icon: '🎬' },
            { key: 'tv' as const, label: '剧集', icon: '📺' },
            { key: 'anime' as const, label: '动漫', icon: '🎌' },
            { key: 'shortdrama' as const, label: '短剧', icon: '🎭' },
            { key: 'live' as const, label: '直播', icon: '📡' },
            { key: 'variety' as const, label: '综艺', icon: '🎪' },
          ].map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setFavoriteFilter(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                favoriteFilter === key
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg scale-105'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span className='mr-1'>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className='mb-4 flex items-center gap-2 text-sm'>
          <span className='text-gray-600 dark:text-gray-400'>排序：</span>
          <div className='flex gap-2'>
            {[
              { key: 'recent' as const, label: '最近添加' },
              { key: 'title' as const, label: '标题 A-Z' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFavoriteSortBy(key)}
                className={`px-3 py-1 rounded-md transition-colors ${
                  favoriteSortBy === key
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
        {filteredAndSortedItems.length > 0 ? (
          filteredAndSortedItems.map((item) => {
            let calculatedRemarks = item.remarks;
            if (item.releaseDate) {
              const now = new Date();
              const releaseDate = new Date(item.releaseDate);
              const daysDiff = Math.ceil((releaseDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              if (daysDiff < 0) {
                calculatedRemarks = `已上映${Math.abs(daysDiff)}天`;
              } else if (daysDiff === 0) {
                calculatedRemarks = '今日上映';
              } else {
                calculatedRemarks = `${daysDiff}天后上映`;
              }
            }
            return (
              <div key={item.id + item.source} className='w-full'>
                <VideoCard
                  query={item.search_title}
                  {...item}
                  from='favorite'
                  remarks={calculatedRemarks}
                  onNavigate={onNavigate} // [滚动恢复整合] 传递 onNavigate
                />
              </div>
            );
          })
        ) : (
          <div className='col-span-full flex flex-col items-center justify-center py-16 px-4'>
            {/* SVG 插画 - 空收藏夹 */}
            <div className='mb-6 relative'>
              <div className='absolute inset-0 bg-gradient-to-r from-pink-300 to-purple-300 dark:from-pink-600 dark:to-purple-600 opacity-20 blur-3xl rounded-full animate-pulse'></div>
              <svg
                className='w-32 h-32 relative z-10'
                viewBox='0 0 200 200'
                fill='none'
                xmlns='http://www.w3.org/2000/svg'
              >
                {/* 心形主体 */}
                <path
                  d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
                  className='fill-gray-300 dark:fill-gray-600 stroke-gray-400 dark:stroke-gray-500 transition-colors duration-300'
                  strokeWidth='3'
                />
                {/* 虚线边框 */}
                <path
                  d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2'
                  strokeDasharray='5,5'
                  className='text-gray-400 dark:text-gray-500'
                />
              </svg>
            </div>
            {/* 文字提示 */}
            <h3 className='text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2'>
              收藏夹空空如也
            </h3>
            <p className='text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs'>
              快去发现喜欢的影视作品，点击 ❤️ 添加到收藏吧！
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

// Helper component for displaying error states in sections
const ErrorState = ({ message = '内容加载失败' }: { message?: string }) => (
  <div className='flex items-center justify-center w-full h-40 bg-gray-100 dark:bg-gray-800 rounded-lg'>
    <div className='text-center text-gray-500 dark:text-gray-400'>
      <AlertTriangle className='mx-auto h-8 w-8 mb-2' />
      <p>{message}</p>
    </div>
  </div>
);

// Sub-component for rendering the "Home" tab view
const HomeView = ({
  hotMovies,
  hotTvShows,
  hotVarietyShows,
  hotShortDramas,
  bangumiCalendarData,
  upcomingReleases,
  loadingStates,
  errorStates,
  onNavigate, // [滚动恢复整合] 接收 onNavigate 回调
  saveScrollState
}: {
  hotMovies: DoubanItem[];
  hotTvShows: DoubanItem[];
  hotVarietyShows: DoubanItem[];
  hotShortDramas: ShortDramaItem[];
  bangumiCalendarData: BangumiCalendarData[];
  upcomingReleases: ReleaseCalendarItem[];
  loadingStates: Record<string, boolean>;
  errorStates: Record<string, boolean>;
  onNavigate: () => void; // [滚动恢复整合] 定义 onNavigate 类型
  saveScrollState: () => void;
}) => {
  return (
    <>
      {/* Hero Banner 轮播 */}
      {!loadingStates.movies && !loadingStates.tvShows && (hotMovies.length > 0 || hotTvShows.length > 0) && (
        <section className='mb-8'>
          <HeroBanner
            items={[
              ...hotMovies.slice(0, 2).map((movie) => ({
                id: movie.id,
                title: movie.title,
                poster: movie.poster,
                description: movie.plot_summary,
                year: movie.year,
                rate: movie.rate,
                douban_id: Number(movie.id),
                type: 'movie',
              })),
              ...hotTvShows.slice(0, 2).map((show) => ({
                id: show.id,
                title: show.title,
                poster: show.poster,
                description: show.plot_summary,
                year: show.year,
                rate: show.rate,
                douban_id: Number(show.id),
                type: 'tv',
              })),
              ...hotVarietyShows.slice(0, 1).map((show) => ({
                id: show.id,
                title: show.title,
                poster: show.poster,
                description: show.plot_summary,
                year: show.year,
                rate: show.rate,
                douban_id: Number(show.id),
                type: 'variety',
              })),
              ...hotShortDramas.slice(0, 2).map((drama) => ({
                id: drama.id,
                title: drama.name,
                poster: drama.cover,
                description: drama.description,
                year: '',
                rate: drama.score ? drama.score.toString() : '',
                type: 'shortdrama',
              })),
              ...(bangumiCalendarData.length > 0
                ? (() => {
                    const today = new Date();
                    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const currentWeekday = weekdays[today.getDay()];
                    const todayAnimes = bangumiCalendarData.find(
                      (item) => item.weekday.en === currentWeekday
                    )?.items || [];
                    return todayAnimes.slice(0, 1).map((anime: any) => ({
                      id: anime.id,
                      title: anime.name_cn || anime.name,
                      poster: anime.images?.large || anime.images?.common || anime.images?.medium || '/placeholder-poster.jpg',
                      description: anime.summary,
                      year: anime.air_date?.split('-')?.[0] || '',
                      rate: anime.rating?.score?.toFixed(1) || '',
                      douban_id: anime.id,
                      type: 'anime',
                    }));
                  })()
                : [])
            ]}
            autoPlayInterval={5000}
            showControls={true}
            showIndicators={true}
          />
        </section>
      )}

      {/* 继续观看 */}
      <ContinueWatching />

      {/* 即将上映 */}
      {upcomingReleases.length > 0 && (
        <section className='mb-8'>
          <div className='mb-4 flex items-center justify-between'>
            <SectionTitle title="即将上映" icon={Calendar} iconColor="text-orange-500" />
            <Link
              href='/release-calendar'
              className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
            >
              查看更多
              <ChevronRight className='w-4 h-4 ml-1' />
            </Link>
          </div>
          <ScrollableRow>
            {upcomingReleases.map((release: any, index) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const releaseDate = new Date(release.releaseDate);
              const daysDiff = Math.ceil((releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              let remarksText;
              if (daysDiff < 0) {
                remarksText = `已上映${Math.abs(daysDiff)}天`;
              } else if (daysDiff === 0) {
                remarksText = '今日上映';
              } else {
                remarksText = `${daysDiff}天后上映`;
              }
              return (
                <div key={`${release.id}-${index}`} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                  <VideoCard
                    source='upcoming_release'
                    id={release.id}
                    source_name='即将上映'
                    from='douban'
                    title={release.title}
                    poster={release.cover || '/placeholder-poster.jpg'}
                    year={release.releaseDate.split('-')[0]}
                    type={release.type}
                    remarks={remarksText}
                    query={release.title}
                    episodes={release.type === 'tv' ? 99 : 1}
                    onNavigate={saveScrollState}
                  />
                </div>
              );
            })}
          </ScrollableRow>
        </section>
      )}

      {/* 热门电影 */}
      <section className='mb-8'>
        <div className='mb-4 flex items-center justify-between'>
          <SectionTitle title='热门电影' icon={Film} iconColor='text-red-500' />
          <Link
            href='/douban?type=movie'
            className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
          >
            查看更多
            <ChevronRight className='w-4 h-4 ml-1' />
          </Link>
        </div>
        <ScrollableRow>
          {loadingStates.movies ? (
            Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
              <SkeletonCard key={index} />
            ))
          ) : errorStates.movies ? (
            <ErrorState />
          ) : (
            hotMovies.map((movie, index) => (
              <div
                key={index}
                className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
              >
                <VideoCard
                  from='douban'
                  title={movie.title}
                  poster={movie.poster}
                  douban_id={Number(movie.id)}
                  rate={movie.rate}
                  year={movie.year}
                  type='movie'
                  onNavigate={onNavigate} // [滚动恢复整合] 传递 onNavigate
                />
              </div>
            ))
          )}
        </ScrollableRow>
      </section>

      {/* 热门剧集 */}
      <section className='mb-8'>
        <div className='mb-4 flex items-center justify-between'>
          <SectionTitle title='热门剧集' icon={Tv} iconColor='text-blue-500' />
          <Link
            href='/douban?type=tv'
            className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
          >
            查看更多
            <ChevronRight className='w-4 h-4 ml-1' />
          </Link>
        </div>
        <ScrollableRow>
          {loadingStates.tvShows ? (
            Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
              <SkeletonCard key={index} />
            ))
          ) : errorStates.tvShows ? (
            <ErrorState />
          ) : (
            hotTvShows.map((show, index) => (
              <div
                key={index}
                className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
              >
                <VideoCard
                  from='douban'
                  title={show.title}
                  poster={show.poster}
                  douban_id={Number(show.id)}
                  rate={show.rate}
                  year={show.year}
                  onNavigate={onNavigate} // [滚动恢复整合] 传递 onNavigate
                />
              </div>
            ))
          )}
        </ScrollableRow>
      </section>

      {/* 每日新番放送 */}
      <section className='mb-8'>
        <div className='mb-4 flex items-center justify-between'>
          <SectionTitle
            title='新番放送'
            icon={Calendar}
            iconColor='text-purple-500'
          />
          <Link
            href='/douban?type=anime'
            className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
          >
            查看更多
            <ChevronRight className='w-4 h-4 ml-1' />
          </Link>
        </div>
        <ScrollableRow>
          {loadingStates.bangumi ? (
            Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
              <SkeletonCard key={index} />
            ))
          ) : errorStates.bangumi ? (
            <ErrorState />
          ) : (
            (() => {
              // 获取当前日期对应的星期
              const today = new Date();
              const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              const currentWeekday = weekdays[today.getDay()];

              // 找到当前星期对应的番剧数据
              const rawTodayAnimes =
                bangumiCalendarData.find(
                  (item) => item.weekday.en === currentWeekday
                )?.items || [];

              // 使用 Zod 安全解析和过滤数据
              const safeTodayAnimes = rawTodayAnimes.flatMap((anime: any) => {
                try {
                  // 验证每一项数据，不符合格式的将被跳过
                  return [BangumiItemSchema.parse(anime)];
                } catch (error) {
                  console.error(
                    'Bangumi item validation failed, skipping:',
                    anime,
                    error
                  );
                  return []; // 验证失败，返回空数组，flatMap 会自动移除它
                }
              });
              return safeTodayAnimes.length > 0 ? (
                safeTodayAnimes.map((anime, index) => (
                  <div
                    key={`${anime.id}-${index}`}
                    className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                  >
                    <VideoCard
                      from='douban'
                      title={anime.name_cn || anime.name}
                      poster={
                        anime.images?.large ||
                        anime.images?.common ||
                        anime.images?.medium ||
                        anime.images?.small ||
                        anime.images?.grid ||
                        '/placeholder-poster.jpg'
                      }
                      douban_id={anime.id}
                      rate={anime.rating?.score?.toFixed(1) || ''}
                      year={anime.air_date?.split('-')?.[0] || ''}
                      isBangumi={true}
                      onNavigate={onNavigate} // [滚动恢复整合] 传递 onNavigate
                    />
                  </div>
                ))
              ) : (
                <div className='flex items-center justify-center w-full h-40 text-gray-500 dark:text-gray-400'>
                  今日暂无新番放送
                </div>
              );
            })()
          )}
        </ScrollableRow>
      </section>

      {/* 热门综艺 */}
      <section className='mb-8'>
        <div className='mb-4 flex items-center justify-between'>
          <SectionTitle
            title='热门综艺'
            icon={Sparkles}
            iconColor='text-pink-500'
          />
          <Link
            href='/douban?type=show'
            className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
          >
            查看更多
            <ChevronRight className='w-4 h-4 ml-1' />
          </Link>
        </div>
        <ScrollableRow>
          {loadingStates.varietyShows ? (
            Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
              <SkeletonCard key={index} />
            ))
          ) : errorStates.varietyShows ? (
            <ErrorState />
          ) : (
            hotVarietyShows.map((show, index) => (
              <div
                key={index}
                className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
              >
                <VideoCard
                  from='douban'
                  title={show.title}
                  poster={show.poster}
                  douban_id={Number(show.id)}
                  rate={show.rate}
                  year={show.year}
                  onNavigate={onNavigate} // [滚动恢复整合] 传递 onNavigate
                />
              </div>
            ))
          )}
        </ScrollableRow>
      </section>

      {/* 热门短剧 */}
      <section className='mb-8'>
        <div className='mb-4 flex items-center justify-between'>
          <SectionTitle
            title='热门短剧'
            icon={Play}
            iconColor='text-orange-500'
          />
          <Link
            href='/shortdrama'
            className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
          >
            查看更多
            <ChevronRight className='w-4 h-4 ml-1' />
          </Link>
        </div>
        <ScrollableRow>
          {loadingStates.shortDramas ? (
            Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
              <SkeletonCard key={index} />
            ))
          ) : errorStates.shortDramas ? (
            <ErrorState />
          ) : (
            hotShortDramas.map((drama, index) => (
              <div
                key={index}
                className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
              >
                <ShortDramaCard drama={drama} onNavigate={onNavigate} />
              </div>
            ))
          )}
        </ScrollableRow>
      </section>
    </>
  );
};

function HomeClient() {
  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [hotShortDramas, setHotShortDramas] = useState<ShortDramaItem[]>([]);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >([]);
  const [upcomingReleases, setUpcomingReleases] = useState<ReleaseCalendarItem[]>([]);

  // Granular loading and error states for a better UX
  const [loadingStates, setLoadingStates] = useState({
    movies: true,
    tvShows: true,
    varietyShows: true,
    shortDramas: true,
    bangumi: true,
  });
  const [errorStates, setErrorStates] = useState({
    movies: false,
    tvShows: false,
    varietyShows: false,
    shortDramas: false,
    bangumi: false,
  });

  const { announcement, mainContainerRef } = useSite(); // [滚动恢复整合] 获取 mainContainerRef
  const [username, setUsername] = useState<string>('');
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showAIRecommendModal, setShowAIRecommendModal] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(true); // 默认显示，检查后再决定
  const [aiCheckTriggered, setAiCheckTriggered] = useState(false); // 新增状态
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [greeting, setGreeting] = useState(''); // 新增状态来存储问候语

  // [滚动恢复整合] 创建 Ref 保存所有需要缓存的数据
  const dataRef = useRef<RestorableHomeData>({
    activeTab: 'home',
    favoriteItems: [],
    items: [],
    hasNextPage: true,
    primarySelection: '',
    secondarySelection: '',
    multiLevelValues: {},
    selectedWeekday: '',
  });

  // [滚动恢复整合] 实例化 Hook
  const { saveScrollState, isRestoring } = useScrollRestoration({
    dataRef,
    mainContainerRef,
    restoreState: (cachedData: RestorableHomeData) => {
      // 当检测到缓存时，此函数会被调用以恢复所有相关的状态
      setActiveTab(cachedData.activeTab);
      setFavoriteItems(cachedData.favoriteItems);
    },
  });

  // [滚动恢复整合] 监听所有相关状态，并实时更新 dataRef
  useEffect(() => {
    dataRef.current = {
      ...dataRef.current, // 保持其他可能存在的属性
      activeTab,
      favoriteItems,
    };
  }, [activeTab, favoriteItems]);

  // 获取用户名和生成问候语
  useEffect(() => {
    const authInfo = getAuthInfoFromBrowserCookie();
    if (authInfo?.username) {
      setUsername(authInfo.username);
    }

    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting('早上好');
    } else if (hour < 18) {
      setGreeting('下午好');
    } else {
      setGreeting('晚上好');
    }
  }, []);

  // 检查公告弹窗状态
  useEffect(() => {
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  // 延迟检查AI功能状态，避免阻塞页面初始渲染
  useEffect(() => {
    if (aiCheckTriggered || typeof window === 'undefined') return;

    let idleCallbackId: number | undefined;
    let timeoutId: number | undefined;
    let cancelled = false;

    const checkAIStatus = async () => {
      if (cancelled) return;
      try {
        const response = await fetch('/api/ai-recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'test' }],
          }),
        });
        if (!cancelled) {
          // 修改：增加对 response.ok 的判断，捕获 4xx/5xx 错误
          if (!response.ok) {
            console.error('AI recommend API failed with status:', response.status);
            setAiEnabled(false); // 在服务器错误时明确禁用AI功能
            return; // 提前退出，不再继续执行
          }
          setAiEnabled(response.status !== 403);
        }
      } catch (error) {
        if (!cancelled) {
          // 网络层面的错误，同样禁用AI功能
          console.error('AI recommend API fetch failed:', error);
          setAiEnabled(false);
        }
      } finally {
        if (!cancelled) {
          setAiCheckTriggered(true);
        }
      }
    };

    const win = window as typeof window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      idleCallbackId = win.requestIdleCallback(() => {
        checkAIStatus().catch(() => {
          // 错误已在内部处理
        });
      }, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(() => {
        checkAIStatus().catch(() => {
          // 错误已在内部处理
        });
      }, 800);
    }

    return () => {
      cancelled = true;
      if (idleCallbackId !== undefined && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [aiCheckTriggered]);

  // 主数据获取 effect
  useEffect(() => {
    // [滚动恢复整合] 如果正在恢复状态，则不执行初始数据获取，避免不必要请求
    if (isRestoring) return;

    // 清理过期缓存
    cleanExpiredCache().catch(console.error);

    const fetchRecommendData = async () => {
      // 并行获取热门电影、热门剧集、热门综艺、热门短剧和即将上映
      const [
        moviesData,
        tvShowsData,
        varietyShowsData,
        shortDramasData,
        bangumiData,
        upcomingReleasesData,
      ] = await Promise.allSettled([
        getDoubanCategories({ kind: 'movie', category: '热门', type: '全部' }),
        getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
        getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
        getRecommendedShortDramas(undefined, 8),
        GetBangumiCalendarData(),
        fetch('/api/release-calendar?limit=100').then(res => {
          if (!res.ok) {
            console.error('获取即将上映数据失败，状态码:', res.status);
            return { items: [] };
          }
          return res.json();
        }),
      ]);

      // 处理电影数据
      if (moviesData.status === 'fulfilled' && moviesData.value?.code === 200) {
        const movies = moviesData.value.list;
        setHotMovies(movies);
        // 异步获取前2条电影的详情（用于Hero Banner）
        Promise.all(
          movies.slice(0, 2).map(async (movie) => {
            try {
              const detailsRes = await getDoubanDetails(movie.id);
              if (detailsRes.code === 200 && detailsRes.data?.plot_summary) {
                return { id: movie.id, plot_summary: detailsRes.data.plot_summary };
              }
            } catch (error) {
              console.warn(`获取电影 ${movie.id} 详情失败:`, error);
            }
            return null;
          })
        ).then((results) => {
          setHotMovies(prev =>
            prev.map(m => {
              const detail = results.find(r => r?.id === m.id);
              return detail ? { ...m, plot_summary: detail.plot_summary } : m;
            })
          );
        });
      } else {
        setErrorStates((prev) => ({ ...prev, movies: true }));
        console.warn(
          '获取热门电影失败:',
          moviesData.status === 'rejected' ? moviesData.reason : '数据格式错误'
        );
      }
      setLoadingStates((prev) => ({ ...prev, movies: false }));

      // 处理剧集数据
      if (
        tvShowsData.status === 'fulfilled' &&
        tvShowsData.value?.code === 200
      ) {
        const tvShows = tvShowsData.value.list;
        setHotTvShows(tvShows);
        // 异步获取前2条剧集的详情（用于Hero Banner）
        Promise.all(
          tvShows.slice(0, 2).map(async (show) => {
            try {
              const detailsRes = await getDoubanDetails(show.id);
              if (detailsRes.code === 200 && detailsRes.data?.plot_summary) {
                return { id: show.id, plot_summary: detailsRes.data.plot_summary };
              }
            } catch (error) {
              console.warn(`获取剧集 ${show.id} 详情失败:`, error);
            }
            return null;
          })
        ).then((results) => {
          setHotTvShows(prev =>
            prev.map(s => {
              const detail = results.find(r => r?.id === s.id);
              return detail ? { ...s, plot_summary: detail.plot_summary } : s;
            })
          );
        });
      } else {
        setErrorStates((prev) => ({ ...prev, tvShows: true }));
        console.warn(
          '获取热门剧集失败:',
          tvShowsData.status === 'rejected' ? tvShowsData.reason : '数据格式错误'
        );
      }
      setLoadingStates((prev) => ({ ...prev, tvShows: false }));

      // 处理综艺数据
      if (
        varietyShowsData.status === 'fulfilled' &&
        varietyShowsData.value?.code === 200
      ) {
        const varietyShows = varietyShowsData.value.list;
        setHotVarietyShows(varietyShows);
        // 异步获取第1条综艺的详情（用于Hero Banner）
        if (varietyShows.length > 0) {
          const show = varietyShows[0];
          getDoubanDetails(show.id)
            .then((detailsRes) => {
              if (detailsRes.code === 200 && detailsRes.data?.plot_summary) {
                setHotVarietyShows(prev =>
                  prev.map(s => s.id === show.id
                    ? { ...s, plot_summary: detailsRes.data!.plot_summary }
                    : s
                  )
                );
              }
            })
            .catch((error) => {
              console.warn(`获取综艺 ${show.id} 详情失败:`, error);
            });
        }
      } else {
        setErrorStates((prev) => ({ ...prev, varietyShows: true }));
        console.warn(
          '获取热门综艺失败:',
          varietyShowsData.status === 'rejected'
            ? varietyShowsData.reason
            : '数据格式错误'
        );
      }
      setLoadingStates((prev) => ({ ...prev, varietyShows: false }));

      // 处理短剧数据
      if (shortDramasData.status === 'fulfilled') {
        const dramas = shortDramasData.value;
        setHotShortDramas(dramas);
        // 异步获取前2条短剧的详情（用于Hero Banner）
        Promise.all(
          dramas.slice(0, 2).map(async (drama) => {
            try {
              const response = await fetch(`/api/shortdrama/detail?id=${drama.id}&episode=1`);
              if (response.ok) {
                const detailData = await response.json();
                if (detailData.desc) {
                  return { id: drama.id, description: detailData.desc };
                }
              }
            } catch (error) {
              console.warn(`获取短剧 ${drama.id} 详情失败:`, error);
            }
            return null;
          })
        ).then((results) => {
          setHotShortDramas(prev =>
            prev.map(d => {
              const detail = results.find(r => r?.id === d.id);
              return detail ? { ...d, description: detail.description } : d;
            })
          );
        });
      } else {
        setErrorStates((prev) => ({ ...prev, shortDramas: true }));
        console.warn('获取热门短剧失败:', shortDramasData.reason);
        setHotShortDramas([]);
      }
      setLoadingStates((prev) => ({ ...prev, shortDramas: false }));

      // 处理bangumi数据
      if (
        bangumiData.status === 'fulfilled' &&
        Array.isArray(bangumiData.value)
      ) {
        const bangumiResult = bangumiData.value;
        setBangumiCalendarData(bangumiResult);
        // 获取今天的番剧并尝试获取详情（用于Hero Banner）
        const today = new Date();
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const currentWeekday = weekdays[today.getDay()];
        const todayAnimes = bangumiResult.find(
          (item) => item.weekday.en === currentWeekday
        )?.items || [];

        // 如果今天有番剧且第一个番剧没有summary，尝试获取详情
        if (todayAnimes.length > 0 && !(todayAnimes[0] as any).summary) {
          const anime: any = todayAnimes[0];
          try {
            const response = await fetch(`https://api.bgm.tv/v0/subjects/${anime.id}`);
            if (response.ok) {
              const detailData = await response.json();
              if (detailData.summary) {
                // 更新 bangumiCalendarData 中对应的番剧
                setBangumiCalendarData(prev =>
                  prev.map(dayData => {
                    if (dayData.weekday.en === currentWeekday) {
                      return {
                        ...dayData,
                        items: dayData.items.map((item: any) =>
                          item.id === anime.id
                            ? { ...item, summary: detailData.summary }
                            : item
                        )
                      };
                    }
                    return dayData;
                  })
                );
              }
            }
          } catch (error) {
            console.warn(`获取番剧 ${anime.id} 详情失败:`, error);
          }
        }
      } else {
        setErrorStates((prev) => ({ ...prev, bangumi: true }));
        console.warn(
          'Bangumi接口失败或返回数据格式错误:',
          bangumiData.status === 'rejected'
            ? bangumiData.reason
            : '数据格式错误'
        );
        setBangumiCalendarData([]);
      }
      setLoadingStates((prev) => ({ ...prev, bangumi: false }));

      // 处理即将上映数据
      if (upcomingReleasesData.status === 'fulfilled' && (upcomingReleasesData.value as any)?.items) {
        const releases = (upcomingReleasesData.value as any).items;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const ninetyDaysLater = new Date(today);
        ninetyDaysLater.setDate(ninetyDaysLater.getDate() + 90);

        const upcoming = releases.filter((item: any) => {
          const releaseDateStr = item.releaseDate;
          const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
          const ninetyDaysStr = ninetyDaysLater.toISOString().split('T')[0];
          return releaseDateStr >= sevenDaysAgoStr && releaseDateStr <= ninetyDaysStr;
        });

        const uniqueUpcoming = upcoming.reduce((acc: any[], current: any) => {
          const existingItem = acc.find(item => item.title === current.title);
          if (!existingItem) {
            acc.push(current);
          } else {
            if (new Date(current.releaseDate) < new Date(existingItem.releaseDate)) {
              const existingIndex = acc.findIndex(item => item.title === current.title);
              acc[existingIndex] = current;
            }
          }
          return acc;
        }, []);

        setUpcomingReleases(uniqueUpcoming.slice(0, 10)); // 智能分配逻辑简化为取前10条
      } else {
        console.warn('获取即将上映数据失败:', upcomingReleasesData.status === 'rejected' ? (upcomingReleasesData as any).reason : '数据格式错误');
        setUpcomingReleases([]);
      }
    };

    fetchRecommendData();
  }, [isRestoring]); // [滚动恢复整合] 添加 isRestoring 作为依赖

  // 处理收藏数据更新的函数
  const updateFavoriteItems = useCallback(
    async (allFavorites: Record<string, any>) => {
      const allPlayRecords = await getAllPlayRecords();
      // 根据保存时间排序（从近到远）
      const sorted = Object.entries(allFavorites)
        .sort(([, a], [, b]) => b.save_time - a.save_time)
        .map(([key, fav]) => {
          const plusIndex = key.indexOf('+');
          const source = key.slice(0, plusIndex);
          const id = key.slice(plusIndex + 1);
          // 查找对应的播放记录，获取当前集数
          const playRecord = allPlayRecords[key];
          const currentEpisode = playRecord?.index;
          return {
            id,
            source,
            title: fav.title,
            year: fav.year,
            poster: fav.cover,
            episodes: fav.total_episodes,
            source_name: fav.source_name,
            currentEpisode,
            search_title: fav?.search_title,
            origin: fav?.origin,
          } as FavoriteItem;
        });
      setFavoriteItems(sorted);
    },
    []
  );

  // 当切换到收藏夹或收藏夹数据更新时加载收藏数据
  useEffect(() => {
    // [滚动恢复整合] 如果正在恢复状态，则不执行，因为数据已由 restoreState 设置
    if (isRestoring) return;

    const loadAndSubscribe = async () => {
      if (activeTab === 'favorites') {
        const allFavorites = await getAllFavorites();
        await updateFavoriteItems(allFavorites);
      }
      const unsubscribe = subscribeToDataUpdates(
        'favoritesUpdated',
        (newFavorites: Record<string, any>) => {
          updateFavoriteItems(newFavorites);
        }
      );
      return unsubscribe;
    };

    const unsubscribe = loadAndSubscribe();
    return () => {
      unsubscribe.then((unsub) => unsub());
    };
  }, [activeTab, updateFavoriteItems, isRestoring]); // [滚动恢复整合] 添加 isRestoring 作为依赖

  const handleCloseAnnouncement = useCallback((announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  }, []);

  return (
    <PageLayout>
      <div className='-mt-6 md:mt-0'>
        {/* 欢迎横幅 - 现代化精简设计 */}
        <div className='mb-6 relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-500/90 via-purple-500/90 to-pink-500/90 backdrop-blur-sm shadow-xl border border-white/20'>
          <div className='relative p-4 sm:p-5'>
            {/* 动态渐变背景 */}
            <div className='absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/5'></div>

            <div className='relative z-10 flex items-center justify-between gap-4'>
              <div className='flex-1 min-w-0'>
                <h2 className='text-lg sm:text-xl font-bold text-white mb-1 flex items-center gap-2 flex-wrap'>
                  <span>
                    {greeting}
                    {username && '，'}
                  </span>
                  {username && (
                    <span className='text-yellow-300 font-semibold'>
                      {username}
                    </span>
                  )}
                  {greeting && <span className='inline-block animate-wave origin-bottom-right'>👋</span>}
                </h2>
                <p className='text-sm text-white/90'>
                  发现更多精彩影视内容 ✨
                </p>
              </div>

              {/* 装饰图标 - 更小更精致 */}
              <div className='hidden md:flex items-center justify-center flex-shrink-0 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20'>
                <Film className='w-6 h-6 text-white' />
              </div>
            </div>
          </div>
        </div>

        {/* 顶部 Tab 切换 */}
        <div className='mb-8 flex flex-col sm:flex-row items-center justify-center gap-4'>
          <CapsuleSwitch
            options={TAB_OPTIONS}
            active={activeTab}
            onChange={(value) => setActiveTab(value as 'home' | 'favorites')}
          />
          {/* AI推荐按钮 - 只在功能启用时显示，添加脉冲动画 */}
          {aiEnabled && (
            <button
              onClick={() => setShowAIRecommendModal(true)}
              className='relative flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-full font-medium transition-all transform hover:scale-105 shadow-lg hover:shadow-xl group overflow-hidden'
              title='AI影视推荐'
            >
              {/* 脉冲光环 */}
              <div className='absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 opacity-0 group-hover:opacity-100 animate-ping'></div>
              {/* 闪烁背景 */}
              <div className='absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 opacity-20 animate-pulse'></div>
              <Brain className='h-4 w-4 relative z-10 group-hover:rotate-12 transition-transform duration-300' />
              <span className='relative z-10'>AI推荐</span>
            </button>
          )}
        </div>

        {/* [滚动恢复整合] 如果正在恢复状态，则显示加载中，避免闪烁 */}
        {isRestoring ? (
          <div className='flex justify-center py-20'>
            <Loader2 className='animate-spin text-gray-400' size={48} />
          </div>
        ) : (
          <div key={activeTab} className='animate-fadeIn'>
            {activeTab === 'home' ? (
              <HomeView
                hotMovies={hotMovies}
                hotTvShows={hotTvShows}
                hotVarietyShows={hotVarietyShows}
                hotShortDramas={hotShortDramas}
                bangumiCalendarData={bangumiCalendarData}
                upcomingReleases={upcomingReleases}
                loadingStates={loadingStates}
                errorStates={errorStates}
                onNavigate={saveScrollState} // [滚动恢复整合] 传递 onNavigate
                saveScrollState={saveScrollState}
              />
            ) : (
              <FavoritesView
                items={favoriteItems}
                onNavigate={saveScrollState} // [滚动恢复整合] 传递 onNavigate
              />
            )}
          </div>
        )}
      </div>
      {announcement && showAnnouncement && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 transition-all duration-300 ${
            showAnnouncement
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-95 pointer-events-none'
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseAnnouncement(announcement);
            }
          }}
          onTouchStart={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          onTouchMove={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          style={{
            touchAction: 'none',
          }}
        >
          <div
            className='w-full max-w-2xl mx-4 transform transition-all duration-300 ease-out'
            onTouchMove={(e) => {
              e.stopPropagation();
            }}
            style={{
              touchAction: 'auto',
            }}
          >
            {/* 公告卡片 */}
            <div className='bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col'>
              {/* 顶部装饰条 */}
              <div className='h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500'></div>
              {/* 卡片头部 */}
              <div className='px-6 py-4 border-b border-gray-100 dark:border-gray-800'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-3'>
                    {/* 图标 */}
                    <div className='w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg'>
                      <svg
                        className='w-5 h-5 text-white'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                        />
                      </svg>
                    </div>
                    {/* 标题 */}
                    <div>
                      <h3 className='text-xl font-bold text-gray-900 dark:text-white'>
                        站点公告
                      </h3>
                      <p className='text-sm text-gray-500 dark:text-gray-400'>
                        重要信息通知
                      </p>
                    </div>
                  </div>
                  {/* 关闭按钮 */}
                  <button
                    onClick={() => handleCloseAnnouncement(announcement)}
                    className='w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors group'
                    aria-label='关闭'
                  >
                    <svg
                      className='w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M6 18L18 6M6 6l12 12'
                      />
                    </svg>
                  </button>
                </div>
              </div>
              {/* 公告内容 */}
              <div className='px-6 py-6 max-h-[60vh] overflow-y-auto'>
                <div className='relative'>
                  {/* 内容区域 */}
                  <div className='bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700'>
                    {/* 左侧装饰线 */}
                    <div className='absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full'></div>
                    {/* 公告文本 */}
                    <div className='ml-4'>
                      <p className='text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap text-[15px]'>
                        {announcement}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              {/* 底部操作区 */}
              <div className='px-6 py-4 bg-gray-50 dark:bg-gray-800/50'>
                <button
                  onClick={() => handleCloseAnnouncement(announcement)}
                  className='w-full relative overflow-hidden group bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0'
                >
                  {/* 按钮背景动画 */}
                  <div className='absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300'></div>
                  {/* 按钮文本 */}
                  <span className='relative flex items-center justify-center gap-2'>
                    <svg
                      className='w-4 h-4'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M5 13l4 4L19 7'
                      />
                    </svg>
                    我知道了
                  </span>
                  {/* 光效 */}
                  <div className='absolute inset-0 bg-white opacity-0 group-active:opacity-20 transition-opacity duration-150'></div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* AI推荐模态框 */}
      <AIRecommendModal
        isOpen={showAIRecommendModal}
        onClose={() => setShowAIRecommendModal(false)}
      />
      {/* Telegram 欢迎弹窗 */}
      <TelegramWelcomeModal />
    </PageLayout>
  );
}
export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
