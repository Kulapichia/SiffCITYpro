interface TokenData {
  cookie: string;
  expires: number;
}

class TokenStore {
  private store: Map<string, TokenData>;

  constructor() {
    // 使用globalThis确保在serverless环境中的一致性
    if (!globalThis.tempTokenStore) {
      globalThis.tempTokenStore = new Map<string, TokenData>();
    }
    this.store = globalThis.tempTokenStore;
  }

  set(token: string, cookie: string, ttlMs: number = 5 * 60 * 1000): void {
    this.store.set(token, {
      cookie,
      expires: Date.now() + ttlMs,
    });
    this.cleanup();
  }

  get(token: string): string | null {
    const data = this.store.get(token);
    if (!data) return null;

    if (data.expires < Date.now()) {
      this.store.delete(token);
      return null;
    }

    // 一次性使用
    this.store.delete(token);
    return data.cookie;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (value.expires < now) {
        this.store.delete(key);
      }
    }
  }
}

// 导出单例实例
export const tokenStore = new TokenStore();
