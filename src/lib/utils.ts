import he from 'he';
import Hls from 'hls.js';
import { AdminConfig } from './admin.types';
// 增强的设备检测逻辑，参考最新的设备特征
const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

// iOS 设备检测 (包括 iPad 的新版本检测)
const isIOS = /iPad|iPhone|iPod/i.test(userAgent) && !(window as any).MSStream;
const isIOS13Plus = isIOS || (
  userAgent.includes('Macintosh') && 
  typeof navigator !== 'undefined' && 
  navigator.maxTouchPoints >= 1
);

// iPad 专门检测 (包括新的 iPad Pro)
const isIPad = /iPad/i.test(userAgent) || (
  userAgent.includes('Macintosh') && 
  typeof navigator !== 'undefined' && 
  navigator.maxTouchPoints > 2
);

// Android 设备检测
const isAndroid = /Android/i.test(userAgent);

// 移动设备检测 (更精确的判断)
const isMobile = isIOS13Plus || isAndroid || /webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

// 平板设备检测
const isTablet = isIPad || (isAndroid && !/Mobile/i.test(userAgent)) || 
  (typeof screen !== 'undefined' && screen.width >= 768);

// Safari 浏览器检测 (更精确)
const isSafari = /^(?:(?!chrome|android).)*safari/i.test(userAgent) && !isAndroid;

// WebKit 检测
const isWebKit = /WebKit/i.test(userAgent);

// 设备性能等级估算
const getDevicePerformanceLevel = (): 'low' | 'medium' | 'high' => {
  if (typeof navigator === 'undefined') return 'medium';
  
  // 基于硬件并发数判断
  const cores = navigator.hardwareConcurrency || 4;
  
  if (isMobile) {
    return cores >= 6 ? 'medium' : 'low';
  } else {
    return cores >= 8 ? 'high' : cores >= 4 ? 'medium' : 'low';
  }
};

const devicePerformance = getDevicePerformanceLevel();

// 导出设备检测结果供其他模块使用
export {
  isIOS,
  isIOS13Plus,
  isIPad,
  isAndroid,
  isMobile,
  isTablet,
  isSafari,
  isWebKit,
  devicePerformance,
  getDevicePerformanceLevel
};

