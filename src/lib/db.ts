/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { AdminConfig, PendingUser, RegistrationStats } from './admin.types';
import { KvrocksStorage } from './kvrocks.db';
import { RedisStorage } from './redis.db';
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
  FriendRequest
} from './types';
import { UpstashRedisStorage } from './upstash.db';

// storage type 常量: 'localstorage' | 'redis' | 'upstash'，默认 'localstorage'
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'upstash'
    | 'kvrocks'
    | undefined) || 'localstorage';

// 简化的内存存储实现（用于localstorage模式）
class MemoryStorage implements IStorage {
  private data: { [key: string]: any } = {};

  // 聊天相关方法的基本实现
  async saveMessage(message: ChatMessage): Promise<void> {
    const key = `message:${message.id}`;
    this.data[key] = message;

    // 更新对话的消息列表
    const messagesKey = `conversation_messages:${message.conversation_id}`;
    if (!this.data[messagesKey]) {
      this.data[messagesKey] = [];
    }
    this.data[messagesKey].push(message.id);
  }

  async getMessages(conversationId: string, limit = 50, offset = 0): Promise<ChatMessage[]> {
    const messagesKey = `conversation_messages:${conversationId}`;
    const messageIds = this.data[messagesKey] || [];

    // 获取消息并按时间排序
    const messages: ChatMessage[] = [];
    for (const messageId of messageIds) {
      const message = this.data[`message:${messageId}`];
      if (message) {
        messages.push(message);
      }
    }

    messages.sort((a, b) => a.timestamp - b.timestamp);
    return messages.slice(offset, offset + limit);
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    const key = `message:${messageId}`;
    if (this.data[key]) {
      this.data[key].is_read = true;
    }
  }

  async getConversations(userName: string): Promise<Conversation[]> {
    const userConversationsKey = `user_conversations:${userName}`;
    const conversationIds = this.data[userConversationsKey] || [];

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
    const key = `conversation:${conversationId}`;
    return this.data[key] || null;
  }

  async createConversation(conversation: Conversation): Promise<void> {
    const key = `conversation:${conversation.id}`;
    this.data[key] = conversation;

    // 添加到每个参与者的对话列表
    for (const participant of conversation.participants) {
      const userConversationsKey = `user_conversations:${participant}`;
      if (!this.data[userConversationsKey]) {
        this.data[userConversationsKey] = [];
      }
      if (!this.data[userConversationsKey].includes(conversation.id)) {
        this.data[userConversationsKey].push(conversation.id);
      }
    }
  }

