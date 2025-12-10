/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

// 1. 修改导入：移除客户端函数，引入 API_CONFIG
import { getCacheTime, API_CONFIG, getConfig } from '@/lib/config';
import { parseShortDramaEpisode } from '@/lib/shortdrama.client';
// 标记为动态路由
export const dynamic = 'force-dynamic';

/**
 * [服务端专用] 直接请求外部API获取短剧单集详情
 * 这个函数取代了之前对客户端 `parseShortDramaEpisode` 的不当调用。
 * 它返回与原函数相同的数据结构，以确保无缝替换。
 */
async function getShortDramaDetailInternal(videoId: number, episodeNum: number, useProxy: boolean): Promise<any> {
  const controller = new AbortController();
  // 设置一个合理的超时时间，例如 8 秒
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const apiUrl = new URL(`${API_CONFIG.shortdrama.baseUrl}/vod/parse/single`);
    apiUrl.searchParams.set('id', videoId.toString());
    apiUrl.searchParams.set('episode', episodeNum.toString());
    if (useProxy) {
      apiUrl.searchParams.set('proxy', 'true');
    }

    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: API_CONFIG.shortdrama.headers,
      signal: controller.signal, // 应用超时控制
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // 模拟网络或HTTP错误时的返回结构
      return { code: -1, msg: `HTTP error! status: ${response.status}` };
    }

    const data = await response.json();

    // 外部API本身可能返回错误码
    if (data.code === 1) {
      return { code: data.code, msg: data.msg || 'API解析失败' };
    }

    // 成功时，包装成与原 `parseShortDramaEpisode` 一致的 { code: 0, data: {...} } 结构
    return {
      code: 0,
      data: {
        videoId: data.videoId || videoId,
        videoName: data.videoName || '',
        currentEpisode: data.episode?.index || episodeNum,
        totalEpisodes: data.totalEpisodes || 1,
        parsedUrl: data.episode?.parsedUrl || data.parsedUrl || '',
        proxyUrl: data.episode?.proxyUrl || '',
        cover: data.cover || '',
        description: data.description || '',
        episode: data.episode || null,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[Internal Fetch Error] ID: ${videoId}, Episode: ${episodeNum}`, error);
    // 捕获fetch本身的异常（如超时）
    return { code: -1, msg: '服务器请求外部API失败' };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');
    const episode = searchParams.get('episode');
    const name = searchParams.get('name'); // 可选：用于备用API
    if (!id) {
      return NextResponse.json(
        { error: '缺少必要参数: id' },
        { status: 400 }
      );
    }

    const videoId = parseInt(id);
    const episodeNum = episode ? parseInt(episode) : 1;

    if (isNaN(videoId) || isNaN(episodeNum)) {
      return NextResponse.json(
        { error: '参数格式错误' },
        { status: 400 }
      );
    }

    // 2. 将原来的 `parseShortDramaEpisode` 调用替换为新的内部函数
    // 先尝试指定集数
    // let result = await getShortDramaDetailInternal(videoId, episodeNum, true);
    // 读取配置以获取备用API地址
    let alternativeApiUrl: string | undefined;
    try {
      const config = await getConfig();
      const shortDramaConfig = config.ShortDramaConfig;
      alternativeApiUrl = shortDramaConfig?.enableAlternative ? shortDramaConfig.alternativeApiUrl : undefined;
    } catch (configError) {
      console.error('读取短剧配置失败:', configError);
      // 配置读取失败时，不使用备用API
      alternativeApiUrl = undefined;
    }

    // 先尝试指定集数，如果提供了剧名且配置了备用API则自动fallback
    let result = await parseShortDramaEpisode(
      videoId,
      episodeNum,
      true,
      name || undefined,
      alternativeApiUrl
    );
    // 如果失败，尝试其他集数
    if (result.code !== 0 || !result.data || !result.data.totalEpisodes) {
      result = await parseShortDramaEpisode(
        videoId,
        episodeNum === 1 ? 2 : 1,
        true,
        name || undefined,
        alternativeApiUrl
      );
    }

    // 如果还是失败，尝试第0集
    if (result.code !== 0 || !result.data || !result.data.totalEpisodes) {
      result = await parseShortDramaEpisode(
        videoId,
        0,
        true,
        name || undefined,
        alternativeApiUrl
      );
    }

    if (result.code !== 0 || !result.data) {
      return NextResponse.json(
        { error: result.msg || '解析失败' },
        { status: 400 }
      );
    }

    const totalEpisodes = Math.max(result.data.totalEpisodes || 1, 1);

    // 转换为兼容格式
    // 注意：始终使用请求的原始ID（主API的ID），不使用result.data.videoId（可能是备用API的ID）
    const response: any = {
      id: id, // 使用原始请求ID，保持一致性
      title: result.data!.videoName,
      poster: result.data!.cover,
      episodes: Array.from({ length: totalEpisodes }, (_, i) =>
        `shortdrama:${id}:${i}` // 使用原始请求ID
      ),
      episodes_titles: Array.from({ length: totalEpisodes }, (_, i) =>
        `第${i + 1}集`
      ),
      source: 'shortdrama',
      source_name: '短剧',
      year: new Date().getFullYear().toString(),
      desc: result.data!.description,
      type_name: '短剧',
      drama_name: result.data!.videoName, // 添加剧名，用于备用API fallback
    };
    // 如果备用API返回了元数据，添加到响应中
    if (result.metadata) {
      response.metadata = result.metadata;
    }
    // 设置与豆瓣一致的缓存策略
    const cacheTime = await getCacheTime();
    const finalResponse = NextResponse.json(response);
    finalResponse.headers.set('Cache-Control', `public, max-age=${cacheTime}, s-maxage=${cacheTime}`);
    finalResponse.headers.set('CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
    finalResponse.headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${cacheTime}`);
    finalResponse.headers.set('Netlify-Vary', 'query');

    return finalResponse;
  } catch (error) {
    console.error('短剧详情获取失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
