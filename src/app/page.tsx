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
import { getDoubanCategories } from '@/lib/douban.client';
// 引入 Zod Schema 用于数据校验
import { BangumiItemSchema } from '@/lib/schemas';
import { cleanExpiredCache } from '@/lib/shortdrama-cache';
import { getRecommendedShortDramas } from '@/lib/shortdrama.client';
import { DoubanItem, ShortDramaItem } from '@/lib/types';
// [滚动恢复整合] 引入核心Hook
import {
  RestorableData,
  useScrollRestoration,
} from '@/lib/useScrollRestoration';

import AIRecommendModal from '@/components/AIRecommendModal';
import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import SectionTitle from '@/components/SectionTitle';
import ShortDramaCard from '@/components/ShortDramaCard';
import { useSite } from '@/components/SiteProvider';
import SkeletonCard from '@/components/SkeletonCard';
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
  const handleClearFavorites = useCallback(async () => {
    // A confirmation could be added here in a real app
    await clearAllFavorites();
    // The parent component will receive the update via subscription
  }, []);

  return (
    <section className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          我的收藏
        </h2>
        {items.length > 0 && (
          <button
            className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            onClick={handleClearFavorites}
          >
            清空
          </button>
        )}
      </div>
      <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id + item.source} className='w-full'>
              <VideoCard
                query={item.search_title}
                {...item}
                from='favorite'
                type={item.episodes > 1 ? 'tv' : ''}
                onNavigate={onNavigate} // [滚动恢复整合] 传递 onNavigate
              />
            </div>
          ))
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
  loadingStates,
  errorStates,
  onNavigate, // [滚动恢复整合] 接收 onNavigate 回调
}: {
  hotMovies: DoubanItem[];
  hotTvShows: DoubanItem[];
  hotVarietyShows: DoubanItem[];
  hotShortDramas: ShortDramaItem[];
  bangumiCalendarData: BangumiCalendarData[];
  loadingStates: Record<string, boolean>;
  errorStates: Record<string, boolean>;
  onNavigate: () => void; // [滚动恢复整合] 定义 onNavigate 类型
}) => {
  return (
    <>
      {/* 继续观看 */}
      <ContinueWatching />

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
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

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

  // 获取用户名
  useEffect(() => {
    const authInfo = getAuthInfoFromBrowserCookie();
    if (authInfo?.username) {
      setUsername(authInfo.username);
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

  // 检查AI功能是否启用
  useEffect(() => {
    const checkAIStatus = async () => {
      try {
        // 发送一个测试请求来检查AI功能状态
        const response = await fetch('/api/ai-recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'test' }],
          }),
        });
        // 如果是403错误，说明功能未启用
        setAiEnabled(response.status !== 403);
      } catch (error) {
        // 发生错误时默认显示按钮
        setAiEnabled(true);
      }
    };
    checkAIStatus();
  }, []);

  // 主数据获取 effect
  useEffect(() => {
    // [滚动恢复整合] 如果正在恢复状态，则不执行初始数据获取，避免不必要请求
    if (isRestoring) return;

    // 清理过期缓存
    cleanExpiredCache().catch(console.error);

    const fetchRecommendData = async () => {
      // 并行获取热门电影、热门剧集、热门综艺和热门短剧
      const [
        moviesData,
        tvShowsData,
        varietyShowsData,
        shortDramasData,
        bangumiData,
      ] = await Promise.allSettled([
        getDoubanCategories({ kind: 'movie', category: '热门', type: '全部' }),
        getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
        getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
        getRecommendedShortDramas(undefined, 8),
        GetBangumiCalendarData(),
      ]);

      // 处理电影数据
      if (moviesData.status === 'fulfilled' && moviesData.value?.code === 200) {
        setHotMovies(moviesData.value.list);
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
        setHotTvShows(tvShowsData.value.list);
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
        setHotVarietyShows(varietyShowsData.value.list);
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
        setHotShortDramas(shortDramasData.value);
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
        setBangumiCalendarData(bangumiData.value);
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
      <div className='px-2 sm:px-10 py-4 sm:py-8 overflow-visible'>
        {/* 欢迎横幅 - 在所有 tab 显示 */}
        <div className='mb-6 mt-0 md:mt-12 relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 p-[2px] shadow-lg animate-[slideDown_0.5s_ease-out]'>
          <div className='relative bg-white dark:bg-gray-900 rounded-2xl p-5 sm:p-6'>
            {/* 装饰性背景 */}
            <div className='absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-3xl'></div>
            <div className='absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-pink-400/10 to-purple-400/10 rounded-full blur-2xl'></div>
            <div className='relative z-10'>
              <div className='flex items-start justify-between gap-4'>
                <div className='flex-1 min-w-0'>
                  <h2 className='text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1.5 flex items-center gap-2 flex-wrap'>
                    <span>
                      {(() => {
                        const hour = new Date().getHours();
                        if (hour < 12) return '早上好';
                        if (hour < 18) return '下午好';
                        return '晚上好';
                      })()}
                      {username && '，'}
                    </span>
                    {username && (
                      <span className='text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400'>
                        {username}
                      </span>
                    )}
                    <span className='inline-block animate-wave origin-bottom-right'>
                      👋
                    </span>
                  </h2>
                  <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
                    发现更多精彩影视内容 ✨
                  </p>
                </div>
                {/* 装饰图标 - 只在大屏幕显示 */}
                <div className='hidden lg:block flex-shrink-0'>
                  <div className='w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg animate-pulse'>
                    <Film className='w-8 h-8 text-white' />
                  </div>
                </div>
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

        <div className='max-w-[95%] mx-auto'>
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
                  loadingStates={loadingStates}
                  errorStates={errorStates}
                  onNavigate={saveScrollState} // [滚动恢复整合] 传递 onNavigate
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
