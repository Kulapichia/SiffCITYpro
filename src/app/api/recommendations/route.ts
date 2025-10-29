import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const RECOMMENDATIONS_KEY = 'recommendations:movie_titles_cache';
const LAST_UPDATED_KEY = 'recommendations:last_updated';
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天（毫秒）

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('API 路由已命中！'); // 早期日志
  
  try {
    const { origin } = new URL(request.url);

    console.log('尝试从数据库获取 LAST_UPDATED_KEY...');
    const lastUpdatedStr = await db.getCache(LAST_UPDATED_KEY);
    console.log(`已获取 LAST_UPDATED_KEY: ${lastUpdatedStr}`);
    const lastUpdated = typeof lastUpdatedStr === 'number' ? lastUpdatedStr : 0;
    const now = Date.now();

    console.log(`当前时间: ${new Date(now).toISOString()}`);
    console.log(`最后更新时间: ${lastUpdated ? new Date(lastUpdated).toISOString() : '从不'}`);
    console.log(`刷新间隔: ${REFRESH_INTERVAL_MS / (1000 * 60 * 60 * 24)} 天`);

    let recommendedMovies: string[] = [];

    // 检查是否需要刷新
    if (!lastUpdated || (now - lastUpdated > REFRESH_INTERVAL_MS)) {
      console.log('需要刷新。尝试刷新缓存...');
      try {
        // 从内部豆瓣 API 获取
        const fetchUrl = `${origin}/api/douban/categories?kind=movie&category=热门&type=全部&limit=50`;
        console.log(`正在从内部 API 获取数据: ${fetchUrl}`);
        const response = await fetch(fetchUrl);

        if (!response.ok) {
          console.error(`豆瓣 API 响应不正常: ${response.status} ${response.statusText}`);
          throw new Error(`Failed to fetch from Douban API: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('从豆瓣 API 接收到数据:', data);
        const allMovies: { title: string; id: string }[] = data.list || [];

        // 提取标题并去重
        const uniqueTitles = Array.from(new Set(allMovies.map(movie => movie.title)));
        console.log('已提取唯一标题:', uniqueTitles.length);

        if (uniqueTitles.length > 0) {
            // 转换为逗号分隔的字符串进行存储
            const moviesCsv = uniqueTitles.join(',');
            console.log(`尝试将 RECOMMENDED_MOVIES_KEY 存储为 CSV。大小: ${moviesCsv.length} 字符。`);
            await db.setCache(RECOMMENDATIONS_KEY, moviesCsv);
            console.log('已将推荐电影存储到数据库。');
    
            await db.setCache(LAST_UPDATED_KEY, now);
            console.log('已将最后更新时间戳存储到数据库。');
        }

        recommendedMovies = uniqueTitles;
        console.log('推荐电影缓存已刷新并存储。');
      } catch (error) {
        console.error('刷新推荐电影缓存时出错:', error);
        // 如果刷新失败，尝试从现有缓存加载
        const cachedMoviesStr = await db.getCache(RECOMMENDATIONS_KEY);
        if (cachedMoviesStr && typeof cachedMoviesStr === 'string') {
          recommendedMovies = cachedMoviesStr.split(',');
          console.log('由于刷新失败，已从现有缓存加载推荐电影。');
        } else {
          console.log('刷新失败后未找到现有缓存。');
        }
      }
    } else {
      console.log('缓存是新的。正在从数据库缓存加载...');
      // 从缓存加载
      const cachedMoviesStr = await db.getCache(RECOMMENDATIONS_KEY);
      console.log(`已获取 RECOMMENDED_MOVIES_KEY: ${typeof cachedMoviesStr === 'string' ? cachedMoviesStr.substring(0, 100) + '...' : '空或无'}`);
      if (cachedMoviesStr && typeof cachedMoviesStr === 'string') {
        recommendedMovies = cachedMoviesStr.split(',');
        console.log('已从数据库缓存加载推荐电影。');
        console.log(`解析后的 recommendedMovies 长度: ${recommendedMovies.length}`);
      } else {
        console.log('缓存中未找到推荐电影。');
      }
    }

    // 打乱并获取 6 个随机推荐
    const shuffled = recommendedMovies.sort(() => 0.5 - Math.random());
    const selectedRecommendations = shuffled.slice(0, 6);

    return NextResponse.json({ list: selectedRecommendations });
  } catch (error) {
    console.error('推荐 API 中出错:', error);
    return NextResponse.json({ list: [] }, { status: 500 });
  }
}
