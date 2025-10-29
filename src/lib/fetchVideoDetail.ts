import { getAvailableApiSites } from '@/lib/config';
import { SearchResult } from '@/lib/types';

import { getDetailFromApi, searchFromApi } from './downstream';

interface FetchVideoDetailOptions {
  source: string;
  id: string;
  fallbackTitle?: string;
}

/**
 * 根据 source 与 id 获取视频详情。
 * 1. 若传入 fallbackTitle，则先调用 /api/search 搜索精确匹配。
 * 2. 若搜索未命中或未提供 fallbackTitle，则直接调用 /api/detail。
 */
export async function fetchVideoDetail({
  source,
  id,
  fallbackTitle = '',
}: FetchVideoDetailOptions): Promise<SearchResult> {
  // 优先通过搜索接口查找精确匹配
  const apiSites = await getAvailableApiSites();
  const apiSite = apiSites.find((site) => site.key === source);
  if (!apiSite) {
    throw new Error('无效的API来源');
  }
  if (fallbackTitle) {
    try {
      const searchData = await searchFromApi(apiSite, fallbackTitle.trim());
      const exactMatch = searchData.find(
        (item: SearchResult) =>
          item.source.toString() === source.toString() &&
          item.id.toString() === id.toString()
      );
      if (exactMatch) {
        return exactMatch;
      }
    } catch (error) {
      // do nothing
    }
  }

  // 调用 /api/detail 接口
  try {
    const detail = await getDetailFromApi(apiSite, id);
    // getDetailFromApi 内部在失败时会抛出错误，因此如果执行到这里，detail 一定是有效的
    return detail;
  } catch (error: any) {
    console.error(`[fetchVideoDetail] 获取详情失败 (source: ${source}, id: ${id}):`, error.message);
    // 抛出一个更具体的错误，以便上层可以根据需要处理或显示给用户
    throw new Error(`从源 [${apiSite.name}] 获取详情失败，该源可能暂时不可用。`);
  }
}
