import { MagnifyingGlassIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import React, { useState, useEffect, useCallback } from 'react';
import VideoCard from './VideoCard';
import { buttonStyles } from '@/hooks/useAdminComponents';

type Site = {
  name: string;
  url: string;
};

type TVBoxCategory = { type_id: any; type_name: string };
type TVBoxVideo = { vod_id: any; vod_pic: any; vod_name: any; vod_remarks: any; vod_douban_id: any };

const SourceBrowser: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [categories, setCategories] = useState<TVBoxCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<TVBoxCategory | null>(null);
  const [videos, setVideos] = useState<TVBoxVideo[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSites = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/admin/source-browser/sites');
        if (response.ok) {
          const data = await response.json();
          setSites(data.sources || []);
        } else {
          throw new Error('获取站点列表失败');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '发生未知错误');
        console.error('Failed to fetch sites:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSites();
  }, []);

  const fetchCategories = useCallback(async (site: Site) => {
    setIsLoading(true);
    setError(null);
    setSelectedSite(site);
    setCategories([]);
    setVideos([]);
    setSelectedCategory(null);
    setCurrentPage(1);
    try {
      const response = await fetch(
        `/api/admin/source-browser/categories?url=${encodeURIComponent(site.url)}`
      );
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
        if (data.length > 0) {
          await handleCategorySelect(data[0]);
        }
      } else {
        throw new Error('获取分类失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误');
      console.error('Failed to fetch categories:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchVideos = useCallback(
    async (category: TVBoxCategory, page: number) => {
      if (!selectedSite) return;
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/source-browser/list?url=${encodeURIComponent(
            selectedSite.url
          )}&tid=${category.type_id}&pg=${page}`
        );
        if (response.ok) {
          const data = await response.json();
          setVideos(data.list);
          setCurrentPage(data.page);
          setTotalPages(data.pagecount);
        } else {
          throw new Error('获取视频列表失败');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '发生未知错误');
        console.error('Failed to fetch videos:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedSite]
  );

  const handleCategorySelect = async (category: TVBoxCategory) => {
    setSelectedCategory(category);
    await fetchVideos(category, 1);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSite || !searchQuery) return;
    setIsLoading(true);
    setError(null);
    setCategories([]);
    setSelectedCategory(null);
    setVideos([]);
    try {
      const response = await fetch(
        `/api/admin/source-browser/search?url=${encodeURIComponent(
          selectedSite.url
        )}&wd=${encodeURIComponent(searchQuery)}`
      );
      if (response.ok) {
        const data = await response.json();
        setVideos(data.list || data);
        setTotalPages(1);
        setCurrentPage(1);
      } else {
        throw new Error('搜索失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误');
      console.error('Failed to search videos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (selectedCategory && newPage > 0 && newPage <= totalPages) {
      fetchVideos(selectedCategory, newPage);
    }
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800/50 rounded-lg text-gray-900 dark:text-white shadow-sm space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">源浏览</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">直接浏览和搜索各个视频源的内容</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-md font-semibold text-gray-800 dark:text-gray-200">1. 选择一个源站点</h3>
        <div className="flex flex-wrap gap-2">
          {sites.map((site) => (
            <button
              key={site.url}
              onClick={() => fetchCategories(site)}
              className={`${selectedSite?.url === site.url
                ? buttonStyles.primary
                : buttonStyles.secondary
                }`}
            >
              {site.name}
            </button>
          ))}
        </div>
      </div>

      {selectedSite && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-md font-semibold text-gray-800 dark:text-gray-200">2. 搜索或选择分类</h3>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-grow">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`在 ${selectedSite.name} 中搜索...`}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button type="submit" className={buttonStyles.primary}>
              搜索
            </button>
          </form>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.type_id}
                  onClick={() => handleCategorySelect(cat)}
                  className={`${selectedCategory?.type_id === cat.type_id
                    ? buttonStyles.primary
                    : buttonStyles.secondary
                    } text-sm`}
                >
                  {cat.type_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="pt-4 border-t border-gray-200 dark:border-gray-700 min-h-[200px]">
        {isLoading ? (
          <div className="flex justify-center items-center py-10">
            <ArrowPathIcon className="w-8 h-8 animate-spin text-blue-500" />
            <p className="ml-3 text-gray-600 dark:text-gray-400">加载中...</p>
          </div>
        ) : error ? (
          <div className="text-center py-10">
            <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-500">加载失败: {error}</p>
          </div>
        ) : videos.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
              {videos.map((video) => (
                <VideoCard
                  key={video.vod_id}
                  id={video.vod_id.toString()}
                  poster={video.vod_pic}
                  title={video.vod_name}
                  source={selectedSite?.name || 'Unknown'}
                  remarks={video.vod_remarks}
                  douban_id={video.vod_douban_id}
                  from='search'
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-6">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className={`${currentPage <= 1 ? buttonStyles.disabled : buttonStyles.secondary}`}
                >
                  上一页
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  第 {currentPage} 页 / 共 {totalPages} 页
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className={`${currentPage >= totalPages ? buttonStyles.disabled : buttonStyles.secondary}`}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-10">
            <MagnifyingGlassIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {selectedSite ? '没有找到结果，请尝试不同分类或搜索词' : '请先选择一个源站点'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SourceBrowser;
