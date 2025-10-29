/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";

export const runtime = 'nodejs';

// Key 缓存管理
const keyCache = new Map<string, { data: ArrayBuffer; timestamp: number; etag?: string }>();
const KEY_CACHE_TTL = 300000; // 缓存5分钟
const MAX_CACHE_SIZE = 200; // 最多缓存200个密钥

// --- 高性能Node.js连接池 ---
import * as https from 'https';
import * as http from 'http';

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 30,
  maxFreeSockets: 10,
  timeout: 15000, // 连接超时
  keepAliveMsecs: 30000,
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 30,
  maxFreeSockets: 10,
  timeout: 15000, // 连接超时
  keepAliveMsecs: 30000,
});

// 性能统计
const keyStats = {
  requests: 0,
  errors: 0,
  cacheHits: 0,
  avgResponseTime: 0,
  totalBytes: 0,
};

/**
 * --- 精细的缓存管理 ---
 * 清理过期的和多余的缓存条目
 */
function cleanupExpiredCache() {
  const now = Date.now();
  let cleanedCount = 0;
  const cacheEntries = Array.from(keyCache.entries());

  for (const [key, value] of cacheEntries) {
    if (now - value.timestamp > KEY_CACHE_TTL) {
      keyCache.delete(key);
      cleanedCount++;
    }
  }
  // 如果清理后缓存仍然过大，则删除最老的条目
  if (keyCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(keyCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => keyCache.delete(key));
    cleanedCount += toDelete.length;
  }

  if (cleanedCount > 0 && process.env.NODE_ENV === 'development') {
    console.log(`Cleaned ${cleanedCount} expired key cache entries`);
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, User-Agent, Referer, If-None-Match',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function GET(request: Request) {
  const startTime = Date.now();
  keyStats.requests++;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('moontv-source');
  
  if (!url) {
    keyStats.errors++;
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  // --- 强制校验 moontv-source 参数 ---
  if (!source) {
    keyStats.errors++;
    return NextResponse.json(
      { error: 'Missing moontv-source parameter' },
      { status: 400 }
    );
  }
  
  const config = await getConfig();
  // --- 同时查找直播源和点播源 ---
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  const vodSource = config.SourceConfig?.find((s: any) => s.key === source);

  if (!liveSource && !vodSource) {
    keyStats.errors++;
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }
  
  // --- 智能User-Agent模拟 ---
  const ua = liveSource?.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  let decodedUrl = '';
  try {
    decodedUrl = decodeURIComponent(url);
  } catch (e) {
    keyStats.errors++;
    return NextResponse.json({ error: 'Invalid URL encoding' }, { status: 400 });
  }
  const cacheKey = `${source}-${decodedUrl}`;
  const ifNoneMatch = request.headers.get('If-None-Match');

  // --- 内存高速缓存 (Map + TTL) ---
  const cached = keyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < KEY_CACHE_TTL) {
    keyStats.cacheHits++;
    
    // --- ETag与304缓存验证 ---
    if (ifNoneMatch && cached.etag && ifNoneMatch === cached.etag) {
        const responseTime = Date.now() - startTime;
        keyStats.avgResponseTime = (keyStats.avgResponseTime * (keyStats.requests - 1) + responseTime) / keyStats.requests;
        return new Response(null, { status: 304 });
    }
    
    const responseTime = Date.now() - startTime;
    keyStats.avgResponseTime = (keyStats.avgResponseTime * (keyStats.requests - 1) + responseTime) / keyStats.requests;

    return new Response(cached.data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': `public, max-age=${Math.round(KEY_CACHE_TTL / 1000)}`,
        'X-Cache': 'HIT',
        'Content-Length': cached.data.byteLength.toString(),
        ...(cached.etag && { 'ETag': cached.etag }),
      },
    });
  }

  try {
    const isHttps = decodedUrl.startsWith('https:');
    const agent = isHttps ? httpsAgent : httpAgent;
    
    const requestHeaders: Record<string, string> = {
      'User-Agent': ua,
      'Accept': 'application/octet-stream, */*',
      'Connection': 'keep-alive',
      // 如果有缓存（即使已过期），也带上ETag进行验证
      ...(cached?.etag && { 'If-None-Match': cached.etag }),
    };

    // --- 智能 Referer 与超时策略 ---
    try {
      const urlObject = new URL(decodedUrl);
      const domain = urlObject.hostname;
      
      // 为不同的视频源设置专门的Referer策略
      if (domain.includes('bvvvvvvv7f.com')) {
        requestHeaders['Referer'] = 'https://www.bvvvvvvv7f.com/';
      } else if (domain.includes('dytt-music.com')) {
        requestHeaders['Referer'] = 'https://www.dytt-music.com/';
      } else if (domain.includes('high25-playback.com')) {
        requestHeaders['Referer'] = 'https://www.high25-playback.com/';
      } else if (domain.includes('ffzyread2.com')) {
        requestHeaders['Referer'] = 'https://www.ffzyread2.com/';
      } else if (domain.includes('wlcdn88.com')) {
        requestHeaders['Referer'] = 'https://www.wlcdn88.com/';
      } else {
        // 通用策略：使用同域根路径
        requestHeaders['Referer'] = urlObject.origin + '/';
      }
    } catch {
      // URL解析失败时不设置Referer
      console.warn('Failed to parse URL for Referer:', decodedUrl);
    }


    const response = await fetch(decodedUrl, {
      headers: requestHeaders,
      signal: AbortSignal.timeout(10000), // 密钥文件很小，10秒超时足够
      // @ts-ignore - Node.js specific option for connection pooling
      agent: typeof window === 'undefined' ? agent : undefined,
    });

    // --- ETag与304缓存验证 ---
    if (response.status === 304 && cached) {
      keyStats.cacheHits++;
      // 密钥未改变，更新缓存时间戳并返回旧数据
      cached.timestamp = Date.now();
      keyCache.set(cacheKey, cached);

      const responseTime = Date.now() - startTime;
      keyStats.avgResponseTime = (keyStats.avgResponseTime * (keyStats.requests - 1) + responseTime) / keyStats.requests;

      return new Response(cached.data, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': `public, max-age=${Math.round(KEY_CACHE_TTL / 1000)}`,
          'X-Cache': '304-HIT',
          'Content-Length': cached.data.byteLength.toString(),
          ...(cached.etag && { 'ETag': cached.etag }),
        },
      });
    }
    
    if (!response.ok) {
      keyStats.errors++;
      return NextResponse.json(
        { error: `Failed to fetch key: ${response.statusText}` },
        { status: response.status }
      );
    }
    const keyData = await response.arrayBuffer();
    const etag = response.headers.get('ETag');

    // 存入缓存
    keyCache.set(cacheKey, { 
      data: keyData, 
      timestamp: Date.now(),
      etag: etag || undefined
    });

    // 触发缓存清理
    if (keyCache.size > MAX_CACHE_SIZE || keyStats.requests % 50 === 0) {
      cleanupExpiredCache();
    }
    
    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, User-Agent, Referer, If-None-Match');
    headers.set('Cache-Control', `public, max-age=${Math.round(KEY_CACHE_TTL / 1000)}`);
    headers.set('X-Cache', 'MISS');
    headers.set('Content-Length', keyData.byteLength.toString());
    if (etag) {
      headers.set('ETag', etag);
    }

    // 更新统计信息
    keyStats.totalBytes += keyData.byteLength;
    const responseTime = Date.now() - startTime;
    keyStats.avgResponseTime = (keyStats.avgResponseTime * (keyStats.requests - 1) + responseTime) / keyStats.requests;

    return new Response(keyData, { headers });
  } catch (error) {
    keyStats.errors++;
    // --- 增强的错误处理 ---
    console.error(`[Key Proxy Error] 代理失败: ${decodedUrl}`, {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    
    let statusCode = 502; // Bad Gateway 作为默认值
    let errorMessage = '代理密钥文件失败';

    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        statusCode = 504; // Gateway Timeout 更精确
        errorMessage = '源服务器请求超时';
      } else if (error.message.includes('network') || error.message.includes('fetch') || (error as any).code === 'ENOTFOUND' || (error as any).code === 'ECONNREFUSED') {
        statusCode = 502; // Bad Gateway
        errorMessage = '从源服务器获取密钥时发生网络错误';
      }
    }

    // 确保总是返回一个 NextResponse 对象
    return NextResponse.json(
      { error: errorMessage },
      { 
        status: statusCode,
        headers: { 'Access-Control-Allow-Origin': '*' }
      }
    );
  } finally {
    // 定期打印统计信息
    if (keyStats.requests % 100 === 0 && process.env.NODE_ENV === 'development') {
      const hitRate = keyStats.requests > 0 ? (keyStats.cacheHits / keyStats.requests * 100) : 0;
      console.log(`Key Proxy Stats - Requests: ${keyStats.requests}, Cache Hits: ${keyStats.cacheHits} (${hitRate.toFixed(1)}%), Errors: ${keyStats.errors}, Avg Time: ${keyStats.avgResponseTime.toFixed(2)}ms, Cache Size: ${keyCache.size}, Total: ${(keyStats.totalBytes / 1024).toFixed(2)}KB`);
    }
  }
}
