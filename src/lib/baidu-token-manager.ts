/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import { fetch as undiciFetch, Agent } from 'undici';

interface BaiduToken {
  access_token: string;
  expires_at: number; // 使用时间戳记录过期时间
}

// 使用模块级变量作为内存缓存
let cachedToken: BaiduToken | null = null;

// 用于防止并发请求token的风暴锁
let tokenPromise: Promise<BaiduToken> | null = null;

/**
 * 获取并缓存百度 Access Token。
 * 实现了内存缓存和请求风暴锁，确保在有效期内全局只请求一次。
 * @param apiKey Baidu API Key
 * @param secretKey Baidu Secret Key
 * @returns {Promise<string>} Access Token
 */

export async function getBaiduAccessToken(apiKey: string, secretKey: string, timeoutMs = 15000): Promise<string> {
  const now = Date.now();

  // 1. 检查缓存中是否有有效的token
  if (cachedToken && now < cachedToken.expires_at) {
    console.log('[Baidu Token Manager] Using cached access token.');
    return cachedToken.access_token;
  }

  // 2. 如果有正在进行的token请求，则等待其完成
  if (tokenPromise) {
    console.log('[Baidu Token Manager] Waiting for an in-flight token request.');
    const token = await tokenPromise;
    return token.access_token;
  }

  // 3. 发起新的token请求
  console.log('[Baidu Token Manager] No valid token, fetching a new one...');
  tokenPromise = (async () => {
    let effectiveTimeout = Math.min(timeoutMs, 12000);
    try {
      const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
      const agent = new Agent({ 
        connectTimeout: Math.min(effectiveTimeout / 2, 6000),
        bodyTimeout: effectiveTimeout,
        headersTimeout: Math.min(effectiveTimeout / 2, 8000)
      });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

      const response = await undiciFetch(tokenUrl, {
        method: 'POST',
        dispatcher: agent,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token request failed: ${response.status} ${errorText}`);
      }

      const tokenData = await response.json() as any;
      if (!tokenData.access_token) {
        throw new Error(tokenData.error_description || 'No access_token in response from Baidu');
      }

      // 计算过期时间戳，提前 5 分钟过期以确保安全
      const expiresIn = (tokenData.expires_in - 300) * 1000;
      cachedToken = {
        access_token: tokenData.access_token,
        expires_at: Date.now() + expiresIn,
      };

      console.log('[Baidu Token Manager] Successfully obtained and cached a new access token.');
      return cachedToken;
    } catch (error) {
      // 请求失败时，清空缓存和promise，以便下次重试
      cachedToken = null;
      console.error('[Baidu Token Manager] Token request failed:', {
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        timeoutUsed: effectiveTimeout
      });
      throw error;
    } finally {
      // 无论成功与否，都要清空风暴锁
      tokenPromise = null;
    }
  })();

  const newToken = await tokenPromise;
  return newToken.access_token;
}