  async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<void> {
    const key = `conversation:${conversationId}`;
    if (this.data[key]) {
      Object.assign(this.data[key], updates);
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (conversation) {
      // 从每个参与者的对话列表中移除
      for (const participant of conversation.participants) {
        const userConversationsKey = `user_conversations:${participant}`;
        if (this.data[userConversationsKey]) {
          this.data[userConversationsKey] = this.data[userConversationsKey].filter(
            (id: string) => id !== conversationId
          );
        }
      }

      // 删除对话本身
      delete this.data[`conversation:${conversationId}`];

      // 删除相关消息
      const messagesKey = `conversation_messages:${conversationId}`;
      const messageIds = this.data[messagesKey] || [];
      for (const messageId of messageIds) {
        delete this.data[`message:${messageId}`];
      }
      delete this.data[messagesKey];
    }
  }

  // 好友相关方法的基本实现
  async getFriends(userName: string): Promise<Friend[]> {
    const key = `user_friends:${userName}`;
    return this.data[key] || [];
  }

  async createFriend(friendship: { user1: string; user2: string; created_at: number }): Promise<void> {
    // 双向添加好友关系
    const user1FriendsKey = `user_friends:${friendship.user1}`;
    const user2FriendsKey = `user_friends:${friendship.user2}`;

    if (!this.data[user1FriendsKey]) this.data[user1FriendsKey] = [];
    if (!this.data[user2FriendsKey]) this.data[user2FriendsKey] = [];

    // 为user1添加user2作为好友
    if (!this.data[user1FriendsKey].some((f: Friend) => f.username === friendship.user2)) {
      this.data[user1FriendsKey].push({
        id: `friend_${Date.now()}_1`,
        username: friendship.user2,
        nickname: friendship.user2,
        status: 'offline' as const,
        added_at: friendship.created_at
      });
    }

    // 为user2添加user1作为好友
    if (!this.data[user2FriendsKey].some((f: Friend) => f.username === friendship.user1)) {
      this.data[user2FriendsKey].push({
        id: `friend_${Date.now()}_2`,
        username: friendship.user1,
        nickname: friendship.user1,
        status: 'offline' as const,
        added_at: friendship.created_at
      });
    }
  }

  async deleteFriend(friendId: string): Promise<void> {
    // 简化实现
  }

  async getFriendRequests(userName: string): Promise<FriendRequest[]> {
    const key = `user_friend_requests:${userName}`;
    return this.data[key] || [];
  }

  async createFriendRequest(request: FriendRequest): Promise<void> {
    const key = `user_friend_requests:${request.to_user}`;
    if (!this.data[key]) {
      this.data[key] = [];
    }
    this.data[key].push(request);
  }

  async updateFriendRequest(requestId: string, status: 'pending' | 'accepted' | 'rejected'): Promise<void> {
    // 查找并更新好友请求
    for (const key in this.data) {
      if (key.startsWith('user_friend_requests:')) {
        const requests = this.data[key];
        const requestIndex = requests.findIndex((r: FriendRequest) => r.id === requestId);
        if (requestIndex !== -1) {
          requests[requestIndex].status = status;
          requests[requestIndex].updated_at = Date.now();
          break;
        }
      }
    }
  }

  async deleteFriendRequest(requestId: string): Promise<void> {
    // 查找并删除好友请求
    for (const key in this.data) {
      if (key.startsWith('user_friend_requests:')) {
        const requests = this.data[key];
        const requestIndex = requests.findIndex((r: FriendRequest) => r.id === requestId);
        if (requestIndex !== -1) {
          requests.splice(requestIndex, 1);
          break;
        }
      }
    }
  }

  // 搜索用户（基本实现）
  async searchUsers(query: string): Promise<Friend[]> {
    const mockUsers: Friend[] = [
      { id: 'user1', username: 'test1', nickname: 'Test User 1', status: 'offline' as const, added_at: Date.now() },
      { id: 'user2', username: 'test2', nickname: 'Test User 2', status: 'offline' as const, added_at: Date.now() },
      { id: 'user3', username: 'admin', nickname: 'Admin User', status: 'offline' as const, added_at: Date.now() },
    ];
    return mockUsers.filter(user => user.username.toLowerCase().includes(query.toLowerCase()) || user.nickname?.toLowerCase().includes(query.toLowerCase()));
  }

  // 其他必需的方法存根
  async getPlayRecord(): Promise<PlayRecord | null> { return null; }
  async setPlayRecord(): Promise<void> { }
  async getAllPlayRecords(): Promise<{ [key: string]: PlayRecord }> { return {}; }
  async deletePlayRecord(): Promise<void> { }
  async getFavorite(): Promise<Favorite | null> { return null; }
  async setFavorite(): Promise<void> { }
  async getAllFavorites(): Promise<{ [key: string]: Favorite }> { return {}; }
  async deleteFavorite(): Promise<void> { }
  async registerUser(): Promise<void> { }
  async verifyUser(): Promise<boolean> { return true; }
  async checkUser(): Promise<boolean> { return true; }
  async checkUserExist(): Promise<boolean> { return true; }
  async changePassword(): Promise<void> { }
  async deleteUser(): Promise<void> { }
  async getSearchHistory(): Promise<string[]> { return []; }
  async addSearchHistory(): Promise<void> { }
  async deleteSearchHistory(): Promise<void> { }
  async clearSearchHistory(): Promise<void> { }
  async getSearchHistoryCount(): Promise<number> { return 0; }
  async getSkipConfigs(): Promise<EpisodeSkipConfig[]> { return []; }
  async getSkipConfig(): Promise<EpisodeSkipConfig | null> { return null; }
  async setSkipConfig(): Promise<void> { }
  async deleteSkipConfig(): Promise<void> { }
  async getAdminConfig(): Promise<AdminConfig> { return this.data['admin_config'] || null; }
  async setAdminConfig(config: AdminConfig): Promise<void> { this.data['admin_config'] = config; }
  async getAllUsers(): Promise<string[]> {
    // 为本地存储模式提供一个基本实现
    const users: string[] = [];
    for (const key in this.data) {
      if (key.startsWith('u:') && key.endsWith(':pwd')) {
        users.push(key.split(':')[1]);
      }
    }
    return users;
  }
  async getAllSkipConfigs(): Promise<{ [key: string]: EpisodeSkipConfig }> { return {}; }
  async clearAllData(): Promise<void> { this.data = {}; }
  async addFriend(): Promise<void> { }
  async removeFriend(): Promise<void> { }
  async updateFriend(): Promise<void> { }
  async updateFriendStatus(): Promise<void> { }
  // --- 缓存方法存根 ---
  async getCache(key: string): Promise<any | null> {
    return this.data[key] || null;
  }
  async setCache(key: string, value: any, _expireSeconds?: number): Promise<void> {
    this.data[key] = value;
  }
  async deleteCache(key: string): Promise<void> {
    delete this.data[key];
  }
  async clearExpiredCache(_prefix?: string): Promise<void> {
    // MemoryStorage 不支持过期，所以此方法为空
  }

  // --- 注册管理存根 ---
  async createPendingUser(username: string, passwordHash: string): Promise<void> {
    if (!this.data['pending_users']) this.data['pending_users'] = [];
    this.data['pending_users'].push({ username, passwordHash, registeredAt: Date.now() });
  }
  async getPendingUsers(): Promise<PendingUser[]> {
    return this.data['pending_users'] || [];
  }
  async approvePendingUser(_username: string): Promise<void> {
    // 简化实现：直接移除
    if (this.data['pending_users']) {
      this.data['pending_users'] = this.data['pending_users'].filter((u: PendingUser) => u.username !== _username);
    }
  }
  async rejectPendingUser(_username: string): Promise<void> {
    // 简化实现：直接移除
    if (this.data['pending_users']) {
      this.data['pending_users'] = this.data['pending_users'].filter((u: PendingUser) => u.username !== _username);
    }
  }
  async getRegistrationStats(): Promise<RegistrationStats> {
    return { totalUsers: 0, pendingUsers: (this.data['pending_users'] || []).length, todayRegistrations: 0 };
  }

  // --- 统计功能存根 ---
  async getPlayStats(): Promise<PlayStatsResult> {
    return {
      totalUsers: 0, totalWatchTime: 0, totalPlays: 0, avgWatchTimePerUser: 0, avgPlaysPerUser: 0,
      userStats: [], topSources: [], dailyStats: [],
      registrationStats: { todayNewUsers: 0, totalRegisteredUsers: 0, registrationTrend: [] },
      activeUsers: { daily: 0, weekly: 0, monthly: 0 },
    };
  }
  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    return { username: userName, totalWatchTime: 0, totalPlays: 0, lastPlayTime: 0, recentRecords: [], avgWatchTime: 0, mostWatchedSource: '' };
  }
  async getContentStats(_limit?: number): Promise<ContentStat[]> { return []; }
  async updatePlayStatistics(_userName: string, _source: string, _id: string, _watchTime: number): Promise<void> { }
  async updateUserLoginStats(_userName: string, _loginTime: number, _isFirstLogin?: boolean): Promise<void> { }

