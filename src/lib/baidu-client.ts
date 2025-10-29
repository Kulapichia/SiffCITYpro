/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import { fetch as undiciFetch, Agent } from 'undici';
import { getBaiduAccessToken } from './baidu-token-manager';

interface BaiduResult {
  decision: 'allow' | 'block' | 'error';
  score: number;
  timestamp: number;
}

// 使用模块级变量作为内存缓存
const cache = new Map<string, BaiduResult>();
const CACHE_TTL = 1000 * 60 * 60; // 缓存1小时

/**
 * 使用百度智能云 API 检查图片，并实现内存缓存。
 * @param imageUrl 要检查的图片 URL
 * @param config 百度智能云的配置
 * @returns {Promise<{ score: number; decision: 'allow' | 'block' | 'error'; reason: string }>} 审核结果
 */
export async function checkImageWithBaidu(
  imageUrl: string,
  config: { apiKey: string; secretKey: string; timeoutMs?: number; tokenTimeoutMs?: number }
): Promise<{ score: number; decision: 'allow' | 'block' | 'error'; reason: string }> {
  const now = Date.now();

  // 1. 检查缓存
  const cached = cache.get(imageUrl);
  if (cached && now < cached.timestamp + CACHE_TTL) {
    console.log(`[Baidu Client] Using cached result for: ${imageUrl}`);
    return {
      score: cached.score,
      decision: cached.decision,
      reason: `Cached result from ${new Date(cached.timestamp).toISOString()}`,
    };
  }

  // 2. 准备API请求
  const { apiKey, secretKey, timeoutMs = 15000, tokenTimeoutMs = 15000 } = config;
  if (!apiKey || !secretKey) {
    return { score: 0, decision: 'error', reason: 'Baidu API keys not configured' };
  }
  
  let effectiveTimeout = Math.min(timeoutMs, 15000);
  try {
    // 3. 获取 Access Token (调用您提供的 token manager)
    const accessToken = await getBaiduAccessToken(apiKey, secretKey, tokenTimeoutMs);
    // 4. 准备审核请求
    const requestUrl = `https://aip.baidubce.com/rest/2.0/solution/v1/img_censor/v2/user_defined?access_token=${accessToken}`;
    const body = new URLSearchParams();
    body.append('imgUrl', imageUrl);
    // 优化 Agent 配置，使用更保守的超时设置
    const agent = new Agent({
      connectTimeout: Math.min(effectiveTimeout / 2, 8000),  // 连接超时设为总超时的一半，最多8秒
      bodyTimeout: effectiveTimeout,
      headersTimeout: Math.min(effectiveTimeout / 2, 10000), // 头部超时设为总超时的一半，最多10秒
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    const response = await undiciFetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      dispatcher: agent,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned status ${response.status}: ${errorText}`);
    }

    const result = await response.json() as any;

    // 5. 解析并标准化结果
    const conclusionType = result.conclusionType;
    if (conclusionType === null || conclusionType === undefined || conclusionType === 4) { // 4是审核失败
      throw new Error(result.error_msg || 'Baidu moderation failed or invalid response');
    }

    // 2:不合规, 3:疑似。我们把疑似也当作不合规处理
    const decision = (conclusionType === 2 || conclusionType === 3) ? 'block' : 'allow';
    const score = conclusionType; // 直接使用 conclusionType 作为分数

    // 6. 缓存结果
    cache.set(imageUrl, { decision, score, timestamp: now });

    const reason = decision === 'block' 
      ? `Blocked by Baidu. ConclusionType: ${score}`
      : 'Baidu moderation passed';

    return { score, decision, reason };
  } catch (error) {
    const isAbortError = error instanceof Error && (
      error.name === 'AbortError' || 
      error.name === 'TimeoutError' ||
      error.message.includes('aborted') ||
      error.message.includes('timeout')
    );
    const reason = isAbortError
      ? `Request timeout/aborted after ${effectiveTimeout}ms for ${imageUrl}`
      : error instanceof Error ? error.message : 'Unknown error during Baidu moderation';
    
    console.error(`[Baidu Client] Error moderating ${imageUrl}:`, reason);
    console.error(`[Baidu Client] Error details:`, {
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      isAbortError,
      url: imageUrl
    });
    // 超时也返回 allow
    return { 
      score: -1,
      decision: isAbortError ? 'allow' : 'error',
      reason 
    };
  }
}
  
