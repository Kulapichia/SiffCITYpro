import { NextResponse } from 'next/server';

import { getCacheTime, API_CONFIG } from '@/lib/config';

// 强制动态路由，禁用所有缓存
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// 服务端专用函数，直接调用外部API
async function getShortDramaCategoriesInternal() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const response = await fetch(`${API_CONFIG.shortdrama.baseUrl}/vod/categories`, {
    headers: API_CONFIG.shortdrama.headers,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  const categories = data.categories || [];
  return categories.map((item: any) => ({
    type_id: item.type_id,
    type_name: item.type_name,
  }));
}

export async function GET() {
  try {
    const categories = await getShortDramaCategoriesInternal();

    // 设置与网页端一致的缓存策略（categories: 4小时）
    const response = NextResponse.json(categories);

    console.log('🕐 [CATEGORIES] 设置4小时HTTP缓存 - 与网页端categories缓存一致');

    // 4小时 = 14400秒（与网页端SHORTDRAMA_CACHE_EXPIRE.categories一致）
    const cacheTime = 14400;
    response.headers.set('Cache-Control', `public, max-age=${cacheTime}, s-maxage=${cacheTime}`);
    response.headers.set('CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
    response.headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${cacheTime}`);

    // 调试信息
    response.headers.set('X-Cache-Duration', '4hour');
    response.headers.set('X-Cache-Expires-At', new Date(Date.now() + cacheTime * 1000).toISOString());
    response.headers.set('X-Debug-Timestamp', new Date().toISOString());

    // Vary头确保不同设备有不同缓存
    response.headers.set('Vary', 'Accept-Encoding, User-Agent');

    return response;
  } catch (error) {
    console.error('获取短剧分类失败，返回备用数据:', error);
    
    // 如果外部API失败，返回默认分类数据作为备用
    const fallbackCategories = [
      { type_id: 1, type_name: '古装' },
      { type_id: 2, type_name: '现代' },
      { type_id: 3, type_name: '都市' },
      { type_id: 4, type_name: '言情' },
      { type_id: 5, type_name: '悬疑' },
      { type_id: 6, type_name: '喜剧' },
      { type_id: 7, type_name: '其他' },
    ];
    
    const response = NextResponse.json(fallbackCategories);
    // 对备用数据也设置缓存，避免短时间内对失效接口的频繁请求
    const cacheTime = 300; // 备用数据缓存5分钟
    response.headers.set('Cache-Control', `public, max-age=${cacheTime}, s-maxage=${cacheTime}`);
    return response;
  }
}
