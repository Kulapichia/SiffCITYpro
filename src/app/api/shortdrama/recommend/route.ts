import { NextRequest, NextResponse } from 'next/server';
import { getCacheTime, API_CONFIG } from '@/lib/config';

// 强制动态路由，禁用所有缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// 服务端专用函数，直接调用外部API
async function getRecommendedShortDramasInternal(
  category?: number,
  size = 10
) {
  // 为外部API请求设置5秒超时，防止长时间等待
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const params = new URLSearchParams();
    if (category) params.append('category', category.toString());
    params.append('size', size.toString());

    // 使用 API_CONFIG 构建请求URL，避免硬编码
    const apiUrl = `${API_CONFIG.shortdrama.baseUrl}/vod/recommend?${params.toString()}`;

    const response = await fetch(
      apiUrl,
      {
        //  使用 API_CONFIG 中的通用请求头，并关联超时控制器
        headers: API_CONFIG.shortdrama.headers,
        signal: controller.signal,
      }
    );

    // 请求成功后，清除超时定时器
    clearTimeout(timeoutId);

    if (!response.ok) {
      // 外部API返回非2xx状态码，抛出错误
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const items = data.items || [];
    
    // 返回格式化后的数据，此逻辑保持不变
    return items.map((item: any) => ({
      id: item.vod_id || item.id,
      name: item.vod_name || item.name,
      cover: item.vod_pic || item.cover,
      update_time: item.vod_time || item.update_time || new Date().toISOString(),
      score: item.vod_score || item.score || 0,
      episode_count: parseInt(item.vod_remarks?.replace(/[^\d]/g, '') || '1'),
      description: item.vod_content || item.description || '',
    }));
  } catch (error) {
    // [新增] 在捕获到任何错误时（包括超时），确保清除定时器
    clearTimeout(timeoutId);
    console.error('内部函数 getRecommendedShortDramasInternal 失败:', error);
    // 返回空数组，使上层调用可以优雅地处理失败情况
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category');
    const size = searchParams.get('size');

    const categoryNum = category ? parseInt(category) : undefined;
    const pageSize = size ? parseInt(size) : 10;

    if ((category && isNaN(categoryNum!)) || isNaN(pageSize)) {
      return NextResponse.json(
        { error: '参数格式错误' },
        { status: 400 }
      );
    }

    const result = await getRecommendedShortDramasInternal(categoryNum, pageSize);

    // 测试1小时HTTP缓存策略
    const response = NextResponse.json(result);

    console.log('🕐 [RECOMMEND] 设置1小时HTTP缓存 - 测试自动过期刷新');

    // 1小时 = 3600秒
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
    console.error('获取推荐短剧失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