  // --- 用户头像存根 ---
  async getUserAvatar(userName: string): Promise<string | null> { return this.data[`avatar:${userName}`] || null; }
  async setUserAvatar(userName: string, avatarBase64: string): Promise<void> { this.data[`avatar:${userName}`] = avatarBase64; }
  async deleteUserAvatar(userName: string): Promise<void> { delete this.data[`avatar:${userName}`]; }

  // --- 弹幕管理存根 ---
  async getDanmu(_videoId: string): Promise<any[]> { return []; }
  async saveDanmu(_videoId: string, _userName: string, _danmu: any): Promise<void> { }
  async deleteDanmu(_videoId: string, _danmuId: string): Promise<void> { }

  // --- 机器码管理存根 ---
  async getUserMachineCode(userName: string): Promise<string | null> { return this.data[`machine_code:${userName}`] || null; }
  async setUserMachineCode(userName: string, machineCode: string, _deviceInfo?: string): Promise<void> { this.data[`machine_code:${userName}`] = machineCode; }
  async deleteUserMachineCode(userName: string): Promise<void> { delete this.data[`machine_code:${userName}`]; }
  async getMachineCodeUsers(): Promise<Record<string, any>> { return {}; }
  async isMachineCodeBound(_machineCode: string): Promise<string | null> { return null; }

