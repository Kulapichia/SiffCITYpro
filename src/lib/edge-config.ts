/**
 * (Edge-Safe) 获取站点接口的缓存时间（秒）。
 * 这个函数是为 Vercel Edge 运行时设计的，它只从环境变量中读取配置，
 * 避免了对 Node.js 特定模块（如数据库客户端）的依赖。
 * @returns {number} 缓存时间（秒）。
 */
export function getEdgeCacheTime(): number {
  // 尝试从环境变量中读取缓存时间
  const envCacheTime = process.env.SITE_INTERFACE_CACHE_TIME;

  if (envCacheTime && !isNaN(parseInt(envCacheTime, 10))) {
    return parseInt(envCacheTime, 10);
  }

  // 如果环境变量未设置或无效，则返回一个安全的默认值
  return 7200; // 默认2小时
}
