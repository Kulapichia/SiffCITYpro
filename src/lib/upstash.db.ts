/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { Redis } from '@upstash/redis';

// [新增] 引入注册审批流程所需类型
import { AdminConfig, PendingUser, RegistrationStats } from './admin.types';
import {
  ContentStat,
  EpisodeSkipConfig,
  Favorite,
  IStorage,
  PlayRecord,
  PlayStatsResult,
  UserPlayStat,
  ChatMessage,
  Conversation,
  Friend,
  FriendRequest,
} from './types';

// 搜索历史最大条数
const SEARCH_HISTORY_LIMIT = 20;

// 数据类型转换辅助函数
function ensureString(value: any): string {
  return String(value);
}

function ensureStringArray(value: any[]): string[] {
  return value.map((item) => String(item));
}

// 添加Upstash Redis操作重试包装器
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err: any) {
      const isLastAttempt = i === maxRetries - 1;
      const isConnectionError =
        err.message?.includes('Connection') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ENOTFOUND') ||
        err.code === 'ECONNRESET' ||
        err.code === 'EPIPE' ||
        err.name === 'UpstashError';

      if (isConnectionError && !isLastAttempt) {
        console.log(
          `Upstash Redis operation failed, retrying... (${i + 1}/${maxRetries})`
        );
        console.error('Error:', err.message);

        // 等待一段时间后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }

      throw err;
    }
  }

  throw new Error('Max retries exceeded');
}

export class UpstashRedisStorage implements IStorage {
  private client: Redis;

  constructor() {
    this.client = getUpstashRedisClient();
  }

