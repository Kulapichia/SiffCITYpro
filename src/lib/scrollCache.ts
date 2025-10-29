/**
 * @file scrollCache.ts
 * @description 滚动恢复功能的数据缓存模块。
 * 负责将页面的滚动位置和相关状态数据存储到浏览器的 sessionStorage 中，
 * 以便在用户返回页面时恢复之前的浏览状态。
 *
 * 本模块采用通用设计，通过泛型 <T> 来适应不同页面需要缓存的特定数据结构。
 */

// 定义一个基础的、可扩展的缓存数据结构。
// 使用泛型 T 来适应不同页面的具体数据结构（如首页、豆瓣页等）。
export interface ScrollCacheData<T> {
  scrollPosition: number; // 滚动位置
  data: T; // 页面特有的、需要缓存的状态数据
  timestamp: number; // 时间戳，用于未来可能的缓存过期策略
}

const CACHE_PREFIX = 'joyflix-scroll-cache-';

/**
 * 生成缓存键
 * @param key - 通常是页面的路径名，如 '/douban' 或 '/'
 */
const getCacheKey = (key: string): string => `${CACHE_PREFIX}${key}`;

/**
 * 从 sessionStorage 中读取缓存。
 * 这是一个泛型函数，调用时需要指定期望的数据类型。
 * @param key - 页面唯一标识
 * @returns 返回带有泛型类型的数据，或在失败时返回 null
 */
export const getScrollCache = <T>(key: string): ScrollCacheData<T> | null => {
  try {
    const cacheKey = getCacheKey(key);
    const cachedData = sessionStorage.getItem(cacheKey);
    if (cachedData) {
      // 解析后，将结果断言为期望的泛型类型
      return JSON.parse(cachedData) as ScrollCacheData<T>;
    }
  } catch (error) {
    // 在开发环境中打印错误以便调试
    if (process.env.NODE_ENV === 'development') {
      console.error(`Error getting scroll cache for key "${key}":`, error);
    }
  }
  return null;
};

/**
 * 将状态写入 sessionStorage。
 * 这是一个泛型函数，可以接收任何类型的数据结构。
 * @param key - 页面唯一标识
 * @param data - 要缓存的数据，其类型为 ScrollCacheData<T>
 */
export const setScrollCache = <T>(key: string, data: ScrollCacheData<T>): void => {
  try {
    const cacheKey = getCacheKey(key);
    sessionStorage.setItem(cacheKey, JSON.stringify(data));
  } catch (error) {
    // 在开发环境中打印错误以便调试
    if (process.env.NODE_ENV === 'development') {
      console.error(`Error setting scroll cache for key "${key}":`, error);
    }
  }
};

/**
 * 清除指定页面的缓存
 * @param key - 页面唯一标识
 */
export const clearScrollCache = (key: string): void => {
  try {
    const cacheKey = getCacheKey(key);
    sessionStorage.removeItem(cacheKey);
  } catch (error) {
    // 在开发环境中打印错误以便调试
    if (process.env.NODE_ENV === 'development') {
      console.error(`Error clearing scroll cache for key "${key}":`, error);
    }
  }
};

/**
 * 清除所有页面的滚动缓存（例如，在用户登出时）
 */
export const clearAllScrollCaches = (): void => {
  try {
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    // 在开发环境中打印错误以便调试
    if (process.env.NODE_ENV === 'development') {
      console.error('Error clearing all scroll caches:', error);
    }
  }
};
