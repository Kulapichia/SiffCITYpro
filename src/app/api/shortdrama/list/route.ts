import { NextRequest, NextResponse } from 'next/server';
import { getCacheTime, API_CONFIG } from '@/lib/config';

// 强制动态路由，禁用所有缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// 服务端专用函数，直接调用外部API
async function getShortDramaListInternal(
  category: number,
  page = 1,
  size = 20
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
  const response = await fetch(
    `${API_CONFIG.shortdrama.baseUrl}/vod/list?categoryId=${category}&page=${page}&size=${size}`,
    {
      headers: API_CONFIG.shortdrama.headers,
      signal: controller.signal,
    }
  );

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
    episode_count: 1, // 分页API没有集数信息，ShortDramaCard会自动获取
    description: item.description || '',
  }));

  return {
    list,
    hasMore: data.currentPage < data.totalPages,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const categoryId = searchParams.get('categoryId');
    const page = searchParams.get('page');
    const size = searchParams.get('size');

    // 详细日志记录
    console.log('🚀 [SHORTDRAMA API] 收到请求:', {
      timestamp: new Date().toISOString(),
      categoryId,
      page,
      size,
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
      url: request.url
    });

    if (!categoryId) {
      return NextResponse.json(
        { error: '缺少必要参数: categoryId' },
        { status: 400 }
      );
    }

    const category = parseInt(categoryId);
    const pageNum = page ? parseInt(page) : 1;
    const pageSize = size ? parseInt(size) : 20;

    if (isNaN(category) || isNaN(pageNum) || isNaN(pageSize)) {
      return NextResponse.json(
        { error: '参数格式错误' },
        { status: 400 }
      );
    }

    const result = await getShortDramaListInternal(category, pageNum, pageSize);

    // 记录返回的数据
    console.log('✅ [SHORTDRAMA API] 返回数据:', {
      timestamp: new Date().toISOString(),
      count: result.list?.length || 0,
      firstItem: result.list?.[0] ? {
        id: result.list[0].id,
        name: result.list[0].name,
        update_time: result.list[0].update_time
      } : null,
      hasMore: result.hasMore
    });

    // 设置与网页端一致的缓存策略（lists: 2小时）
    const response = NextResponse.json(result);

    console.log('🕐 [LIST] 设置2小时HTTP缓存 - 与网页端lists缓存一致');

    // 2小时 = 7200秒（与网页端SHORTDRAMA_CACHE_EXPIRE.lists一致）
    const cacheTime = 7200;
    response.headers.set('Cache-Control', `public, max-age=${cacheTime}, s-maxage=${cacheTime}`);
    response.headers.set('CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
    response.headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${cacheTime}`);

    // 调试信息
    response.headers.set('X-Cache-Duration', '2hour');
    response.headers.set('X-Cache-Expires-At', new Date(Date.now() + cacheTime * 1000).toISOString());
    response.headers.set('X-Debug-Timestamp', new Date().toISOString());

    // Vary头确保不同设备有不同缓存
    response.headers.set('Vary', 'Accept-Encoding, User-Agent');

    return response;
  } catch (error) {
    console.error('获取短剧列表失败，返回备用数据:', error);
    
    // 返回默认列表数据作为备用
    const mockList = Array.from({ length: 20 }, (_, index) => {
        const classOptions = ['都市情感', '古装宫廷', '现代言情'];
        return {
            id: `mock_${index}`,
            name: `短剧示例 ${index + 1}`,
            cover: 'https://via.placeholder.com/300x400',
            update_time: new Date().toISOString(),
            score: Math.floor(Math.random() * 5) + 6,
            episode_count: 1,
            description: `这是短剧 ${index + 1} 的示例描述。`,
        };
    });

    return NextResponse.json({
        list: mockList,
        hasMore: false,
    });
  }
}
