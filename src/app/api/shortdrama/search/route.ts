import { NextRequest, NextResponse } from 'next/server';
import { API_CONFIG } from '@/lib/config';

// 强制动态路由，禁用所有缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// 服务端专用函数，直接调用外部API
async function searchShortDramasInternal(
  query: string,
  page = 1,
  size = 20
) {
  // 为外部API请求设置5秒超时，防止长时间等待
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const params = new URLSearchParams({
      name: query,
      page: page.toString(),
      size: size.toString(),
    });

    // 使用 API_CONFIG 构建请求URL，避免硬编码
    const apiUrl = `${API_CONFIG.shortdrama.baseUrl}/vod/search?${params.toString()}`;

    const response = await fetch(apiUrl, {
      // 使用 API_CONFIG 中的通用请求头，并关联超时控制器
      headers: API_CONFIG.shortdrama.headers,
      signal: controller.signal,
    });
    
    // 请求成功后，清除超时定时器
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const items = data.list || [];
    const list = items.map((item: any) => ({
      id: item.id,
      name: item.name,
      cover: item.cover,
      update_time: item.update_time || new Date().toISOString(),
      score: item.score || 0,
      episode_count: 1, // 搜索API没有集数信息，ShortDramaCard会自动获取
      description: item.description || '',
    }));

    return {
      list,
      hasMore: data.currentPage < data.totalPages,
    };
  } catch (error) {
    // 在捕获到任何错误时（包括超时），确保清除定时器
    clearTimeout(timeoutId);
    console.error('内部函数 searchShortDramasInternal 失败:', error);
    // 返回一个空的、结构一致的对象，使上层调用可以优雅地处理失败情况
    return {
      list: [],
      hasMore: false,
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const query = searchParams.get('query');
    const page = searchParams.get('page');
    const size = searchParams.get('size');

    if (!query) {
      return NextResponse.json(
        { error: '缺少必要参数: query' },
        { status: 400 }
      );
    }

    const pageNum = page ? parseInt(page) : 1;
    const pageSize = size ? parseInt(size) : 20;

    if (isNaN(pageNum) || isNaN(pageSize)) {
      return NextResponse.json(
        { error: '参数格式错误' },
        { status: 400 }
      );
    }

    const result = await searchShortDramasInternal(query, pageNum, pageSize);

    // 设置与网页端一致的缓存策略（搜索结果: 1小时）
    const response = NextResponse.json(result);

    console.log('🕐 [SEARCH] 设置1小时HTTP缓存 - 与网页端搜索缓存一致');

    // 1小时 = 3600秒（搜索结果更新频繁，短期缓存）
    const cacheTime = 3600;
    response.headers.set('Cache-Control', `public, max-age=${cacheTime}, s-maxage=${cacheTime}`);
    response.headers.set('CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
    response.headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${cacheTime}`);

    // 调试信息
    response.headers.set('X-Cache-Duration', '1hour');
    response.headers.set('X-Cache-Expires-At', new Date(Date.now() + cacheTime * 1000).toISOString());
    response.headers.set('X-Debug-Timestamp', new Date().toISOString());

    // Vary头确保不同设备有不同缓存
    response.headers.set('Vary', 'Accept-Encoding, User-Agent');

    return response;
  } catch (error) {
    console.error('搜索短剧失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
