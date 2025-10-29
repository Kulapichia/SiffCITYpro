
/* eslint-disable @typescript-eslint/no-explicit-any,no-console */
import { Agent, fetch as undiciFetch } from 'undici';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { moderateContent, decisionThresholds } from '@/lib/yellow';
import { checkImageWithSightengine } from '@/lib/sightengine-client';
import { checkImageWithBaidu } from '@/lib/baidu-client';
import { API_CONFIG } from '@/lib/config'; 
// 短剧搜索函数
async function searchShortDrama(query: string, page = 1, limit = 20): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${API_CONFIG.shortdrama.baseUrl}/vod/search?name=${encodeURIComponent(query)}&page=${page}&limit=${limit}`, {
      method: 'GET',
      headers: API_CONFIG.shortdrama.headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Short drama API returned ${response.status}`);
    const data = await response.json();
    if (!data.list || !Array.isArray(data.list)) return [];

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
  // [关键修复] 添加最外层的 try...catch 块，捕获所有未处理的异常
  try {
    console.log('[WS Search API] Request received:', {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString()
    });
  
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      console.log('[WS Search API] Authorization failed:', authInfo);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    console.log('[WS Search API] User authenticated:', authInfo.username);
  
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
  
    console.log('[WS Search API] Query parameter:', query);
  
    if (!query) {
      console.log('[WS Search API] Empty query, returning error');
      return new Response(JSON.stringify({ error: '搜索关键词不能为空' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  
    const config = await getConfig();
    let apiSites = await getAvailableApiSites(authInfo.username);
    
    console.log('[WS Search API] Original sites loaded:', apiSites.map(site => ({ 
      key: site.key, 
      name: site.name, 
      disabled: site.disabled,
      lastCheck: site.lastCheck ? { status: site.lastCheck.status, latency: site.lastCheck.latency } : null
    })));
  
    // 过滤掉被管理员手动禁用的源
    apiSites = apiSites.filter(site => !site.disabled);
    console.log('[WS Search API] After filtering disabled sites:', apiSites.length, 'sites remain');
    
    // --- 智能排序逻辑 ---
    // 对视频源进行智能排序，确保优先搜索最健康的源
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
      
      // 如果优先级相同（都是健康源），则按延迟排序
      if (priorityA === 0) {
        const latencyA = a.lastCheck?.latency ?? Infinity;
        const latencyB = b.lastCheck?.latency ?? Infinity;
        return latencyA - latencyB;
      }
      
      return 0; // 其他同级不改变顺序
    });
    // 共享状态
    let streamClosed = false;
  
    // 创建可读流
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
  
        // 辅助函数：安全地向控制器写入数据
        const safeEnqueue = (data: Uint8Array) => {
          try {
            if (
              streamClosed ||
              (!controller.desiredSize && controller.desiredSize !== 0)
            ) {
              // 流已标记为关闭或控制器已关闭
              return false;
            }
            controller.enqueue(data);
            return true;
          } catch (error) {
            // 控制器已关闭或出现其他错误
            console.warn('Failed to enqueue data:', error);
            streamClosed = true;
            return false;
          }
        };
  
        console.log('[WS Search API] After intelligent sorting:', apiSites.map((site, index) => ({ 
          index,
          key: site.key, 
          name: site.name,
          priority: !site.lastCheck || site.lastCheck.status === 'untested' ? 'medium' : 
                    site.lastCheck.status === 'valid' ? 'high' : 
                    site.lastCheck.status === 'no_results' ? 'medium' : 'low',
          status: site.lastCheck?.status || 'untested',
          latency: site.lastCheck?.latency || 'N/A'
        })));
  
        console.log('[WS Search API] Starting stream with sites:', apiSites.map(site => ({ key: site.key, name: site.name, status: site.lastCheck?.status })));
  
        // 发送开始事件
        const startEvent = `data: ${JSON.stringify({
          type: 'start',
          query,
          totalSources: apiSites.length + 1,
          timestamp: Date.now(),
        })}\n\n`;
  
        console.log('[WS Search API] Sending start event');
        if (!safeEnqueue(encoder.encode(startEvent))) {
          console.log('[WS Search API] Failed to send start event, connection closed');
          return; // 连接已关闭，提前退出
        }
  
        // --- 全新的健壮并发控制器 ---
        let completedSources = 0;
        const totalSources = apiSites.length + 1; 
        const allResults: any[] = [];
        const concurrency = 8;
        
        // 创建一个任务队列的副本，以便安全地从中取任务
        const taskQueue = [...apiSites];
        const runWorker = async (workerId: number) => {
          // 每个 "工人" 持续从队列中取任务，直到队列为空
          while (taskQueue.length > 0) {
            if (streamClosed) {
              console.log(`[Worker ${workerId}] Stream closed, stopping worker.`);
              break;
            }
  
            // 从队列头部取出一个任务（数据源）
            const site = taskQueue.shift();
            if (!site) continue; // 如果取不到则继续循环（理论上不会发生）
  
            const siteIndex = apiSites.indexOf(site);
            console.log(`[Worker ${workerId}] Starting search for site ${siteIndex + 1}/${totalSources}: ${site.name} (${site.key})`);
            
            try {
              const searchPromise = Promise.race([
                searchFromApi(site, query),
                new Promise<any[]>((_, reject) =>
                  setTimeout(() => reject(new Error(`${site.name} timeout after 20s`)), 20000)
                ),
              ]);
  
              let results = (await searchPromise) as any[];
  
              if (!Array.isArray(results)) {
                throw new Error('返回数据格式不正确');
              }
              console.log(`[WS Search API] Raw results from ${site.name}:`, results.length, 'items');
  
              // International leading advanced search relevance scoring algorithm (consistent with standard API)
              const calculateRelevanceScore = (item: any, searchQuery: string): number => {
                const query = searchQuery.toLowerCase().trim();
                const title = (item.title || '').toLowerCase();
                const typeName = (item.type_name || '').toLowerCase();
                const director = (item.director || '').toLowerCase();
                const actor = (item.actor || '').toLowerCase();
                
                let score = 0;
                const queryLength = query.length;
                const titleLength = title.length;
                
                if (title === query) score += 1000;
                else if (title.startsWith(query)) score += 800 * (queryLength / titleLength);
                else if (new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title)) score += 600;
                else if (title.includes(query)) {
                  const position = title.indexOf(query);
                  score += 300 * (1 - (position / titleLength));
                }
                
                const queryWords = query.split(/\s+/).filter((word: string) => word.length > 0);
                if (queryWords.length > 1) {
                  let wordMatchScore = 0;
                  let exactWordMatches = 0;
                  let partialWordMatches = 0;
                  const titleWords = title.split(/[\s-._]+/).filter((word: string) => word.length > 0);
                  queryWords.forEach(queryWord => {
                    let bestWordScore = 0;
                    titleWords.forEach((titleWord: string) => {
                      if (titleWord === queryWord) {
                        bestWordScore = Math.max(bestWordScore, 50);
                        exactWordMatches++;
                      } else if (titleWord.includes(queryWord) && queryWord.length >= 2) {
                        bestWordScore = Math.max(bestWordScore, 25 * (queryWord.length / titleWord.length));
                        partialWordMatches++;
                      } else if (queryWord.includes(titleWord) && titleWord.length >= 2) {
                        bestWordScore = Math.max(bestWordScore, 20 * (titleWord.length / queryWord.length));
                      }
                    });
                    wordMatchScore += bestWordScore;
                  });
                  if (exactWordMatches === queryWords.length) wordMatchScore *= 2;
                  const matchRatio = (exactWordMatches + partialWordMatches * 0.5) / queryWords.length;
                  wordMatchScore *= (0.5 + matchRatio);
                  score += wordMatchScore;
                }
                
                let metadataScore = 0;
                if (typeName.includes(query)) metadataScore += 40;
                if (director.includes(query)) metadataScore += 60;
                if (actor.includes(query)) metadataScore += 50;
                score += metadataScore;
                
                const currentYear = new Date().getFullYear();
                const itemYear = parseInt(item.year) || 0;
                if (itemYear >= currentYear - 1) score += 30;
                else if (itemYear >= currentYear - 3) score += 20;
                else if (itemYear >= currentYear - 10) score += 10;
                
                if (titleLength > queryLength * 4) score *= 0.9;
                if (titleLength <= queryLength * 2 && score > 100) score *= 1.1;
                if (score > 0 && score < 50 && !title.includes(query)) score = 0;
                return Math.max(0, Math.round(score));
              };
  
              results.forEach((item: any) => {
                if (item.poster && item.poster.startsWith('http://')) {
                  item.poster = item.poster.replace('http://', 'https://');
                }
              });
  
              const moderateImage = async (imageUrl: string, config: any): Promise<{ decision: 'allow' | 'block' | 'error'; reason: string; score?: number }> => {
                  const filterConfig = config.SiteConfig.IntelligentFilter;
                  if (!filterConfig || !filterConfig.enabled || !imageUrl) return { decision: 'allow', reason: 'Filter disabled or no image URL' };
                  const getNestedValue = (obj: any, path: string): number | null => {
                    if (!path) return null;
                    try {
                      const value = path.split('.').reduce((o, k) => (o || {})[k], obj);
                      const num = parseFloat(value);
                      return isNaN(num) ? null : num;
                    } catch { return null; }
                  };
                  const provider: string = filterConfig.provider;
                  switch (provider) {
                    case 'sightengine': {
                      const opts = filterConfig.options.sightengine || {};
                      return await checkImageWithSightengine(imageUrl, {
                        apiUrl: opts.apiUrl,
                        apiUser: process.env.SIGHTENGINE_API_USER || opts.apiUser,
                        apiSecret: process.env.SIGHTENGINE_API_SECRET || opts.apiSecret,
                        confidence: filterConfig.confidence,
                        timeoutMs: opts.timeoutMs,
                      });
                    }
                    case 'baidu': {
                      const opts = filterConfig.options.baidu || {};
                      return await checkImageWithBaidu(imageUrl, {
                        apiKey: process.env.BAIDU_API_KEY || opts.apiKey,
                        secretKey: process.env.BAIDU_SECRET_KEY || opts.secretKey,
                        timeoutMs: opts.timeoutMs,
                        tokenTimeoutMs: opts.tokenTimeoutMs,
                      });
                    }
                    case 'custom': {
                      const opts = filterConfig.options.custom || {};
                      const apiKeyValue = process.env.CUSTOM_API_KEY_VALUE || opts.apiKeyValue;
                      if (!opts.apiUrl || !apiKeyValue || !opts.apiKeyHeader || !opts.jsonBodyTemplate || !opts.responseScorePath || apiKeyValue === '(not provided)') return { decision: 'error', reason: 'Custom API not fully configured' };
                      let effectiveTimeout = 20000;
                      try {
                        const agent = new Agent({ connectTimeout: Math.min(effectiveTimeout / 2, 10000), bodyTimeout: effectiveTimeout, headersTimeout: Math.min(effectiveTimeout / 2, 10000) });
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
                        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                        headers[opts.apiKeyHeader] = apiKeyValue;
                        const body = JSON.parse(opts.jsonBodyTemplate.replace('{{URL}}', imageUrl));
                        const response = await undiciFetch(opts.apiUrl, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, dispatcher: agent });
                        clearTimeout(timeoutId);
                        if (!response.ok) {
                          const errorBody = await response.text();
                          return { decision: 'error', reason: `API request for custom failed with status ${response.status}. Body: ${errorBody.substring(0, 200)}` };
                        }
                        const result = await response.json();
                        const score = getNestedValue(result, opts.responseScorePath);
                        if (score === null) return { decision: 'error', reason: `Could not find a valid score at path "${opts.responseScorePath}" for custom.` };
                        if (score >= filterConfig.confidence) return { decision: 'block', reason: `Blocked by custom. Score: ${score} >= Confidence: ${filterConfig.confidence}.`, score };
                        return { decision: 'allow', reason: 'Moderation passed', score };
                      } catch (error) {
                        const isAbortError = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError' || error.message.includes('aborted') || error.message.includes('timeout'));
                        const reason = isAbortError ? `Custom API timeout/aborted after 20000ms for ${imageUrl}` : `Exception during API call for custom: ${(error as Error).message}`;
                        return { decision: isAbortError ? 'allow' : 'error', reason };
                      }
                    }
                    default: return { decision: 'allow', reason: 'Unknown provider' };
                  }
              };
              
              // --- [关键修复] 完整的内容安全审核流程 ---
              // --- 1a. 关键词过滤 (始终执行，用于前端分类) ---
              results.forEach((result: any) => {
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

              // --- 1b. 内容移除 (仅在过滤器开启时执行) ---
              // 只有当“禁用黄色过滤器”开关是关闭的时候，才执行过滤逻辑
              if (!config.SiteConfig.DisableYellowFilter) {
                // 智能 AI 图片审核 (带熔断)
                if (config.SiteConfig.IntelligentFilter?.enabled) {
                  let failureCount = 0;
                  const failureThreshold = 5;
                  let isServiceDown = false;
                  const batchSize = 3;
                  const batches = [];
                  for (let i = 0; i < results.length; i += batchSize) {
                    batches.push(results.slice(i, i + batchSize));
                  }
                  const moderatedResults = [];
                  for (const batch of batches) {
                    const batchPromises = batch.map(async (item) => {
                      try {
                        if (isServiceDown) return item;
                        const moderationResult = await moderateImage(item.poster, config);
                        if (moderationResult.decision === 'error') failureCount++; else failureCount = 0;
                        if (failureCount >= failureThreshold) isServiceDown = true;
                        return moderationResult.decision !== 'block' ? item : null;
                      } catch (modError) {
                        console.error('[WS AI Filter DEBUG] Unhandled exception in moderation, allowing item to pass:', {
                          title: item.title,
                          error: modError instanceof Error ? modError.message : String(modError),
                        });
                        return item; // 容错：审核失败时放行
                      }
                    });
  
                    const batchResults = await Promise.all(batchPromises);
                    moderatedResults.push(...batchResults.filter((item): item is any => item !== null));
                    if (batches.indexOf(batch) < batches.length - 1) await new Promise(resolve => setTimeout(resolve, 250));
                  }
                  results = moderatedResults;
                }
              } else {
                // 如果禁用了过滤器，仅打印日志，不清除 isYellow 标记
                console.log('[WS Search API] Yellow filter is disabled. Skipping content removal moderation.');
              }
  
              const scoredResults = results
                .map(item => ({ ...item, relevanceScore: calculateRelevanceScore(item, query) }))
                .filter(item => {
                  const minThreshold = query.length <= 2 ? 100 : 50;
                  return item.relevanceScore >= minThreshold;
                })
                .sort((a, b) => {
                  const scoreDiff = b.relevanceScore - a.relevanceScore;
                  if (Math.abs(scoreDiff) <= Math.max(a.relevanceScore, b.relevanceScore) * 0.1) {
                    const yearMatch = query.match(/\b(19|20)\d{2}\b/);
                    if (yearMatch) {
                      const targetYear = yearMatch[0];
                      const aYearMatch = a.year === targetYear;
                      const bYearMatch = b.year === targetYear;
                      if (aYearMatch !== bYearMatch) return aYearMatch ? -1 : 1;
                    }
                    const aYear = parseInt(a.year) || 0;
                    const bYear = parseInt(b.year) || 0;
                    return bYear - aYear;
                  }
                  return scoreDiff;
                });
              
              const filteredResults = scoredResults;
  
              if (!streamClosed) {
                const sourceEvent = `data: ${JSON.stringify({
                  type: 'source_result',
                  source: site.key,
                  sourceName: site.name,
                  results: filteredResults,
                  timestamp: Date.now(),
                })}\n\n`;
                safeEnqueue(encoder.encode(sourceEvent));
              }
              if (filteredResults.length > 0) {
                allResults.push(...filteredResults);
              }
            } catch (error) {
              // [关键修复] 增强错误处理，确保任何类型的错误都能被正确记录和报告
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error(`[WS Search API] Search failed for ${site.name}:`, { 
                error: error, // 记录原始错误对象以供调试
                siteKey: site.key 
              });
              if (!streamClosed) {
                const errorEvent = `data: ${JSON.stringify({
                  type: 'source_error',
                  source: site.key,
                  sourceName: site.name,
                  error: errorMessage, // 向客户端发送更具体的错误信息
                  timestamp: Date.now(),
                })}\n\n`;
                safeEnqueue(encoder.encode(errorEvent));
              }
            } finally {
              // 这是关键：每个任务完成后，无论成功失败，都检查是否为最后一个任务
              completedSources++;
              if (completedSources === totalSources && !streamClosed) {
                console.log('[WS Search API] All sources completed. Sending complete event.');
                const completeEvent = `data: ${JSON.stringify({
                  type: 'complete',
                  totalResults: allResults.length,
                  completedSources,
                  timestamp: Date.now(),
                })}\n\n`;
                if (safeEnqueue(encoder.encode(completeEvent))) {
                  try {
                    controller.close();
                  } catch (e) { console.warn('Failed to close controller:', e); }
                }
              }
            }
          }
        };
        
        // 启动并发的 "工人"
        const workers = Array(Math.min(concurrency, apiSites.length)).fill(null).map((_, i) => runWorker(i + 1));
        
        // 并行处理短剧搜索
        const shortDramaPromise = (async () => {
          try {
            const results = await searchShortDrama(query, 1, 20);
            // 短剧搜索结果不需要复杂的审核和排序，直接发送
            if (!streamClosed && results.length > 0) {
              const sourceEvent = `data: ${JSON.stringify({
                type: 'source_result',
                source: 'shortdrama',
                sourceName: '短剧',
                results: results,
                timestamp: Date.now(),
              })}\n\n`;
              safeEnqueue(encoder.encode(sourceEvent));
              allResults.push(...results);
            }
          } catch (error) {
             const errorMessage = error instanceof Error ? error.message : String(error);
             if (!streamClosed) {
                const errorEvent = `data: ${JSON.stringify({
                  type: 'source_error',
                  source: 'shortdrama',
                  sourceName: '短剧',
                  error: errorMessage,
                  timestamp: Date.now(),
                })}\n\n`;
                safeEnqueue(encoder.encode(errorEvent));
             }
          } finally {
            completedSources++;
          }
        })();

        // 等待所有 "工人" 和短剧搜索完成
        await Promise.all([...workers, shortDramaPromise]);

        // 确保在所有任务完成后（包括短剧）再发送完成事件
        if (completedSources >= totalSources && !streamClosed) {
          console.log('[WS Search API] All sources completed (including short drama). Sending complete event.');
          const completeEvent = `data: ${JSON.stringify({
            type: 'complete',
            totalResults: allResults.length,
            completedSources,
            timestamp: Date.now(),
          })}\n\n`;
          if (safeEnqueue(encoder.encode(completeEvent))) {
            try {
              controller.close();
            } catch (e) { console.warn('Failed to close controller:', e); }
          }
        }
      },
  
      cancel() {
        // 客户端断开连接时，标记流已关闭
        streamClosed = true;
        console.log('Client disconnected, cancelling search stream');
      },
    });
  
    // 返回流式响应
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    // [关键修复] 最外层捕获块
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WS Search API] CRITICAL: 未处理的顶层异常:', {
      error: error,
      url: request.url,
      timestamp: new Date().toISOString()
    });
    // 对于流式API，返回一个表示错误的普通HTTP响应
    return new Response(JSON.stringify({ 
      type: 'fatal_error',
      error: `流式搜索API发生未知服务器错误: ${errorMessage}`
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }
}