  // --- 新版剧集跳过配置存根 ---
  async getEpisodeSkipConfig(_userName: string, _source: string, _id: string): Promise<EpisodeSkipConfig | null> { return null; }
  async saveEpisodeSkipConfig(_userName: string, _source: string, _id: string, _config: EpisodeSkipConfig): Promise<void> { }
  async deleteEpisodeSkipConfig(_userName: string, _source: string, _id: string): Promise<void> { }
  async getAllEpisodeSkipConfigs(_userName: string): Promise<{ [key: string]: EpisodeSkipConfig }> { return {}; }
}

// 创建存储实例
function createStorage(): IStorage {
  switch (STORAGE_TYPE) {
    case 'redis':
      return new RedisStorage();
    case 'upstash':
      return new UpstashRedisStorage();
    case 'kvrocks':
      return new KvrocksStorage();
    case 'localstorage':
    default:
      console.log('使用内存存储模式（用于开发和测试）');
      return new MemoryStorage();
  }
}

// 单例存储实例
let storageInstance: IStorage | null = null;

function getStorage(): IStorage {
  if (!storageInstance) {
    storageInstance = createStorage();
  }
  return storageInstance;
}

// 工具函数：生成存储key
export function generateStorageKey(source: string, id: string): string {
  return `${source}+${id}`;
}

// 导出便捷方法
export class DbManager {
  private storage: IStorage;

  constructor() {
    this.storage = getStorage();
  }

  // 播放记录相关方法
  async getPlayRecord(
    userName: string,
    source: string,
    id: string
  ): Promise<PlayRecord | null> {
    const key = generateStorageKey(source, id);
    return this.storage.getPlayRecord(userName, key);
  }

  async savePlayRecord(
    userName: string,
    source: string,
    id: string,
    record: PlayRecord
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.setPlayRecord(userName, key, record);
  }

  async getAllPlayRecords(userName: string): Promise<{
    [key: string]: PlayRecord;
  }> {
    return this.storage.getAllPlayRecords(userName);
  }

  async deletePlayRecord(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.deletePlayRecord(userName, key);
  }

  // 收藏相关方法
  async getFavorite(
    userName: string,
    source: string,
    id: string
  ): Promise<Favorite | null> {
    const key = generateStorageKey(source, id);
    return this.storage.getFavorite(userName, key);
  }

  async saveFavorite(
    userName: string,
    source: string,
    id: string,
    favorite: Favorite
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.setFavorite(userName, key, favorite);
  }

  async getAllFavorites(
    userName: string
  ): Promise<{ [key: string]: Favorite }> {
    return this.storage.getAllFavorites(userName);
  }

  async deleteFavorite(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.deleteFavorite(userName, key);
  }

  async isFavorited(
    userName: string,
    source: string,
    id: string
  ): Promise<boolean> {
    const favorite = await this.getFavorite(userName, source, id);
    return favorite !== null;
  }

  // ---------- 用户相关 ----------
  async registerUser(userName: string, password: string): Promise<void> {
    await this.storage.registerUser(userName, password);
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    return this.storage.verifyUser(userName, password);
  }

  // 检查用户是否已存在
  async checkUserExist(userName: string): Promise<boolean> {
    return this.storage.checkUserExist(userName);
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    await this.storage.changePassword(userName, newPassword);
  }

  async deleteUser(userName: string): Promise<void> {
    await this.storage.deleteUser(userName);
  }

  // ---------- 搜索历史 ----------
  async getSearchHistory(userName: string): Promise<string[]> {
    return this.storage.getSearchHistory(userName);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    await this.storage.addSearchHistory(userName, keyword);
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    await this.storage.deleteSearchHistory(userName, keyword);
  }

  // 获取全部用户名
  async getAllUsers(): Promise<string[]> {
    if (typeof (this.storage as any).getAllUsers === 'function') {
      return (this.storage as any).getAllUsers();
    }
    return [];
  }

