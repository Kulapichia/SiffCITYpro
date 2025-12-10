/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { API_CONFIG } from './config.shared';
import {
  ShortDramaCategory,
  ShortDramaItem,
  ShortDramaParseResult,
} from './types';

export type { ShortDramaCategory };
import {
  SHORTDRAMA_CACHE_EXPIRE,
  getCacheKey,
  getCache,
  setCache,
} from './shortdrama-cache';

// 检测是否为移动端环境
const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// 获取API基础URL - 移动端使用内部API代理，桌面端直接调用外部API
const getApiBase = (endpoint: string) => {
  if (isMobile()) {
    return `/api/shortdrama${endpoint}`;
  }
  // 桌面端使用外部API的完整路径
  // MODIFIED: Use baseUrl from API_CONFIG
  return `${API_CONFIG.shortdrama.baseUrl}/vod${endpoint}`;
};

// 获取短剧分类列表
export async function getShortDramaCategories(): Promise<ShortDramaCategory[]> {
  const cacheKey = getCacheKey('categories', {});

  try {
    // 临时禁用缓存进行测试 - 移动端强制刷新
    if (!isMobile()) {
      const cached = await getCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const apiUrl = isMobile()
      ? `/api/shortdrama/categories`
      : getApiBase('/categories');

    // 移动端使用内部API，桌面端调用外部API
    const fetchOptions: RequestInit = isMobile() ? {} : {
      // 移动端：让浏览器使用HTTP缓存，不添加破坏缓存的headers
      headers: API_CONFIG.shortdrama.headers,
      mode: 'cors',
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let result: ShortDramaCategory[];
    // 内部API直接返回数组，外部API返回带categories的对象
    if (isMobile()) {
      result = data; // 内部API已经处理过格式
    } else {
      const categories = data.categories || [];
      result = categories.map((item: any) => ({
        type_id: item.type_id,
        type_name: item.type_name,
      }));
    }

    // 缓存结果
    await setCache(cacheKey, result, SHORTDRAMA_CACHE_EXPIRE.categories);
    return result;
  } catch (error) {
    console.error('获取短剧分类失败:', error);
    return [];
  }
}

// 获取推荐短剧列表
export async function getRecommendedShortDramas(
  category?: number,
  size = 10
): Promise<ShortDramaItem[]> {
  const cacheKey = getCacheKey('recommends', { category, size });

  try {
    // 临时禁用缓存进行测试 - 移动端强制刷新
    if (!isMobile()) {
      const cached = await getCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const apiUrl = isMobile()
      ? `/api/shortdrama/recommend?${category ? `category=${category}&` : ''}size=${size}`
      // MODIFIED: Use baseUrl from API_CONFIG
      : `${API_CONFIG.shortdrama.baseUrl}/vod/recommend?${category ? `category=${category}&` : ''}size=${size}`;

    const fetchOptions: RequestInit = isMobile() ? {} : {
      headers: API_CONFIG.shortdrama.headers,
      mode: 'cors',
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let result: ShortDramaItem[];
    if (isMobile()) {
      result = data; // 内部API已经处理过格式
    } else {
      // 外部API的处理逻辑
      const items = data.items || [];
      result = items.map((item: any) => ({
        id: item.vod_id || item.id,
        name: item.vod_name || item.name,
        cover: item.vod_pic || item.cover,
        update_time: item.vod_time || item.update_time || new Date().toISOString(),
        score: item.vod_score || item.score || 0,
        episode_count: parseInt(item.vod_remarks?.replace(/[^\d]/g, '') || '1'),
        description: item.vod_content || item.description || '',
        author: item.vod_actor || item.author || '',
        backdrop: item.vod_pic_slide || item.backdrop || item.vod_pic || item.cover,
        vote_average: item.vod_score || item.vote_average || 0,
        tmdb_id: item.tmdb_id || undefined,
      }));
    }

    // 缓存结果
    await setCache(cacheKey, result, SHORTDRAMA_CACHE_EXPIRE.recommends);
    return result;
  } catch (error) {
    console.error('获取推荐短剧失败:', error);
    return [];
  }
}

// 获取分类短剧列表（分页）
export async function getShortDramaList(
  category: number,
  page = 1,
  size = 20
): Promise<{ list: ShortDramaItem[]; hasMore: boolean }> {
  const cacheKey = getCacheKey('lists', { category, page, size });

  try {
    // 临时禁用缓存进行测试 - 移动端强制刷新
    if (!isMobile()) {
      const cached = await getCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const apiUrl = isMobile()
      ? `/api/shortdrama/list?categoryId=${category}&page=${page}&size=${size}`
      // MODIFIED: Use baseUrl from API_CONFIG
      : `${API_CONFIG.shortdrama.baseUrl}/vod/list?categoryId=${category}&page=${page}&size=${size}`;

    const fetchOptions: RequestInit = isMobile() ? {} : {
      headers: API_CONFIG.shortdrama.headers,
      mode: 'cors',
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let result: { list: ShortDramaItem[]; hasMore: boolean };
    if (isMobile()) {
      result = data; // 内部API已经处理过格式
    } else {
      // 外部API的处理逻辑
      const items = data.list || [];
      const list = items.map((item: any) => ({
        id: item.id,
        name: item.name,
        cover: item.cover,
        update_time: item.update_time || new Date().toISOString(),
        score: item.score || 0,
        episode_count: 1, // 分页API没有集数信息，ShortDramaCard会自动获取
        description: item.description || '',
        author: item.author || '',
        backdrop: item.backdrop || item.cover,
        vote_average: item.vote_average || item.score || 0,
        tmdb_id: item.tmdb_id || undefined,
      }));
      result = { list, hasMore: data.currentPage < data.totalPages };
    }

    // 缓存结果 - 第一页缓存时间更长
    const cacheTime = page === 1 ? SHORTDRAMA_CACHE_EXPIRE.lists * 2 : SHORTDRAMA_CACHE_EXPIRE.lists;
    await setCache(cacheKey, result, cacheTime);
    return result;
  } catch (error) {
    console.error('获取短剧列表失败:', error);
    return { list: [], hasMore: false };
  }
}

// 搜索短剧
export async function searchShortDramas(
  query: string,
  page = 1,
  size = 20
): Promise<{ list: ShortDramaItem[]; hasMore: boolean }> {
  try {
    const apiUrl = isMobile()
      ? `/api/shortdrama/search?query=${encodeURIComponent(query)}&page=${page}&size=${size}`
      // MODIFIED: Use baseUrl from API_CONFIG
      : `${API_CONFIG.shortdrama.baseUrl}/vod/search?name=${encodeURIComponent(query)}&page=${page}&size=${size}`;

    const fetchOptions: RequestInit = isMobile() ? {} : {
      // MODIFIED: Use headers from API_CONFIG
      headers: API_CONFIG.shortdrama.headers,
      mode: 'cors',
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let result: { list: ShortDramaItem[]; hasMore: boolean };
    if (isMobile()) {
      result = data; // 内部API已经处理过格式
    } else {
      // 外部API的处理逻辑
      const items = data.list || [];
      const list = items.map((item: any) => ({
        id: item.id,
        name: item.name,
        cover: item.cover,
        update_time: item.update_time || new Date().toISOString(),
        score: item.score || 0,
        episode_count: 1, // 搜索API没有集数信息，ShortDramaCard会自动获取
        description: item.description || '',
        author: item.author || '',
        backdrop: item.backdrop || item.cover,
        vote_average: item.vote_average || item.score || 0,
        tmdb_id: item.tmdb_id || undefined,
      }));
      result = { list, hasMore: data.currentPage < data.totalPages };
    }

    return result;
  } catch (error) {
    console.error('搜索短剧失败:', error);
    return { list: [], hasMore: false };
  }
}

// 使用备用API解析单集视频
async function parseWithAlternativeApi(
  dramaName: string,
  episode: number,
  alternativeApiUrl: string
): Promise<ShortDramaParseResult> {
  try {
    const alternativeApiBase = alternativeApiUrl;
    if (!alternativeApiBase) {
      return { code: -1, msg: '备用API未启用' };
    }
    const searchUrl = `${alternativeApiBase}/api/v1/drama/dl?dramaName=${encodeURIComponent(dramaName)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      mode: 'cors',
    });
    if (!searchResponse.ok) throw new Error(`Search failed: ${searchResponse.status}`);
    const searchData = await searchResponse.json();
    if (!searchData?.data?.[0]?.id) {
      return { code: 1, msg: `未找到短剧"${dramaName}"` };
    }
    const dramaId = searchData.data[0].id;
    const episodesUrl = `${alternativeApiBase}/api/v1/drama/dramas?dramaId=${dramaId}`;
    const episodesResponse = await fetch(episodesUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      mode: 'cors',
    });
    if (!episodesResponse.ok) throw new Error(`Episodes fetch failed: ${episodesResponse.status}`);
    const episodesData = await episodesResponse.json();
    if (!episodesData?.data?.length) return { code: 1, msg: '该短剧暂无可用集数' };
    const episodeIndex = Math.max(0, episode === 0 ? 0 : episode - 1);
    if (episodeIndex >= episodesData.data.length) return { code: 1, msg: `集数 ${episode} 不存在` };
    const episodeId = episodesData.data[episodeIndex].id;
    const directUrl = `${alternativeApiBase}/api/v1/drama/direct?episodeId=${episodeId}`;
    const directResponse = await fetch(directUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      mode: 'cors',
    });
    if (!directResponse.ok) throw new Error(`Direct link fetch failed: ${directResponse.status}`);
    const directData = await directResponse.json();
    if (!directData?.url) throw new Error('备用API未返回播放链接');
    return {
      code: 0,
      data: {
        videoId: dramaId,
        videoName: searchData.data[0].name,
        currentEpisode: episode,
        totalEpisodes: episodesData.data.length,
        parsedUrl: directData.url, proxyUrl: directData.url,
        cover: directData.pic || searchData.data[0].pic || '',
        description: searchData.data[0].overview || '',
        episode: { index: episode, label: `第${episode}集`, parsedUrl: directData.url, title: directData.title || `第${episode}集` },
      },
      metadata: {
        author: searchData.data[0].author || '',
        backdrop: searchData.data[0].backdrop || searchData.data[0].pic || '',
        vote_average: searchData.data[0].vote_average || 0,
        tmdb_id: searchData.data[0].tmdb_id || undefined,
      }
    };
  } catch (error) {
    console.error('备用API解析失败:', error);
    return { code: -1, msg: `备用API错误: ${error instanceof Error ? error.message : '未知错误'}` };
  }
}

// 解析单集视频（支持跨域代理，自动fallback到备用API）
export async function parseShortDramaEpisode(
  id: number,
  episode: number,
  useProxy = true,
  dramaName?: string,
  alternativeApiUrl?: string
): Promise<ShortDramaParseResult> {
  try {
    const params = new URLSearchParams({ id: id.toString(), episode: episode.toString() });
    if (useProxy) params.append('proxy', 'true');
    const timestamp = Date.now();
    const apiUrl = isMobile()
      ? `/api/shortdrama/parse?${params.toString()}&_t=${timestamp}`
      : `${API_CONFIG.shortdrama.baseUrl}/vod/parse/single?${params.toString()}`;
    const fetchOptions: RequestInit = isMobile() ? {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' }
    } : { headers: API_CONFIG.shortdrama.headers, mode: 'cors' };
    const response = await fetch(apiUrl, fetchOptions);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.code === 1) {
      if (dramaName && alternativeApiUrl) {
        console.log('主API失败，尝试使用备用API...');
        return await parseWithAlternativeApi(dramaName, episode, alternativeApiUrl);
      }
      return { code: data.code, msg: data.msg || '解析失败' };
    }
    // API成功时直接返回数据对象，根据实际结构解析
    return {
      code: 0,
      data: {
        videoId: data.videoId || id,
        videoName: data.videoName || '',
        currentEpisode: data.episode?.index || episode,
        totalEpisodes: data.totalEpisodes || 1,
        parsedUrl: data.episode?.parsedUrl || data.parsedUrl || '',
        proxyUrl: data.episode?.proxyUrl || '', // proxyUrl在episode对象内
        cover: data.cover || '',
        description: data.description || '',
        episode: data.episode || null, // 保留原始episode对象
      },
    };
  } catch (error) {
    console.error('解析短剧集数失败:', error);
    if (dramaName && alternativeApiUrl) {
      console.log('主API网络错误，尝试使用备用API...');
      return await parseWithAlternativeApi(dramaName, episode, alternativeApiUrl);
    }
    return { code: -1, msg: '网络请求失败' };
  }
}

// 批量解析多集视频
export async function parseShortDramaBatch(
  id: number,
  episodes: number[],
  useProxy = true
): Promise<ShortDramaParseResult[]> {
  try {
    const params = new URLSearchParams({ id: id.toString(), episodes: episodes.join(',') });
    if (useProxy) params.append('proxy', 'true');
    const timestamp = Date.now();
    const apiUrl = isMobile()
      ? `/api/shortdrama/parse/batch?${params.toString()}&_t=${timestamp}`
      : `${API_CONFIG.shortdrama.baseUrl}/vod/parse/batch?${params.toString()}`;
    const fetchOptions: RequestInit = isMobile() ? {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' }
    } : { headers: API_CONFIG.shortdrama.headers, mode: 'cors' };
    const response = await fetch(apiUrl, fetchOptions);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('批量解析短剧失败:', error);
    return [];
  }
}

// 解析整部短剧所有集数
export async function parseShortDramaAll(
  id: number,
  useProxy = true
): Promise<any> { // MODIFIED: Return type changed to `any` to match detailed logic in other file
  try {
    const params = new URLSearchParams({ id: id.toString() });
    if (useProxy) params.append('proxy', 'true');
    const timestamp = Date.now();
    const apiUrl = isMobile()
      // MODIFIED: The mobile route for 'all' should point to the specific 'all' endpoint
      ? `/api/shortdrama/parse/all?${params.toString()}&_t=${timestamp}`
      // MODIFIED: Use baseUrl from API_CONFIG
      : `${API_CONFIG.shortdrama.baseUrl}/vod/parse/all?${params.toString()}`;
    const fetchOptions: RequestInit = isMobile() ? {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' }
    } : { headers: API_CONFIG.shortdrama.headers, mode: 'cors' };
    const response = await fetch(apiUrl, fetchOptions);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    // MODIFIED: Directly return the full data object, which contains `results` and other metadata
    return data;
  } catch (error) {
    console.error('解析完整短剧失败:', error);
    // MODIFIED: Return a more structured error object
    return { results: [], error: 'Failed to fetch all episodes', videoId: id };
  }
}

// 获取最新发布的短剧列表
export async function getShortDramaLatest(
  page = 1,
  size = 20
): Promise<{ list: ShortDramaItem[]; hasMore: boolean }> {
  const cacheKey = getCacheKey('latest', { page, size });

  try {
    if (!isMobile()) {
      const cached = await getCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const apiUrl = isMobile()
      ? `/api/shortdrama/latest?page=${page}&size=${size}`
      : `${API_CONFIG.shortdrama.baseUrl}/vod/latest?page=${page}&size=${size}`;

    const fetchOptions: RequestInit = isMobile() ? {} : {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      mode: 'cors',
    };

    const response = await fetch(apiUrl, fetchOptions);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    let result: { list: ShortDramaItem[]; hasMore: boolean };
    if (isMobile()) {
      result = data;
    } else {
      const items = data.list || [];
      const list = items.map((item: any) => ({
        id: item.id,
        name: item.name,
        cover: item.cover,
        update_time: item.update_time || new Date().toISOString(),
        score: item.score || 0,
        episode_count: 1,
        description: item.description || '',
      }));
      result = { list, hasMore: data.currentPage < data.totalPages };
    }

    await setCache(cacheKey, result, SHORTDRAMA_CACHE_EXPIRE.lists);
    return result;
  } catch (error) {
    console.error('获取最新短剧失败:', error);
    return { list: [], hasMore: false };
  }
}
