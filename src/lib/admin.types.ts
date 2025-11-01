export type SourceCheckStatus =
  | 'untested'
  | 'valid'
  | 'invalid'
  | 'timeout'
  | 'no_results'
  | 'unreachable';

export interface SourceLastCheck {
  status: SourceCheckStatus;
  latency: number; // in milliseconds, -1 if not applicable
  timestamp: number; // Unix timestamp of the check
}

export interface OAuthConfig {
  enabled: boolean; // OAuth 登录开关
  autoRegister: boolean; // 自动注册开关
  minTrustLevel: number; // 最低信任等级限制
  defaultRole: 'user' | 'admin'; // 自动注册默认角色
  clientId: string; // OAuth 应用 ID
  clientSecret: string; // OAuth 应用密钥
  redirectUri?: string; // 自定义回调地址
  authorizeUrl: string; // 授权端点
  tokenUrl: string; // 令牌端点
  userInfoUrl: string; // 用户信息端点
}

export interface TelegramConfig {
  enabled: boolean; // Telegram 登录开关
  autoRegister: boolean; // 自动注册开关
  botName: string; // Bot 用户名
  botToken: string; // Bot Token
  defaultRole: 'user' | 'admin'; // 自动注册默认角色
}

export interface SiteConfig {
  SiteName: string;
  Announcement: string;
  SearchDownstreamMaxPage: number;
  SiteInterfaceCacheTime: number;
  DoubanProxyType: string;
  DoubanProxy: string;
  DoubanImageProxyType: string;
  DoubanImageProxy: string;
  DisableYellowFilter: boolean;
  ShowAdultContent: boolean; // 是否显示成人内容，默认 false
  FluidSearch: boolean;
  // TMDB配置
  TMDBApiKey?: string;
  TMDBLanguage?: string;
  EnableTMDBActorSearch?: boolean;
  ShowContentFilter?: boolean;
  EnableVirtualScroll?: boolean;
  NetdiskSearch?: boolean;
  // 智能审核字段
  IntelligentFilter: {
    enabled: boolean;
    provider: 'sightengine' | 'custom' | 'baidu' | 'aliyun' | 'tencent'; // 扩展支持的提供商
    confidence: number;
    // 不同提供商的特定配置
    options: {
      // Sightengine 的配置
      sightengine?: {
        apiUrl: string;
        apiUser: string;
        apiSecret: string;
        timeoutMs?: number;
      };
      // 自定义 API 的配置
      custom?: {
        apiUrl: string;
        apiKeyHeader: string;
        apiKeyValue: string;
      // 使用 {{URL}} 作为图片地址占位符
        jsonBodyTemplate: string;
        responseScorePath: string;
      };
      // 百度智能云 的配置
      baidu?: {
        apiKey: string;
        secretKey: string;
        tokenUrl?: string;
        timeoutMs?: number; // 新增：审核请求超时
        tokenTimeoutMs?: number; // 新增：Token请求超时
      };
      // 阿里云 的配置
      aliyun?: {
        accessKeyId: string;
        accessKeySecret: string;
        regionId: string; // 例如: cn-shanghai
      };
      // 腾讯云 的配置
      tencent?: {
        secretId: string;
        secretKey: string;
        region: string; // 例如: ap-shanghai
      };
    };
  };
  EnableRegistration: boolean; // 全局注册开关
  RegistrationApproval: boolean; // 是否需要管理员审批
  MaxUsers?: number; // 最大用户数限制（可选）
  LinuxDoOAuth: OAuthConfig;
  TelegramAuth: TelegramConfig; // 新增 Telegram 配置
  RequireDeviceCode: boolean;
}