  // ---------- 管理员配置 ----------
  async getAdminConfig(): Promise<AdminConfig | null> {
    if (typeof (this.storage as any).getAdminConfig === 'function') {
      return (this.storage as any).getAdminConfig();
    }
    return null;
  }

  async saveAdminConfig(config: AdminConfig): Promise<void> {
    if (typeof (this.storage as any).setAdminConfig === 'function') {
      await (this.storage as any).setAdminConfig(config);
    }
  }

  // ---------- 跳过片头片尾配置 ----------
  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<EpisodeSkipConfig | null> {
    if (typeof (this.storage as any).getSkipConfig === 'function') {
      return (this.storage as any).getSkipConfig(userName, source, id);
    }
    return null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig
  ): Promise<void> {
    if (typeof (this.storage as any).setSkipConfig === 'function') {
      await (this.storage as any).setSkipConfig(userName, source, id, config);
    }
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    if (typeof (this.storage as any).deleteSkipConfig === 'function') {
      await (this.storage as any).deleteSkipConfig(userName, source, id);
    }
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    if (typeof (this.storage as any).getAllSkipConfigs === 'function') {
      return (this.storage as any).getAllSkipConfigs(userName);
    }
    return {};
  }

  // ---------- 剧集跳过配置（新版，多片段支持）----------
  async getEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<EpisodeSkipConfig | null> {
    if (typeof (this.storage as any).getEpisodeSkipConfig === 'function') {
      return (this.storage as any).getEpisodeSkipConfig(userName, source, id);
    }
    return null;
  }

