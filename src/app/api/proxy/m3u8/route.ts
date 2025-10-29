/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import * as https from 'https';
import * as http from 'http';

import { getConfig } from "@/lib/config";
import { getBaseUrl, resolveUrl } from "@/lib/live";

export const runtime = 'nodejs';

// --- 高性能Node.js连接池 ---
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 45000, // 增加默认超时以适应慢速源
  keepAliveMsecs: 30000,
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 45000, // 增加默认超时以适应慢速源
  keepAliveMsecs: 30000,
});

// 性能统计 (来自项目A)
const stats = {
  requests: 0,
  errors: 0,
  avgResponseTime: 0,
  totalBytes: 0,
};

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, Origin, Accept, User-Agent, Referer',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function GET(request: Request) {
  const startTime = Date.now();
  stats.requests++;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const allowCORS = searchParams.get('allowCORS') === 'true';
  const source = searchParams.get('moontv-source');
  
  if (!url) {
    stats.errors++;
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  // --- 强制校验 moontv-source 参数 (来自项目B) ---
  if (!source) {
    stats.errors++;
    return NextResponse.json(
      { error: 'Missing moontv-source parameter' },
      { status: 400 }
    );
  }

  const config = await getConfig();
  // --- 优先查找直播源，点播源作为备选 (来自项目B) ---
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  const vodSource = config.SourceConfig?.find((s: any) => s.key === source);

  if (!liveSource && !vodSource) {
    stats.errors++;
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  // --- 智能User-Agent模拟 (来自项目B，融合项目A的UA作为备选) ---
  const ua = liveSource?.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  
  // --- 智能超时策略 (来自项目B) ---
  const getTimeoutBySourceDomain = (domain: string): number => {
    const knownSlowDomains = ['bvvvvvvv7f.com', 'dytt-music.com', 'high25-playback.com', 'ffzyread2.com'];
    // 如果域名包含在慢速列表中，给予更长的超时时间
    return knownSlowDomains.some(slow => domain.includes(slow)) ? 45000 : 30000;
  };
  
  let response: Response | null = null;
  let responseUsed = false;
  let decodedUrl = ''; // 将 decodedUrl 提升作用域以便在 catch 中使用

  try {
    decodedUrl = decodeURIComponent(url);
    
    // --- 选择合适的 agent (来自项目B) ---
    const isHttps = decodedUrl.startsWith('https:');
    const agent = isHttps ? httpsAgent : httpAgent;

    const requestHeaders: Record<string, string> = {
      'User-Agent': ua,
      'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,application/octet-stream,*/*',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
    };

    let timeout = 30000; // 默认30秒超时

    // --- 智能 Referer 与超时策略 (来自项目B) ---
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
      timeout = getTimeoutBySourceDomain(domain);
    } catch {
      // URL解析失败时不设置Referer
      console.warn('Failed to parse URL for Referer:', decodedUrl);
    }

    response = await fetch(decodedUrl, {
      cache: 'no-cache',
      redirect: 'follow',
      credentials: 'omit', 
      signal: AbortSignal.timeout(timeout),
      headers: requestHeaders,
      // @ts-ignore - Node.js specific option for connection pooling
      agent: typeof window === 'undefined' ? agent : undefined,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch m3u8 from source: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type') || '';
    const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
    
    // rewrite m3u8
    if (
      contentType.toLowerCase().includes('mpegurl') ||
      contentType.toLowerCase().includes('octet-stream')
    ) {
      // 获取最终的响应URL（处理重定向后的URL）
      const finalUrl = response.url;
      const m3u8Content = await response.text();
      responseUsed = true; // 标记 response 已被使用

      // 更新统计信息
      if (contentLength > 0) {
        stats.totalBytes += contentLength;
      } else {
        stats.totalBytes += m3u8Content.length;
      }

      // 使用最终的响应URL作为baseUrl，而不是原始的请求URL
      const baseUrl = getBaseUrl(finalUrl);
      // 重写 M3U8 内容
      const modifiedContent = rewriteM3U8Content(
        m3u8Content,
        baseUrl,
        request,
        allowCORS,
        source
      );

      const headers = new Headers();
      headers.set('Content-Type', contentType || 'application/vnd.apple.mpegurl');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Accept, User-Agent, Referer');
      headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
      headers.set('Cache-Control', 'public, max-age=10');
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
      headers.set('Content-Length', modifiedContent.length.toString());

      // 更新性能统计
      const responseTime = Date.now() - startTime;
      stats.avgResponseTime = (stats.avgResponseTime * (stats.requests - 1) + responseTime) / stats.requests;
      
      return new Response(modifiedContent, { headers });
    }

    // 对于非M3U8内容，直接代理
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
    headers.set('Cache-Control', 'no-cache');
    
    // 更新统计信息
    if (contentLength > 0) {
      stats.totalBytes += contentLength;
    }
    const responseTime = Date.now() - startTime;
    stats.avgResponseTime = (stats.avgResponseTime * (stats.requests - 1) + responseTime) / stats.requests;

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

  } catch (error) {
    stats.errors++;
    // --- 增强的错误处理 (来自项目B) ---
    console.error('代理M3U8请求失败:', {
      url: decodedUrl,
      error: error instanceof Error ? error.message : String(error),
    });
  
    // 根据错误类型返回不同的状态码
    let statusCode = 502; // Bad Gateway 作为默认值，比 500 更贴切
    let errorMessage = '代理 M3U8 文件失败';
  
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        statusCode = 504; // Gateway Timeout 更精确
        errorMessage = '源服务器请求超时';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        statusCode = 502; // Bad Gateway
        errorMessage = '从源服务器获取 M3U8 时发生网络错误';
      }
    }
  
    return NextResponse.json(
      { error: errorMessage },
      {
        status: statusCode,
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    );
  } finally {
    // 确保 response 被正确关闭以释放资源
    if (response && !responseUsed && response.body) {
      try {
        await response.body.cancel();
      } catch (e) {
        // 忽略关闭时的错误
        console.warn('Failed to cancel response body on error:', e);
      }
    }

    // 定期打印统计信息
    if (stats.requests % 100 === 0 && process.env.NODE_ENV === 'development') {
      console.log(`M3U8 Proxy Stats - Requests: ${stats.requests}, Errors: ${stats.errors}, Avg Response Time: ${stats.avgResponseTime.toFixed(2)}ms, Total Bytes: ${(stats.totalBytes / 1024 / 1024).toFixed(2)}MB`);
    }
  }
}

function rewriteM3U8Content(
  content: string,
  baseUrl: string,
  req: Request,
  allowCORS: boolean,
  source: string | null
) {
  // --- 更健壮的协议判断 (来自项目B) ---
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const referer = req.headers.get('referer');
  let protocol = 'http';

  if (forwardedProto) {
    protocol = forwardedProto.split(',')[0].trim();
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      protocol = refererUrl.protocol.replace(':', '');
    } catch (error) {
      // 忽略referer解析错误
    }
  }

  const host = req.headers.get('host');
  const proxyBase = `${protocol}://${host}/api/proxy`;

  const lines = content.split('\n');
  const rewrittenLines: string[] = [];
  const variables = new Map<string, string>(); // 用于 EXT-X-DEFINE 变量替换

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // 处理 TS 片段 URL 和其他媒体文件
    if (line && !line.startsWith('#')) {
      const resolvedUrl = resolveUrl(baseUrl, line);
      // 智能判断：只有当 allowCORS 为 true 且链接是 https 时，才允许直连。
      // 否则，强制通过代理来解决 http 混合内容问题。
      const isSafeDirectLink = allowCORS && resolvedUrl.startsWith('https://');
      
      const proxyUrl = isSafeDirectLink
        ? resolvedUrl
        : `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
      rewrittenLines.push(proxyUrl);
      continue;
    }

    // 处理变量定义 (EXT-X-DEFINE)
    if (line.startsWith('#EXT-X-DEFINE:')) {
      line = processDefineVariables(line, variables);
    }

    // 处理 EXT-X-MAP 标签中的 URI
    if (line.startsWith('#EXT-X-MAP:')) {
      line = rewriteMapUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理 EXT-X-KEY 标签中的 URI
    if (line.startsWith('#EXT-X-KEY:')) {
      line = rewriteKeyUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理 EXT-X-MEDIA 标签中的 URI (音频轨道等)
    if (line.startsWith('#EXT-X-MEDIA:')) {
      line = rewriteMediaUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理 LL-HLS 部分片段 (EXT-X-PART)
    if (line.startsWith('#EXT-X-PART:')) {
      line = rewritePartUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理内容导向 (EXT-X-CONTENT-STEERING)
    if (line.startsWith('#EXT-X-CONTENT-STEERING:')) {
      line = rewriteContentSteeringUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理会话数据 (EXT-X-SESSION-DATA) - 可能包含 URI
    if (line.startsWith('#EXT-X-SESSION-DATA:')) {
      line = rewriteSessionDataUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理会话密钥 (EXT-X-SESSION-KEY)
    if (line.startsWith('#EXT-X-SESSION-KEY:')) {
      line = rewriteSessionKeyUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理嵌套的 M3U8 文件 (EXT-X-STREAM-INF)
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      rewrittenLines.push(line);
      // 下一行通常是 M3U8 URL
      if (i + 1 < lines.length) {
        i++;
        const nextLine = lines[i].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          let resolvedUrl = resolveUrl(baseUrl, nextLine);
          resolvedUrl = substituteVariables(resolvedUrl, variables);
          const proxyUrl = `${proxyBase}/m3u8?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
          rewrittenLines.push(proxyUrl);
        } else {
          rewrittenLines.push(nextLine);
        }
      }
      continue;
    }

    // 处理日期范围标签中的 URI (EXT-X-DATERANGE)
    if (line.startsWith('#EXT-X-DATERANGE:')) {
      line = rewriteDateRangeUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理预加载提示 (EXT-X-PRELOAD-HINT)
    if (line.startsWith('#EXT-X-PRELOAD-HINT:')) {
      line = rewritePreloadHintUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理渲染报告 (EXT-X-RENDITION-REPORT)
    if (line.startsWith('#EXT-X-RENDITION-REPORT:')) {
      line = rewriteRenditionReportUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理服务器控制 (EXT-X-SERVER-CONTROL)
    if (line.startsWith('#EXT-X-SERVER-CONTROL:')) {
      line = rewriteServerControlUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理跳过片段 (EXT-X-SKIP)
    if (line.startsWith('#EXT-X-SKIP:')) {
      line = rewriteSkipUri(line, baseUrl, proxyBase, source, variables);
    }

    rewrittenLines.push(line);
  }

  return rewrittenLines.join('\n');
}

// 变量替换函数 - 参考 hls.js 标准实现
const VARIABLE_REPLACEMENT_REGEX = /\{\$([a-zA-Z0-9-_]+)\}/g;

function substituteVariables(text: string, variables: Map<string, string>): string {
  if (variables.size === 0) {
    return text;
  }
  
  return text.replace(VARIABLE_REPLACEMENT_REGEX, (variableReference: string, variableName: string) => {
    const variableValue = variables.get(variableName);
    if (variableValue === undefined) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Missing variable definition for: "${variableName}"`);
      }
      return variableReference; // 保持原始引用如果变量未定义
    }
    return variableValue;
  });
}

// 处理变量定义
function processDefineVariables(line: string, variables: Map<string, string>): string {
  const nameMatch = line.match(/NAME="([^"]+)"/);
  const valueMatch = line.match(/VALUE="([^"]+)"/);
  
  if (nameMatch && valueMatch) {
    variables.set(nameMatch[1], valueMatch[1]);
  }
  
  return line; // 返回原始标签，让客户端处理
}

function rewriteMapUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>) {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

function rewriteKeyUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>) {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/key?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

function rewriteMediaUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>) {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    
    // 检查URI是否有效，避免nan值
    if (!originalUri || originalUri === 'nan' || originalUri.includes('nan')) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('检测到无效的音频轨道URI:', originalUri, '原始行:', line);
      }
      // 移除URI属性，让HLS.js忽略这个音频轨道
      return line.replace(/,?URI="[^"]*"/, '');
    }
    
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    
    try {
      const resolvedUrl = resolveUrl(baseUrl, originalUri);
      const proxyUrl = `${proxyBase}/m3u8?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
      return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('解析音频轨道URI失败:', originalUri, error);
      }
      // 移除URI属性，让HLS.js忽略这个音频轨道
      return line.replace(/,?URI="[^"]*"/, '');
    }
  }
  return line;
}

// 处理 LL-HLS 部分片段
function rewritePartUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>): string {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

// 处理内容导向
function rewriteContentSteeringUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>): string {
  const serverUriMatch = line.match(/SERVER-URI="([^"]+)"/);
  if (serverUriMatch) {
    let originalUri = serverUriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/m3u8?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
    return line.replace(serverUriMatch[0], `SERVER-URI="${proxyUrl}"`);
  }
  return line;
}

