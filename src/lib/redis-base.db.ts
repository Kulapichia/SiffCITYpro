/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { createClient, RedisClientType } from 'redis';

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

// 连接配置接口
export interface RedisConnectionConfig {
  url: string;
  clientName: string; // 用于日志显示，如 "Redis" 或 "Pika"
}

// 添加Redis操作重试包装器
function createRetryWrapper(clientName: string, getClient: () => RedisClientType) {
  return async function withRetry<T>(
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
          err.code === 'EPIPE';

        if (isConnectionError && !isLastAttempt) {
          console.log(
            `${clientName} operation failed, retrying... (${i + 1}/${maxRetries})`
          );
          console.error('Error:', err.message);

          // 等待一段时间后重试
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));

          // 尝试重新连接
          try {
            const client = getClient();
            if (!client.isOpen) {
              await client.connect();
            }
          } catch (reconnectErr) {
            console.error('Failed to reconnect:', reconnectErr);
          }

          continue;
        }

        throw err;
      }
    }

    throw new Error('Max retries exceeded');
  };
}

// 创建客户端的工厂函数
export function createRedisClient(config: RedisConnectionConfig, globalSymbol: symbol): RedisClientType {
  let client: RedisClientType | undefined = (global as any)[globalSymbol];

  if (!client) {
    if (!config.url) {
      throw new Error(`${config.clientName}_URL env variable not set`);
    }

    // 创建客户端配置
    const clientConfig: any = {
      url: config.url,
      socket: {
        // 重连策略：指数退避，最大30秒
        reconnectStrategy: (retries: number) => {
          console.log(`${config.clientName} reconnection attempt ${retries + 1}`);
          if (retries > 10) {
            console.error(`${config.clientName} max reconnection attempts exceeded`);
            return false; // 停止重连
          }
          return Math.min(1000 * Math.pow(2, retries), 30000); // 指数退避，最大30秒
        },
        connectTimeout: 10000, // 10秒连接超时
        // 设置no delay，减少延迟
        noDelay: true,
      },
      // 添加其他配置
      pingInterval: 30000, // 30秒ping一次，保持连接活跃
    };

    client = createClient(clientConfig);

    // 添加错误事件监听
    client.on('error', (err) => {
      console.error(`${config.clientName} client error:`, err);
    });

    client.on('connect', () => {
      console.log(`${config.clientName} connected`);
    });

    client.on('reconnecting', () => {
      console.log(`${config.clientName} reconnecting...`);
    });

    client.on('ready', () => {
      console.log(`${config.clientName} ready`);
    });

    // 初始连接，带重试机制
    const connectWithRetry = async () => {
      try {
        await client!.connect();
        console.log(`${config.clientName} connected successfully`);
      } catch (err) {
        console.error(`${config.clientName} initial connection failed:`, err);
        console.log('Will retry in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
      }
    };

    connectWithRetry();

    (global as any)[globalSymbol] = client;
  }

  return client;
}

// 抽象基类，包含所有通用的Redis操作逻辑
export abstract class BaseRedisStorage implements IStorage {
  protected client: RedisClientType;
  protected config: RedisConnectionConfig;
  protected withRetry: <T>(operation: () => Promise<T>, maxRetries?: number) => Promise<T>;

  constructor(config: RedisConnectionConfig, globalSymbol: symbol) {
    this.config = config; // 保存配置
    this.client = createRedisClient(config, globalSymbol);
    this.withRetry = createRetryWrapper(config.clientName, () => this.client);
  }

  // ---------- 播放记录 ----------
  private prKey(user: string, key: string) {
    return `u:${user}:pr:${key}`; // u:username:pr:source+id
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const val = await this.withRetry(() =>
      this.client.get(this.prKey(userName, key))
    );
    if (!val) return null;
    try {
      return JSON.parse(val) as PlayRecord;
    } catch (e) {
      console.error(`[DB] Failed to parse PlayRecord for key ${key}:`, e);
      return null;
    }
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.set(this.prKey(userName, key), JSON.stringify(record))
    );
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    const pattern = `u:${userName}:pr:*`;
    const keys: string[] = [];
    let cursor = '0';
    do {
      const reply = await this.client.scan(cursor as any, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor as any;
      keys.push(...reply.keys);
    } while (cursor !== '0');
    if (keys.length === 0) return {};
    const values = await this.withRetry(() => this.client.mGet(keys));
    const result: Record<string, PlayRecord> = {};
    keys.forEach((fullKey: string, idx: number) => {
      const raw = values[idx];
      if (raw) {
        try {
          const rec = JSON.parse(raw) as PlayRecord;
          // 截取 source+id 部分
          const keyPart = ensureString(fullKey.replace(`u:${userName}:pr:`, ''));
          result[keyPart] = rec;
        } catch (e) {
          console.error(`[DB] Failed to parse PlayRecord for key ${fullKey}:`, e);
        }
      }
    });
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.prKey(userName, key)));
  }

  // ---------- 收藏 ----------
  private favKey(user: string, key: string) {
    return `u:${user}:fav:${key}`;
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const val = await this.withRetry(() =>
      this.client.get(this.favKey(userName, key))
    );
    if (!val) return null;
    try {
      return JSON.parse(val) as Favorite;
    } catch (e) {
      console.error(`[DB] Failed to parse Favorite for key ${key}:`, e);
      return null;
    }
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.set(this.favKey(userName, key), JSON.stringify(favorite))
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const pattern = `u:${userName}:fav:*`;
    const keys: string[] = [];
    let cursor = '0';
    do {
      const reply = await this.client.scan(cursor as any, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor as any;
      keys.push(...reply.keys);
    } while (cursor !== '0');
    if (keys.length === 0) return {};
    const values = await this.withRetry(() => this.client.mGet(keys));
    const result: Record<string, Favorite> = {};
    keys.forEach((fullKey: string, idx: number) => {
      const raw = values[idx];
      if (raw) {
        try {
          const fav = JSON.parse(raw) as Favorite;
          const keyPart = ensureString(fullKey.replace(`u:${userName}:fav:`, ''));
          result[keyPart] = fav;
        } catch (e) {
          console.error(`[DB] Failed to parse Favorite for key ${fullKey}:`, e);
        }
      }
    });
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.favKey(userName, key)));
  }

  // ---------- 用户注册 / 登录 ----------
  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await this.withRetry(() => this.client.set(this.userPwdKey(userName), password));
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await this.withRetry(() =>
      this.client.get(this.userPwdKey(userName))
    );
    if (stored === null) return false;
    // 确保比较时都是字符串类型
    return ensureString(stored) === password;
  }

  // 检查用户是否存在
  async checkUserExist(userName: string): Promise<boolean> {
    // 使用 EXISTS 判断 key 是否存在
    const exists = await this.withRetry(() =>
      this.client.exists(this.userPwdKey(userName))
    );
    return exists === 1;
  }

  // 修改用户密码
  async changePassword(userName: string, newPassword: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await this.withRetry(() =>
      this.client.set(this.userPwdKey(userName), newPassword)
    );
  }

  // 删除用户及其所有数据
  async deleteUser(userName: string): Promise<void> {
    const keysToDelete: string[] = [];
    // 删除用户密码
    keysToDelete.push(this.userPwdKey(userName));
    // 删除搜索历史
    keysToDelete.push(this.shKey(userName));
    // 删除用户登入统计
    keysToDelete.push(this.userStatsKey(userName));
    // 删除头像和机器码
    keysToDelete.push(this.avatarKey(userName));
    keysToDelete.push(this.machineCodeKey(userName));
    
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
      let cursor = '0';
      do {
        const reply = await this.client.scan(cursor as any, { MATCH: pattern, COUNT: 250 });
        cursor = reply.cursor as any;
        keysToDelete.push(...reply.keys);
      } while (cursor !== '0');
    }

    if (keysToDelete.length > 0) {
      await this.withRetry(() => this.client.del(keysToDelete));
    }
  }

  // ---------- 搜索历史 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await this.withRetry(() =>
      this.client.lRange(this.shKey(userName), 0, -1)
    );
    // 确保返回的都是字符串类型
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 先去重
    await this.withRetry(() => this.client.lRem(key, 0, ensureString(keyword)));
    // 插入到最前
    await this.withRetry(() => this.client.lPush(key, ensureString(keyword)));
    // 限制最大长度
    await this.withRetry(() => this.client.lTrim(key, 0, SEARCH_HISTORY_LIMIT - 1));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await this.withRetry(() => this.client.lRem(key, 0, ensureString(keyword)));
    } else {
      await this.withRetry(() => this.client.del(key));
    }
  }

  // ---------- 获取全部用户 ----------
  async getAllUsers(): Promise<string[]> {
    const users: string[] = [];
    let cursor = '0';
    do {
      const reply = await this.client.scan(cursor as any, { MATCH: 'u:*:pwd', COUNT: 100 });
      cursor = reply.cursor as any;
      for (const key of reply.keys) {
        const match = key.match(/^u:(.+?):pwd$/);
        if (match) {
          users.push(ensureString(match[1]));
        }
      }
    } while (cursor !== '0');
    return users;
  }

  // ---------- 管理员配置 ----------
  private adminConfigKey() {
    return 'admin:config';
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const val = await this.withRetry(() => this.client.get(this.adminConfigKey()));
    if (!val) return null;
    try {
      return JSON.parse(val) as AdminConfig;
    } catch (e) {
      console.error(`[DB] Failed to parse AdminConfig:`, e);
      return null;
    }
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await this.withRetry(() =>
      this.client.set(this.adminConfigKey(), JSON.stringify(config))
    );
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
    const val = await this.withRetry(() =>
      this.client.get(this.skipConfigKey(userName, source, id))
    );
    if (!val) return null;
    try {
      return JSON.parse(val) as EpisodeSkipConfig;
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
    await this.withRetry(() =>
      this.client.set(
        this.skipConfigKey(userName, source, id),
        JSON.stringify(config)
      )
    );
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.del(this.skipConfigKey(userName, source, id))
    );
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const pattern = `u:${userName}:skip:*`;
    const keys: string[] = [];
    let cursor = '0';
    do {
      const reply = await this.client.scan(cursor as any, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor as any;
      keys.push(...reply.keys);
    } while (cursor !== '0');

    if (keys.length === 0) {
      return {};
    }

    const configs: { [key: string]: EpisodeSkipConfig } = {};

    // 批量获取所有配置
    const values = await this.withRetry(() => this.client.mGet(keys));

    keys.forEach((key, index) => {
      const value = values[index];
      if (value) {
        try {
          // 从key中提取source+id
          const match = key.match(/^u:.+?:skip:(.+)$/);
          if (match) {
            const sourceAndId = match[1];
            configs[sourceAndId] = JSON.parse(value as string) as EpisodeSkipConfig;
          }
        } catch (e) {
          console.error(`[DB] Failed to parse SkipConfig for key ${key}:`, e);
        }
      }
    });

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
    const val = await this.withRetry(() =>
      this.client.get(this.episodeSkipConfigKey(userName, source, id))
    );
    if (!val) return null;
    try {
      return JSON.parse(val) as EpisodeSkipConfig;
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
    await this.withRetry(() =>
      this.client.set(
        this.episodeSkipConfigKey(userName, source, id),
        JSON.stringify(config)
      )
    );
  }

  async deleteEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.del(this.episodeSkipConfigKey(userName, source, id))
    );
  }

  async getAllEpisodeSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const pattern = `u:${userName}:episodeskip:*`;
    const keys: string[] = [];
    let cursor = '0';
    do {
      const reply = await this.client.scan(cursor as any, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor as any;
      keys.push(...reply.keys);
    } while (cursor !== '0');

    if (keys.length === 0) {
      return {};
    }

    const configs: { [key: string]: EpisodeSkipConfig } = {};

    // 批量获取所有配置
    const values = await this.withRetry(() => this.client.mGet(keys));

    keys.forEach((key, index) => {
      const value = values[index];
      if (value) {
        try {
          // 从key中提取source+id
          const match = key.match(/^u:.+?:episodeskip:(.+)$/);
          if (match) {
            const sourceAndId = match[1];
            configs[sourceAndId] = JSON.parse(value as string) as EpisodeSkipConfig;
          }
        } catch (e) {
          console.error(`[DB] Failed to parse EpisodeSkipConfig for key ${key}:`, e);
        }
      }
    });

    return configs;
  }

  // 清空所有数据
  async clearAllData(): Promise<void> {
    try {
      // 获取所有用户
      const allUsers = await this.getAllUsers();

      // 删除所有用户及其数据
      for (const username of allUsers) {
        await this.deleteUser(username);
      }

      // 删除管理员配置
      await this.withRetry(() => this.client.del(this.adminConfigKey()));

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
      const val = await this.withRetry(() => this.client.get(this.cacheKey(key)));
      if (!val) return null;

      // 智能处理返回值：兼容不同Redis客户端的行为
      if (typeof val === 'string') {
        // 检查是否是HTML错误页面
        if (val.trim().startsWith('<!DOCTYPE') || val.trim().startsWith('<html')) {
          console.error(`${this.config.clientName} returned HTML instead of JSON. Connection issue detected.`);
          return null;
        }

        try {
          return JSON.parse(val);
        } catch (parseError) {
          console.warn(`${this.config.clientName} JSON解析失败，返回原字符串 (key: ${key}):`, parseError);
          return val; // 解析失败返回原字符串
        }
      } else {
        // 某些Redis客户端可能直接返回解析后的对象
        return val;
      }
    } catch (error: any) {
      console.error(`${this.config.clientName} getCache error (key: ${key}):`, error);
      return null;
    }
  }

  async setCache(key: string, data: any, expireSeconds?: number): Promise<void> {
    try {
      const cacheKey = this.cacheKey(key);
      const value = JSON.stringify(data);

      if (expireSeconds) {
        await this.withRetry(() => this.client.setEx(cacheKey, expireSeconds, value));
      } else {
        await this.withRetry(() => this.client.set(cacheKey, value));
      }
    } catch (error) {
      console.error(`${this.config.clientName} setCache error (key: ${key}):`, error);
      throw error; // 重新抛出错误以便上层处理
    }
  }

  async deleteCache(key: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.cacheKey(key)));
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    // Redis的TTL机制会自动清理过期数据，这里主要用于手动清理
    // 可以根据需要实现特定前缀的缓存清理
    const pattern = prefix ? `cache:${prefix}*` : 'cache:*';
    const keys: string[] = [];
    let cursor = '0';
    do {
      const reply = await this.client.scan(cursor as any, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor as any;
      keys.push(...reply.keys);
    } while (cursor !== '0');


    if (keys.length > 0) {
      await this.withRetry(() => this.client.del(keys));
      console.log(`Cleared ${keys.length} cache entries with pattern: ${pattern}`);
    }
  }

  // ---------- 注册相关方法 ----------
  private pendingUserKey(username: string) {
    return `pending:user:${username}`;
  }

  private registrationStatsKey() {
    return 'registration:stats';
  }

  async createPendingUser(username: string, password: string): Promise<void> {
    const pendingUser: PendingUser = {
      username,
      registeredAt: Date.now(),
      password: password, // 存储明文密码，与主系统保持一致
    };

    await this.withRetry(() =>
      this.client.set(
        this.pendingUserKey(username),
        JSON.stringify(pendingUser)
      )
    );

    // 更新今日注册统计
    const today = new Date().toISOString().split('T')[0];
    const todayKey = `registration:today:${today}`;
    await this.withRetry(() => this.client.incr(todayKey));
    await this.withRetry(() => this.client.expire(todayKey, 24 * 60 * 60)); // 24小时过期
  }

  async getPendingUsers(): Promise<PendingUser[]> {
    const pattern = 'pending:user:*';
    const keys: string[] = [];
    let cursor = '0';
    do {
      const reply = await this.client.scan(cursor as any, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor as any;
      keys.push(...reply.keys);
    } while (cursor !== '0');
    
    if (keys.length === 0) return [];

    const values = await this.withRetry(() => this.client.mGet(keys));
    const pendingUsers: PendingUser[] = [];

    values.forEach((raw, index) => {
      if (raw) {
        try {
          // 检查 raw 是否为有效的 JSON 字符串
          if (typeof raw === 'string' && raw !== '[object Object]') {
            const parsed = JSON.parse(raw) as PendingUser;
            // 验证解析后的数据结构是否完整
            if (
              parsed &&
              parsed.username &&
              typeof parsed.registeredAt === 'number'
            ) {
              pendingUsers.push(parsed);
            } else {
              console.warn('待审核用户数据结构不完整:', parsed);
              // 可选：清理损坏的数据
              const keyToClean = keys[index];
              if (keyToClean) {
                this.withRetry(() => this.client.del(keyToClean)).catch((err) =>
                  console.error('清理损坏数据失败:', err)
                );
              }
            }
          } else {
            console.warn('待审核用户数据格式无效:', raw);
            // 清理无效数据
            const keyToClean = keys[index];
            if (keyToClean) {
              this.withRetry(() => this.client.del(keyToClean)).catch((err) =>
                console.error('清理无效数据失败:', err)
              );
            }
          }
        } catch (error) {
          console.error('解析待审核用户数据失败:', error, 'raw data:', raw);
          // 清理解析失败的损坏数据
          const keyToClean = keys[index];
          if (keyToClean) {
            this.withRetry(() => this.client.del(keyToClean)).catch((err) =>
              console.error('清理解析失败的数据失败:', err)
            );
          }
        }
      }
    });

    return pendingUsers.sort((a, b) => a.registeredAt - b.registeredAt);
  }

  async approvePendingUser(username: string): Promise<void> {
    // 获取待审核用户信息
    const pendingData = await this.withRetry(() =>
      this.client.get(this.pendingUserKey(username))
    );

    if (!pendingData) {
      throw new Error('待审核用户不存在');
    }

    let pendingUser: PendingUser;
    try {
      pendingUser = JSON.parse(pendingData);
    } catch (e) {
      console.error(`[DB] Failed to parse PendingUser for ${username}:`, e);
      // 如果解析失败，直接拒绝并删除该损坏的待审核记录
      await this.rejectPendingUser(username);
      throw new Error(`待审核用户 ${username} 的数据已损坏`);
    }

    // 创建正式用户账号（使用明文密码）
    await this.withRetry(() =>
      this.client.set(this.userPwdKey(username), pendingUser.password)
    );

    // 删除待审核记录
    await this.withRetry(() => this.client.del(this.pendingUserKey(username)));

    console.log(`用户 ${username} 注册审核通过`);
  }

  async rejectPendingUser(username: string): Promise<void> {
    const exists = await this.withRetry(() =>
      this.client.exists(this.pendingUserKey(username))
    );

    if (exists === 0) {
      throw new Error('待审核用户不存在');
    }

    await this.withRetry(() => this.client.del(this.pendingUserKey(username)));
    console.log(`用户 ${username} 注册申请已拒绝`);
  }

  async getRegistrationStats(): Promise<RegistrationStats> {
    // 获取总用户数
    const allUsers = await this.getAllUsers();
    const totalUsers = allUsers.length;

    // 获取待审核用户数
    const pendingUsers = await this.getPendingUsers();
    const pendingCount = pendingUsers.length;

    // 获取今日注册数
    const today = new Date().toISOString().split('T')[0];
    const todayKey = `registration:today:${today}`;
    const todayCount = await this.withRetry(() => this.client.get(todayKey));
    const todayRegistrations = todayCount ? parseInt(todayCount) : 0;

    // 从配置中获取最大用户数限制
    const adminConfig = await this.getAdminConfig();
    const maxUsers = adminConfig?.SiteConfig?.MaxUsers;

    return {
      totalUsers,
      maxUsers,
      pendingUsers: pendingCount,
      todayRegistrations,
    };
  }

  // ---------- 播放统计相关 ----------
  private playStatsKey() {
    return 'global:play_stats';
  }

  private userStatsKey(userName: string) {
    return `u:${userName}:stats`;
  }

  private contentStatsKey(source: string, id: string) {
    return `content:stats:${source}+${id}`;
  }

  // 获取全站播放统计
  async getPlayStats(): Promise<PlayStatsResult> {
    try {
      // 尝试从缓存获取
      const cached = await this.getCache('play_stats_summary');
      if (cached) {
        return cached;
      }

      // 重新计算统计数据
      const allUsers = await this.getAllUsers();

      const userStats: Array<{
        username: string;
        totalWatchTime: number;
        totalPlays: number;
        lastPlayTime: number;
        recentRecords: PlayRecord[];
        avgWatchTime: number;
        mostWatchedSource: string;
        registrationDays: number;
        lastLoginTime: number;
        loginCount: number;
        createdAt: number;
      }> = [];
      let totalWatchTime = 0;
      let totalPlays = 0;

      // 用户注册统计
      const now = Date.now();
      const todayStart = new Date(now).setHours(0, 0, 0, 0);
      let todayNewUsers = 0;
      const registrationData: Record<string, number> = {};
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      // 收集所有用户统计
      for (const username of allUsers) {
        const userStat = await this.getUserPlayStat(username);

        // 设置项目开始时间，2025年9月14日
        const PROJECT_START_DATE = new Date('2025-09-14').getTime();
        // 模拟用户创建时间（Redis模式下通常没有这个信息，使用首次播放时间或项目开始时间）
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

        const enhancedUserStat = {
          username: userStat.username,
          totalWatchTime: userStat.totalWatchTime,
          totalPlays: userStat.totalPlays,
          lastPlayTime: userStat.lastPlayTime,
          recentRecords: userStat.recentRecords,
          avgWatchTime: userStat.avgWatchTime,
          mostWatchedSource: userStat.mostWatchedSource,
          registrationDays,
          lastLoginTime,
          loginCount: userStat.loginCount || 0, // 添加登入次数字段
          createdAt: userCreatedAt,
        };

        userStats.push(enhancedUserStat);
        totalWatchTime += userStat.totalWatchTime;
        totalPlays += userStat.totalPlays;
      }

      // 计算热门来源
      const sourceMap = new Map<string, number>();
      for (const user of userStats) {
        for (const record of user.recentRecords) {
          const count = sourceMap.get(record.source_name) || 0;
          sourceMap.set(record.source_name, count + 1);
        }
      }

      const topSources = Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // 生成近7天统计（简化版本）
      const dailyStats = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        dailyStats.push({
          date: date.toISOString().split('T')[0],
          watchTime: Math.floor(totalWatchTime / 7), // 简化计算
          plays: Math.floor(totalPlays / 7)
        });
      }

      // 计算注册趋势
      const registrationStats = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        registrationStats.push({
          date: dateKey,
          newUsers: registrationData[dateKey] || 0,
        });
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
        userStats: userStats.sort((a, b) => b.totalWatchTime - a.totalWatchTime),
        topSources,
        dailyStats,
        // 新增：用户注册统计
        registrationStats: {
          todayNewUsers,
          totalRegisteredUsers: allUsers.length,
          registrationTrend: registrationStats,
        },
        // 新增：用户活跃度统计
        activeUsers,
      };

      // 缓存结果30分钟
      await this.setCache('play_stats_summary', result, 1800);

      return result;
    } catch (error) {
      console.error('获取播放统计失败:', error);
      return {
        totalUsers: 0,
        totalWatchTime: 0,
        totalPlays: 0,
        avgWatchTimePerUser: 0,
        avgPlaysPerUser: 0,
        userStats: [],
        topSources: [],
        dailyStats: [],
        // 新增：用户注册统计
        registrationStats: {
          todayNewUsers: 0,
          totalRegisteredUsers: 0,
          registrationTrend: [],
        },
        // 新增：用户活跃度统计
        activeUsers: {
          daily: 0,
          weekly: 0,
          monthly: 0,
        },
      };
    }
  }

  // 获取用户播放统计
  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    try {
      // 获取用户所有播放记录
      const playRecords = await this.getAllPlayRecords(userName);
      const records = Object.values(playRecords);

      if (records.length === 0) {
        // 即使没有播放记录，也要获取登入统计
        let loginStats = {
          loginCount: 0,
          firstLoginTime: 0,
          lastLoginTime: 0,
          lastLoginDate: 0
        };

        try {
          const loginStatsKey = `user_login_stats:${userName}`;
          const storedLoginStats = await this.client.get(loginStatsKey);
          if (storedLoginStats) {
            const parsed = JSON.parse(storedLoginStats);
            loginStats = {
              loginCount: parsed.loginCount || 0,
              firstLoginTime: parsed.firstLoginTime || 0,
              lastLoginTime: parsed.lastLoginTime || 0,
              lastLoginDate: parsed.lastLoginDate || parsed.lastLoginTime || 0
            };
          }
        } catch (error) {
          console.error(`获取用户 ${userName} 登入统计失败:`, error);
        }

        return {
          username: userName,
          totalWatchTime: 0,
          totalPlays: 0,
          lastPlayTime: 0,
          recentRecords: [],
          avgWatchTime: 0,
          mostWatchedSource: '',
          // 新增字段
          totalMovies: 0,
          firstWatchDate: Date.now(),
          lastUpdateTime: Date.now(),
          // 登入统计字段
          loginCount: loginStats.loginCount,
          firstLoginTime: loginStats.firstLoginTime,
          lastLoginTime: loginStats.lastLoginTime,
          lastLoginDate: loginStats.lastLoginDate
        };
      }

      // 计算统计数据
      const totalWatchTime = records.reduce((sum, record) => sum + (record.play_time || 0), 0);
      const totalPlays = records.length;
      const lastPlayTime = Math.max(...records.map(r => r.save_time || 0));

      // 计算观看影片总数（去重）
      const totalMovies = new Set(records.map(r => `${r.title}_${r.source_name}_${r.year}`)).size;

      // 计算首次观看时间
      const firstWatchDate = Math.min(...records.map(r => r.save_time || Date.now()));

      // 最近10条记录，按时间排序
      const recentRecords = records
        .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
        .slice(0, 10);

      // 平均观看时长
      const avgWatchTime = totalPlays > 0 ? totalWatchTime / totalPlays : 0;

      // 最常观看的来源
      const sourceMap = new Map<string, number>();
      records.forEach(record => {
        const sourceName = record.source_name || '未知来源';
        const count = sourceMap.get(sourceName) || 0;
        sourceMap.set(sourceName, count + 1);
      });

      const mostWatchedSource = sourceMap.size > 0
        ? Array.from(sourceMap.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0]
        : '';

      // 获取登入统计数据
      let loginStats = {
        loginCount: 0,
        firstLoginTime: 0,
        lastLoginTime: 0,
        lastLoginDate: 0
      };

      try {
        const loginStatsKey = `user_login_stats:${userName}`;
        const storedLoginStats = await this.client.get(loginStatsKey);
        if (storedLoginStats) {
          const parsed = JSON.parse(storedLoginStats);
          loginStats = {
            loginCount: parsed.loginCount || 0,
            firstLoginTime: parsed.firstLoginTime || 0,
            lastLoginTime: parsed.lastLoginTime || 0,
            lastLoginDate: parsed.lastLoginDate || parsed.lastLoginTime || 0
          };
        }
      } catch (error) {
        console.error(`获取用户 ${userName} 登入统计失败:`, error);
      }

      return {
        username: userName,
        totalWatchTime,
        totalPlays,
        lastPlayTime,
        recentRecords,
        avgWatchTime,
        mostWatchedSource,
        // 新增字段
        totalMovies,
        firstWatchDate,
        lastUpdateTime: Date.now(),
        // 登入统计字段
        loginCount: loginStats.loginCount,
        firstLoginTime: loginStats.firstLoginTime,
        lastLoginTime: loginStats.lastLoginTime,
        lastLoginDate: loginStats.lastLoginDate
      };
    } catch (error) {
      console.error(`获取用户 ${userName} 统计失败:`, error);
      return {
        username: userName,
        totalWatchTime: 0,
        totalPlays: 0,
        lastPlayTime: 0,
        recentRecords: [],
        avgWatchTime: 0,
        mostWatchedSource: '',
        // 新增字段
        totalMovies: 0,
        firstWatchDate: Date.now(),
        lastUpdateTime: Date.now(),
        // 登入统计字段
        loginCount: 0,
        firstLoginTime: 0,
        lastLoginTime: 0,
        lastLoginDate: 0
      };
    }
  }

  // 获取内容热度统计
  async getContentStats(limit = 10): Promise<ContentStat[]> {
    try {
      // 获取所有用户
      const allUsers = await this.getAllUsers();
      const contentMap = new Map<string, {
        record: PlayRecord;
        playCount: number;
        totalWatchTime: number;
        users: Set<string>;
      }>();

      // 收集所有播放记录
      for (const username of allUsers) {
        const playRecords = await this.getAllPlayRecords(username);

        Object.entries(playRecords).forEach(([key, record]) => {
          const contentKey = key; // source+id

          if (!contentMap.has(contentKey)) {
            contentMap.set(contentKey, {
              record,
              playCount: 0,
              totalWatchTime: 0,
              users: new Set()
            });
          }

          const content = contentMap.get(contentKey)!;
          content.playCount++;
          content.totalWatchTime += record.play_time;
          content.users.add(username);
        });
      }

      // 转换为ContentStat数组并排序
      const contentStats: ContentStat[] = Array.from(contentMap.entries())
        .map(([key, data]) => {
          const [source, id] = key.split('+');
          return {
            source,
            id,
            title: data.record.title,
            source_name: data.record.source_name,
            cover: data.record.cover,
            year: data.record.year,
            playCount: data.playCount,
            totalWatchTime: data.totalWatchTime,
            averageWatchTime: data.playCount > 0 ? data.totalWatchTime / data.playCount : 0,
            lastPlayed: data.record.save_time,
            uniqueUsers: data.users.size
          };
        })
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, limit);

      return contentStats;
    } catch (error) {
      console.error('获取内容统计失败:', error);
      return [];
    }
  }

  // 更新播放统计（当用户播放时调用）
  async updatePlayStatistics(
    _userName: string,
    _source: string,
    _id: string,
    _watchTime: number
  ): Promise<void> {
    try {
      // 清除全站统计缓存，下次查询时重新计算
      await this.deleteCache('play_stats_summary');

      // 这里可以添加更多实时统计更新逻辑
      // 比如更新用户统计缓存、内容热度等
      // 暂时只是清除缓存，实际统计在查询时重新计算
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
      const currentStats = await this.client.get(loginStatsKey);
      const loginStats = currentStats ? JSON.parse(currentStats) : {
        loginCount: 0,
        firstLoginTime: null,
        lastLoginTime: null,
        lastLoginDate: null
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
    const val = await this.withRetry(() => this.client.get(this.avatarKey(userName)));
    return val ? ensureString(val) : null;
  }

  async setUserAvatar(userName: string, avatarBase64: string): Promise<void> {
    await this.withRetry(() =>
      this.client.set(this.avatarKey(userName), avatarBase64)
    );
  }

  async deleteUserAvatar(userName: string): Promise<void> {
    await this.withRetry(() =>
      this.client.del(this.avatarKey(userName))
    );
  }

  // ---------- 弹幕管理 ----------
  private danmuKey(videoId: string) {
    return `video:${videoId}:danmu`;
  }

  async getDanmu(videoId: string): Promise<any[]> {
    const val = await this.withRetry(() => this.client.lRange(this.danmuKey(videoId), 0, -1));
    return val ? val.map(item => JSON.parse(ensureString(item))) : [];
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
    await this.withRetry(() =>
      this.client.rPush(this.danmuKey(videoId), JSON.stringify(danmuData))
    );
  }

  async deleteDanmu(videoId: string, danmuId: string): Promise<void> {
    const danmuList = await this.getDanmu(videoId);
    const filteredList = danmuList.filter(item => item.id !== danmuId);
    await this.withRetry(() => this.client.del(this.danmuKey(videoId)));
    if (filteredList.length > 0) {
      const danmuStrings = filteredList.map(item => JSON.stringify(item));
      await this.withRetry(() =>
        this.client.rPush(this.danmuKey(videoId), danmuStrings)
      );
    }
  }

  // ---------- 机器码管理 ----------
  private machineCodesKey(userName: string) {
    // 键名从 machine_code 改为 machine_codes (复数)
    return `u:${userName}:machine_codes`;
  }

  private machineCodeToUserKey() {
    // 用于反向查找 machineCode -> user
    return 'system:machine_code_owner';
  }

  async getUserMachineCodes(userName: string): Promise<any[]> {
    const val = await this.withRetry(() =>
      // 使用 SMEMBERS 获取一个 Set 中的所有设备信息
      this.client.sMembers(this.machineCodesKey(userName))
    );
    if (!val || val.length === 0) return [];
    try {
      // 每个成员都是一个JSON字符串，需要解析
      return val.map(item => JSON.parse(item));
    } catch (e) {
      console.error('解析用户设备列表失败:', e);
      return [];
    }
  }

  async setUserMachineCode(userName: string, machineCode: string, deviceInfo?: string): Promise<void> {
    const data = {
      machineCode,
      deviceInfo: deviceInfo || '',
      bindTime: Date.now()
    };
    // 使用 SADD 将设备信息（JSON字符串）添加到 Set 中
    await this.withRetry(() =>
      this.client.sAdd(this.machineCodesKey(userName), JSON.stringify(data))
    );
    // 使用 HSET 记录 machineCode -> userName 的映射关系
    await this.withRetry(() =>
      this.client.hSet(this.machineCodeToUserKey(), machineCode, userName)
    );
  }

  async deleteUserMachineCode(userName: string, machineCode?: string): Promise<void> {
    const userDevicesKey = this.machineCodesKey(userName);
    if (machineCode) {
      // 如果提供了 machineCode，则只删除指定的设备
      const devices = await this.getUserMachineCodes(userName);
      const deviceToRemove = devices.find(d => d.machineCode === machineCode);
      if (deviceToRemove) {
        // 从 Set 中移除指定的设备信息
        await this.withRetry(() =>
          this.client.sRem(userDevicesKey, JSON.stringify(deviceToRemove))
        );
        // 从反向映射中移除
        await this.withRetry(() =>
          this.client.hDel(this.machineCodeToUserKey(), machineCode)
        );
      }
    } else {
      // 如果没有提供 machineCode，则解绑该用户的所有设备
      const devices = await this.getUserMachineCodes(userName);
      if (devices.length > 0) {
        const codesToRemove = devices.map(d => d.machineCode);
        // 从反向映射中批量移除
        await this.withRetry(() =>
          this.client.hDel(this.machineCodeToUserKey(), codesToRemove)
        );
      }
      // 删除整个 Set
      await this.withRetry(() =>
        this.client.del(userDevicesKey)
      );
    }
  }

  async getMachineCodeUsers(): Promise<Record<string, { devices: any[] }>> {
    const result: Record<string, { devices: any[] }> = {};
    const pattern = 'u:*:machine_codes'; // 匹配新的键名
    let cursor = '0';
    do {
      const reply = await this.client.scan(cursor as any, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor as any;
      for (const key of reply.keys) {
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
    const val = await this.withRetry(() => this.client.hGet(this.machineCodeToUserKey(), machineCode));
    return val ? ensureString(val) : null;
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
    await this.withRetry(() => this.client.set(this.messageKey(message.id), JSON.stringify(message)));
    await this.withRetry(() => this.client.zAdd(this.conversationMessagesKey(message.conversation_id), { score: message.timestamp, value: message.id }));
  }

  async getMessages(conversationId: string, limit = 50, offset = 0): Promise<ChatMessage[]> {
    const messageIds = await this.withRetry(() => this.client.zRange(this.conversationMessagesKey(conversationId), offset, offset + limit - 1, { REV: true }));
    if (messageIds.length === 0) return [];
    const messagesData = await this.withRetry(() => this.client.mGet(messageIds.map(id => this.messageKey(id))));
    const messages: ChatMessage[] = [];
    messagesData.forEach(data => {
      if(data) {
        try {
          messages.push(JSON.parse(ensureString(data)));
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      }
    });
    return messages.reverse();
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    const messageData = await this.withRetry(() => this.client.get(this.messageKey(messageId)));
    if (messageData) {
      const message = JSON.parse(ensureString(messageData));
      message.is_read = true;
      await this.withRetry(() => this.client.set(this.messageKey(messageId), JSON.stringify(message)));
    }
  }

  async getConversations(userName: string): Promise<Conversation[]> {
    const conversationIds = await this.withRetry(() => this.client.sMembers(this.userConversationsKey(userName)));
    if (conversationIds.length === 0) return [];
    const conversationsData = await this.withRetry(() => this.client.mGet(conversationIds.map(id => this.conversationKey(id))));
    const conversations = conversationsData.filter(Boolean).map(d => JSON.parse(ensureString(d)) as Conversation);
    return conversations.sort((a, b) => b.updated_at - a.updated_at);
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const data = await this.withRetry(() => this.client.get(this.conversationKey(conversationId)));
    return data ? JSON.parse(ensureString(data)) as Conversation : null;
  }

  async createConversation(conversation: Conversation): Promise<void> {
    await this.withRetry(() => this.client.set(this.conversationKey(conversation.id), JSON.stringify(conversation)));
    for (const participant of conversation.participants) {
      await this.withRetry(() => this.client.sAdd(this.userConversationsKey(participant), conversation.id));
    }
  }

  async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (conversation) {
      Object.assign(conversation, updates);
      await this.withRetry(() => this.client.set(this.conversationKey(conversationId), JSON.stringify(conversation)));
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (conversation) {
      for (const participant of conversation.participants) {
        await this.withRetry(() => this.client.sRem(this.userConversationsKey(participant), conversationId));
      }
      await this.withRetry(() => this.client.del(this.conversationKey(conversationId)));
      await this.withRetry(() => this.client.del(this.conversationMessagesKey(conversationId)));
    }
  }

  async getFriends(userName: string): Promise<Friend[]> {
    const friendIds = await this.withRetry(() => this.client.sMembers(this.userFriendsKey(userName)));
    if (friendIds.length === 0) return [];
    const friendsData = await this.withRetry(() => this.client.mGet(friendIds.map(id => this.friendKey(id))));
    const friends = friendsData.filter(Boolean).map(d => JSON.parse(ensureString(d)) as Friend);
    return friends.sort((a, b) => b.added_at - a.added_at);
  }

  async addFriend(userName: string, friend: Friend): Promise<void> {
    await this.withRetry(() => this.client.set(this.friendKey(friend.id), JSON.stringify(friend)));
    await this.withRetry(() => this.client.sAdd(this.userFriendsKey(userName), friend.id));
  }

  async removeFriend(userName: string, friendId: string): Promise<void> {
    await this.withRetry(() => this.client.sRem(this.userFriendsKey(userName), friendId));
    await this.withRetry(() => this.client.del(this.friendKey(friendId)));
  }

  async updateFriendStatus(friendId: string, status: Friend['status']): Promise<void> {
    const friendData = await this.withRetry(() => this.client.get(this.friendKey(friendId)));
    if (friendData) {
      const friend = JSON.parse(ensureString(friendData));
      friend.status = status;
      await this.withRetry(() => this.client.set(this.friendKey(friendId), JSON.stringify(friend)));
    }
  }

  async getFriendRequests(userName: string): Promise<FriendRequest[]> {
    const requestIds = await this.withRetry(() => this.client.sMembers(this.userFriendRequestsKey(userName)));
    if (requestIds.length === 0) return [];
    const requestsData = await this.withRetry(() => this.client.mGet(requestIds.map(id => this.friendRequestKey(id))));
    const requests = requestsData.filter(Boolean).map(d => JSON.parse(ensureString(d)) as FriendRequest);
    return requests.filter(req => req.to_user === userName || req.from_user === userName).sort((a, b) => b.created_at - a.created_at);
  }

  async createFriendRequest(request: FriendRequest): Promise<void> {
    await this.withRetry(() => this.client.set(this.friendRequestKey(request.id), JSON.stringify(request)));
    await this.withRetry(() => this.client.sAdd(this.userFriendRequestsKey(request.from_user), request.id));
    await this.withRetry(() => this.client.sAdd(this.userFriendRequestsKey(request.to_user), request.id));
  }

  async updateFriendRequest(requestId: string, status: FriendRequest['status']): Promise<void> {
    const requestData = await this.withRetry(() => this.client.get(this.friendRequestKey(requestId)));
    if (requestData) {
      const request = JSON.parse(ensureString(requestData));
      request.status = status;
      request.updated_at = Date.now();
      await this.withRetry(() => this.client.set(this.friendRequestKey(requestId), JSON.stringify(request)));
    }
  }

  async deleteFriendRequest(requestId: string): Promise<void> {
    const requestData = await this.withRetry(() => this.client.get(this.friendRequestKey(requestId)));
    if (requestData) {
      const request = JSON.parse(ensureString(requestData));
      await this.withRetry(() => this.client.sRem(this.userFriendRequestsKey(request.from_user), requestId));
      await this.withRetry(() => this.client.sRem(this.userFriendRequestsKey(request.to_user), requestId));
    }
    await this.withRetry(() => this.client.del(this.friendRequestKey(requestId)));
  }

  async searchUsers(query: string): Promise<Friend[]> {
    const allUsers = await this.getAllUsers();
    const matchedUsers = allUsers.filter(username => username.toLowerCase().includes(query.toLowerCase()));
    return matchedUsers.map(username => ({ id: username, username, status: 'offline' as const, added_at: 0, }));
  }
}