  // ---------- 播放记录 ----------
  private prKey(user: string, key: string) {
    return `u:${user}:pr:${key}`; // u:username:pr:source+id
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const val = await withRetry(() =>
      this.client.get(this.prKey(userName, key))
    );
    if (!val) return null;
    // [优化] 增加健壮性，兼容对象和JSON字符串
    try {
      return (
        typeof val === 'string' ? JSON.parse(val) : val
      ) as PlayRecord;
    } catch (e) {
      console.error(`[DB] 解析播放记录失败 for key ${key}:`, e);
      return null;
    }
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    await withRetry(() => this.client.set(this.prKey(userName, key), record));
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    const pattern = `u:${userName}:pr:*`;
    const result: Record<string, PlayRecord> = {};
    let cursor: string = '0'; // Upstash-redis v2.x.x scan 返回的 cursor 是 string

    // [优化] 使用 SCAN 替代 KEYS 避免阻塞
    do {
      const [nextCursor, keys] = await withRetry(() => this.client.scan(cursor, { match: pattern, count: 100 }));
      cursor = nextCursor;
      
      if (keys.length > 0) {
        const values = await withRetry(() => this.client.mget(...keys));
        values.forEach((value, index) => {
          if (value) {
            try {
              // 截取 source+id 部分
              const fullKey = keys[index];
              const keyPart = ensureString(fullKey.replace(`u:${userName}:pr:`, ''));
              result[keyPart] = (typeof value === 'string' ? JSON.parse(value) : value) as PlayRecord;
            } catch (e) {
              console.error(`[DB] 解析播放记录失败 for key ${keys[index]}:`, e);
            }
          }
        });
      }
    } while (cursor !== '0');

    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.del(this.prKey(userName, key)));
  }

  // ---------- 收藏 ----------
  private favKey(user: string, key: string) {
    return `u:${user}:fav:${key}`;
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const val = await withRetry(() =>
      this.client.get(this.favKey(userName, key))
    );
    if (!val) return null;
    // [优化] 增加健壮性，兼容对象和JSON字符串
    try {
      return (typeof val === 'string' ? JSON.parse(val) : val) as Favorite;
    } catch(e) {
      console.error(`[DB] 解析收藏失败 for key ${key}:`, e);
      return null;
    }
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.favKey(userName, key), favorite)
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const pattern = `u:${userName}:fav:*`;
    const result: Record<string, Favorite> = {};
    let cursor: string = '0';

    // [优化] 使用 SCAN 替代 KEYS 避免阻塞
    do {
      const [nextCursor, keys] = await withRetry(() => this.client.scan(cursor, { match: pattern, count: 100 }));
      cursor = nextCursor;

      if (keys.length > 0) {
        const values = await withRetry(() => this.client.mget(...keys));
        values.forEach((value, index) => {
          if (value) {
            try {
              const fullKey = keys[index];
              const keyPart = ensureString(fullKey.replace(`u:${userName}:fav:`, ''));
              result[keyPart] = (typeof value === 'string' ? JSON.parse(value) : value) as Favorite;
            } catch (e) {
              console.error(`[DB] 解析收藏失败 for key ${keys[index]}:`, e);
            }
          }
        });
      }
    } while (cursor !== '0');

    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.del(this.favKey(userName, key)));
  }

  // ---------- 用户注册 / 登录 ----------
  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await withRetry(() => this.client.set(this.userPwdKey(userName), password));
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await withRetry(() =>
      this.client.get(this.userPwdKey(userName))
    );
    if (stored === null) return false;
    // 确保比较时都是字符串类型
    return ensureString(stored) === password;
  }

  // 检查用户是否存在
  async checkUserExist(userName: string): Promise<boolean> {
    // 使用 EXISTS 判断 key 是否存在
    const exists = await withRetry(() =>
      this.client.exists(this.userPwdKey(userName))
    );
    return exists === 1;
  }

  // 修改用户密码
  async changePassword(userName: string, newPassword: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await withRetry(() =>
      this.client.set(this.userPwdKey(userName), newPassword)
    );
  }

  // 删除用户及其所有数据
  async deleteUser(userName: string): Promise<void> {
    const keysToDelete: string[] = [];

    // 收集用户自身相关的key
    keysToDelete.push(this.userPwdKey(userName));
    keysToDelete.push(this.shKey(userName));
    // [新增] 收集用户登录统计key
    keysToDelete.push(`user_login_stats:${userName}`);
    // 删除头像和机器码
    keysToDelete.push(this.avatarKey(userName));
    keysToDelete.push(this.machineCodesKey(userName));
    // [优化] 使用 SCAN 收集用户所有数据
    const patterns = [
      `u:${userName}:pr:*`,
      `u:${userName}:fav:*`,
      `u:${userName}:skip:*`,
      `u:${userName}:episodeskip:*`,
      // 聊天相关数据
      `u:${userName}:conversations`,
      `u:${userName}:friends`,
      `u:${userName}:friend_requests`,
    ];
    for (const pattern of patterns) {
      let cursor: string = '0';
      do {
        const [nextCursor, keys] = await withRetry(() => this.client.scan(cursor, { match: pattern, count: 250 }));
        cursor = nextCursor;
        keysToDelete.push(...keys);
      } while (cursor !== '0');
    }

    // 批量删除
    if (keysToDelete.length > 0) {
      await withRetry(() => this.client.del(...keysToDelete));
    }
  }

  // ---------- 搜索历史 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await withRetry(() =>
      this.client.lrange(this.shKey(userName), 0, -1)
    );
    // 确保返回的都是字符串类型
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 先去重
    await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    // 插入到最前
    await withRetry(() => this.client.lpush(key, ensureString(keyword)));
    // 限制最大长度
    await withRetry(() => this.client.ltrim(key, 0, SEARCH_HISTORY_LIMIT - 1));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    } else {
      await withRetry(() => this.client.del(key));
    }
  }

  // ---------- 获取全部用户 ----------
  async getAllUsers(): Promise<string[]> {
    const users: string[] = [];
    let cursor: string = '0';
    
    // [优化] 使用 SCAN 替代 KEYS
    do {
      const [nextCursor, keys] = await withRetry(() => this.client.scan(cursor, { match: 'u:*:pwd', count: 100 }));
      cursor = nextCursor;
      keys.forEach((k) => {
        const match = k.match(/^u:(.+?):pwd$/);
        if (match) {
          users.push(ensureString(match[1]));
        }
      });
    } while (cursor !== '0');

    return users;
  }

  // ---------- 管理员配置 ----------
  private adminConfigKey() {
    return 'admin:config';
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const val = await withRetry(() => this.client.get(this.adminConfigKey()));
    if (!val) return null;

    // 智能兼容：自动识别 JSON 字符串或对象
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch (e) {
        console.error('解析 AdminConfig JSON 失败:', e);
        return null;
      }
    }

    // 对象格式，直接返回
    return val as AdminConfig;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    // 智能保存：尝试 JSON 字符串，失败则用对象（兼容两种方式）
    try {
      const jsonStr = JSON.stringify(config);
      await withRetry(() => this.client.set(this.adminConfigKey(), jsonStr));
    } catch (e) {
      // JSON 序列化失败，回退到对象方式
      console.warn('[Upstash] JSON.stringify 失败，回退到对象方式:', e);
      await withRetry(() => this.client.set(this.adminConfigKey(), config));
    }
  }

  // ---------- 跳过片头片尾配置 ----------
  private skipConfigKey(user: string, source: string, id: string) {
    return `u:${user}:skip:${source}+${id}`;
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<EpisodeSkipConfig | null> {
    const val = await withRetry(() =>
      this.client.get(this.skipConfigKey(userName, source, id))
    );
    if (!val) return null;
    try {
      return (
        typeof val === 'string' ? JSON.parse(val) : val
      ) as EpisodeSkipConfig;
    } catch (e) {
      console.error(
        `[DB] Failed to parse SkipConfig for key ${source}+${id}:`,
        e
      );
      return null;
    }
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.skipConfigKey(userName, source, id), config)
    );
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    await withRetry(() =>
      this.client.del(this.skipConfigKey(userName, source, id))
    );
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const pattern = `u:${userName}:skip:*`;
    const configs: { [key: string]: EpisodeSkipConfig } = {};
    let cursor: string = '0';
    
    // [优化] 使用 SCAN 替代 KEYS
    do {
      const [nextCursor, keys] = await withRetry(() => this.client.scan(cursor, { match: pattern, count: 100 }));
      cursor = nextCursor;

      if (keys.length > 0) {
        // 批量获取所有配置
        const values = await withRetry(() => this.client.mget(...keys));
        keys.forEach((key, index) => {
          const value = values[index];
          if (value) {
            // 从key中提取source+id
            const match = key.match(/^u:.+?:skip:(.+)$/);
            if (match) {
              try {
                const sourceAndId = match[1];
                configs[sourceAndId] = (
                  typeof value === 'string' ? JSON.parse(value) : value
                ) as EpisodeSkipConfig;
              } catch (e) {
                console.error(`[DB] Failed to parse SkipConfig for key ${key}:`, e);
              }
            }
          }
        });
      }
    } while (cursor !== '0');

    return configs;
  }

  // ---------- 剧集跳过配置（新版，多片段支持）----------
  private episodeSkipConfigKey(user: string, source: string, id: string) {
    return `u:${user}:episodeskip:${source}+${id}`;
  }

  async getEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<EpisodeSkipConfig | null> {
    const val = await withRetry(() =>
      this.client.get(this.episodeSkipConfigKey(userName, source, id))
    );
    if (!val) return null;
    try {
      return (
        typeof val === 'string' ? JSON.parse(val) : val
      ) as EpisodeSkipConfig;
    } catch (e) {
      console.error(
        `[DB] Failed to parse EpisodeSkipConfig for key ${source}+${id}:`,
        e
      );
      return null;
    }
  }

  async saveEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.episodeSkipConfigKey(userName, source, id), config)
    );
  }

  async deleteEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    await withRetry(() =>
      this.client.del(this.episodeSkipConfigKey(userName, source, id))
    );
  }

  async getAllEpisodeSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const pattern = `u:${userName}:episodeskip:*`;
    const configs: { [key: string]: EpisodeSkipConfig } = {};
    let cursor: string = '0';

    // [优化] 使用 SCAN 替代 KEYS
    do {
      const [nextCursor, keys] = await withRetry(() => this.client.scan(cursor, { match: pattern, count: 100 }));
      cursor = nextCursor;

      if (keys.length > 0) {
        // 批量获取所有配置
        const values = await withRetry(() => this.client.mget(...keys));
        keys.forEach((key, index) => {
          const value = values[index];
          if (value) {
            // 从key中提取source+id
            const match = key.match(/^u:.+?:episodeskip:(.+)$/);
            if (match) {
              try {
                const sourceAndId = match[1];
                configs[sourceAndId] = (
                  typeof value === 'string' ? JSON.parse(value) : value
                ) as EpisodeSkipConfig;
              } catch (e) {
                console.error(`[DB] Failed to parse EpisodeSkipConfig for key ${key}:`, e);
              }
            }
          }
        });
      }
    } while (cursor !== '0');
    
    return configs;
  }

  // 清空所有数据
  async clearAllData(): Promise<void> {
    try {
      // [优化] 使用 SCAN 清理所有数据
      let cursor: string = '0';
      do {
        // 每次扫描500个key
        const [nextCursor, keys] = await withRetry(() => this.client.scan(cursor, { count: 500 }));
        cursor = nextCursor;
        if (keys.length > 0) {
          await withRetry(() => this.client.del(...keys));
        }
      } while (cursor !== '0');

      console.log('所有数据已清空');
    } catch (error) {
      console.error('清空数据失败:', error);
      throw new Error('清空数据失败');
    }
  }

  // ---------- 通用缓存方法 ----------
  private cacheKey(key: string) {
    return `cache:${key}`;
  }

  async getCache(key: string): Promise<any | null> {
    try {
      const val = await withRetry(() => this.client.get(this.cacheKey(key)));
      if (!val) return null;
      
      // 智能处理返回值：Upstash 可能返回字符串或已解析的对象
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch (parseError) {
          console.warn(`JSON解析失败，返回原字符串 (key: ${key}):`, parseError);
          return val; // 解析失败返回原字符串
        }
      } else {
        // Upstash 可能直接返回解析后的对象
        return val;
      }
    } catch (error) {
      console.error(`Upstash getCache error (key: ${key}):`, error);
      return null;
    }
  }

  async setCache(key: string, data: any, expireSeconds?: number): Promise<void> {
    const cacheKey = this.cacheKey(key);
    const value = JSON.stringify(data);
    
    if (expireSeconds) {
      await withRetry(() => this.client.setex(cacheKey, expireSeconds, value));
    } else {
      await withRetry(() => this.client.set(cacheKey, value));
    }
  }

  async deleteCache(key: string): Promise<void> {
    await withRetry(() => this.client.del(this.cacheKey(key)));
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    // Upstash的TTL机制会自动清理过期数据，这里主要用于手动清理
    // 可以根据需要实现特定前缀的缓存清理
    const pattern = prefix ? `cache:${prefix}*` : 'cache:*';
    
    // [优化] 使用 SCAN 替代 KEYS
    let cursor: string = '0';
    do {
        const [nextCursor, keys] = await withRetry(() => this.client.scan(cursor, { match: pattern, count: 250 }));
        cursor = nextCursor;
        if (keys.length > 0) {
            await withRetry(() => this.client.del(...keys));
            console.log(`Cleared ${keys.length} cache entries with pattern: ${pattern}`);
        }
    } while (cursor !== '0');
  }

  // ---------- [新增] 注册相关方法 ----------
  private pendingUserKey(username: string) {
    return `pending:user:${username}`;
  }
  
  async createPendingUser(username: string, password: string): Promise<void> {
    const pendingUser: PendingUser = {
      username,
      password,
      registeredAt: Date.now(),
    };
    await withRetry(() => this.client.set(this.pendingUserKey(username), JSON.stringify(pendingUser)));
  }

  async getPendingUsers(): Promise<PendingUser[]> {
    const users: PendingUser[] = [];
    let cursor: string = '0';
    
    do {
      const [nextCursor, keys] = await withRetry(() => this.client.scan(cursor, { match: 'pending:user:*', count: 100 }));
      cursor = nextCursor;
      if (keys.length > 0) {
        const values = await withRetry(() => this.client.mget(...keys));
        values.forEach(v => {
          if (v) {
            try {
              const parsed = (typeof v === 'string' ? JSON.parse(v) : v) as PendingUser;
              // 验证解析后的数据结构是否完整
              if (parsed && parsed.username && typeof parsed.registeredAt === 'number') {
                users.push(parsed);
              } else {
                console.warn('待审核用户数据结构不完整:', parsed);
              }
            } catch(e) {
              console.error('解析待审核用户数据失败:', v, e);
            }
          }
        });
      }
    } while (cursor !== '0');
    
    return users.sort((a, b) => a.registeredAt - b.registeredAt);
  }

  async approvePendingUser(username: string): Promise<void> {
    const key = this.pendingUserKey(username);
    const pendingData = await withRetry(() => this.client.get(key));
    if (!pendingData) {
      throw new Error('待审核用户不存在或数据已损坏');
    }
    
    let user: PendingUser;
    try {
      user = (typeof pendingData === 'string' ? JSON.parse(pendingData) : pendingData) as PendingUser;
      if (!user.username || !user.password) {
        throw new Error('待审核用户数据不完整');
      }
    } catch (e) {
      console.error(`[DB] Failed to parse PendingUser for ${username}:`, e);
      // 如果解析失败，直接拒绝并删除该损坏的待审核记录
      await this.rejectPendingUser(username);
      throw new Error(`待审核用户 ${username} 的数据已损坏`);
    }

    await this.registerUser(user.username, user.password);
    await withRetry(() => this.client.del(key));
  }

  async rejectPendingUser(username: string): Promise<void> {
    await withRetry(() => this.client.del(this.pendingUserKey(username)));
  }

  async getRegistrationStats(): Promise<RegistrationStats> {
    const totalUsers = (await this.getAllUsers()).length;
    const pendingUsers = (await this.getPendingUsers()).length;
    const adminConfig = await this.getAdminConfig();
    const maxUsers = adminConfig?.SiteConfig?.MaxUsers;
    // todayRegistrations 依赖于更复杂的日志或统计，此处简化
    return { totalUsers, maxUsers, pendingUsers, todayRegistrations: 0 };
  }
  
  // ---------- 播放统计相关 ----------
  isStatsSupported(): boolean {
    return true;
  }
  
  async getPlayStats(): Promise<PlayStatsResult> {
    try {
      // 尝试从缓存获取
      const cached = await this.getCache('play_stats_summary');
      if (cached) {
        return cached as PlayStatsResult;
      }

      // 重新计算统计数据
      const allUsers = await this.getAllUsers();
      const userStats: any[] = [];
      let totalWatchTime = 0;
      let totalPlays = 0;
      const sourceCount: Record<string, number> = {};
      const dailyData: Record<string, { watchTime: number; plays: number }> = {};

      // 用户注册统计
      const now = Date.now();
      const todayStart = new Date(now).setHours(0, 0, 0, 0);
      let todayNewUsers = 0;
      const registrationData: Record<string, number> = {};

      // 计算近7天的日期范围
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      for (const username of allUsers) {
        const userStat = await this.getUserPlayStat(username);

        // 设置项目开始时间，2025年9月14日
        const PROJECT_START_DATE = new Date('2025-09-14').getTime();
        // 模拟用户创建时间（Upstash模式下通常没有这个信息，使用首次播放时间或项目开始时间）
        const userCreatedAt = userStat.firstWatchDate || PROJECT_START_DATE;
        const registrationDays = Math.floor((now - userCreatedAt) / (1000 * 60 * 60 * 24)) + 1;

        // 统计今日新增用户
        if (userCreatedAt >= todayStart) {
          todayNewUsers++;
        }

        // 统计注册时间分布（近7天）
        if (userCreatedAt >= sevenDaysAgo) {
          const regDate = new Date(userCreatedAt).toISOString().split('T')[0];
          registrationData[regDate] = (registrationData[regDate] || 0) + 1;
        }

        // 推断最后登录时间（基于最后播放时间）
        const lastLoginTime = userStat.lastPlayTime || userCreatedAt;

        const enhancedUserStat = { ...userStat, registrationDays, lastLoginTime, createdAt: userCreatedAt };

        userStats.push(enhancedUserStat);
        totalWatchTime += userStat.totalWatchTime;
        totalPlays += userStat.totalPlays;

        // 获取用户的播放记录来统计源和每日数据
        const records = await this.getAllPlayRecords(username);
        Object.values(records).forEach((record) => {
          const sourceName = record.source_name || '未知来源';
          sourceCount[sourceName] = (sourceCount[sourceName] || 0) + 1;

          const recordDate = new Date(record.save_time);
          if (recordDate.getTime() >= sevenDaysAgo) {
            const dateKey = recordDate.toISOString().split('T')[0];
            if (!dailyData[dateKey]) {
              dailyData[dateKey] = { watchTime: 0, plays: 0 };
            }
            dailyData[dateKey].watchTime += record.play_time || 0;
            dailyData[dateKey].plays += 1;
          }
        });
      }

      // 按观看时间降序排序
      userStats.sort((a, b) => b.totalWatchTime - a.totalWatchTime);

      // 整理热门来源数据
      const topSources = Object.entries(sourceCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([source, count]) => ({ source, count }));

      // 整理近7天数据
      const dailyStats: Array<{ date: string; watchTime: number; plays: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        const data = dailyData[dateKey] || { watchTime: 0, plays: 0 };
        dailyStats.push({ date: dateKey, watchTime: data.watchTime, plays: data.plays });
      }

      // 计算注册趋势
      const registrationStats = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        registrationStats.push({ date: dateKey, newUsers: registrationData[dateKey] || 0 });
      }

      // 计算活跃用户统计
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      const activeUsers = {
        daily: userStats.filter(user => user.lastLoginTime >= oneDayAgo).length,
        weekly: userStats.filter(user => user.lastLoginTime >= sevenDaysAgo).length,
        monthly: userStats.filter(user => user.lastLoginTime >= thirtyDaysAgo).length,
      };

      const result: PlayStatsResult = {
        totalUsers: allUsers.length,
        totalWatchTime,
        totalPlays,
        avgWatchTimePerUser: allUsers.length > 0 ? totalWatchTime / allUsers.length : 0,
        avgPlaysPerUser: allUsers.length > 0 ? totalPlays / allUsers.length : 0,
        userStats,
        topSources,
        dailyStats,
        registrationStats: { todayNewUsers, totalRegisteredUsers: allUsers.length, registrationTrend: registrationStats },
        activeUsers,
      };

      // 缓存结果30分钟
      await this.setCache('play_stats_summary', result, 1800);
      return result;
    } catch (error) {
      console.error('获取播放统计失败:', error);
      return {
        totalUsers: 0, totalWatchTime: 0, totalPlays: 0, avgWatchTimePerUser: 0, avgPlaysPerUser: 0,
        userStats: [], topSources: [], dailyStats: [],
        registrationStats: { todayNewUsers: 0, totalRegisteredUsers: 0, registrationTrend: [] },
        activeUsers: { daily: 0, weekly: 0, monthly: 0 },
      };
    }
  }

  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    try {
      // 获取用户的所有播放记录
      const records = await this.getAllPlayRecords(userName);
      const playRecords = Object.values(records);

      // 优先获取登入统计数据
      let loginStats = { loginCount: 0, firstLoginTime: 0, lastLoginTime: 0, lastLoginDate: 0 };
      try {
        const loginStatsKey = `user_login_stats:${userName}`;
        const storedLoginStats = await this.client.get<any>(loginStatsKey);
        if (storedLoginStats) {
          loginStats = {
            loginCount: storedLoginStats.loginCount || 0,
            firstLoginTime: storedLoginStats.firstLoginTime || 0,
            lastLoginTime: storedLoginStats.lastLoginTime || 0,
            lastLoginDate: storedLoginStats.lastLoginDate || storedLoginStats.lastLoginTime || 0
          };
        }
      } catch (error) {
        console.error(`获取用户 ${userName} 登入统计失败:`, error);
      }
      
      if (playRecords.length === 0) {
        return {
          username: userName, totalWatchTime: 0, totalPlays: 0, lastPlayTime: 0, recentRecords: [],
          avgWatchTime: 0, mostWatchedSource: '', totalMovies: 0, firstWatchDate: 0,
          lastUpdateTime: Date.now(), ...loginStats
        };
      }

      // 计算播放统计
      let totalWatchTime = 0;
      let lastPlayTime = 0;
      const sourceCount: Record<string, number> = {};
      playRecords.forEach((record) => {
        totalWatchTime += record.play_time || 0;
        if (record.save_time > lastPlayTime) lastPlayTime = record.save_time;
        const sourceName = record.source_name || '未知来源';
        sourceCount[sourceName] = (sourceCount[sourceName] || 0) + 1;
      });

      const totalMovies = new Set(playRecords.map(r => `${r.title}_${r.source_name}_${r.year}`)).size;
      const firstWatchDate = Math.min(...playRecords.map(r => r.save_time || Date.now()));
      const recentRecords = playRecords.sort((a, b) => (b.save_time || 0) - (a.save_time || 0)).slice(0, 10);
      let mostWatchedSource = '';
      let maxCount = 0;
      Object.entries(sourceCount).forEach(([source, count]) => {
        if (count > maxCount) {
          maxCount = count;
          mostWatchedSource = source;
        }
      });
      
      return {
        username: userName, totalWatchTime, totalPlays: playRecords.length, lastPlayTime, recentRecords,
        avgWatchTime: playRecords.length > 0 ? totalWatchTime / playRecords.length : 0,
        mostWatchedSource, totalMovies, firstWatchDate, lastUpdateTime: Date.now(), ...loginStats
      };
    } catch (error) {
      console.error(`获取用户 ${userName} 统计失败:`, error);
      return {
        username: userName, totalWatchTime: 0, totalPlays: 0, lastPlayTime: 0, recentRecords: [],
        avgWatchTime: 0, mostWatchedSource: '', totalMovies: 0, firstWatchDate: 0,
        lastUpdateTime: Date.now(), loginCount: 0, firstLoginTime: 0, lastLoginTime: 0, lastLoginDate: 0,
      };
    }
  }

  async getContentStats(limit = 10): Promise<ContentStat[]> {
    try {
      // 获取所有用户的播放记录
      const allUsers = await this.getAllUsers();
      const contentStats: Record<string, any> = {};

      for (const username of allUsers) {
        const records = await this.getAllPlayRecords(username);
        Object.entries(records).forEach(([key, record]) => {
          if (!contentStats[key]) {
            const [source, id] = key.split('+', 2);
            contentStats[key] = {
              source: source || '', id: id || '', title: record.title || '未知标题',
              source_name: record.source_name || '未知来源', cover: record.cover || '',
              year: record.year || '', playCount: 0, totalWatchTime: 0,
              uniqueUsers: new Set(), lastPlayed: 0,
            };
          }
          const stat = contentStats[key];
          stat.playCount += 1;
          stat.totalWatchTime += record.play_time || 0;
          stat.uniqueUsers.add(username);
          if (record.save_time > stat.lastPlayed) {
            stat.lastPlayed = record.save_time;
          }
        });
      }

      // 转换 Set 为数量并排序
      const result = Object.values(contentStats)
        .map((stat) => ({
          ...stat,
          averageWatchTime: stat.playCount > 0 ? stat.totalWatchTime / stat.playCount : 0,
          uniqueUsers: stat.uniqueUsers.size,
        }))
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, limit);

      return result;
    } catch (error) {
      console.error('获取内容统计失败:', error);
      return [];
    }
  }

  async updatePlayStatistics(
    _userName: string,
    _source: string,
    _id: string,
    _watchTime: number
  ): Promise<void> {
    try {
      // 清除全站统计缓存，下次查询时重新计算
      await this.deleteCache('play_stats_summary');
    } catch (error) {
      console.error('更新播放统计失败:', error);
    }
  }

  // 更新用户登入统计
  async updateUserLoginStats(
    userName: string,
    loginTime: number,
    isFirstLogin?: boolean
  ): Promise<void> {
    try {
      const loginStatsKey = `user_login_stats:${userName}`;

      // 获取当前登入统计数据
      const currentStats = await this.client.get<any>(loginStatsKey);
      const loginStats = currentStats || {
        loginCount: 0, firstLoginTime: null, lastLoginTime: null, lastLoginDate: null
      };

      // 更新统计数据
      loginStats.loginCount = (loginStats.loginCount || 0) + 1;
      loginStats.lastLoginTime = loginTime;
      loginStats.lastLoginDate = loginTime; // 保持兼容性

      // 如果是首次登入，记录首次登入时间
      if (isFirstLogin || !loginStats.firstLoginTime) {
        loginStats.firstLoginTime = loginTime;
      }

      // 保存更新后的统计数据
      await this.client.set(loginStatsKey, JSON.stringify(loginStats));

      console.log(`用户 ${userName} 登入统计已更新:`, loginStats);
    } catch (error) {
      console.error(`更新用户 ${userName} 登入统计失败:`, error);
      throw error;
    }
  }

  // ---------- 用户头像 ----------
  private avatarKey(userName: string) {
    return `u:${userName}:avatar`;
  }

  async getUserAvatar(userName: string): Promise<string | null> {
    const val = await withRetry(() => this.client.get(this.avatarKey(userName)));
    return val ? ensureString(val) : null;
  }

  async setUserAvatar(userName: string, avatarBase64: string): Promise<void> {
    await withRetry(() => this.client.set(this.avatarKey(userName), avatarBase64));
  }

  async deleteUserAvatar(userName: string): Promise<void> {
    await withRetry(() => this.client.del(this.avatarKey(userName)));
  }

  // ---------- 弹幕管理 ----------
  private danmuKey(videoId: string) {
    return `video:${videoId}:danmu`;
  }

  async getDanmu(videoId: string): Promise<any[]> {
    const val = await withRetry(() => this.client.lrange(this.danmuKey(videoId), 0, -1));
    if (!val || !Array.isArray(val)) return [];
    return val.map(item => {
      try {
        return typeof item === 'string' ? JSON.parse(item) : item;
      } catch (error) {
        console.error('解析弹幕数据失败:', error);
        return null;
      }
    }).filter(item => item !== null);
  }

  async saveDanmu(videoId: string, userName: string, danmu: {
    text: string;
    color: string;
    mode: number;
    time: number;
    timestamp: number;
  }): Promise<void> {
    const danmuData = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userName,
      ...danmu
    };
    await withRetry(() => this.client.rpush(this.danmuKey(videoId), JSON.stringify(danmuData)));
  }

  async deleteDanmu(videoId: string, danmuId: string): Promise<void> {
    const danmuList = await this.getDanmu(videoId);
    const filteredList = danmuList.filter(item => item.id !== danmuId);
    await withRetry(() => this.client.del(this.danmuKey(videoId)));
    if (filteredList.length > 0) {
      const danmuStrings = filteredList.map(item => JSON.stringify(item));
      await withRetry(() => this.client.rpush(this.danmuKey(videoId), ...danmuStrings));
    }
  }

  // ---------- 机器码管理 ----------
  private machineCodesKey(userName: string) {
    return `u:${userName}:machine_codes`;
  }

  private machineCodeToUserKey() {
    return 'system:machine_code_owner';
  }

  async getUserMachineCodes(userName: string): Promise<any[]> {
    const val = await withRetry(() =>
      this.client.smembers(this.machineCodesKey(userName))
    );
    if (!val || val.length === 0) return [];
    try {
      return val.map(item => JSON.parse(item as string));
    } catch (error) {
      console.error('解析用户设备列表失败:', error);
      return [];
    }
  }

  async setUserMachineCode(userName: string, machineCode: string, deviceInfo?: string): Promise<void> {
    const data = {
      machineCode,
      deviceInfo: deviceInfo || '',
      bindTime: Date.now()
    };
    await withRetry(() =>
      this.client.sadd(this.machineCodesKey(userName), JSON.stringify(data))
    );
    await withRetry(() =>
      this.client.hset(this.machineCodeToUserKey(), { [machineCode]: userName })
    );
  }

  async deleteUserMachineCode(userName: string, machineCode?: string): Promise<void> {
    const userDevicesKey = this.machineCodesKey(userName);
    if (machineCode) {
      // 删除单个设备
      const devices = await this.getUserMachineCodes(userName);
      const deviceToRemove = devices.find(d => d.machineCode === machineCode);
      if (deviceToRemove) {
        await withRetry(() =>
          this.client.srem(userDevicesKey, JSON.stringify(deviceToRemove))
        );
        await withRetry(() =>
          this.client.hdel(this.machineCodeToUserKey(), machineCode)
        );
      }
    } else {
      // 删除所有设备
      const devices = await this.getUserMachineCodes(userName);
      if (devices.length > 0) {
        const codesToRemove = devices.map(d => d.machineCode);
        await withRetry(() =>
          this.client.hdel(this.machineCodeToUserKey(), ...codesToRemove)
        );
      }
      await withRetry(() => this.client.del(userDevicesKey));
    }
  }

  async getMachineCodeUsers(): Promise<Record<string, { devices: any[] }>> {
    const result: Record<string, { devices: any[] }> = {};
    const pattern = 'u:*:machine_codes';
    let cursor = '0';
    do {
      const [nextCursor, keys] = await withRetry(() => this.client.scan(cursor, { match: pattern, count: 100 }));
      cursor = nextCursor;
      for (const key of keys) {
        const userNameMatch = key.match(/^u:(.+?):machine_codes$/);
        if (userNameMatch) {
          const userName = userNameMatch[1];
          const devices = await this.getUserMachineCodes(userName);
          result[userName] = { devices };
        }
      }
    } while (cursor !== '0');
    return result;
  }

  async isMachineCodeBound(machineCode: string): Promise<string | null> {
    const val = await withRetry(() => this.client.hget(this.machineCodeToUserKey(), machineCode));
    return val ? ensureString(val as string) : null;
  }

  // ---------- 聊天功能 ----------
  private messageKey(messageId: string) { return `msg:${messageId}`; }
  private conversationKey(conversationId: string) { return `conv:${conversationId}`; }
  private conversationMessagesKey(conversationId: string) { return `conv:${conversationId}:messages`; }
  private userConversationsKey(userName: string) { return `u:${userName}:conversations`; }
  private userFriendsKey(userName: string) { return `u:${userName}:friends`; }
  private userFriendRequestsKey(userName: string) { return `u:${userName}:friend_requests`; }
  private friendKey(friendId: string) { return `friend:${friendId}`; }
  private friendRequestKey(requestId: string) { return `friend_req:${requestId}`; }

  async saveMessage(message: ChatMessage): Promise<void> {
    await withRetry(() => this.client.set(this.messageKey(message.id), JSON.stringify(message)));
    await withRetry(() => this.client.zadd(this.conversationMessagesKey(message.conversation_id), { score: message.timestamp, member: message.id }));
  }

  async getMessages(conversationId: string, limit = 50, offset = 0): Promise<ChatMessage[]> {
    const messageIds = await withRetry(() => this.client.zrange(this.conversationMessagesKey(conversationId), offset, offset + limit - 1, { rev: true }));
    const messages: ChatMessage[] = [];
    for (const messageId of messageIds) {
      const messageData = await withRetry(() => this.client.get(this.messageKey(messageId as string)));
      if (messageData) {
        try {
          const message = typeof messageData === 'string' ? JSON.parse(messageData) : messageData;
          messages.push(message as ChatMessage);
        } catch (error) { console.error('解析消息失败:', error); }
      }
    }
    return messages.reverse();
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    const messageData = await withRetry(() => this.client.get(this.messageKey(messageId)));
    if (messageData) {
      const message = typeof messageData === 'string' ? JSON.parse(messageData) : messageData as ChatMessage;
      message.is_read = true;
      await withRetry(() => this.client.set(this.messageKey(messageId), JSON.stringify(message)));
    }
  }

  async getConversations(userName: string): Promise<Conversation[]> {
    const conversationIds = await withRetry(() => this.client.smembers(this.userConversationsKey(userName)));
    const conversations: Conversation[] = [];
    for (const conversationId of conversationIds) {
      const conversation = await this.getConversation(conversationId);
      if (conversation) {
        conversations.push(conversation);
      }
    }
    return conversations.sort((a, b) => b.updated_at - a.updated_at);
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const data = await withRetry(() => this.client.get(this.conversationKey(conversationId)));
    return data ? (typeof data === 'string' ? JSON.parse(data) : data as Conversation) : null;
  }

  async createConversation(conversation: Conversation): Promise<void> {
    await withRetry(() => this.client.set(this.conversationKey(conversation.id), JSON.stringify(conversation)));
    for (const participant of conversation.participants) {
      await withRetry(() => this.client.sadd(this.userConversationsKey(participant), conversation.id));
    }
  }

  async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (conversation) {
      Object.assign(conversation, updates);
      await withRetry(() => this.client.set(this.conversationKey(conversationId), JSON.stringify(conversation)));
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (conversation) {
      for (const participant of conversation.participants) {
        await withRetry(() => this.client.srem(this.userConversationsKey(participant), conversationId));
      }
      await withRetry(() => this.client.del(this.conversationKey(conversationId)));
      await withRetry(() => this.client.del(this.conversationMessagesKey(conversationId)));
    }
  }

  async getFriends(userName: string): Promise<Friend[]> {
    const friendIds = await withRetry(() => this.client.smembers(this.userFriendsKey(userName)));
    const friends: Friend[] = [];
    for (const friendId of friendIds) {
      const friendData = await withRetry(() => this.client.get(this.friendKey(friendId)));
      if (friendData) {
        try {
          const friend = typeof friendData === 'string' ? JSON.parse(friendData) : friendData;
          friends.push(friend as Friend);
        } catch (e) { console.error('解析好友数据失败:', e); }
      }
    }
    return friends.sort((a, b) => b.added_at - a.added_at);
  }

  async addFriend(userName: string, friend: Friend): Promise<void> {
    await withRetry(() => this.client.set(this.friendKey(friend.id), JSON.stringify(friend)));
    await withRetry(() => this.client.sadd(this.userFriendsKey(userName), friend.id));
  }

  async removeFriend(userName: string, friendId: string): Promise<void> {
    await withRetry(() => this.client.srem(this.userFriendsKey(userName), friendId));
    await withRetry(() => this.client.del(this.friendKey(friendId)));
  }

  async updateFriendStatus(friendId: string, status: Friend['status']): Promise<void> {
    const friendData = await withRetry(() => this.client.get(this.friendKey(friendId)));
    if (friendData) {
      const friend = typeof friendData === 'string' ? JSON.parse(friendData) : friendData as Friend;
      friend.status = status;
      await withRetry(() => this.client.set(this.friendKey(friendId), JSON.stringify(friend)));
    }
  }

  async getFriendRequests(userName: string): Promise<FriendRequest[]> {
    const requestIds = await withRetry(() => this.client.smembers(this.userFriendRequestsKey(userName)));
    const requests: FriendRequest[] = [];
    for (const requestId of requestIds) {
      const requestData = await withRetry(() => this.client.get(this.friendRequestKey(requestId)));
      if (requestData) {
        const request = typeof requestData === 'string' ? JSON.parse(requestData) : requestData as FriendRequest;
        if (request.to_user === userName || request.from_user === userName) {
          requests.push(request);
        }
      }
    }
    return requests.sort((a, b) => b.created_at - a.created_at);
  }

  async createFriendRequest(request: FriendRequest): Promise<void> {
    await withRetry(() => this.client.set(this.friendRequestKey(request.id), JSON.stringify(request)));
    await withRetry(() => this.client.sadd(this.userFriendRequestsKey(request.from_user), request.id));
    await withRetry(() => this.client.sadd(this.userFriendRequestsKey(request.to_user), request.id));
  }

  async updateFriendRequest(requestId: string, status: FriendRequest['status']): Promise<void> {
    const requestData = await withRetry(() => this.client.get(this.friendRequestKey(requestId)));
    if (requestData) {
      const request = typeof requestData === 'string' ? JSON.parse(requestData) : requestData as FriendRequest;
      request.status = status;
      request.updated_at = Date.now();
      await withRetry(() => this.client.set(this.friendRequestKey(requestId), JSON.stringify(request)));
    }
  }

  async deleteFriendRequest(requestId: string): Promise<void> {
    const requestData = await withRetry(() => this.client.get(this.friendRequestKey(requestId)));
    if (requestData) {
      const request = typeof requestData === 'string' ? JSON.parse(requestData) : requestData as FriendRequest;
      await withRetry(() => this.client.srem(this.userFriendRequestsKey(request.from_user), requestId));
      await withRetry(() => this.client.srem(this.userFriendRequestsKey(request.to_user), requestId));
    }
    await withRetry(() => this.client.del(this.friendRequestKey(requestId)));
  }

  async searchUsers(query: string): Promise<Friend[]> {
    const allUsers = await this.getAllUsers();
    const matchedUsers = allUsers.filter(username => username.toLowerCase().includes(query.toLowerCase()));
    return matchedUsers.map(username => ({ id: username, username, status: 'offline' as const, added_at: 0 }));
  }
}

// 单例 Upstash Redis 客户端
function getUpstashRedisClient(): Redis {
  const globalKey = Symbol.for('__MOONTV_UPSTASH_REDIS_CLIENT__');
  let client: Redis | undefined = (global as any)[globalKey];

  if (!client) {
    const upstashUrl = process.env.UPSTASH_URL;
    const upstashToken = process.env.UPSTASH_TOKEN;

    if (!upstashUrl || !upstashToken) {
      throw new Error(
        'UPSTASH_URL and UPSTASH_TOKEN env variables must be set'
      );
    }

    // 创建 Upstash Redis 客户端
    client = new Redis({
      url: upstashUrl,
      token: upstashToken,
      // 可选配置
      retry: {
        retries: 3,
        backoff: (retryCount: number) =>
          Math.min(1000 * Math.pow(2, retryCount), 30000),
      },
    });

    console.log('Upstash Redis client created successfully');

    (global as any)[globalKey] = client;
  }

  return client;
}
