// 客户端搜索工具 - 直接从API获取视频源配置进行搜索
import { SearchResult } from './types';
// import { ApiSite } from './config'; // 移除对服务器端文件 config.ts 的依赖

// 将 ApiSite 及其依赖的类型定义移入此处
export type SourceCheckStatus =
  | 'untested'
  | 'valid'
  | 'invalid'
  | 'timeout'
  | 'no_results'
  | 'unreachable';

export interface SourceLastCheck {
  status: SourceCheckStatus;
  latency: number; // in milliseconds, -1 if not applicable
  timestamp: number; // Unix timestamp of the check
}

export interface ApiSite {
  key: string;
  api: string;
  name: string;
  detail?: string;
  disabled?: boolean;
  lastCheck?: SourceLastCheck;
}

type VideoSource = ApiSite;

// 缓存视频源列表，避免重复请求
let cachedSources: VideoSource[] | null = null;
let sourcesPromise: Promise<VideoSource[]> | null = null;

async function getSources(): Promise<VideoSource[]> {
  if (cachedSources) {
    return cachedSources;
  }
  if (sourcesPromise) {
    return sourcesPromise;
  }
  sourcesPromise = fetch('/api/sources')
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch sources');
      return res.json();
    })
    .then(data => {
      cachedSources = data;
      sourcesPromise = null;
      return cachedSources as VideoSource[];
    });
  return sourcesPromise;
}


async function searchFromSource(
  source: VideoSource,
  query: string
): Promise<SearchResult[]> {
  try {
    const searchUrl = `${source.api}?ac=videolist&wd=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`搜索失败 [${source.name}]:`, response.status);
      return [];
    }
    const data = await response.json();
    if (!data || !data.list || !Array.isArray(data.list)) {
      console.warn(`搜索结果格式无效 [${source.name}]`);
      return [];
    }

    // 转换为统一格式
    return data.list.map((item: any) => {
      // 解析播放地址为episodes数组
      const episodes: string[] = [];
      const episodes_titles: string[] = [];
      if (item.vod_play_url && typeof item.vod_play_url === 'string') {
        try {
          const playUrls = item.vod_play_url.split('$$$')[0]; // 取第一个播放源
          if (playUrls) {
            const episodeList = playUrls.split('#').filter((ep: string) => ep && ep.trim());
            if (Array.isArray(episodeList)) {
              episodeList.forEach((ep: string) => {
                const parts = ep.split('$');
                if (parts.length > 1 && parts[1]) {
                    episodes.push(parts[1]);
                    episodes_titles.push(parts[0]);
                }
              });
            }
          }
        } catch (e) {
          console.warn(`解析播放地址失败 [${source.name}]:`, e);
        }
      }
      
      return {
        id: String(item.vod_id),
        title: item.vod_name,
        poster: item.vod_pic || '',
        episodes: episodes,
        episodes_titles: episodes_titles,
        source: source.key,
        source_name: source.name,
        year: String(item.vod_year || 'unknown'),
        type_name: item.type_name || item.vod_class || '',
        desc: item.vod_content || '',
        douban_id: item.vod_douban_id || 0,
        remarks: item.vod_remarks || '',
      } as SearchResult;
    });
  } catch (error) {
    console.error(`搜索错误 [${source.name}]:`, error);
    return [];
  }
}

/**
 * 从所有启用的视频源并发搜索 (客户端)
 */
export async function searchFromAllEnabledSources(query: string): Promise<SearchResult[]> {
  if (!query) return [];

  const sources = await getSources();
  const blockedSourcesStr = localStorage.getItem('danmutv_blocked_sources');
  const blockedSources = blockedSourcesStr ? JSON.parse(blockedSourcesStr) : [];

  const enabledSources = sources.filter(
    s => !s.disabled && !blockedSources.includes(s.key)
  );

  if (enabledSources.length === 0) {
    console.warn('没有可用的客户端搜索源');
    return [];
  }

  console.log(`客户端正在从 ${enabledSources.length} 个视频源搜索: "${query}"`);

  const results = await Promise.all(
    enabledSources.map(source => searchFromSource(source, query))
  );
  
  return results.flat();
}

// getVideoDetail 函数
/**
 * 获取视频详情
 */
export async function getVideoDetail(
  sourceKey: string,
  videoId: string | number
): Promise<any> {
  if (typeof window === 'undefined') {
    return null;
  }

  // 从API获取视频源配置
  const sources = await getSources();

  // 获取被临时屏蔽的视频源列表
  const blockedSourcesStr = localStorage.getItem('danmutv_blocked_sources');
  if (blockedSourcesStr) {
    try {
      const blockedSources: string[] = JSON.parse(blockedSourcesStr);
      if (blockedSources.includes(sourceKey)) {
        console.warn(`视频源 ${sourceKey} 已被临时屏蔽，跳过获取详情`);
        return null;
      }
    } catch (e) {
      console.error('解析屏蔽源列表失败:', e);
    }
  }

  // 找到对应的视频源
  const source = sources.find(s => s.key === sourceKey);
  
  if (!source) {
    console.warn(`未找到视频源: ${sourceKey}`);
    return null;
  }

  try {
    const detailUrl = source.detail || source.api;
    const url = `${detailUrl}?ac=videolist&ids=${videoId}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`获取详情失败 [${source.name}]:`, response.status);
      return null;
    }

    const data = await response.json();
    
    if (!data.list || !Array.isArray(data.list) || data.list.length === 0) {
      return null;
    }

    return data.list[0];
  } catch (error) {
    console.error(`获取详情错误 [${source.name}]:`, error);
    return null;
  }
}