export interface AdminConfig {
  ConfigSubscribtion: {
    URL: string;
    AutoUpdate: boolean;
    LastCheck: string;
  };
  ConfigFile: string;
  SiteConfig: SiteConfig;
  ThemeConfig?: {
    defaultTheme: 'default' | 'minimal' | 'warm' | 'fresh';
    customCSS: string;
    allowUserCustomization: boolean;
  };
  UserConfig: {
    AllowRegister?: boolean; // 是否允许用户注册，默认 true
    AutoCleanupInactiveUsers?: boolean; // 是否自动清理非活跃用户，默认 false
    InactiveUserDays?: number; // 非活跃用户保留天数，默认 7
    Users: User[];
    Tags?: {
      name: string;
      enabledApis: string[];
      showAdultContent?: boolean; // 用户组级别的成人内容显示控制
    }[];
  };
  SourceConfig: {
    key: string;
    name: string;
    api: string;
    detail?: string;
    from: 'config' | 'custom';
    disabled?: boolean;
    lastCheck?: SourceLastCheck;
    is_adult?: boolean;
  }[];
  CustomCategories: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
    from: 'config' | 'custom';
    disabled?: boolean;
  }[];
  LiveConfig?: {
    key: string;
    name: string;
    url: string;  // m3u 地址
    ua?: string;
    epg?: string; // 节目单
    from: 'config' | 'custom';
    channelNumber?: number;
    disabled?: boolean;
  }[];
  NetDiskConfig?: {
    enabled: boolean;                    // 是否启用网盘搜索
    pansouUrl: string;                   // PanSou服务地址
    timeout: number;                     // 请求超时时间(秒)
    enabledCloudTypes: string[];         // 启用的网盘类型
  };
  AIRecommendConfig?: {
    enabled: boolean;                    // 是否启用AI推荐功能
    apiUrl: string;                      // OpenAI兼容API地址
    apiKey: string;                      // API密钥
    model: string;                       // 模型名称
    temperature: number;                 // 温度参数 0-2
    maxTokens: number;                   // 最大token数
  };
  YouTubeConfig?: {
    enabled: boolean;                    // 是否启用YouTube搜索功能
    apiKey: string;                      // YouTube Data API v3密钥
    enableDemo: boolean;                 // 是否启用演示模式
    maxResults: number;                  // 每页最大搜索结果数
    enabledRegions: string[];            // 启用的地区代码列表
    enabledCategories: string[];         // 启用的视频分类列表
  };
  TVBoxSecurityConfig?: {
    enableAuth: boolean;                 // 是否启用Token验证
    token: string;                       // 访问Token
    enableIpWhitelist: boolean;          // 是否启用IP白名单
    allowedIPs: string[];               // 允许的IP地址列表
    enableRateLimit: boolean;            // 是否启用频率限制
    rateLimit: number;                   // 每分钟允许的请求次数
  };
  HomeCustomize?: any;
}

export interface AdminConfigResult {
  Role: 'owner' | 'admin';
  Config: AdminConfig;
}

// 定义并导出 User 类型，包含了所有原始字段
export type User = {
  username: string;
  role: 'user' | 'admin' | 'owner';
  banned?: boolean;
  status?: 'active' | 'pending' | 'rejected'; // 用户状态
  enabledApis?: string[]; // 优先级高于tags限制（网站内搜索用）
  tags?: string[]; // 多 tags 取并集限制
  createdAt?: number; // 用户注册时间戳
  tvboxToken?: string; // 用户专属的 TVBox Token
  tvboxEnabledSources?: string[]; // TVBox 可访问的源（为空则返回所有源）
  linuxdoId?: number; // LinuxDo 用户 ID
  linuxdoUsername?: string; // LinuxDo 用户名
  telegramId?: number; // 新增 Telegram 用户 ID
  telegramUsername?: string; // 新增 Telegram 用户名
  showAdultContent?: boolean; // 用户级别的成人内容显示控制
};

export interface LinuxDoUserInfo {
  id: number;
  username: string;
  name: string;
  avatar_template: string;
  active: boolean;
  trust_level: number;
  silenced: boolean;
  external_ids: unknown;
  api_key: string;
}

// OAuth 令牌响应
export interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

// 待审核用户类型
export interface PendingUser {
  username: string;
  registeredAt: number;
  password: string; // 存储明文密码，与主系统保持一致
}

// 注册响应类型
export interface RegisterResponse {
  success: boolean;
  message: string;
  needsApproval?: boolean;
}

// 注册统计信息
export interface RegistrationStats {
  totalUsers: number;
  maxUsers?: number;
  pendingUsers: number;
  todayRegistrations: number;
}