function getDoubanImageProxyConfig(): {
  proxyType:
  | 'direct'
  | 'server'
  | 'img3'
  | 'cmliussss-cdn-tencent'
  | 'cmliussss-cdn-ali'
  | 'custom';
  proxyUrl: string;
} {
  const doubanImageProxyType =
    localStorage.getItem('doubanImageProxyType') ||
    (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY_TYPE ||
    'cmliussss-cdn-tencent';
  const doubanImageProxy =
    localStorage.getItem('doubanImageProxyUrl') ||
    (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY ||
    '';
  return {
    proxyType: doubanImageProxyType,
    proxyUrl: doubanImageProxy,
  };
}

/**
 * 获取通用图片代理 URL 设置
 */
export function getImageProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 本地未开启图片代理，则不使用代理
  const enableImageProxy = localStorage.getItem('enableImageProxy');
  if (enableImageProxy !== null) {
    if (!JSON.parse(enableImageProxy) as boolean) {
      return null;
    }
  }

  const localImageProxy = localStorage.getItem('imageProxyUrl');
  if (localImageProxy != null) {
    return localImageProxy.trim() ? localImageProxy.trim() : null;
  }

  // 如果未设置，则使用全局对象
  const serverImageProxy = (window as any).RUNTIME_CONFIG?.IMAGE_PROXY;
  return serverImageProxy && serverImageProxy.trim()
    ? serverImageProxy.trim()
    : null;
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;
  // 处理 manmankan 图片防盗链
  if (originalUrl.includes('manmankan.com')) {
    return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
  }
  // 优先处理豆瓣图片代理
  if (originalUrl.includes('doubanio.com')) {
    const { proxyType, proxyUrl } = getDoubanImageProxyConfig();
    switch (proxyType) {
      case 'server':
        return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
      case 'img3':
        return originalUrl.replace(/img\d+\.doubanio\.com/g, 'img3.doubanio.com');
      case 'cmliussss-cdn-tencent':
        return originalUrl.replace(
          /img\d+\.doubanio\.com/g,
          'img.doubanio.cmliussss.net'
        );
      case 'cmliussss-cdn-ali':
        return originalUrl.replace(
          /img\d+\.doubanio\.com/g,
          'img.doubanio.cmliussss.com'
        );
      case 'custom':
        return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
      case 'direct':
      default:
        return originalUrl;
    }
  }
  
  // 对于其他图片，使用通用图片代理
  const proxyUrl = getImageProxyUrl();
  if (!proxyUrl) return originalUrl;

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

/**
 * 从m3u8地址获取视频质量等级和网络信息
 * @param m3u8Url m3u8播放列表的URL
 * @returns Promise<{quality: string, loadSpeed: string, pingTime: number}> 视频质量等级和网络信息
 */
export async function getVideoResolutionFromM3u8(m3u8Url: string): Promise<{
  quality: string;
  loadSpeed: string;
  pingTime: number;
}> {
  try {
    // 检测是否为iPad（无论什么浏览器）
    const isIPad = /iPad/i.test(userAgent);
    
    if (isIPad) {
      // iPad使用最简单的ping测试，不创建任何video或HLS实例
      console.log('iPad检测，使用简化测速避免崩溃');
      
      const startTime = performance.now();
      try {
        await fetch(m3u8Url, { 
          method: 'HEAD', 
          mode: 'no-cors',
          signal: AbortSignal.timeout(2000)
        });
        const pingTime = Math.round(performance.now() - startTime);
        
        return {
          quality: '未知', // iPad不检测视频质量避免崩溃
          loadSpeed: '未知', // iPad不检测下载速度
          pingTime
        };
      } catch (error) {
        return {
          quality: '未知',
          loadSpeed: '未知',
          pingTime: 9999
        };
      }
    }
    
    // 非iPad设备使用优化后的测速逻辑
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      
      // 移动设备使用更小的视频元素减少内存占用
      if (isMobile) {
        video.width = 32;
        video.height = 18;
        video.style.display = 'none';
        video.style.position = 'absolute';
        video.style.left = '-9999px';
      }

      // 测量ping时间
      const pingStart = performance.now();
      let pingTime = 0;

      const pingPromise = fetch(m3u8Url, { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
          pingTime = performance.now() - pingStart;
        })
        .catch(() => {
          pingTime = performance.now() - pingStart;
        });

      // 基于最新 hls.js v1.6.13 和设备性能的智能优化配置
      const hlsConfig = {
        debug: false,

        // Worker 配置 - 根据设备性能和浏览器能力
        enableWorker: !isMobile && !isSafari && devicePerformance !== 'low',

        // 低延迟模式 - 仅在高性能非移动设备上启用
        lowLatencyMode: !isMobile && devicePerformance === 'high',

        // v1.6.13 新增：优化片段解析错误处理
        fragLoadingRetryDelay: isMobile ? 500 : 300,
        fragLoadingMaxRetry: 3,

        // v1.6.13 新增：时间戳处理优化（针对直播回搜修复）
        allowAugmentingTimeStamp: true,

        // 缓冲管理 - 基于设备性能分级
        maxBufferLength: devicePerformance === 'low' ? 3 :
                        devicePerformance === 'medium' ? 8 : 15,
        maxBufferSize: devicePerformance === 'low' ? 1 * 1024 * 1024 :
                      devicePerformance === 'medium' ? 5 * 1024 * 1024 : 15 * 1024 * 1024,
        backBufferLength: isTablet ? 20 : isMobile ? 10 : 30,
        frontBufferFlushThreshold: devicePerformance === 'low' ? 15 :
                                  devicePerformance === 'medium' ? 30 : 60,

        // v1.6.13 增强：更智能的缓冲区管理
        maxBufferHole: 0.3, // 允许较小的缓冲区空洞
        appendErrorMaxRetry: 5, // 增加append错误重试次数以利用v1.6.13修复

        // 自适应比特率 - 根据设备类型和性能调整
        abrEwmaDefaultEstimate: devicePerformance === 'low' ? 1500000 :
                               devicePerformance === 'medium' ? 3000000 : 6000000,
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: isMobile ? 0.6 : 0.7,
        abrMaxWithRealBitrate: true,
        maxStarvationDelay: isMobile ? 2 : 4,
        maxLoadingDelay: isMobile ? 2 : 4,

        // v1.6.13 新增：DRM相关优化（虽然你项目不用DRM，但有助于稳定性）
        keyLoadRetryDelay: 1000,
        keyLoadMaxRetry: 3,

        // 浏览器特殊优化
        liveDurationInfinity: !isSafari,
        progressive: false,

        // 移动设备网络优化
        ...(isMobile && {
          manifestLoadingRetryDelay: 2000,
          levelLoadingRetryDelay: 2000,
          manifestLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 3,
        })
      };

      const hls = new Hls(hlsConfig);

      const timeoutDuration = isMobile ? 3000 : 4000;
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout loading video metadata'));
      }, timeoutDuration);

      const cleanup = () => {
        clearTimeout(timeout);
        try {
          if (hls) hls.destroy();
        } catch (e) {
          console.warn('HLS cleanup error:', e);
        }
        try {
          if (video && video.parentNode) {
            video.parentNode.removeChild(video);
          } else if (video) {
            video.remove();
          }
        } catch (e) {
          console.warn('Video cleanup error:', e);
        }
      };

      video.onerror = () => {
        cleanup();
        reject(new Error('Failed to load video metadata'));
      };

      let actualLoadSpeed = '未知';
      let hasSpeedCalculated = false;
      let hasMetadataLoaded = false;
      let fragmentStartTime = 0;

      const checkAndResolve = async () => {
        if (hasMetadataLoaded && (hasSpeedCalculated || actualLoadSpeed !== '未知')) {
          await pingPromise;
          
          const width = video.videoWidth;
          let quality = '未知';
          
          if (width && width > 0) {
            quality = width >= 3840 ? '4K'
              : width >= 2560 ? '2K'
              : width >= 1920 ? '1080p'
              : width >= 1280 ? '720p'
              : width >= 854 ? '480p'
              : 'SD';
          }

          cleanup();
          resolve({
            quality,
            loadSpeed: actualLoadSpeed,
            pingTime: Math.round(pingTime),
          });
        }
      };

      // 监听片段加载
      hls.on(Hls.Events.FRAG_LOADING, () => {
        if (!hasSpeedCalculated) {
          fragmentStartTime = performance.now();
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, (event: any, data: any) => {
        if (fragmentStartTime > 0 && data && data.payload && !hasSpeedCalculated) {
          const loadTime = performance.now() - fragmentStartTime;
          const size = data.payload.byteLength || 0;

          if (loadTime > 0 && size > 0) {
            const speedKBps = size / 1024 / (loadTime / 1000);
            actualLoadSpeed = speedKBps >= 1024
              ? `${(speedKBps / 1024).toFixed(2)} MB/s`
              : `${speedKBps.toFixed(2)} KB/s`;
            hasSpeedCalculated = true;
            checkAndResolve();
          }
        }
      });

      // 监听视频元数据加载完成
      video.addEventListener('loadedmetadata', () => {
        hasMetadataLoaded = true;
        checkAndResolve();
      });

      // 监听HLS错误 - v1.6.13增强处理
      hls.on(Hls.Events.ERROR, (event: any, data: any) => {
        console.warn('HLS测速错误:', data);

        // v1.6.13 特殊处理：片段解析错误不应该导致测速失败
        if (data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR) {
          console.log('测速中遇到片段解析错误，v1.6.13已修复，继续测速');
          return;
        }

        // v1.6.13 特殊处理：时间戳错误也不应该导致测速失败
        if (data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR &&
            data.err && data.err.message &&
            data.err.message.includes('timestamp')) {
          console.log('测速中遇到时间戳错误，v1.6.13已修复，继续测速');
          return;
        }

        if (data.fatal) {
          cleanup();
          reject(new Error(`HLS Error: ${data.type} - ${data.details}`));
        }
      });

      // 加载m3u8
      try {
        hls.loadSource(m3u8Url);
        hls.attachMedia(video);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  } catch (error) {
    throw new Error(`测速失败: ${error}`);
  }
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';

  const cleanedText = text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .replace(/&nbsp;/g, ' ') // 将 &nbsp; 替换为空格
    .trim(); // 去掉首尾空格

  // 使用 he 库解码 HTML 实体
  return he.decode(cleanedText);
}

/**
 * 判断剧集是否已完结
 * @param remarks 备注信息（如"已完结"、"更新至20集"、"HD"等）
 * @returns 是否已完结
 */
export function isSeriesCompleted(remarks?: string): boolean {
  if (!remarks) return false;

  // 匹配规则：
  // - "完结" 或 "已完结"
  // - "全XX集"（如"全30集"）
  // - 单独的"完"（但不包括"完整"）
  return /完结|已完结|全\d+集|完(?!整)/.test(remarks);
}

// ========================================================================
// 导入/导出功能所需的函数
// ========================================================================

type Source = AdminConfig['SourceConfig'][0];

/**
 * 导出数据为文件
 * @param data - 要导出的视频源数组
 * @param format - 格式 'json', 'csv', 'text'
 * @param cacheTime - 仅在导出json时需要，用于构建config.json结构
 */
export function exportData(
  data: Source[],
  format: 'json' | 'csv' | 'text',
  cacheTime?: number
) {
  let content: string;
  let mimeType: string;
  let fileExtension: string;
  let fileName: string; //用于自定义文件名

  switch (format) {
    case 'csv': {
      const header = 'name,key,api,detail,disabled\n';
      const rows = data
        .map(
          (s) =>
            `"${s.name}","${s.key}","${s.api}","${s.detail || ''}","${
              s.disabled
            }"`
        )
        .join('\n');
      content = header + rows;
      mimeType = 'text/csv;charset=utf-8;';
      fileExtension = 'csv';
      break;
    }

    case 'text':
      content = data.map((s) => s.api).join('\n');
      mimeType = 'text/plain;charset=utf-8;';
      fileExtension = 'txt';
      break;

    case 'json':
    default: {
      // 将数组转换为 "api_site" 对象结构
      const api_site = data.reduce(
        (acc, source) => {
          // 只导出需要的字段
          acc[source.key] = {
            name: source.name,
            api: source.api,
            detail: source.detail || '',
          };
          return acc;
        },
        {} as Record<string, { name: string; api: string; detail: string }>
      );

      const exportObject = {
        cache_time: cacheTime || 7200, // 使用传入的cacheTime或默认值
        api_site,
      };

      // 使用4个空格缩进以匹配格式
      content = JSON.stringify(exportObject, null, 4);
      mimeType = 'application/json;charset=utf-8;';
      fileExtension = 'json';
      break;
    }
  }

  // 根据格式决定文件名
  if (format === 'json') {
    fileName = 'config.json';
  } else {
    fileName = `video_sources_${new Date()
      .toISOString()
      .slice(0, 10)}.${fileExtension}`;
  }

  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName; //使用新的文件名变量
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 解析导入的文本数据并进行校验
 * @param rawText - 原始文本
 * @param existingKeys - 已存在的 key 集合，用于查重
 * @returns 解析结果，包括数据、格式和错误信息
 */
export function parseImportData(rawText: string, existingKeys: Set<string>) {
  const lines = rawText.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { data: [], format: 'unknown', errors: ['输入内容为空'] };

  const errors: string[] = [];
  const parsedData: Omit<Source, 'from'>[] = [];
  const importKeys = new Set<string>();
  let format = 'unknown';

  // 1. Try parsing as JSON
  try {
    const jsonData = JSON.parse(rawText);
    
    // 检查是否为 config.json 格式 (包含 api_site 对象)
    if (jsonData && typeof jsonData.api_site === 'object' && !Array.isArray(jsonData.api_site)) {
      format = 'json';
      Object.entries(jsonData.api_site).forEach(([key, site]: [string, any], index) => {
        if (!site.name || !site.api) {
          errors.push(`第 ${index + 1} 条 (JSON config): 源 "${key}" 缺少 name 或 api 字段。`);
          return;
        }
        if (existingKeys.has(key)) {
          errors.push(`第 ${index + 1} 条 (JSON config): Key "${key}" 已存在，将跳过。`);
          return;
        }
        if (importKeys.has(key)) {
          errors.push(`第 ${index + 1} 条 (JSON config): Key "${key}" 在导入数据中重复，将跳过。`);
          return;
        }
        parsedData.push({
          name: String(site.name),
          key: key,
          api: String(site.api),
          detail: String(site.detail || ''),
          disabled: false, // 默认不禁用
        });
        importKeys.add(key);
      });
      return { data: parsedData, format, errors };
    }
    
    // 检查是否为简单的对象数组格式
    if (Array.isArray(jsonData)) {
      format = 'json';
      jsonData.forEach((item, index) => {
        if (!item.key || !item.name || !item.api) {
          errors.push(`第 ${index + 1} 行 (JSON): 缺少 name, key, 或 api 字段。`);
          return;
        }
        if (existingKeys.has(item.key)) {
          errors.push(`第 ${index + 1} 行 (JSON): Key "${item.key}" 已存在，将跳过。`);
          return;
        }
        if (importKeys.has(item.key)) {
          errors.push(`第 ${index + 1} 行 (JSON): Key "${item.key}" 在导入数据中重复，将跳过。`);
          return;
        }
        parsedData.push({
          name: String(item.name),
          key: String(item.key),
          api: String(item.api),
          detail: String(item.detail || ''),
          disabled: Boolean(item.disabled),
        });
        importKeys.add(item.key);
      });
      return { data: parsedData, format, errors };
    }
  } catch (e) { /* 不是 JSON, 继续尝试下一种格式 */ }
  
  // 2. Try parsing as CSV
  if (lines[0].includes(',')) {
    format = 'csv';
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
    const nameIndex = header.indexOf('name');
    const keyIndex = header.indexOf('key');
    const apiIndex = header.indexOf('api');
    
    if (nameIndex > -1 && keyIndex > -1 && apiIndex > -1) {
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const key = values[keyIndex];
        const name = values[nameIndex];
        const api = values[apiIndex];

        if (!key || !name || !api) {
          errors.push(`第 ${i + 1} 行 (CSV): 缺少 name, key, 或 api 值。`);
          continue;
        }
        if (existingKeys.has(key)) {
          errors.push(`第 ${i + 1} 行 (CSV): Key "${key}" 已存在，将跳过。`);
          continue;
        }
        if (importKeys.has(key)) {
          errors.push(`第 ${i + 1} 行 (CSV): Key "${key}" 在导入数据中重复，将跳过。`);
          continue;
        }
        parsedData.push({
          key, name, api,
          detail: values[header.indexOf('detail')] || '',
          disabled: values[header.indexOf('disabled')] === 'true',
        });
        importKeys.add(key);
      }
      return { data: parsedData, format, errors };
    }
  }

  // 3. Assume Plain Text (one API per line)
  format = 'text';
  lines.forEach((line, index) => {
    try {
      const url = new URL(line);
      const name = url.hostname;
      const key = `imported_${Date.now()}_${index}`; // 生成唯一 key
      
      parsedData.push({
        name: `导入 - ${name}`,
        key,
        api: line,
        detail: '',
        disabled: false,
      });
    } catch (e) {
      errors.push(`第 ${index + 1} 行 (TEXT): "${line.slice(0, 30)}..." 不是一个有效的 URL。`);
    }
  });

  return { data: parsedData, format, errors };
}
