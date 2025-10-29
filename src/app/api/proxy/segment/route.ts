/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";

export const runtime = 'nodejs';

// 连接池管理
import * as https from 'https';
import * as http from 'http';

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 20,
  timeout: 75000, // 保持更长超时
  keepAliveMsecs: 30000,
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 20,
  timeout: 75000, // 保持更长超时
  keepAliveMsecs: 30000,
});

// 性能统计
const segmentStats = {
  requests: 0,
  errors: 0,
  totalBytes: 0,
  avgResponseTime: 0,
  activeStreams: 0,
};

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, User-Agent, Referer',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function GET(request: Request) {
  const startTime = Date.now();
  segmentStats.requests++;
  segmentStats.activeStreams++;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('moontv-source');
  
  if (!url) {
    segmentStats.errors++;
    segmentStats.activeStreams--;
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  // --- 强制校验 moontv-source 参数 ---
  if (!source) {
    segmentStats.errors++;
    segmentStats.activeStreams--;
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
    segmentStats.errors++;
    segmentStats.activeStreams--;
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }
  
  // --- 智能User-Agent模拟 ---
  const ua = liveSource?.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  // 优化: 智能超时策略
  const getTimeoutBySourceDomain = (domain: string): number => {
    const knownSlowDomains = ['bvvvvvvv7f.com', 'dytt-music.com', 'high25-playback.com', 'ffzyread2.com'];
    return knownSlowDomains.some(slow => domain.includes(slow)) ? 75000 : 60000;
  };

  let response: Response | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let decodedUrl = ''; // 提升作用域

  try {
    decodedUrl = decodeURIComponent(url);
    const isHttps = decodedUrl.startsWith('https:');
    const agent = isHttps ? httpsAgent : httpAgent;

    const requestHeaders: Record<string, string> = {
      'User-Agent': ua,
      'Accept': '*/*', // 使用更通用的Accept头
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
    };

    const range = request.headers.get('range');
    if (range) {
      requestHeaders['Range'] = range;
    }

    let timeout = 60000; // 默认60秒超时

    // --- 智能 Referer 与超时策略 ---
    try {
      const urlObject = new URL(decodedUrl);
      const domain = urlObject.hostname;
      
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
        requestHeaders['Referer'] = urlObject.origin + '/';
      }
      
      timeout = getTimeoutBySourceDomain(domain);
    } catch {
      console.warn('Failed to parse URL for Referer:', decodedUrl);
    }

    response = await fetch(decodedUrl, {
      signal: AbortSignal.timeout(timeout),
      headers: requestHeaders,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Node.js specific option
      agent: typeof window === 'undefined' ? agent : undefined,
    });

    if (!response.ok) {
      segmentStats.errors++;
      // 保留更简洁的错误返回
      return NextResponse.json({ 
        error: `Failed to fetch segment: ${response.status} ${response.statusText}` 
      }, { status: response.status >= 500 ? 500 : response.status });
    }

    const headers = new Headers();
    
    // 设置内容类型 - 保留精确判断
    const originalContentType = response?.headers.get('Content-Type');
    if (originalContentType) {
      headers.set('Content-Type', originalContentType);
    } else {
      headers.set('Content-Type', 'video/mp2t');
    }
    
    // 设置更全面的CORS头
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range, Content-Type, User-Agent, Referer');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
    if (!headers.has('accept-ranges')) {
      headers.set('Accept-Ranges', 'bytes');
    }
    // 使用更长的缓存策略
    headers.set('Cache-Control', 'public, max-age=86400, immutable');
    
    // 复制原始响应的重要头部
    ['Content-Length', 'Content-Range', 'Last-Modified', 'ETag', 'accept-ranges', 'content-type'].forEach(header => {
      const value = response?.headers.get(header);
      if (value) {
        headers.set(header, value);
      }
    });

    let bytesTransferred = 0;

    // 优化的流式传输，带背压控制
    const stream = new ReadableStream({
      start(controller) {
        if (!response?.body) {
          controller.close();
          segmentStats.activeStreams--;
          return;
        }

        reader = response?.body?.getReader();
        let isCancelled = false;

        function pump(): void {
          if (isCancelled || !reader) {
            return;
          }

          reader.read().then(({ done, value }) => {
            if (isCancelled) {
              return;
            }

            if (done) {
              controller.close();
              cleanup();
              
              // 更新统计信息
              const responseTime = Date.now() - startTime;
              segmentStats.avgResponseTime = 
                (segmentStats.avgResponseTime * (segmentStats.requests - 1) + responseTime) / segmentStats.requests;
              segmentStats.totalBytes += bytesTransferred;
              segmentStats.activeStreams--;
              
              return;
            }

            if (value) {
              bytesTransferred += value.byteLength;
            }

            try {
              controller.enqueue(value);
            } catch (e) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('Failed to enqueue chunk:', e);
              }
              cleanup();
              return;
            }
            
            pump();
          }).catch((error) => {
            if (!isCancelled) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('Stream pump error:', error);
              }
              controller.error(error);
              cleanup();
            }
          });
        }

        function cleanup() {
          if (reader) {
            try {
              reader.releaseLock();
            } catch (e) {
              // reader 可能已经被释放，忽略错误
            }
            reader = null;
          }
          segmentStats.activeStreams--;
        }

        pump();
      },
      cancel() {
        // 当流被取消时，确保释放所有资源
        if (reader) {
          try {
            reader.cancel();
            reader.releaseLock();
          } catch (e) {
            // ignore
          }
          reader = null;
        }

        if (response?.body) {
          try {
            response.body.cancel();
          } catch (e) {
            // 忽略取消时的错误
          }
        }
        
        segmentStats.activeStreams--;
      }
    }, {
      // 添加背压控制
      highWaterMark: 65536, // 64KB 缓冲区
      size(chunk) {
        return chunk ? chunk.byteLength : 0;
      }
    });

    return new Response(stream, { status: response.status, headers });
    
  } catch (error: any) {
    segmentStats.errors++;
    segmentStats.activeStreams--;
    
    // 确保在错误情况下也释放资源
    if (reader) {
      try {
        (reader as ReadableStreamDefaultReader<Uint8Array>).releaseLock();
      } catch (e) {
        // 忽略错误
      }
    }

    if (response?.body) {
      try {
        response.body.cancel();
      } catch (e) {
        // 忽略错误
      }
    }

    // --- 功能增强: 更详细的错误日志和状态码 ---
    console.error('代理分片请求失败:', {
        url: searchParams.get('url'),
        error: error instanceof Error ? error.message : String(error),
    });

    let statusCode = 502; // Bad Gateway 作为默认值
    let errorMessage = '代理视频分片失败';
  
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        statusCode = 504; // Gateway Timeout 更精确
        errorMessage = '源服务器请求超时';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        statusCode = 502; // Bad Gateway
        errorMessage = '从源服务器获取视频分片时发生网络错误';
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
    
  } finally {
    // 定期打印统计信息
    if (segmentStats.requests % 500 === 0 && process.env.NODE_ENV === 'development') {
      console.log(`Segment Proxy Stats - Requests: ${segmentStats.requests}, Active: ${segmentStats.activeStreams}, Errors: ${segmentStats.errors}, Avg Time: ${segmentStats.avgResponseTime.toFixed(2)}ms, Total: ${(segmentStats.totalBytes / 1024 / 1024).toFixed(2)}MB`);
    }
  }
}