// 处理会话数据
function rewriteSessionDataUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>): string {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

// 处理会话密钥
function rewriteSessionKeyUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>): string {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/key?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

// 处理日期范围标签中的 URI
function rewriteDateRangeUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>): string {
  // SCTE-35 或其他可能包含 URI 的属性
  const uriMatches = Array.from(line.matchAll(/([A-Z-]+)="([^"]*(?:https?:\/\/|\/)[^"]*)"/g));
  let result = line;
  
  for (const match of uriMatches) {
    const [fullMatch, , originalUri] = match;
    if (originalUri.includes('://') || originalUri.startsWith('/')) {
      let uri = originalUri;
      if (variables) {
        uri = substituteVariables(uri, variables);
      }
      try {
        const resolvedUrl = resolveUrl(baseUrl, uri);
        const proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
        result = result.replace(fullMatch, fullMatch.replace(originalUri, proxyUrl));
      } catch (error) {
        // 保持原始 URI 如果解析失败
      }
    }
  }
  
  return result;
}

// 处理预加载提示 - LL-HLS 功能
function rewritePreloadHintUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>): string {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    
    try {
      const resolvedUrl = resolveUrl(baseUrl, originalUri);
      // 根据 TYPE 属性选择适当的代理端点
      const typeMatch = line.match(/TYPE=([^,\s]+)/);
      const type = typeMatch ? typeMatch[1] : 'PART';
      
      let proxyUrl: string;
      if (type === 'PART') {
        proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
      } else if (type === 'MAP') {
        proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
      } else {
        proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
      }
      
      return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('解析预加载提示URI失败:', originalUri, error);
      }
      return line;
    }
  }
  return line;
}

// 处理渲染报告
function rewriteRenditionReportUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>): string {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    
    try {
      const resolvedUrl = resolveUrl(baseUrl, originalUri);
      const proxyUrl = `${proxyBase}/m3u8?url=${encodeURIComponent(resolvedUrl)}&moontv-source=${source}`;
      return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('解析渲染报告URI失败:', originalUri, error);
      }
      return line;
    }
  }
  return line;
}

// 处理服务器控制
function rewriteServerControlUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>): string {
  // EXT-X-SERVER-CONTROL 通常不包含 URI，但为了完整性保留此函数
  // 如果将来有包含 URI 的扩展，可以在此处理
  return line;
}

// 处理跳过片段
function rewriteSkipUri(line: string, baseUrl: string, proxyBase: string, source: string | null, variables?: Map<string, string>): string {
  // EXT-X-SKIP 不包含 URI，只包含 SKIPPED-SEGMENTS 等属性
  // 保持原样返回
  return line;
}
