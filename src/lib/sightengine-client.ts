/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import { fetch as undiciFetch, Agent } from 'undici';

interface SightengineResult {
  score: number;
  decision: 'allow' | 'block';
  timestamp: number;
}

// 使用模块级变量作为内存缓存
const cache = new Map<string, SightengineResult>();
const CACHE_TTL = 1000 * 60 * 60; // 缓存1小时

// 添加一个正确实现的请求队列来管理并发
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private readonly maxConcurrent = 3; // 限制并发数为3，以减轻API压力
  private activeRequests = 0;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private process() { // process 方法可以是同步的，因为它只负责启动任务
    if (this.processing || this.activeRequests >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const task = this.queue.shift();
      if (task) {
        this.activeRequests++;
        // 任务本身是异步的
        task().finally(() => {
          this.activeRequests--;
          // 增加请求间隔，避免触发速率限制
          setTimeout(() => this.process(), 200); // 增加间隔到200ms
        });
      }
    }

    this.processing = false;
  }
}

const requestQueue = new RequestQueue();

/**
 * 使用 Sightengine API 检查图片，并实现内存缓存。
 * @param imageUrl 要检查的图片 URL
 * @param config Sightengine 的配置
 * @returns {Promise<{ score: number; decision: 'allow' | 'block' | 'error'; reason: string }>} 审核结果
 */
export async function checkImageWithSightengine(
  imageUrl: string,
  config: { apiUrl: string; apiUser: string; apiSecret: string; confidence: number; timeoutMs?: number }
): Promise<{ score: number; decision: 'allow' | 'block' | 'error'; reason: string }> {
  const now = Date.now();

  // 1. 检查缓存
  const cached = cache.get(imageUrl);
  if (cached && now < cached.timestamp + CACHE_TTL) {
    console.log(`[Sightengine Client] Using cached result for: ${imageUrl}`);
    return {
      score: cached.score,
      decision: cached.decision,
      reason: `Cached result from ${new Date(cached.timestamp).toISOString()}`,
    };
  }

  // 2. 准备API请求
  const { apiUrl, apiUser, apiSecret, confidence, timeoutMs = 30000 } = config;
  // 1. 只检查关键凭证，因为 apiUrl 可以使用默认值
  if (!apiUser || !apiSecret) {
    return { score: 0, decision: 'error', reason: 'Sightengine config incomplete: missing credentials' };
  }
  // URL 基础验证
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return { score: 0, decision: 'error', reason: 'Invalid image URL' };
  }

  // 2.使用请求队列管理并发
  return requestQueue.add(async () => {
    const effectiveApiUrl = apiUrl || 'https://api.sightengine.com/1.0/check.json';

    const params = new URLSearchParams({
      url: imageUrl,
      models: 'nudity-2.0',
      api_user: apiUser,
      api_secret: apiSecret,
    });
  // 3. 直接使用 effectiveApiUrl 构建最终请求
    const requestUrl = `${effectiveApiUrl}?${params.toString()}`;
    
  // 4. 执行API调用
    let effectiveTimeout = Math.min(timeoutMs, 20000);
    try {
      // 优化 Agent 配置，使用更保守的超时设置
      const agent = new Agent({ 
        connectTimeout: Math.min(timeoutMs / 2, 10000),  // 连接超时设为总超时的一半，最多10秒
        bodyTimeout: Math.min(timeoutMs, 15000),     // 响应体超时最多15秒
        headersTimeout: Math.min(timeoutMs / 2, 10000),  // 头部超时设为总超时的一半，最多10秒
        keepAliveTimeout: 4000,
        keepAliveMaxTimeout: 600000
      });
      
      const controller = new AbortController();
      // 减少超时时间并添加更详细的日志
      const timeoutId = setTimeout(() => {
        console.log(`[Sightengine Client] Request timeout after ${effectiveTimeout}ms for: ${imageUrl}`);
        controller.abort();
      }, effectiveTimeout);

      console.log(`[Sightengine Client] Starting moderation for: ${imageUrl} (timeout: ${effectiveTimeout}ms)`);
      
      const response = await undiciFetch(requestUrl, {
        method: 'GET',
        dispatcher: agent,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        const errorMsg = `API returned status ${response.status}: ${errorText}`;
        console.error(`[Sightengine Client] HTTP Error:`, errorMsg);
        return { score: -1, decision: 'error' as const, reason: errorMsg };
      }

      const result = await response.json() as any;

      if (result.status !== 'success') {
        const errorMsg = result.error?.message || `API returned status: ${result.status}`;
        console.error(`[Sightengine Client] API Error:`, errorMsg);
        return { score: -1, decision: 'error' as const, reason: errorMsg };
      }

      // 正确解析分数
      const nudity = result.nudity || {};
      const score = Math.max(
        nudity.sexual_activity || 0,
        nudity.sexual_display || 0,
        nudity.erotica || 0,
        nudity.suggestive || 0
      );
      const decision = score >= confidence ? 'block' : 'allow';

      // 缓存结果
      cache.set(imageUrl, { score, decision, timestamp: now });

      console.log(`[Sightengine Client] Moderation complete for ${imageUrl}: score=${score}, decision=${decision}`);
      
      return { 
        score, 
        decision, 
        reason: `Moderation complete with score ${score}` 
      };
    } catch (error) {
      // 增强错误判断，包含更多中止错误类型
      const isAbortError = error instanceof Error && (
        error.name === 'AbortError' || 
        error.name === 'TimeoutError' ||
        error.message.includes('aborted') ||
        error.message.includes('timeout')
      );
      
      const reason = isAbortError 
        ? `Request timeout/aborted after ${effectiveTimeout}ms for ${imageUrl}`
        : error instanceof Error ? error.message : 'Unknown error during moderation';
      
      console.error(`[Sightengine Client] Error moderating ${imageUrl}:`, reason);
      console.error(`[Sightengine Client] Error details:`, {
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        isAbortError,
        url: imageUrl
      });
      
      // 对于超时错误，返回 allow 决策以避免因网络问题误伤内容
      return { 
        score: -1, 
        decision: isAbortError ? 'allow' as const : 'error' as const, 
        reason 
      };
    }
  });
}

