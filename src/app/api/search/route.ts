
/* eslint-disable @typescript-eslint/no-explicit-any,no-console */
import { Agent, fetch as undiciFetch } from 'undici';
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { searchFromAll, searchFromApi } from '@/lib/downstream';
import { decisionThresholds, moderateContent } from '@/lib/yellow';
import { checkImageWithSightengine } from '@/lib/sightengine-client';
import { checkImageWithBaidu } from '@/lib/baidu-client';
import { API_CONFIG } from '@/lib/config';
import { SearchResult } from '@/lib/types';

// 短剧搜索函数
async function searchShortDrama(query: string, page = 1, limit = 20): Promise<any[]> {
  try {
    // 使用 AbortController 实现超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${API_CONFIG.shortdrama.baseUrl}/vod/search?name=${encodeURIComponent(query)}&page=${page}&limit=${limit}`, {
      method: 'GET',
      headers: API_CONFIG.shortdrama.headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Short drama API returned ${response.status}`);
    }

    const data = await response.json();

    if (!data.list || !Array.isArray(data.list)) {
      return [];
    }

    // 将短剧数据转换为统一的搜索结果格式，限制数量避免卡顿
    const limitedResults = data.list.slice(0, limit);
    return limitedResults.map((item: any) => ({
      id: item.id?.toString() || '',
      title: item.name || '',
      poster: item.cover || '',
      year: item.update_time ? new Date(item.update_time).getFullYear().toString() : 'unknown',
      episodes: [{ id: '1', name: '第1集' }],
      source: 'shortdrama',
      source_name: '短剧',
      douban_id: 0,
      type_name: '短剧',
      score: item.score || 0,
      update_time: item.update_time || '',
      vod_class: '',
      vod_tag: '',
    }));
  } catch (error) {
    console.warn('短剧搜索失败:', error);
    return [];
  }
}

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // [关键修复] 最外层的 try...catch 块，捕获所有未处理的异常
  try {
    console.log('[Search API] Request received:', {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString()
    });
  
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      console.log('[Search API] Authorization failed:', authInfo);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    console.log('[Search API] User authenticated:', authInfo.username);
  
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const pageStr = searchParams.get('page');
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const deep = searchParams.get('deep') === 'true';
  
    console.log('[Search API] Query parameter:', query, 'Page:', page);
  
  
    if (!query) {
      console.log('[Search API] Empty query, returning empty results');
      const cacheTime = await getCacheTime();
      return NextResponse.json(
        { results: [] },
        {
          headers: {
            'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
            'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Netlify-Vary': 'query',
          },
        }
      );
    }
  
    const config = await getConfig();
    let apiSites = await getAvailableApiSites(authInfo.username);
    
    console.log('[Search API] Original sites loaded:', apiSites.map(site => ({ 
      key: site.key, 
      name: site.name, 
      disabled: site.disabled,
      lastCheck: site.lastCheck ? { status: site.lastCheck.status, latency: site.lastCheck.latency } : null
    })));
    
    // 过滤掉被管理员手动禁用的源
    apiSites = apiSites.filter(site => !site.disabled);
    console.log('[Search API] After filtering disabled sites:', apiSites.length, 'sites remain');
    
    // 智能视频源排序 - 确保优先使用最可靠的源
    apiSites.sort((a, b) => {
      const getPriority = (site: typeof a) => {
        if (!site.lastCheck || site.lastCheck.status === 'untested') {
          return 1; // 未测试的源，优先级中等
        }
        switch (site.lastCheck.status) {
          case 'valid':
            return 0; // 健康的源，优先级最高
          case 'no_results':
            return 1; // 能通但搜不到结果，优先级中等
          case 'invalid':
          case 'timeout':
          case 'unreachable':
            return 2; // 不健康的源，优先级最低
          default:
            return 1; // 其他情况默认为中等
        }
      };
      
      const priorityA = getPriority(a);
      const priorityB = getPriority(b);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB; // 按优先级分组
      }
      
      // 如果优先级相同（都是健康源），则按延迟从低到高排序
      if (priorityA === 0) {
        const latencyA = a.lastCheck?.latency ?? Infinity;
        const latencyB = b.lastCheck?.latency ?? Infinity;
        return latencyA - latencyB;
      }
      
      return 0; // 其他同级不改变顺序
    });
  
    console.log('[Search API] After intelligent sorting:', apiSites.map((site, index) => ({ 
      index,
      key: site.key, 
      name: site.name,
      priority: !site.lastCheck || site.lastCheck.status === 'untested' ? 'medium' : 
                site.lastCheck.status === 'valid' ? 'high' : 
                site.lastCheck.status === 'no_results' ? 'medium' : 'low',
      status: site.lastCheck?.status || 'untested',
      latency: site.lastCheck?.latency || 'N/A'
    })));
  
    // 为每个源创建搜索Promise，包含超时控制
    const searchPromises = apiSites.map((site, index) => {
      console.log(`[Search API] Creating search promise for site ${index + 1}/${apiSites.length}: ${site.name} (${site.key})`);
      return Promise.race([
        searchFromApi(site, query),
        new Promise<SearchResult[]>((_, reject) =>
          setTimeout(() => reject(new Error(`${site.name} timeout after 20s`)), 20000)
        ),
      ]).catch((err) => {
        console.warn(`[Search API] Search failed for ${site.name}:`, {
          error: (err as Error).message,
          siteKey: site.key,
          siteStatus: site.lastCheck?.status || 'unknown'
        });
        return []; // 返回空数组而不是抛出错误
      });
    });
    
    // 添加短剧搜索
    const shortDramaSearchPromise = searchShortDrama(query, page, 20).catch((err) => {
      console.warn('短剧搜索失败:', err.message);
      return [];
    });

    // 将短剧搜索添加到所有搜索Promise中
    searchPromises.push(shortDramaSearchPromise);  
    console.log(`[Search API] Created ${searchPromises.length} search promises for query: "${query}"`);
    
    // International leading advanced search relevance scoring algorithm
    const calculateRelevanceScore = (item: any, searchQuery: string): number => {
        const query = searchQuery.toLowerCase().trim();
        const title = (item.title || '').toLowerCase();
        const typeName = (item.type_name || '').toLowerCase();
        const director = (item.director || '').toLowerCase();
        const actor = (item.actor || '').toLowerCase();
        
        let score = 0;
        const queryLength = query.length;
        const titleLength = title.length;
        
        // Advanced exact matching with weight adjustment
        if (title === query) {
          score += 1000; // Significantly higher for exact match
        }
        // Perfect prefix matching (high priority for user intent)
        else if (title.startsWith(query)) {
          score += 800 * (queryLength / titleLength); // Weight by query coverage
        }
        // Word boundary exact matches (important for multi-word queries)
        else if (new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title)) {
          score += 600;
        }
        // Substring matching with position weighting
        else if (title.includes(query)) {
          const position = title.indexOf(query);
          const positionWeight = 1 - (position / titleLength); // Earlier position gets higher score
          score += 300 * positionWeight;
        }
        
        // Advanced multi-word query processing
        const queryWords = query.split(/\s+/).filter((word: string) => word.length > 0);
        const titleWords = title.split(/[\s-._]+/).filter((word: string) => word.length > 0);
        
        if (queryWords.length > 1) {
          let wordMatchScore = 0;
          let exactWordMatches = 0;
          let partialWordMatches = 0;
          
          queryWords.forEach(queryWord => {
            let bestWordScore = 0;
            titleWords.forEach((titleWord: string) => {
              if (titleWord === queryWord) {
                bestWordScore = Math.max(bestWordScore, 50);
                exactWordMatches++;
              } else if (titleWord.includes(queryWord) && queryWord.length >= 2) {
                const coverage = queryWord.length / titleWord.length;
                bestWordScore = Math.max(bestWordScore, 25 * coverage);
                partialWordMatches++;
              } else if (queryWord.includes(titleWord) && titleWord.length >= 2) {
                const coverage = titleWord.length / queryWord.length;
                bestWordScore = Math.max(bestWordScore, 20 * coverage);
              }
            });
            wordMatchScore += bestWordScore;
          });
          
          // Bonus for matching all query words
          if (exactWordMatches === queryWords.length) {
            wordMatchScore *= 2;
          }
          
          // Bonus for high match ratio
          const matchRatio = (exactWordMatches + partialWordMatches * 0.5) / queryWords.length;
          wordMatchScore *= (0.5 + matchRatio);
          
          score += wordMatchScore;
        }
        
        // Enhanced metadata matching
        let metadataScore = 0;
        if (typeName.includes(query)) metadataScore += 40;
        if (director.includes(query)) metadataScore += 60;
        if (actor.includes(query)) metadataScore += 50;
        score += metadataScore;
        
        // Content quality and recency weighting
        const currentYear = new Date().getFullYear();
        const itemYear = parseInt(item.year) || 0;
        
        if (itemYear >= currentYear - 1) score += 30;
        else if (itemYear >= currentYear - 3) score += 20;
        else if (itemYear >= currentYear - 10) score += 10;
        
        // Penalty adjustments for better relevance
        if (titleLength > queryLength * 4) score *= 0.9;
        // Boost for concise, relevant titles
        if (titleLength <= queryLength * 2 && score > 100) score *= 1.1;
        // Ensure minimum threshold for very weak matches
        if (score > 0 && score < 50 && !title.includes(query)) score = 0;
        
        return Math.max(0, Math.round(score));
    };
  
    // [构建修复] 将函数声明改为函数表达式以解决 TS1252 错误
    const moderateImage = async (imageUrl: string, config: any): Promise<{ decision: 'allow' | 'block' | 'error'; reason: string; score?: number }> => {
      console.log(`[AI Filter DEBUG] ==> moderateImage CALLED for URL: ${imageUrl}`);
      const filterConfig = config.SiteConfig.IntelligentFilter;
  
      if (!filterConfig || !filterConfig.enabled || !imageUrl) {
        console.log(`[AI Filter DEBUG] SKIPPING: Filter disabled or no image URL.`);
        return { decision: 'allow', reason: 'Filter disabled or no image URL' };
      }
      
      const provider: string = filterConfig.provider;
  
        // --- 1. 根据提供商准备请求参数 ---
      switch (provider) {
        case 'sightengine': {
            // 直接调用封装好的客户端
          const opts = filterConfig.options.sightengine || {};
          return await checkImageWithSightengine(imageUrl, {
            apiUrl: opts.apiUrl,
            apiUser: process.env.SIGHTENGINE_API_USER || opts.apiUser,
            apiSecret: process.env.SIGHTENGINE_API_SECRET || opts.apiSecret,
            confidence: filterConfig.confidence,
            timeoutMs: opts.timeoutMs, // 传递超时配置
          });
        }
        case 'baidu': {
            // 从前端配置中获取选项，并提供一个空对象作为默认值
          const opts = filterConfig.options.baidu || {};
          return await checkImageWithBaidu(imageUrl, {
            // 1. 优先从环境变量读取密钥，如果不存在，则回退到前端设置
            apiKey: process.env.BAIDU_API_KEY || opts.apiKey,
            secretKey: process.env.BAIDU_SECRET_KEY || opts.secretKey,
            timeoutMs: opts.timeoutMs, // 传递审核超时
            tokenTimeoutMs: opts.tokenTimeoutMs, // 传递Token超时
          });
        }
        case 'custom': {
          const opts = filterConfig.options.custom || {};
          const apiKeyValue = process.env.CUSTOM_API_KEY_VALUE || opts.apiKeyValue;
  
          if (!opts.apiUrl || !apiKeyValue || !opts.apiKeyHeader || !opts.jsonBodyTemplate || !opts.responseScorePath || apiKeyValue === '(not provided)') {
            console.warn('[AI Filter] Custom API is not fully configured.');
            return { decision: 'error', reason: 'Custom API not fully configured' };
          }
          let effectiveTimeout = 20000; 
          try {
            // 优化 Agent 配置，使用更保守的超时设置
            const agent = new Agent({ 
              connectTimeout: Math.min(effectiveTimeout / 2, 10000),  // 连接超时设为总超时的一半，最多10秒
              bodyTimeout: effectiveTimeout,     // 响应体超时使用完整配置值
              headersTimeout: Math.min(effectiveTimeout / 2, 10000),  // 头部超时设为总超时的一半，最多10秒
              keepAliveTimeout: 4000,
              keepAliveMaxTimeout: 600000
            });
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
              console.log(`[Custom API] Request timeout after ${effectiveTimeout}ms for: ${imageUrl}`);
              controller.abort();
            }, effectiveTimeout);
  
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            headers[opts.apiKeyHeader] = apiKeyValue;
            const body = JSON.parse(opts.jsonBodyTemplate.replace('{{URL}}', imageUrl));
        // --- 2. 执行 API 请求并解析响应 ---
  
            const response = await undiciFetch(opts.apiUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              signal: controller.signal,
              dispatcher: agent
            });
            
            clearTimeout(timeoutId);
  
            if (!response.ok) {
              const errorBody = await response.text();
              return { decision: 'error', reason: `API request for custom failed with status ${response.status}. Body: ${errorBody.substring(0, 200)}` };
            }
  
            const getNestedValue = (obj: any, path: string): number | null => {
                if (!path) return null;
                try {
                  const value = path.split('.').reduce((o, k) => (o || {})[k], obj);
                  const num = parseFloat(value);
                  return isNaN(num) ? null : num;
                } catch { return null; }
            };
  
            const result = await response.json();
            const score = getNestedValue(result, opts.responseScorePath);
            
            if (score === null) {
              return { decision: 'error', reason: `Could not find a valid score at path "${opts.responseScorePath}" for custom.` };
            }
  
            if (score >= filterConfig.confidence) {
              return { decision: 'block', reason: `Blocked by custom. Score: ${score} >= Confidence: ${filterConfig.confidence}.`, score };
            }
            
            return { decision: 'allow', reason: 'Moderation passed', score };
  
          } catch (error) {
            const isAbortError = error instanceof Error && (
              error.name === 'AbortError' || 
              error.name === 'TimeoutError' ||
              error.message.includes('aborted') ||
              error.message.includes('timeout')
            );
            const reason = isAbortError 
              ? `Custom API timeout/aborted after ${effectiveTimeout}ms for ${imageUrl}`
              : `Exception during API call for custom: ${(error as Error).message}`;
            console.error(`[AI Filter DEBUG] <== ${reason} URL: ${imageUrl}`, error);
            console.error(`[Custom API] Error details:`, {
              errorName: error instanceof Error ? error.name : 'Unknown',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              isAbortError,
              url: imageUrl
            });
            // 超时时返回 allow，其他错误返回 error
            return { 
              decision: isAbortError ? 'allow' : 'error', 
              reason 
            };
          }
        }
        default:
          return { decision: 'allow', reason: 'Unknown provider' };
      }
    };
  
    console.log('[Search API] Starting search with sites:', apiSites.map(site => ({ key: site.key, name: site.name, status: site.lastCheck?.status })));
  
    // 这是一个内部的 try...catch, 用于处理搜索过程中的预期错误
    try {
      let flattenedResults: any[] = [];
      if (deep) {
        console.log(`[Deep Search API] Starting deep search for query: "${query}"`);
        const allDeepResults: SearchResult[] = [];
        for await (const sourceResults of searchFromAll(query)) {
          if (sourceResults && sourceResults.length > 0) {
            allDeepResults.push(...sourceResults);
          }
        }
        flattenedResults = allDeepResults;
        console.log(`[Deep Search API] Found a total of ${flattenedResults.length} deep results.`);
      } else {
        const results = await Promise.allSettled(searchPromises);
        console.log('[Search API] Search promises completed:', results.map((r, i) => ({ 
          site: apiSites[i]?.name, 
          status: r.status, 
          resultCount: r.status === 'fulfilled' ? (r.value as any[]).length : 0,
          error: r.status === 'rejected' ? r.reason?.message : null
        })));
  
        const successResults = results
          .filter((result) => result.status === 'fulfilled')
          .map((result) => (result as PromiseFulfilledResult<any>).value);
        // [FIXED] 使用 .flat() 来展平数组的数组
        flattenedResults = successResults.flat();
      }
      
      console.log('[Search API] Flattened results count:', flattenedResults.length);
      // 在此处添加修正逻辑
      flattenedResults.forEach((item: any) => {
        if (item.poster && item.poster.startsWith('http://')) {
          item.poster = item.poster.replace('http://', 'https://');
        }
      });
      
      // --- 1. 内容安全审核流程 ---
      // --- 1a. 关键词过滤 ---
      flattenedResults.forEach((result: any) => {
        const typeName = result.type_name || '';
        const title = result.title || '';
        const titleModeration = moderateContent(title);
        const typeModeration = moderateContent(typeName);
        if (
          titleModeration.totalScore >= decisionThresholds.FLAG ||
          typeModeration.totalScore >= decisionThresholds.FLAG
        ) {
          result.isYellow = true;
        }
      });
      
      // --- 1b. 智能 AI 图片审核 (仅在过滤器开启时执行) ---
      // 只有当“禁用黄色过滤器”开关是关闭的时候，才执行过滤逻辑
      if (!config.SiteConfig.DisableYellowFilter) {
        if (config.SiteConfig.IntelligentFilter?.enabled) {
          console.log('[AI Filter DEBUG] IntelligentFilter is ENABLED. Starting moderation process...');
          
          let failureCount = 0;
          const failureThreshold = 5;
          let isServiceDown = false;
  
          // 添加批次处理，避免并发过高
          const batchSize = 5;
          const batches = [];
          for (let i = 0; i < flattenedResults.length; i += batchSize) {
            batches.push(flattenedResults.slice(i, i + batchSize));
          }
  
          const moderatedResults = [];
          for (const batch of batches) {
              const batchPromises = batch.map(async (item) => {
                try {
                  // 如果服务已熔断，则直接放行
                  if (isServiceDown) {
                    console.log(`[AI Filter DEBUG] Circuit breaker is OPEN. Allowing item to pass directly.`);
                    return item;
                  }
  
                  const moderationResult = await moderateImage(item.poster, config);
                  
                  if (moderationResult.decision === 'error') {
                    failureCount++;
                    console.log(`[AI Filter DEBUG] Moderation failure #${failureCount} recorded.`);
                  } else {
                    // 任何一次成功都应立即重置失败计数，表明服务已恢复
                    failureCount = 0;
                  }
  
                  // 检查是否达到熔断阈值
                  if (failureCount >= failureThreshold) {
                    isServiceDown = true;
                    console.warn(`[AI Filter DEBUG] Circuit breaker OPENED due to ${failureCount} consecutive failures.`);
                  }
  
                  // 策略：失败时放行 (当审核出错或审核通过时，都保留)
                  return moderationResult.decision !== 'block' ? item : null;
                } catch (modError) {
                  console.error('[AI Filter DEBUG] Unhandled exception in moderation process, allowing item to pass:', {
                    title: item.title,
                    poster: item.poster,
                    error: modError instanceof Error ? modError.message : String(modError),
                  });
                  return item; // 容错：审核过程意外失败时，默认放行
                }
              });
  
            
            const batchResults = await Promise.all(batchPromises);
            moderatedResults.push(...batchResults);
            
            // 批次间添加延迟，减少API压力
            if (batches.indexOf(batch) < batches.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
  
          flattenedResults = moderatedResults.filter((item): item is any => item !== null);
        }
      } else {
        console.log('[Search API] Yellow filter is disabled. Skipping content removal moderation.');
      }
      
      // Create a map for quick lookup of site health status
      const siteStatusMap = new Map(apiSites.map(site => {
        const getPriority = (s: typeof site) => {
          if (!s.lastCheck || s.lastCheck.status === 'untested') return 1;
          switch (s.lastCheck.status) {
            case 'valid': return 0;
            case 'no_results': return 1;
            case 'invalid':
            case 'timeout':
            case 'unreachable': return 2;
            default: return 1;
          }
        };
        return [site.key, getPriority(site)];
      }));
  
      // Apply advanced relevance scoring and intelligent filtering
      const scoredResults = flattenedResults
        .map(item => ({
          ...item,
          relevanceScore: calculateRelevanceScore(item, query)
        }))
        .filter(item => {
            // Dynamic threshold based on query characteristics
          const minThreshold = query.length <= 2 ? 100 : 50;
          return item.relevanceScore >= minThreshold;
        })
        .sort((a, b) => {
            // 1. Primary Sort: By source health status
          const priorityA = siteStatusMap.get(a.source) ?? 2;
          const priorityB = siteStatusMap.get(b.source) ?? 2;
          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }
  
          // 2. Secondary Sort: By relevance score
          const scoreDiff = b.relevanceScore - a.relevanceScore;
          
          // If scores are very close (within 10%), consider tertiary factors
          if (Math.abs(scoreDiff) <= Math.max(a.relevanceScore, b.relevanceScore) * 0.1) {
            // Prefer exact year matches if query contains year
            const yearMatch = query.match(/\b(19|20)\d{2}\b/);
            if (yearMatch) {
              const targetYear = yearMatch[0];
              const aYearMatch = a.year === targetYear;
              const bYearMatch = b.year === targetYear;
              if (aYearMatch !== bYearMatch) {
                return aYearMatch ? -1 : 1;
              }
            }
            
            // Then by recency
            const aYear = parseInt(a.year) || 0;
            const bYear = parseInt(b.year) || 0;
            return bYear - aYear;
          }
          
          return scoreDiff;
        });
      
      flattenedResults = scoredResults;
      const cacheTime = await getCacheTime();
  
      console.log('[Search API] Final results after all filters:', {
        count: flattenedResults.length,
        sample: flattenedResults.slice(0, 3).map(r => ({ title: r.title, source: r.source }))
      });
  
      if (flattenedResults.length === 0) {
        console.log('[Search API] No results found, returning empty array');
        // no cache if empty
        return NextResponse.json({ results: [] }, { status: 200 });
      }
  
      console.log('[Search API] Returning successful response with', flattenedResults.length, 'results');
      return NextResponse.json(
        { results: flattenedResults },
        {
          headers: {
            'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
            'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Netlify-Vary': 'query',
          },
        }
      );
    } catch (error) {
      // 这是内部的 catch 块, 用于处理搜索过程中的预期错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : 'No stack trace available';
      
      console.error('[Search API] CRITICAL: Unhandled exception in search process. This is the inner catch block.', {
        error: error,
        query,
        timestamp: new Date().toISOString()
      });
  
      return NextResponse.json(
        { 
          error: `搜索过程中发生严重服务器错误: ${errorMessage}`,
          results: [] 
        }, 
        { status: 500 }
      );
    }
  } catch (error) {
    // [运行时修复] 这是最外层的 catch 块，用于防止服务崩溃 (它一直都在！)
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Search API] CRITICAL: 未处理的顶层异常:', {
      error: error,
      url: request.url,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json(
      { 
        error: `搜索API发生未知服务器错误: ${errorMessage}`,
        results: [] 
      }, 
      { status: 500 }
    );
  }
}