  async saveEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig
  ): Promise<void> {
    if (typeof (this.storage as any).saveEpisodeSkipConfig === 'function') {
      await (this.storage as any).saveEpisodeSkipConfig(userName, source, id, config);
    }
  }

  async deleteEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    if (typeof (this.storage as any).deleteEpisodeSkipConfig === 'function') {
      await (this.storage as any).deleteEpisodeSkipConfig(userName, source, id);
    }
  }

  async getAllEpisodeSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    if (typeof (this.storage as any).getAllEpisodeSkipConfigs === 'function') {
      return (this.storage as any).getAllEpisodeSkipConfigs(userName);
    }
    return {};
  }

  // ---------- 数据清理 ----------
  async clearAllData(): Promise<void> {
    if (typeof (this.storage as any).clearAllData === 'function') {
      await (this.storage as any).clearAllData();
    } else {
      throw new Error('存储类型不支持清空数据操作');
    }
  }

  // ---------- 通用缓存方法 ----------
  async getCache(key: string): Promise<any | null> {
    if (typeof this.storage.getCache === 'function') {
      return await this.storage.getCache(key);
    }
    return null;
  }

  async setCache(key: string, data: any, expireSeconds?: number): Promise<void> {
    if (typeof this.storage.setCache === 'function') {
      await this.storage.setCache(key, data, expireSeconds);
    }
  }

  async deleteCache(key: string): Promise<void> {
    if (typeof this.storage.deleteCache === 'function') {
      await this.storage.deleteCache(key);
    }
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    if (typeof this.storage.clearExpiredCache === 'function') {
      await this.storage.clearExpiredCache(prefix);
    }
  }
  
  // ---------- 注册相关方法 ----------
  async createPendingUser(username: string, password: string): Promise<void> {
    if (typeof (this.storage as any).createPendingUser === 'function') {
      await (this.storage as any).createPendingUser(username, password);
    } else {
      throw new Error('存储类型不支持注册功能');
    }
  }

  async getPendingUsers(): Promise<PendingUser[]> {
    if (typeof (this.storage as any).getPendingUsers === 'function') {
      return (this.storage as any).getPendingUsers();
    }
    return [];
  }

  async approvePendingUser(username: string): Promise<void> {
    if (typeof (this.storage as any).approvePendingUser === 'function') {
      await (this.storage as any).approvePendingUser(username);
    } else {
      throw new Error('存储类型不支持注册功能');
    }
  }

  async rejectPendingUser(username: string): Promise<void> {
    if (typeof (this.storage as any).rejectPendingUser === 'function') {
      await (this.storage as any).rejectPendingUser(username);
    } else {
      throw new Error('存储类型不支持注册功能');
    }
  }

  async getRegistrationStats(): Promise<RegistrationStats> {
    if (typeof (this.storage as any).getRegistrationStats === 'function') {
      return (this.storage as any).getRegistrationStats();
    }
    return {
      totalUsers: 0,
      pendingUsers: 0,
      todayRegistrations: 0,
    };
  }
  
  // ---------- 播放统计相关 ----------
  async getPlayStats(): Promise<PlayStatsResult> {
    if (typeof (this.storage as any).getPlayStats === 'function') {
      return (this.storage as any).getPlayStats();
    }

    // 如果存储不支持统计功能，返回默认值
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

  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    if (typeof (this.storage as any).getUserPlayStat === 'function') {
      return (this.storage as any).getUserPlayStat(userName);
    }

    // 如果存储不支持统计功能，返回默认值
    return {
      username: userName,
      totalWatchTime: 0,
      totalPlays: 0,
      lastPlayTime: 0,
      recentRecords: [],
      avgWatchTime: 0,
      mostWatchedSource: ''
    };
  }

  async getContentStats(limit = 10): Promise<ContentStat[]> {
    if (typeof (this.storage as any).getContentStats === 'function') {
      return (this.storage as any).getContentStats(limit);
    }

    // 如果存储不支持统计功能，返回空数组
    return [];
  }

  async updatePlayStatistics(
    _userName: string,
    _source: string,
    _id: string,
    _watchTime: number
  ): Promise<void> {
    if (typeof (this.storage as any).updatePlayStatistics === 'function') {
      await (this.storage as any).updatePlayStatistics(_userName, _source, _id, _watchTime);
    }
  }

  async updateUserLoginStats(
    userName: string,
    loginTime: number,
    isFirstLogin?: boolean
  ): Promise<void> {
    if (typeof (this.storage as any).updateUserLoginStats === 'function') {
      await (this.storage as any).updateUserLoginStats(userName, loginTime, isFirstLogin);
    }
  }

  // 检查存储类型是否支持统计功能
  isStatsSupported(): boolean {
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    return storageType !== 'localstorage';
  }

  // ---------- 用户头像 ----------
  async getUserAvatar(userName: string): Promise<string | null> {
    if (typeof (this.storage as any).getUserAvatar === 'function') {
      return (this.storage as any).getUserAvatar(userName);
    }
    return null;
  }

  async setUserAvatar(userName: string, avatarBase64: string): Promise<void> {
    if (typeof (this.storage as any).setUserAvatar === 'function') {
      await (this.storage as any).setUserAvatar(userName, avatarBase64);
    }
  }

  async deleteUserAvatar(userName: string): Promise<void> {
    if (typeof (this.storage as any).deleteUserAvatar === 'function') {
      await (this.storage as any).deleteUserAvatar(userName);
    }
  }

  // ---------- 弹幕管理 ----------
  async getDanmu(videoId: string): Promise<any[]> {
    if (typeof (this.storage as any).getDanmu === 'function') {
      return (this.storage as any).getDanmu(videoId);
    }
    return [];
  }

  async saveDanmu(videoId: string, userName: string, danmu: {
    text: string;
    color: string;
    mode: number;
    time: number;
    timestamp: number;
  }): Promise<void> {
    if (typeof (this.storage as any).saveDanmu === 'function') {
      await (this.storage as any).saveDanmu(videoId, userName, danmu);
    }
  }

  async deleteDanmu(videoId: string, danmuId: string): Promise<void> {
    if (typeof (this.storage as any).deleteDanmu === 'function') {
      await (this.storage as any).deleteDanmu(videoId, danmuId);
    }
  }

  // ---------- 机器码管理 ----------
  async getUserMachineCodes(userName: string): Promise<any[]> {
    if (typeof (this.storage as any).getUserMachineCodes === 'function') {
      return (this.storage as any).getUserMachineCodes(userName);
    }
    return [];
  }

  async setUserMachineCode(userName: string, machineCode: string, deviceInfo?: string): Promise<void> {
    if (typeof (this.storage as any).setUserMachineCode === 'function') {
      await (this.storage as any).setUserMachineCode(userName, machineCode, deviceInfo);
    }
  }

  async deleteUserMachineCode(userName: string, machineCode?: string): Promise<void> {
    if (typeof (this.storage as any).deleteUserMachineCode === 'function') {
      await (this.storage as any).deleteUserMachineCode(userName, machineCode);
    }
  }

  async getMachineCodeUsers(): Promise<Record<string, { devices: any[] }>> {
    if (typeof (this.storage as any).getMachineCodeUsers === 'function') {
      return (this.storage as any).getMachineCodeUsers();
    }
    return {};
  }

  async isMachineCodeBound(machineCode: string): Promise<string | null> {
    if (typeof (this.storage as any).isMachineCodeBound === 'function') {
      return (this.storage as any).isMachineCodeBound(machineCode);
    }
    return null;
  }

  // ---------- 聊天功能 ----------
  // 消息管理
  async saveMessage(message: ChatMessage): Promise<void> {
    if (typeof (this.storage as any).saveMessage === 'function') {
      await (this.storage as any).saveMessage(message);
    }
  }

  async getMessages(conversationId: string, limit?: number, offset?: number): Promise<ChatMessage[]> {
    if (typeof (this.storage as any).getMessages === 'function') {
      return (this.storage as any).getMessages(conversationId, limit, offset);
    }
    return [];
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    if (typeof (this.storage as any).markMessageAsRead === 'function') {
      await (this.storage as any).markMessageAsRead(messageId);
    }
  }

  // 对话管理
  async getConversations(userName: string): Promise<Conversation[]> {
    if (typeof (this.storage as any).getConversations === 'function') {
      return (this.storage as any).getConversations(userName);
    }
    return [];
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    if (typeof (this.storage as any).getConversation === 'function') {
      return (this.storage as any).getConversation(conversationId);
    }
    return null;
  }

  async createConversation(conversation: Conversation): Promise<void> {
    if (typeof (this.storage as any).createConversation === 'function') {
      await (this.storage as any).createConversation(conversation);
    }
  }

  async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<void> {
    if (typeof (this.storage as any).updateConversation === 'function') {
      await (this.storage as any).updateConversation(conversationId, updates);
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    if (typeof (this.storage as any).deleteConversation === 'function') {
      await (this.storage as any).deleteConversation(conversationId);
    }
  }

  // 好友管理
  async getFriends(userName: string): Promise<Friend[]> {
    if (typeof (this.storage as any).getFriends === 'function') {
      return (this.storage as any).getFriends(userName);
    }
    return [];
  }

  async addFriend(userName: string, friend: Friend): Promise<void> {
    if (typeof (this.storage as any).addFriend === 'function') {
      await (this.storage as any).addFriend(userName, friend);
    }
  }

  async removeFriend(userName: string, friendId: string): Promise<void> {
    if (typeof (this.storage as any).removeFriend === 'function') {
      await (this.storage as any).removeFriend(userName, friendId);
    }
  }

  async updateFriendStatus(friendId: string, status: Friend['status']): Promise<void> {
    if (typeof (this.storage as any).updateFriendStatus === 'function') {
      await (this.storage as any).updateFriendStatus(friendId, status);
    }
  }

  // 好友申请管理
  async getFriendRequests(userName: string): Promise<FriendRequest[]> {
    if (typeof (this.storage as any).getFriendRequests === 'function') {
      return (this.storage as any).getFriendRequests(userName);
    }
    return [];
  }

  async createFriendRequest(request: FriendRequest): Promise<void> {
    if (typeof (this.storage as any).createFriendRequest === 'function') {
      await (this.storage as any).createFriendRequest(request);
    }
  }

  async updateFriendRequest(requestId: string, status: FriendRequest['status']): Promise<void> {
    if (typeof (this.storage as any).updateFriendRequest === 'function') {
      await (this.storage as any).updateFriendRequest(requestId, status);
    }
  }

  async deleteFriendRequest(requestId: string): Promise<void> {
    if (typeof (this.storage as any).deleteFriendRequest === 'function') {
      await (this.storage as any).deleteFriendRequest(requestId);
    }
  }

  // 用户搜索
  async searchUsers(query: string): Promise<Friend[]> {
    if (typeof (this.storage as any).searchUsers === 'function') {
      return (this.storage as any).searchUsers(query);
    }
    return [];
  }
}

// 导出默认实例
export const db = new DbManager();

