/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import React from 'react'; // 引入 React 用于 ErrorBoundary
import { Heart, ChevronUp, Copy, AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import EpisodeSelector from '@/components/EpisodeSelector';
import NetDiskSearchResults from '@/components/NetDiskSearchResults';
import PageLayout from '@/components/PageLayout';
import SkipController, { SkipSettingsButton } from '@/components/SkipController';
import artplayerPluginChromecast from '@/lib/artplayer-plugin-chromecast';
import artplayerPluginLiquidGlass from '@/lib/artplayer-plugin-liquid-glass';
import { ClientCache } from '@/lib/client-cache';
import { triggerGlobalError } from '@/components/GlobalErrorIndicator';
import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  getAllFavorites,
  getAllPlayRecords,
  getSkipConfig,
  isFavorited,
  saveFavorite,
  savePlayRecord,
  subscribeToDataUpdates,
  saveSkipConfig,
  deleteSkipConfig,
  EpisodeSkipConfig,
  SkipSegment,
} from '@/lib/db.client';
import { TelegramWelcomeModal } from '@/components/TelegramWelcomeModal';
import { getDoubanDetails, getDoubanComments, getDoubanActorMovies } from '@/lib/douban.client';
import { SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8, processImageUrl } from '@/lib/utils';
import VideoCard from '@/components/VideoCard';

// 根据 type_name 推断内容类型的辅助函数
const inferTypeFromName = (typeName?: string, episodeCount?: number): string => {
  if (!typeName) {
    // 如果没有 type_name，使用集数判断（向后兼容）
    return episodeCount && episodeCount > 1 ? 'tv' : 'movie';
  }
  const lowerType = typeName.toLowerCase();
  if (lowerType.includes('综艺') || lowerType.includes('variety')) return 'variety';
  if (lowerType.includes('电影') || lowerType.includes('movie')) return 'movie';
  if (lowerType.includes('电视剧') || lowerType.includes('剧集') || lowerType.includes('tv') || lowerType.includes('series')) return 'tv';
  if (lowerType.includes('动漫') || lowerType.includes('动画') || lowerType.includes('anime')) return 'anime';
  if (lowerType.includes('纪录片') || lowerType.includes('documentary')) return 'documentary';
  // 默认根据集数判断
  return episodeCount && episodeCount > 1 ? 'tv' : 'movie';
};
// 为UI交互和数据库存储创建一个统一的类型
type UiAndDbSkipConfig = EpisodeSkipConfig & {
  enable: boolean;
  intro_time: number;
  outro_time: number;
};

// 扩展 HTMLVideoElement 类型以支持 hls 属性
declare global {
  interface HTMLVideoElement {
    hls?: any;
  }
}

// Wake Lock API 类型声明
interface WakeLockSentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
  removeEventListener(type: 'release', listener: () => void): void;
}

// 将数字转换为下标格式
const toSubscript = (num: number): string => {
  const subscriptMap: { [key: string]: string } = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
  };
  return num.toString().split('').map(digit => subscriptMap[digit] || digit).join('');
};

// 弹幕合并：合并一段时间窗口内完全相同的弹幕
const mergeSimilarDanmaku = (danmakuList: any[], windowSeconds: number = 5): any[] => {
  if (!danmakuList || danmakuList.length === 0) return [];
  
  const merged: any[] = [];
  const sorted = [...danmakuList].sort((a, b) => a.time - b.time);
  
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const currentText = (current.text || '').trim();
    
    if (!currentText) continue;
    
    // 查找是否可以合并到已有的弹幕
    let foundMergeTarget = false;
    
    for (let j = merged.length - 1; j >= 0; j--) {
      const target = merged[j];
      // 提取原始文本（去除可能已有的角标）
      const targetText = (target.originalText || target.text || '').trim();
      
      // 时间超出窗口，后续不可能合并
      if (current.time - target.time > windowSeconds) break;
      
      // 文本完全相同且在时间窗口内
      if (targetText === currentText && current.time - target.time <= windowSeconds) {
        // 合并：增加计数
        const newCount = (target.mergeCount || 1) + 1;
        target.mergeCount = newCount;
        
        // 更新显示文本（添加下标角标）
        target.text = `${currentText} ${toSubscript(newCount)}`;
        
        // 根据合并数量设置字号,但保持原始颜色不变
        let mergedFontSize = 25;
        if (newCount <= 3) {
          mergedFontSize = 25;
        } else if (newCount <= 10) {
          mergedFontSize = 35;
        } else if (newCount <= 20) {
          mergedFontSize = 45;
        } else {
          mergedFontSize = 55;
        }
        
        // 添加自定义样式对象,只设置字号
        target.style = {
          fontSize: `${mergedFontSize}px`,
          fontWeight: newCount > 3 ? 'bold' : 'normal',
        };
        
        console.log(`[danmaku] 合并弹幕: "${currentText}" 计数=${newCount}, 字号=${mergedFontSize}px`);
        
        foundMergeTarget = true;
        break;
      }
    }
    
    if (!foundMergeTarget) {
      // 创建新弹幕条目
      merged.push({
        ...current,
        mergeCount: 1, // 初始计数为1
        originalText: currentText, // 保存原始文本
      });
    }
  }
  
  console.log(`[danmaku] 弹幕合并完成: ${danmakuList.length} → ${merged.length} (减少 ${danmakuList.length - merged.length} 条)`);
  return merged;
};

function PlayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // [整合] WebSocket for Danmaku
  const { sendMessage } = useWebSocket({
    onMessage: (message) => {
      // 仅处理实时弹幕消息
      if (message.type === 'message' && artPlayerRef.current?.plugins.artplayerPluginDanmuku) {
        try {
          const danmaku = message.data;
          // 假设收到的弹幕数据结构包含一个唯一标识符来匹配当前视频
          if (danmaku.id === `${currentSourceRef.current}-${currentIdRef.current}-${currentEpisodeIndexRef.current}`) {
            artPlayerRef.current.plugins.artplayerPluginDanmuku.emit(danmaku.data);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      }
    },
  });

  // 动态导入客户端库
  // -----------------------------------------------------------------------------
  const [Artplayer, setArtplayer] = useState<any>(null);
  const [Hls, setHls] = useState<any>(null);
  const [artplayerPluginDanmuku, setArtplayerPluginDanmuku] = useState<any>(null);

  // 自定义输入对话框(替代 prompt,因为 Electron 不支持 prompt)
  const showInputDialog = (message: string, defaultValue: string = ''): Promise<string | null> => {
    return new Promise((resolve) => {
      // 创建对话框遮罩
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
      `;

      // 创建对话框
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: #2a2a2a;
        border-radius: 8px;
        padding: 24px;
        min-width: 400px;
        max-width: 600px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      `;

      // 创建消息文本
      const messageEl = document.createElement('div');
      messageEl.style.cssText = `
        color: #fff;
        font-size: 14px;
        margin-bottom: 16px;
        white-space: pre-wrap;
        line-height: 1.5;
      `;
      messageEl.textContent = message;

      // 创建输入框
      const input = document.createElement('textarea');
      input.value = defaultValue;
      input.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        background: #1a1a1a;
        border: 1px solid #444;
        border-radius: 4px;
        color: #fff;
        font-size: 14px;
        font-family: inherit;
        resize: vertical;
        min-height: 60px;
        box-sizing: border-box;
        outline: none;
      `;
      input.addEventListener('focus', () => {
        input.style.borderColor = '#3b82f6';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = '#444';
      });

      // 创建按钮容器
      const buttons = document.createElement('div');
      buttons.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 16px;
      `;

      // 取消按钮
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = `
        padding: 8px 16px;
        background: #444;
        border: none;
        border-radius: 4px;
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.2s;
      `;
      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = '#555';
      });
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = '#444';
      });
      cancelBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(null);
      });

      // 确定按钮
      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = '确定';
      confirmBtn.style.cssText = `
        padding: 8px 16px;
        background: #3b82f6;
        border: none;
        border-radius: 4px;
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.2s;
      `;
      confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.background = '#2563eb';
      });
      confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.background = '#3b82f6';
      });
      confirmBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve(input.value);
      });

      // 组装对话框
      buttons.appendChild(cancelBtn);
      buttons.appendChild(confirmBtn);
      dialog.appendChild(messageEl);
      dialog.appendChild(input);
      dialog.appendChild(buttons);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // 自动聚焦并选中文本
      setTimeout(() => {
        input.focus();
        input.select();
      }, 100);

      // 支持回车确认
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          confirmBtn.click();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelBtn.click();
        }
      });

      // 点击遮罩关闭
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cancelBtn.click();
        }
      });
    });
  };

  useEffect(() => {
    // 动态导入客户端依赖,避免服务器端编译错误
    Promise.all([
      import('artplayer'),
      import('hls.js'),
      import('artplayer-plugin-danmuku'),
    ]).then(([artplayerModule, hlsModule, danmukuModule]) => {
      setArtplayer(() => artplayerModule.default);
      setHls(() => hlsModule.default);
      setArtplayerPluginDanmuku(() => danmukuModule.default);
      console.log('[DynamicImport] 客户端库加载完成');
    }).catch((err) => {
      console.error('[DynamicImport] 加载失败:', err);
      setError('播放器库加载失败,请刷新页面重试');
    });
  }, []);

  // -----------------------------------------------------------------------------
  // 状态变量（State）
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'searching' | 'preferring' | 'fetching' | 'ready'
  >('searching');
  const [loadingMessage, setLoadingMessage] = useState('正在搜索播放源...');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);

  // 收藏状态
  const [favorited, setFavorited] = useState(false);

    // 跳过片头片尾配置
  const [skipConfig, setSkipConfig] = useState<UiAndDbSkipConfig | null>(null);
  const skipConfigRef = useRef<UiAndDbSkipConfig | null>(skipConfig);
  useEffect(() => {
    skipConfigRef.current = skipConfig;
}, [skipConfig]);

  // 从 segments 派生出UI所需的状态
  const introSegment = useMemo(() => {
    return skipConfig?.segments.find((s) => s.type === 'opening');
  }, [skipConfig]);

  const endingSegment = useMemo(() => {
    return skipConfig?.segments.find((s) => s.type === 'ending');
  }, [skipConfig]);

  const isSkipEnabled = useMemo(() => {
    return skipConfig?.segments?.some((s) => s.autoSkip) ?? false;
  }, [skipConfig]);

  
  // 跳过检查的时间间隔控制
  const lastSkipCheckRef = useRef(0);

  // 弹幕相关状态
  const [danmakuEnabled, setDanmakuEnabled] = useState(false);
  const [danmakuOffset, setDanmakuOffset] = useState(0); // 秒，可正可负
  const danmakuPluginRef = useRef<any>(null);
  const danmakuFileRef = useRef<File | null>(null); // 存储本地弹幕文件
  const danmakuFilesRef = useRef<File[]>([]); // 存储批量上传的弹幕文件
  const [danmakuFilesList, setDanmakuFilesList] = useState<File[]>([]); // 用于UI显示
  const isFirstLoadRef = useRef(true); // 标记是否是首次加载
  // 弹幕高级加载面板
  const [danmakuPanelOpen, setDanmakuPanelOpen] = useState(false);
  type DanmakuSourceType =
    | 'bv'
    | 'link'
    | 'season_id'
    | 'media_id'
    | 'cid'
    | 'local';
  const [danmakuSourceType, setDanmakuSourceType] =
    useState<DanmakuSourceType>('link');
  const [danmakuInput, setDanmakuInput] = useState('');
  const [danmakuEp, setDanmakuEp] = useState<number>(1); // season/media 专用（1基）
  const [danmakuP, setDanmakuP] = useState<number>(1); // BV 分P（1基）
  const [danmakuLoading, setDanmakuLoading] = useState(false);
  const [danmakuMsg, setDanmakuMsg] = useState<string | null>(null);
  // 弹幕优化：密度限制与关键词屏蔽
  const [danmakuLimitPerSec, setDanmakuLimitPerSec] = useState<number>(() => {
    try {
      const v =
        typeof window !== 'undefined'
          ? localStorage.getItem('danmaku_limit_per_sec')
          : null;
      const n = v ? Number(v) : 50; // 默认 50 条/秒
      return Number.isFinite(n) && n >= 0 ? n : 50;
    } catch {
      return 50;
    }
  });
  const [danmakuKeywords, setDanmakuKeywords] = useState<string>(() => {
    try {
      return typeof window !== 'undefined'
        ? localStorage.getItem('danmaku_keywords') || ''
        : '';
    } catch {
      return '';
    }
  });
  // 弹幕合并开关
  const [danmakuMergeEnabled, setDanmakuMergeEnabled] = useState<boolean>(() => {
    try {
      const v = typeof window !== 'undefined'
        ? localStorage.getItem('danmaku_merge_enabled')
        : null;
      return v === 'true';
    } catch {
      return false;
    }
  });
  const [danmakuMergeWindow, setDanmakuMergeWindow] = useState<number>(() => {
    try {
      const v = typeof window !== 'undefined'
        ? localStorage.getItem('danmaku_merge_window')
        : null;
      const n = v ? Number(v) : 5; // 默认5秒窗口
      return Number.isFinite(n) && n > 0 ? n : 5;
    } catch {
      return 5;
    }
  });
  // 当插件未就绪时暂存待加载的数据源（URL 解析为数组后再存）；同样记录最近一次成功加载的数据源
  const pendingDanmakuDataRef = useRef<any[] | null>(null);
  const lastDanmakuDataRef = useRef<any[] | null>(null);

  // 弹幕加载历史记录
  type DanmakuHistory = {
    type: DanmakuSourceType;
    value: string; // cid/bv/season_id/media_id 或 url
    ep?: number; // season/media 的集数
    p?: number; // BV 的分P
    timestamp: number;
  };

  // 剧集弹幕配置（按剧保存 season_id/media_id）
  type SeriesDanmakuConfig = {
    type: 'season_id' | 'media_id';
    value: string;
    timestamp: number;
  };

  // 豆瓣详情状态
  const [movieDetails, setMovieDetails] = useState<any>(null);
  const [loadingMovieDetails, setLoadingMovieDetails] = useState(false);

  // 豆瓣短评状态
  const [movieComments, setMovieComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  
  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);

  // bangumi详情状态
  const [bangumiDetails, setBangumiDetails] = useState<any>(null);
  const [loadingBangumiDetails, setLoadingBangumiDetails] = useState(false);

  // 网盘搜索状态
  const [netdiskResults, setNetdiskResults] = useState<{ [key: string]: any[] } | null>(null);
  const [netdiskLoading, setNetdiskLoading] = useState(false);
  const [netdiskError, setNetdiskError] = useState<string | null>(null);
  const [netdiskTotal, setNetdiskTotal] = useState(0);

  // 演员作品状态
  const [selectedCelebrityName, setSelectedCelebrityName] = useState<string | null>(null);
  const [celebrityWorks, setCelebrityWorks] = useState<any[]>([]);
  const [loadingCelebrityWorks, setLoadingCelebrityWorks] = useState(false);

  // SkipController 相关状态
  const [isSkipSettingOpen, setIsSkipSettingOpen] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // 进度条拖拽状态管理
  const isDraggingProgressRef = useRef(false);
  const seekResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 用于跟踪在一次自动换源序列中已尝试过的源，防止循环
  const autoSwitchAttemptRef = useRef<Set<string>>(new Set());
  
  // resize事件防抖管理
  const resizeResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 去广告开关（从 localStorage 继承，默认 true）
  const [blockAdEnabled, setBlockAdEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_blockad');
      if (v !== null) return v === 'true';
    }
    return true;
  });
  const blockAdEnabledRef = useRef(blockAdEnabled);
  useEffect(() => {
    blockAdEnabledRef.current = blockAdEnabled;
  }, [blockAdEnabled]);

  // 外部弹幕开关（从 localStorage 继承，默认全部关闭）
  const [externalDanmuEnabled, setExternalDanmuEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_external_danmu');
      if (v !== null) return v === 'true';
    }
    return false; // 默认关闭外部弹幕
  });
  const externalDanmuEnabledRef = useRef(externalDanmuEnabled);
  useEffect(() => {
    externalDanmuEnabledRef.current = externalDanmuEnabled;
  }, [externalDanmuEnabled]);

  // 长按显示的剧集标题
  const [longPressedTitle, setLongPressedTitle] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false); // 新增状态，控制淡出动画
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeOutTimerRef = useRef<NodeJS.Timeout | null>(null); // 新增ref，用于管理淡出计时器

  // 视频基本信息
  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState('');
  const [videoDoubanId, setVideoDoubanId] = useState(
    parseInt(searchParams.get('douban_id') || '0') || 0
  );

  // 短剧相关参数
  const [shortdramaId, setShortdramaId] = useState(
    searchParams.get('shortdrama_id') || ''
  );
  const [vodClass, setVodClass] = useState(
    searchParams.get('vod_class') || ''
  );
  const [vodTag, setVodTag] = useState(
    searchParams.get('vod_tag') || ''
  );

  // 当前源和ID
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');

  // 搜索所需信息
  const [searchTitle] = useState(searchParams.get('stitle') || '');
  const [searchType] = useState(searchParams.get('stype') || '');

  // 是否需要优选
  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);
  // 集数相关
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  // 换源相关状态
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
  const availableSourcesRef = useRef<SearchResult[]>([]);

  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const videoDoubanIdRef = useRef(videoDoubanId);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);
  const shortdramaIdRef = useRef(shortdramaId);
  const vodClassRef = useRef(vodClass);
  const vodTagRef = useRef(vodTag);

  // 同步最新值到 refs
  useEffect(() => {
    currentSourceRef.current = currentSource;
    currentIdRef.current = currentId;
    detailRef.current = detail;
    currentEpisodeIndexRef.current = currentEpisodeIndex;
    videoTitleRef.current = videoTitle;
    videoYearRef.current = videoYear;
    videoDoubanIdRef.current = videoDoubanId;
    availableSourcesRef.current = availableSources;
    shortdramaIdRef.current = shortdramaId;
    vodClassRef.current = vodClass;
    vodTagRef.current = vodTag;
  }, [
    currentSource,
    currentId,
    detail,
    currentEpisodeIndex,
    videoTitle,
    videoYear,
    videoDoubanId,
    availableSources,
    shortdramaId,
    vodClass,
    vodTag,
  ]);

  // 加载详情（豆瓣或bangumi）
  useEffect(() => {
    const loadMovieDetails = async () => {
      if (!videoDoubanId || videoDoubanId === 0 || detail?.source === 'shortdrama') {
        return;
      }

      // 检测是否为bangumi ID
      if (isBangumiId(videoDoubanId)) {
        // 加载bangumi详情
        if (loadingBangumiDetails || bangumiDetails) {
          return;
        }
        
        setLoadingBangumiDetails(true);
        try {
          const bangumiData = await fetchBangumiDetails(videoDoubanId);
          if (bangumiData) {
            setBangumiDetails(bangumiData);
          }
        } catch (error) {
          console.error('Failed to load bangumi details:', error);
        } finally {
          setLoadingBangumiDetails(false);
        }
      } else {
        // 加载豆瓣详情
        if (loadingMovieDetails || movieDetails) {
          return;
        }
        
        setLoadingMovieDetails(true);
        try {
          const response = await getDoubanDetails(videoDoubanId.toString());
          if (response.code === 200 && response.data) {
            setMovieDetails(response.data);
          }
        } catch (error) {
          console.error('Failed to load movie details:', error);
        } finally {
          setLoadingMovieDetails(false);
        }
      }
    };

    loadMovieDetails();
  }, [videoDoubanId, loadingMovieDetails, movieDetails, loadingBangumiDetails, bangumiDetails]);

  // 自动网盘搜索：当有视频标题时可以随时搜索
  useEffect(() => {
    // 移除自动搜索，改为用户点击按钮时触发
    // 这样可以避免不必要的API调用
  }, []);

  // 视频播放地址
  const [videoUrl, setVideoUrl] = useState('');

  // 总集数
  const totalEpisodes = detail?.episodes?.length || 0;

  // 用于记录是否需要在播放器 ready 后跳转到指定进度
  const resumeTimeRef = useRef<number | null>(null);
  // 上次使用的音量，默认 0.7
  const lastVolumeRef = useRef<number>(0.7);
  // 上次使用的播放速率，默认 1.0
  const lastPlaybackRateRef = useRef<number>(1.0);

  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(
    null
  );

  // 优选和测速开关
  const [optimizationEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('enableOptimization');
      if (saved !== null) {
        try {
          return JSON.parse(saved);
        } catch {
          /* ignore */
        }
      }
    }
    return false;
  });

  // 保存优选时的测速结果，避免EpisodeSelector重复测速
  const [precomputedVideoInfo, setPrecomputedVideoInfo] = useState<
    Map<string, { quality: string; loadSpeed: string; pingTime: number }>
  >(new Map());

  // 弹幕缓存：避免重复请求相同的弹幕数据，支持页面刷新持久化（统一存储）
  const DANMU_CACHE_DURATION = 30 * 60; // 30分钟缓存（秒）
  const DANMU_CACHE_KEY_PREFIX = 'danmu-cache';
  
  // 获取单个弹幕缓存
  const getDanmuCacheItem = async (key: string): Promise<{ data: any[]; timestamp: number } | null> => {
    try {
      const cacheKey = `${DANMU_CACHE_KEY_PREFIX}-${key}`;
      // 优先从统一存储获取
      const cached = await ClientCache.get(cacheKey);
      if (cached) return cached;
      
      // 兜底：从localStorage获取（兼容性）
      if (typeof localStorage !== 'undefined') {
        const oldCacheKey = 'lunatv_danmu_cache';
        const localCached = localStorage.getItem(oldCacheKey);
        if (localCached) {
          const parsed = JSON.parse(localCached);
          const cacheMap = new Map(Object.entries(parsed));
          const item = cacheMap.get(key) as { data: any[]; timestamp: number } | undefined;
          if (item && typeof item.timestamp === 'number' && Date.now() - item.timestamp < DANMU_CACHE_DURATION * 1000) {
            return item;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.warn('读取弹幕缓存失败:', error);
      return null;
    }
  };
  
  // 保存单个弹幕缓存
  const setDanmuCacheItem = async (key: string, data: any[]): Promise<void> => {
    try {
      const cacheKey = `${DANMU_CACHE_KEY_PREFIX}-${key}`;
      const cacheData = { data, timestamp: Date.now() };
      
      // 主要存储：统一存储
      await ClientCache.set(cacheKey, cacheData, DANMU_CACHE_DURATION);
      
      // 兜底存储：localStorage（兼容性，但只存储最近几个）
      if (typeof localStorage !== 'undefined') {
        try {
          const oldCacheKey = 'lunatv_danmu_cache';
          let localCache: Map<string, { data: any[]; timestamp: number }> = new Map();
          
          const existing = localStorage.getItem(oldCacheKey);
          if (existing) {
            const parsed = JSON.parse(existing);
            localCache = new Map(Object.entries(parsed)) as Map<string, { data: any[]; timestamp: number }>;
          }
          
          // 清理过期项并限制数量（最多保留10个）
          const now = Date.now();
          const validEntries = Array.from(localCache.entries())
            .filter(([, item]) => typeof item.timestamp === 'number' && now - item.timestamp < DANMU_CACHE_DURATION * 1000)
            .slice(-9); // 保留9个，加上新的共10个
            
          validEntries.push([key, cacheData]);
          
          const obj = Object.fromEntries(validEntries);
          localStorage.setItem(oldCacheKey, JSON.stringify(obj));
        } catch (e) {
          // localStorage可能满了，忽略错误
        }
      }
    } catch (error) {
      console.warn('保存弹幕缓存失败:', error);
    }
  };

  // 折叠状态（仅在 lg 及以上屏幕有效）
  const [isEpisodeSelectorCollapsed, setIsEpisodeSelectorCollapsed] =
    useState(false);

  // 换源加载状态
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoLoadingStage, setVideoLoadingStage] = useState<
    'initing' | 'sourceChanging'
  >('initing');

  // 播放进度保存相关
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  
  // 弹幕加载状态管理，防止重复加载
  const danmuLoadingRef = useRef<boolean>(false);
  const lastDanmuLoadKeyRef = useRef<string>('');

  // 🚀 新增：弹幕操作防抖和性能优化
  const danmuOperationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const episodeSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const danmuPluginStateRef = useRef<any>(null); // 保存弹幕插件状态
  const isSourceChangingRef = useRef<boolean>(false); // 标记是否正在换源
  const isEpisodeChangingRef = useRef<boolean>(false); // 标记是否正在切换集数
  const isSkipControllerTriggeredRef = useRef<boolean>(false); // 标记是否通过 SkipController 触发了下一集
  const videoEndedHandledRef = useRef<boolean>(false); // 🔥 标记当前视频的 video:ended 事件是否已经被处理过（防止多个监听器重复触发）

  // 🚀 新增：连续切换源防抖和资源管理
  const sourceSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSwitchRef = useRef<any>(null); // 保存待处理的切换请求
  const switchPromiseRef = useRef<Promise<void> | null>(null); // 当前切换的Promise

  const artPlayerRef = useRef<any>(null);
  const artRef = useRef<HTMLDivElement | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  // Wake Lock 相关
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

    // 工具函数（Utils）
  // -----------------------------------------------------------------------------

  // 短剧标签处理函数
  const parseVodTags = (vodTagString: string): string[] => {
    if (!vodTagString) return [];
    return vodTagString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  };

  // 为标签生成颜色的函数
  const getTagColor = (tag: string, isClass: boolean = false) => {
    if (isClass) {
      // vod_class 使用更显眼的颜色
      const classColors = [
        'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
        'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
        'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
      ];
      const hash = tag.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
      return classColors[hash % classColors.length];
    } else {
      // vod_tag 使用较为柔和的颜色
      const tagColors = [
        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
        'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
        'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
        'bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-300',
        'bg-orange-100 text-orange-700 dark:bg-orange-800 dark:text-orange-300',
        'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-300',
        'bg-pink-100 text-pink-700 dark:bg-pink-800 dark:text-pink-300',
        'bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-300'
      ];
      const hash = tag.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
      return tagColors[hash % tagColors.length];
    }
  };

  // 短剧播放地址处理函数
  const processShortDramaUrl = (originalUrl: string): string => {
    if (!originalUrl) {
      return originalUrl;
    }
    const needsProxy = [
      'quark.cn', 'drive.quark.cn', 'dl-c-zb-', 'dl-c-',
      'ffzy-online', 'bfikuncdn.com', 'vip.', 'm3u8'
    ].some(keyword => originalUrl.includes(keyword)) ||
      !!originalUrl.match(/https?:\/\/[^/]*\.drive\./) &&
      !originalUrl.includes('localhost') && !originalUrl.includes('127.0.0.1');

    if (needsProxy) {
      return `/api/proxy/video?url=${encodeURIComponent(originalUrl)}`;
    }
    return originalUrl;
  };

  // 短剧数据获取和转换函数
  const fetchShortDramaData = async (shortdramaId: string): Promise<SearchResult> => {
    try {
      const response = await fetch(`/api/shortdrama/parse/all?id=${encodeURIComponent(shortdramaId)}`);
      if (!response.ok) {
        throw new Error(`获取短剧数据失败: ${response.statusText}`);
      }
      const data = await response.json();
      if (!data || !data.results || data.results.length === 0) {
        throw new Error('未找到可播放的短剧视频源');
      }

      const episodes: string[] = [];
      const episodesTitles: string[] = [];

      const sortedResults = data.results.sort((a: any, b: any) => (a.index || 0) - (b.index || 0));

      sortedResults.forEach((item: any) => {
        if (item.status === 'success' && item.parsedUrl) {
          episodes.push(processShortDramaUrl(item.parsedUrl));
          episodesTitles.push(item.label || `第${item.index + 1}集`);
        }
      });
      if (episodes.length === 0) {
        throw new Error('解析后未找到有效的短剧播放地址');
      }
      const searchResult: SearchResult = {
        source: 'shortdrama',
        id: shortdramaId,
        title: data.videoName || videoTitle || '短剧播放',
        poster: data.cover || '',
        year: videoYear || new Date().getFullYear().toString(),
        source_name: '短剧',
        type_name: '短剧',
        class: '短剧',
        episodes: episodes,
        episodes_titles: episodesTitles,
        desc: data.description || '精彩短剧，为您呈现优质内容',
        douban_id: 0
      };
      return searchResult;
    } catch (error) {
      console.error('获取短剧数据失败:', error);
      throw error;
    }
  };

  // 获取当前剧集的唯一标识（用于剧集弹幕配置）
  const getSeriesKey = (): string | null => {
    // 优先使用 site_id + detail_id（来自详情页的播放）
    const siteId = searchParams.get('site_id');
    const detailId = searchParams.get('detail_id');
    if (siteId && detailId) {
      return `series_${siteId}_${detailId}`;
    }

    // 其次使用 source + id（直接播放页面）
    const source = searchParams.get('source');
    const id = searchParams.get('id');
    if (source && id) {
      return `series_${source}_${id}`;
    }

    // 无法确定剧集标识
    return null;
  };

  // 获取当前播放的集数（从 URL 或 state）
  const getCurrentEpisode = (): number => {
    // 从当前播放的集数索引获取（1-based）
    return currentEpisodeIndex + 1;
  };

  // 获取当前视频的唯一标识（用于保存弹幕历史）
  const getVideoKey = (): string => {
    // 优先使用 source_id（如果有的话）
    const sourceId = searchParams.get('source_id');
    if (sourceId) return `source_${sourceId}`;

    // 其次使用 site_id + detail_id（来自详情页）
    const siteId = searchParams.get('site_id');
    const detailId = searchParams.get('detail_id');
    if (siteId && detailId) {
      const episode = getCurrentEpisode();
      return `site_${siteId}_${detailId}_ep${episode}`;
    }

    // 再次使用 source + id（直接播放页面）
    const source = searchParams.get('source');
    const id = searchParams.get('id');
    if (source && id) {
      const episode = getCurrentEpisode();
      return `video_${source}_${id}_ep${episode}`;
    }

    // 兜底使用视频标题（如果有的话）
    if (videoTitle) {
      return `title_${videoTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}`;
    }

    // 最后兜底
    return `video_${Date.now()}`;
  };

  // 保存剧集弹幕配置（season_id/media_id）
  const saveSeriesDanmakuConfig = (
    type: 'season_id' | 'media_id',
    value: string
  ) => {
    try {
      const seriesKey = getSeriesKey();
      if (!seriesKey) {
        console.log('[danmaku] 无法确定剧集标识，不保存剧集配置');
        return;
      }
      const config: SeriesDanmakuConfig = {
        type,
        value,
        timestamp: Date.now(),
      };
      localStorage.setItem(
        `danmaku_series_${seriesKey}`,
        JSON.stringify(config)
      );
      console.log('[danmaku] 已保存剧集弹幕配置', { seriesKey, config });
    } catch (e) {
      console.warn('[danmaku] 保存剧集弹幕配置失败', e);
    }
  };

  // 读取剧集弹幕配置
  const loadSeriesDanmakuConfig = (): SeriesDanmakuConfig | null => {
    try {
      const seriesKey = getSeriesKey();
      if (!seriesKey) return null;
      const stored = localStorage.getItem(`danmaku_series_${seriesKey}`);
      if (!stored) return null;
      const config = JSON.parse(stored) as SeriesDanmakuConfig;
      console.log('[danmaku] 读取到剧集弹幕配置', { seriesKey, config });
      return config;
    } catch (e) {
      console.warn('[danmaku] 读取剧集弹幕配置失败', e);
      return null;
    }
  };

  // 保存弹幕加载历史
  const saveDanmakuHistory = (
    type: DanmakuSourceType,
    value: string,
    ep?: number,
    p?: number
  ) => {
    try {
      const key = getVideoKey();
      const history: DanmakuHistory = {
        type,
        value,
        ep,
        p,
        timestamp: Date.now(),
      };
      localStorage.setItem(`danmaku_history_${key}`, JSON.stringify(history));
      console.log('[danmaku] 已保存加载历史', { key, history });

      // 如果是剧集类型，同时保存剧集配置
      if (type === 'season_id' || type === 'media_id') {
        saveSeriesDanmakuConfig(type, value);
      } else if (type === 'link') {
        // 尝试从 link 中提取 season_id 或 media_id
        const ssMatch = value.match(/\/ss(\d+)/);
        const mdMatch = value.match(/\/md(\d+)/);
        if (ssMatch) {
          saveSeriesDanmakuConfig('season_id', ssMatch[1]);
        } else if (mdMatch) {
          saveSeriesDanmakuConfig('media_id', mdMatch[1]);
        }
      }
    } catch (e) {
      console.warn('[danmaku] 保存加载历史失败', e);
    }
  };

  // 读取弹幕加载历史
  const loadDanmakuHistory = (): DanmakuHistory | null => {
    try {
      const key = getVideoKey();
      const stored = localStorage.getItem(`danmaku_history_${key}`);
      if (!stored) return null;
      const history = JSON.parse(stored) as DanmakuHistory;
      console.log('[danmaku] 读取到加载历史', { key, history });
      return history;
    } catch (e) {
      console.warn('[danmaku] 读取加载历史失败', e);
      return null;
    }
  };
  
  // 保存批量弹幕配置(用于多文件上传)
  interface BatchDanmakuConfig {
    files: { name: string; content: string }[];
    timestamp: number;
  }
  
  const saveBatchDanmakuConfig = async (files: File[]) => {
    try {
      const seriesKey = getSeriesKey();
      if (!seriesKey) {
        console.log('[danmaku] 无法确定剧集标识，不保存批量配置');
        return;
      }
      
      // 读取所有文件内容
      const fileContents = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          content: await file.text(),
        }))
      );
      
      const config: BatchDanmakuConfig = {
        files: fileContents,
        timestamp: Date.now(),
      };
      
      localStorage.setItem(
        `danmaku_batch_${seriesKey}`,
        JSON.stringify(config)
      );
      console.log('[danmaku] 已保存批量弹幕配置', { seriesKey, count: files.length });
    } catch (e) {
      console.warn('[danmaku] 保存批量弹幕配置失败', e);
    }
  };
  
  // 读取批量弹幕配置
  const loadBatchDanmakuConfig = (): BatchDanmakuConfig | null => {
    try {
      const seriesKey = getSeriesKey();
      if (!seriesKey) return null;
      const stored = localStorage.getItem(`danmaku_batch_${seriesKey}`);
      if (!stored) return null;
      const config = JSON.parse(stored) as BatchDanmakuConfig;
      // 验证配置结构
      if (!config || !Array.isArray(config.files)) {
        console.warn('[danmaku] 批量弹幕配置格式无效');
        return null;
      }
      console.log('[danmaku] 读取到批量弹幕配置', { seriesKey, count: config.files.length });
      return config;
    } catch (e) {
      console.warn('[danmaku] 读取批量弹幕配置失败', e);
      return null;
    }
  };

  // 构造弹幕过滤器：关键词屏蔽 + 每秒密度限制
  const buildDanmakuFilter = (keywords?: string, limitPerSec?: number) => {
    const kw = (keywords ?? danmakuKeywords ?? '')
      .split(/[,\n;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const kwSet = new Set(kw);
    const limit = Number(limitPerSec ?? danmakuLimitPerSec) || 0; // 0 表示不限
    const perSecondCounter = new Map<number, number>();

    return (item: any) => {
      if (!item || !item.text) return false;
      // 关键词过滤
      if (kwSet.size > 0) {
        const textLower = String(item.text).toLowerCase();
        let blocked = false;
        kwSet.forEach((k) => {
          if (!blocked && k && textLower.includes(k)) blocked = true;
        });
        if (blocked) return false;
      }
      // 密度限制（按弹幕出现时间的秒粒度）
      if (limit > 0) {
        const sec = Math.max(0, Math.floor(Number(item.time) || 0));
        const c = (perSecondCounter.get(sec) || 0) + 1;
        perSecondCounter.set(sec, c);
        if (c > limit) return false;
      }
      return true;
    };
  };

  // 获取弹幕插件实例（兼容不同安装方式）
  const getDanmakuPlugin = (): any | null => {
    const direct = danmakuPluginRef.current;
    if (direct && typeof direct.load === 'function') return direct;
    const art: any = artPlayerRef.current as any;
    if (art && art.plugins) {
      const plugins = art.plugins;

      // 优先检查常见路径: plugins.artplayerPluginDanmuku
      if (
        plugins.artplayerPluginDanmuku &&
        typeof plugins.artplayerPluginDanmuku.load === 'function'
      ) {
        return plugins.artplayerPluginDanmuku;
      }

      // 递归查找 plugins 下所有对象，防止循环引用
      const findDanmaku = (obj: any, visited = new Set()): any | null => {
        if (!obj || typeof obj !== 'object') return null;
        if (visited.has(obj)) return null;
        visited.add(obj);
        // 只要求 load 方法存在
        if (typeof obj.load === 'function') {
          return obj;
        }
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (val && typeof val === 'object') {
            const found = findDanmaku(val, visited);
            if (found) return found;
          }
        }
        return null;
      };
      // 先查 plugins 自身
      const found = findDanmaku(plugins);
      if (found) return found;

      // 再查 plugins 的每个 key
      if (Array.isArray(plugins)) {
        for (const cand of plugins) {
          const found = findDanmaku(cand);
          if (found) return found;
        }
      } else if (typeof plugins === 'object') {
        for (const key of Object.keys(plugins)) {
          const cand = plugins[key];
          const found = findDanmaku(cand);
          if (found) return found;
        }
      }
    }
    return null;
  };

  // 同步弹幕插件属性时加判空保护
  const safeSet = (obj: any, key: string, value: any) => {
    if (obj && typeof obj === 'object') {
      try {
        obj[key] = value;
      } catch (e) {
        console.warn('同步弹幕插件属性失败', key, e);
      }
    }
  };
  const showPlayerNotice = (text: string, duration = 2400) => {
    try {
      const art: any = artPlayerRef.current as any;
      if (!art) return;
      // 方式一：函数形式
      const fn = art.notice?.show;
      if (typeof fn === 'function') {
        try {
          fn.call(art.notice, text, duration);
          return;
        } catch {
          // ignore
        }
      }
      // 方式二：属性赋值（某些版本是 setter）
      try {
        if (art.notice && 'show' in art.notice) {
          (art.notice as any).show = text;
          return;
        }
      } catch {
        // ignore
      }
      // 方式三：DOM 兜底层
      const host: HTMLElement | null = (artRef.current as any) || null;
      if (!host) return;
      let el = host.querySelector('.danmaku-toast') as HTMLElement | null;
      if (!el) {
        el = document.createElement('div');
        el.className = 'danmaku-toast';
        Object.assign(el.style, {
          position: 'absolute',
          left: '12px',
          top: '12px',
          zIndex: '100000',
          background: 'rgba(0,0,0,0.65)',
          color: '#fff',
          padding: '6px 10px',
          borderRadius: '8px',
          fontSize: '12px',
          pointerEvents: 'none',
          transition: 'opacity .2s ease',
          opacity: '0',
          maxWidth: '70%',
        } as CSSStyleDeclaration);
        const computed = window.getComputedStyle(host);
        if (computed.position === 'static') {
          host.style.position = 'relative';
        }
        host.appendChild(el);
      }
      el.textContent = text;
      el.style.opacity = '1';
      // @ts-ignore 临时属性存放计时器
      window.clearTimeout(el._hideTimer);
      // @ts-ignore
      el._hideTimer = window.setTimeout(() => {
        if (el) el.style.opacity = '0';
      }, duration);
    } catch {
      // ignore
    }
  };

  // 解析工具：B站 XML
  const parseBilibiliXml = (xmlText: string): any[] => {
    if (!xmlText || typeof xmlText !== 'string') {
      console.warn('[danmaku] parseBilibiliXml 接收到无效输入', xmlText);
      return [];
    }
    try {
      const list: any[] = [];
      const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
      const nodes = Array.from(doc.getElementsByTagName('d'));
      nodes.forEach((node) => {
        const p = node.getAttribute('p') || '';
        const parts = p.split(',');
        const time = Number.parseFloat(parts[0] || '0') || 0;
        const colorDec = Number.parseInt(parts[3] || '16777215', 10);
        const color = `#${(colorDec >>> 0).toString(16).padStart(6, '0')}`;
        const text = node.textContent || '';
        if (text) list.push({ text, time, color, mode: 0 });
      });
      return list.sort((a, b) => a.time - b.time);
    } catch {
      return [];
    }
  };

  // 强制清空所有弹幕DOM元素的通用函数(只删除弹幕内容,不删除控制UI)
  const clearAllDanmakuDOM = (): number => {
    if (!artRef.current) return 0;
    
    let cleared = 0;
    
    // 只查找弹幕渲染容器,不包括控制按钮
    // artplayer-plugin-danmuku 的弹幕通常渲染在特定的容器内
    const danmakuContainer = artRef.current.querySelector('.art-danmaku');
    
    if (danmakuContainer) {
      // 只删除容器内的直接子元素(弹幕item),不删除容器本身和控制UI
      const items = danmakuContainer.querySelectorAll('div[style*="position"]');
      items.forEach(item => {
        // 确保是弹幕元素(有定位样式且有文本内容)
        const style = item.getAttribute('style') || '';
        if (style.includes('position') && item.textContent && item.textContent.trim()) {
          item.remove();
          cleared++;
        }
      });
    }
    
    return cleared;
  };

  // 解析工具：ASS（极简实现，仅取起始时间和文本）
  const parseASSToDanmaku = (assText: string): any[] => {
    if (!assText || typeof assText !== 'string') {
      console.warn('[danmaku] parseASSToDanmaku 接收到无效输入', assText);
      return [];
    }
    const lines = assText.split(/\r?\n/);
    const res: any[] = [];
    const timeToSec = (t: string) => {
      const m = t.trim().match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);
      if (!m) return 0;
      const h = Number(m[1] || 0);
      const mi = Number(m[2] || 0);
      const s = Number(m[3] || 0);
      const cs = Number(m[4] || 0);
      return h * 3600 + mi * 60 + s + cs / 100;
    };
    for (const line of lines) {
      if (!line.startsWith('Dialogue:')) continue;
      const m = line.match(
        /^Dialogue:[^,]*,([^,]*),([^,]*),[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,(.*)$/
      );
      if (!m) continue;
      const start = timeToSec(m[1]);
      let text = m[3] || '';
      text = text.replace(/{[^}]*}/g, '').replace(/\\N/g, '\n');
      if (text) res.push({ text, time: start, color: '#ffffff', mode: 0 });
    }
    return res.sort((a, b) => a.time - b.time);
  };

  // 解析入口：根据内容识别 XML/ASS/JSON
  const parseDanmakuText = (text: string): any[] => {
    if (!text || typeof text !== 'string') {
      console.warn('[danmaku] parseDanmakuText 接收到无效输入', text);
      return [];
    }
    const t = text.trim();
    if (!t) return [];
    if (t.startsWith('<')) {
      // B站 XML
      return parseBilibiliXml(t);
    }
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const data = JSON.parse(t);
        if (Array.isArray(data)) return data;
      } catch {
        /* ignore */
      }
    }
    // 兜底按 ASS 解析
    return parseASSToDanmaku(t);
  };

  // 从 URL 加载并解析为数组
  const loadDanmakuFromUrl = async (url: string) => {
    if (!url) return;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      const msg = await r.text().catch(() => '');
      throw new Error(`请求失败 ${r.status}: ${msg.slice(0, 120)}`);
    }
    const text = await r.text();
    let data = parseDanmakuText(text);
    console.log('[danmaku] 解析弹幕', { url, dataLen: data.length });
    if (!data.length) throw new Error('弹幕解析为空');

    // 从localStorage读取最新的合并状态（避免闭包中的旧值）
    let currentMergeEnabled = false;
    let currentMergeWindow = 5;
    try {
      currentMergeEnabled = localStorage.getItem('danmaku_merge_enabled') === 'true';
      const windowStr = localStorage.getItem('danmaku_merge_window');
      currentMergeWindow = windowStr ? Number(windowStr) : 5;
    } catch (e) {
      console.warn('[danmaku] 读取合并设置失败', e);
    }

    // 应用弹幕合并（如果启用）
    if (currentMergeEnabled && data && Array.isArray(data) && data.length > 0) {
      const beforeMerge = data.length;
      data = mergeSimilarDanmaku(data, currentMergeWindow);
      console.log(`[danmaku] 弹幕合并: ${beforeMerge} → ${data.length} (窗口: ${currentMergeWindow}秒)`);
    }

    // 手动应用过滤器
    const filter = buildDanmakuFilter();
    const originalCount = data.length;
    data = data.filter(filter);
    const filteredCount = data.length;
    const blockedCount = originalCount - filteredCount;
    console.log('[danmaku] 过滤后', {
      原始: originalCount,
      保留: filteredCount,
      屏蔽: blockedCount,
    });

    const plugin = getDanmakuPlugin();
    if (plugin && typeof plugin.load === 'function') {
      // 加载前先清空旧弹幕DOM
      try {
        await plugin.load([]);
        const cleared = clearAllDanmakuDOM();
        if (cleared > 0) {
          console.log(`[danmaku] 加载前清除了 ${cleared} 个旧DOM元素`);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (e) {
        console.warn('[danmaku] 清空旧弹幕失败', e);
      }
      
      // 加载新弹幕
      try {
        await plugin.load(data);
        console.log('[danmaku] plugin.load(data) 成功', data.length);
      } catch (e) {
        console.warn('[danmaku] 以数组加载弹幕失败，尝试回退为 URL 加载', e);
        try {
          await plugin.load(url);
          console.log('[danmaku] plugin.load(url) 成功');
        } catch (e2) {
          console.error('[danmaku] URL 加载弹幕仍失败', e2);
          throw e2;
        }
      }
      safeSet(plugin.config, 'visible', true);
      if (typeof plugin.update === 'function') plugin.update();

      const msg =
        blockedCount > 0
          ? `弹幕已加载：保留 ${filteredCount} 条，屏蔽 ${blockedCount} 条`
          : `弹幕已加载：${filteredCount} 条`;
      showPlayerNotice(msg, 2600);
    } else {
      console.warn('[danmaku] 插件未就绪，pending', data.length);
      pendingDanmakuDataRef.current = data;
      // 兜底：1秒后强制重试
      setTimeout(() => {
        const p = getDanmakuPlugin();
        if (
          p &&
          typeof p.load === 'function' &&
          pendingDanmakuDataRef.current
        ) {
          try {
            p.load(pendingDanmakuDataRef.current);
            showPlayerNotice(
              `弹幕已加载：${pendingDanmakuDataRef.current.length} 条`,
              2600
            );
            pendingDanmakuDataRef.current = null;
            console.log('[danmaku] 兜底重试成功');
          } catch (e) {
            console.error('[danmaku] 兜底重试失败', e);
          }
        }
      }, 1000);
    }
    // 保存原始数据用于重新过滤
    lastDanmakuDataRef.current = parseDanmakuText(text);
  };

  // 从文本内容加载(用于本地文件)
  const loadDanmakuFromText = async (text: string) => {
    let data = parseDanmakuText(text);
    console.log('[danmaku] 解析本地弹幕', { dataLen: data.length });
    if (!data.length) throw new Error('弹幕解析为空');

    // 从localStorage读取最新的合并状态（避免闭包中的旧值）
    let currentMergeEnabled = false;
    let currentMergeWindow = 5;
    try {
      currentMergeEnabled = localStorage.getItem('danmaku_merge_enabled') === 'true';
      const windowStr = localStorage.getItem('danmaku_merge_window');
      currentMergeWindow = windowStr ? Number(windowStr) : 5;
    } catch (e) {
      console.warn('[danmaku] 读取合并设置失败', e);
    }

    // 应用弹幕合并（如果启用）
    if (currentMergeEnabled && data && Array.isArray(data) && data.length > 0) {
      const beforeMerge = data.length;
      data = mergeSimilarDanmaku(data, currentMergeWindow);
      console.log(`[danmaku] 弹幕合并: ${beforeMerge} → ${data.length} (窗口: ${currentMergeWindow}秒)`);
    }

    // 手动应用过滤器
    const filter = buildDanmakuFilter();
    const originalCount = data.length;
    data = data.filter(filter);
    const filteredCount = data.length;
    const blockedCount = originalCount - filteredCount;
    console.log('[danmaku] 过滤后', {
      原始: originalCount,
      保留: filteredCount,
      屏蔽: blockedCount,
    });

    const plugin = getDanmakuPlugin();
    if (plugin && typeof plugin.load === 'function') {
      // 加载前先清空旧弹幕DOM
      try {
        await plugin.load([]);
        const cleared = clearAllDanmakuDOM();
        if (cleared > 0) {
          console.log(`[danmaku] 加载前清除了 ${cleared} 个旧DOM元素`);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (e) {
        console.warn('[danmaku] 清空旧弹幕失败', e);
      }
      
      // 加载新弹幕
      try {
        await plugin.load(data);
        console.log('[danmaku] plugin.load(data) 成功', data.length);
      } catch (e) {
        console.warn('[danmaku] 以数组加载本地弹幕失败，尝试回退为文本加载', e);
        try {
          await plugin.load(text);
          console.log('[danmaku] plugin.load(text) 成功');
        } catch (e2) {
          console.error('[danmaku] 文本加载本地弹幕仍失败', e2);
          throw e2;
        }
      }
      safeSet(plugin.config, 'visible', true);
      if (typeof plugin.update === 'function') plugin.update();

      const msg =
        blockedCount > 0
          ? `弹幕已加载：保留 ${filteredCount} 条，屏蔽 ${blockedCount} 条`
          : `弹幕已加载：${filteredCount} 条`;
      showPlayerNotice(msg, 2600);
    } else {
      console.warn('[danmaku] 插件未就绪，pending', data.length);
      pendingDanmakuDataRef.current = data;
      setTimeout(() => {
        const p = getDanmakuPlugin();
        if (
          p &&
          typeof p.load === 'function' &&
          pendingDanmakuDataRef.current
        ) {
          try {
            p.load(pendingDanmakuDataRef.current);
            showPlayerNotice(
              `弹幕已加载：${pendingDanmakuDataRef.current.length} 条`,
              2600
            );
            pendingDanmakuDataRef.current = null;
            console.log('[danmaku] 兜底重试成功');
          } catch (e) {
            console.error('[danmaku] 兜底重试失败', e);
          }
        }
      }, 1000);
    }
    // 保存原始数据用于重新过滤
    lastDanmakuDataRef.current = parseDanmakuText(text);
  };

  // 重新以当前过滤规则加载上一次弹幕源
  const reloadDanmakuWithFilter = async (keywords?: string, limitPerSec?: number): Promise<string> => {
    const data = lastDanmakuDataRef.current || pendingDanmakuDataRef.current;
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('[danmaku] 无可用弹幕数据,跳过重载');
      return '无弹幕源';
    }
    
    console.log(`[danmaku] ===== 开始重新加载弹幕 =====`);
    console.log(`[danmaku] 原始数据条数: ${data.length}`);
    
    // 暂停视频,防止在清空和加载期间弹幕继续滚动
    const wasPlaying = artPlayerRef.current && !artPlayerRef.current.paused;
    const currentTime = artPlayerRef.current?.currentTime || 0;
    
    if (wasPlaying && artPlayerRef.current) {
      artPlayerRef.current.pause();
      console.log('[danmaku] 暂停视频以重新加载弹幕');
    }
    
    try {
      const plugin = getDanmakuPlugin();
      if (plugin) {
        // 直接使用 lastDanmakuDataRef 中的数据(已经在初始加载时应用了合并)
        // 这里只需要应用新的过滤规则
        const processedData = [...data];
        
        // 手动应用过滤器,使用传入的参数或当前状态
        const filter = buildDanmakuFilter(keywords, limitPerSec);
        const beforeCount = processedData.length;
        const filteredData = processedData.filter(filter);
        const afterCount = filteredData.length;
        const blockedCount = beforeCount - afterCount;

        console.log('[danmaku] 过滤统计:', {
          原始: beforeCount,
          保留: afterCount,
          屏蔽: blockedCount,
          关键词: keywords ?? danmakuKeywords,
          密度限制: limitPerSec ?? danmakuLimitPerSec,
        });

        // 清空并重新加载弹幕
        try {
          console.log('[danmaku] 清空旧弹幕...');
          
          // 新策略:强制清空所有弹幕DOM元素
          // 步骤1: 先加载空数组清空插件数据
          await plugin.load([]);
          console.log('[danmaku] 插件数据已清空');
          
          // 步骤2: 使用通用函数清除所有弹幕DOM
          const cleared = clearAllDanmakuDOM();
          if (cleared > 0) {
            console.log(`[danmaku] 强制清除了 ${cleared} 个DOM元素`);
          }
          
          // 步骤3: 等待确保清除完成
          await new Promise(resolve => setTimeout(resolve, 100));
          
          console.log('[danmaku] 清空完成');
        } catch (e: any) {
          console.error('[danmaku] 清空失败:', e?.message || e);
        }

        // 加载过滤后的数据
        console.log('[danmaku] 开始加载新弹幕数据:', filteredData.length, '条');
        await plugin.load(filteredData);
        
        // 显示弹幕
        if (typeof plugin.show === 'function') {
          plugin.show();
          console.log('[danmaku] 显示弹幕');
        }
        
        // 更新插件
        if (typeof plugin.update === 'function') {
          plugin.update();
          console.log('[danmaku] 更新插件');
        }

        const msg =
          blockedCount > 0
            ? `弹幕过滤已应用：保留 ${afterCount} 条，屏蔽 ${blockedCount} 条`
            : `弹幕过滤已应用：共 ${afterCount} 条`;
        showPlayerNotice(msg, 2500);
        
        // 恢复播放状态
        if (wasPlaying && artPlayerRef.current) {
          // 确保时间没有变化
          if (Math.abs(artPlayerRef.current.currentTime - currentTime) > 0.5) {
            artPlayerRef.current.currentTime = currentTime;
          }
          // 延迟恢复播放,确保弹幕加载完成
          setTimeout(() => {
            if (artPlayerRef.current) {
              artPlayerRef.current.play().catch((e: any) => console.warn('[danmaku] 恢复播放失败', e));
              console.log('[danmaku] 恢复视频播放');
            }
          }, 200);
        }
        
        console.log('[danmaku] ===== 弹幕重新加载完成 =====');
        
        return '已应用并重载';
      }
      pendingDanmakuDataRef.current = data;
      return '插件未就绪，稍后自动应用';
    } catch (e: any) {
      console.error('重载弹幕失败', e);
      const msg = e?.message || '重载失败';
      triggerGlobalError(msg);
      
      // 即使失败也尝试恢复播放
      if (wasPlaying && artPlayerRef.current) {
        artPlayerRef.current.play().catch(() => {});
      }
      
      return '失败';
    }
  };

  // 跳过片头片尾配置相关函数
  const handleSkipConfigChange = async (newConfig: UiAndDbSkipConfig) => {

    if (!currentSourceRef.current || !currentIdRef.current) return;

    try {
      const newSegments: SkipSegment[] = [];
      const duration = artPlayerRef.current?.duration;

      if (newConfig.intro_time > 0) {
        newSegments.push({
          type: 'opening',
          start: 0,
          end: newConfig.intro_time,
          autoSkip: newConfig.enable,
        });
      }
      if (newConfig.outro_time < 0 && duration) {
        newSegments.push({
          type: 'ending',
          start: duration + newConfig.outro_time,
          end: duration,
          autoSkip: newConfig.enable,
          autoNextEpisode: true,
        });
      }

      const fullConfig: UiAndDbSkipConfig = {
        source: currentSourceRef.current,
        id: currentIdRef.current,
        title: videoTitleRef.current,
        segments: newSegments,
        updated_time: Date.now(),
        enable: newConfig.enable,
        intro_time: newConfig.intro_time,
        outro_time: newConfig.outro_time,
      };

      setSkipConfig(fullConfig);

      if (fullConfig.segments.length === 0) {
        await deleteSkipConfig(currentSourceRef.current, currentIdRef.current);
        artPlayerRef.current.setting.update({
          name: '跳过片头片尾',
          html: '跳过片头片尾',
          switch: skipConfigRef.current?.enable,
          onSwitch: function (item: any) {
              if (skipConfigRef.current) {
                const newConfig = {
                  ...skipConfigRef.current,
                  enable: !item.switch,
                };
                handleSkipConfigChange(newConfig);
              }
            return !item.switch;
          },
        });
        artPlayerRef.current.setting.update({
          name: '设置片头',
          html: '设置片头',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2" fill="#ffffff"/><path d="M9 12L17 12" stroke="#ffffff" stroke-width="2"/><path d="M17 6L17 18" stroke="#ffffff" stroke-width="2"/></svg>',
          tooltip:
            skipConfigRef.current?.intro_time === 0
              ? '设置片头时间'
              : `${formatTime(skipConfigRef.current?.intro_time || 0)}`,
          onClick: function () {
            const currentTime = artPlayerRef.current?.currentTime || 0;
            if (currentTime > 0 && skipConfigRef.current) {
              const newConfig = {
                ...skipConfigRef.current,
                intro_time: currentTime,
              };
              handleSkipConfigChange(newConfig);
              return `${formatTime(currentTime)}`;
            }
          },
        });
        artPlayerRef.current.setting.update({
          name: '设置片尾',
          html: '设置片尾',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 6L7 18" stroke="#ffffff" stroke-width="2"/><path d="M7 12L15 12" stroke="#ffffff" stroke-width="2"/><circle cx="19" cy="12" r="2" fill="#ffffff"/></svg>',
          tooltip:
            (skipConfigRef.current?.outro_time || 0) >= 0
              ? '设置片尾时间'
              : `-${formatTime(-(skipConfigRef.current?.outro_time || 0))}`,
          onClick: function () {
            const outroTime =
              -(
                artPlayerRef.current?.duration -
                artPlayerRef.current?.currentTime
              ) || 0;
            if (outroTime < 0 && skipConfigRef.current) {
              const newConfig = {
                ...skipConfigRef.current,
                outro_time: outroTime,
              };
              handleSkipConfigChange(newConfig);
              return `-${formatTime(-outroTime)}`;
            }
          },
        });
      } else {
        await saveSkipConfig(
          currentSourceRef.current,
          currentIdRef.current,
          fullConfig
        );
      }
      console.log('跳过片头片尾配置已保存:', fullConfig);
    } catch (err) {
      console.error('保存跳过片头片尾配置失败:', err);
    }
  };
  
  // -----------------------------------------------------------------------------
  // 亮点功能：源预连接与预加载
  // -----------------------------------------------------------------------------
  // 对最优的几个源进行预连接，减少后续请求的握手时间
  const preconnectTopSources = (sortedSources: SearchResult[]) => {
    // 移除旧的预连接标签
    document.querySelectorAll('link[rel="preconnect"]').forEach(link => link.remove());
    
    // 只对前3个最优源进行预连接
    sortedSources.slice(0, 3).forEach((source) => {
      try {
        if (source.episodes?.length > 0) {
          const origin = new URL(source.episodes[0]).origin;
          // 避免重复添加同一个 origin
          if (!document.querySelector(`link[href="${origin}"]`)) {
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = origin;
            document.head.appendChild(link);
          }
        }
      } catch (e) {
        // 忽略无效的URL
      }
    });
  };
  
  // 预加载下一个备选源的 m3u8 文件
  const preloadNextSource = (currentIndex: number, sources: SearchResult[]) => {
    if (currentIndex + 1 < sources.length) {
      const nextSource = sources[currentIndex + 1];
      if (nextSource && nextSource.episodes && nextSource.episodes.length > 0) {
        const nextEpisodeUrl = nextSource.episodes[currentEpisodeIndexRef.current] || nextSource.episodes[0];
        const proxyUrl = `/api/proxy/m3u8?url=${encodeURIComponent(nextEpisodeUrl)}&moontv-source=${nextSource.source}`;
        // 使用 fetch 发起低优先级预加载，静默失败
        fetch(proxyUrl, { cache: 'force-cache' }).catch(() => {});
      }
    }
  };

  // -----------------------------------------------------------------------------
  // 工具函数（Utils）
  // -----------------------------------------------------------------------------

  // bangumi ID检测（3-6位数字）
  const isBangumiId = (id: number): boolean => {
    const length = id.toString().length;
    return id > 0 && length >= 3 && length <= 6;
  };

  // bangumi缓存配置
  const BANGUMI_CACHE_EXPIRE = 4 * 60 * 60 * 1000; // 4小时，和douban详情一致

  // bangumi缓存工具函数（统一存储）
  const getBangumiCache = async (id: number) => {
    try {
      const cacheKey = `bangumi-details-${id}`;
      // 优先从统一存储获取
      const cached = await ClientCache.get(cacheKey);
      if (cached) return cached;
      
      // 兜底：从localStorage获取（兼容性）
      if (typeof localStorage !== 'undefined') {
        const localCached = localStorage.getItem(cacheKey);
        if (localCached) {
          const { data, expire } = JSON.parse(localCached);
          if (Date.now() <= expire) {
            return data;
          }
          localStorage.removeItem(cacheKey);
        }
      }
      
      return null;
    } catch (e) {
      console.warn('获取Bangumi缓存失败:', e);
      return null;
    }
  };

  const setBangumiCache = async (id: number, data: any) => {
    try {
      const cacheKey = `bangumi-details-${id}`;
      const expireSeconds = Math.floor(BANGUMI_CACHE_EXPIRE / 1000); // 转换为秒
      
      // 主要存储：统一存储
      await ClientCache.set(cacheKey, data, expireSeconds);
      
      // 兜底存储：localStorage（兼容性）
      if (typeof localStorage !== 'undefined') {
        try {
          const cacheData = {
            data,
            expire: Date.now() + BANGUMI_CACHE_EXPIRE,
            created: Date.now()
          };
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
          // localStorage可能满了，忽略错误
        }
      }
    } catch (e) {
      console.warn('设置Bangumi缓存失败:', e);
    }
  };

  // 获取bangumi详情（带缓存）
  const fetchBangumiDetails = async (bangumiId: number) => {
    // 检查缓存
    const cached = await getBangumiCache(bangumiId);
    if (cached) {
      console.log(`Bangumi详情缓存命中: ${bangumiId}`);
      return cached;
    }

    try {
      const response = await fetch(`https://api.bgm.tv/v0/subjects/${bangumiId}`);
      if (response.ok) {
        const bangumiData = await response.json();
        
        // 保存到缓存
        await setBangumiCache(bangumiId, bangumiData);
        console.log(`Bangumi详情已缓存: ${bangumiId}`);
        
        return bangumiData;
      }
    } catch (error) {
      console.log('Failed to fetch bangumi details:', error);
    }
    return null;
  };

  /**
   * 生成搜索查询的多种变体，提高搜索命中率
   * @param originalQuery 原始查询
   * @returns 按优先级排序的搜索变体数组
   */
  const generateSearchVariants = (originalQuery: string): string[] => {
    const variants: string[] = [];
    const trimmed = originalQuery.trim();

    // 1. 原始查询（最高优先级）
    variants.push(trimmed);

    // 2. 处理中文标点符号变体
    const chinesePunctuationVariants = generateChinesePunctuationVariants(trimmed);
    chinesePunctuationVariants.forEach(variant => {
      if (!variants.includes(variant)) {
        variants.push(variant);
      }
    });

    // 3. 移除数字变体处理（优化性能，依赖downstream相关性评分处理数字差异）

    // 如果包含空格，生成额外变体
    if (trimmed.includes(' ')) {
      // 4. 去除所有空格
      const noSpaces = trimmed.replace(/\s+/g, '');
      if (noSpaces !== trimmed) {
        variants.push(noSpaces);
      }

      // 5. 标准化空格（多个空格合并为一个）
      const normalizedSpaces = trimmed.replace(/\s+/g, ' ');
      if (normalizedSpaces !== trimmed && !variants.includes(normalizedSpaces)) {
        variants.push(normalizedSpaces);
      }

      // 6. 提取关键词组合（针对"中餐厅 第九季"这种情况）
      const keywords = trimmed.split(/\s+/);
      if (keywords.length >= 2) {
        // 主要关键词 + 季/集等后缀
        const mainKeyword = keywords[0];
        const lastKeyword = keywords[keywords.length - 1];

        // 如果最后一个词包含"第"、"季"、"集"等，尝试组合
        if (/第|季|集|部|篇|章/.test(lastKeyword)) {
          const combined = mainKeyword + lastKeyword;
          if (!variants.includes(combined)) {
            variants.push(combined);
          }
        }

        // 7. 空格变冒号的变体（重要！针对"死神来了 血脉诅咒" -> "死神来了：血脉诅咒"）
        const withColon = trimmed.replace(/\s+/g, '：');
        if (!variants.includes(withColon)) {
          variants.push(withColon);
        }

        // 8. 空格变英文冒号的变体
        const withEnglishColon = trimmed.replace(/\s+/g, ':');
        if (!variants.includes(withEnglishColon)) {
          variants.push(withEnglishColon);
        }

        // 仅使用主关键词搜索（过滤无意义的词）
        const meaninglessWords = ['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by'];
        if (!variants.includes(mainKeyword) &&
            !meaninglessWords.includes(mainKeyword.toLowerCase()) &&
            mainKeyword.length > 2) {
          variants.push(mainKeyword);
        }
      }
    }

    // 去重并返回
    return Array.from(new Set(variants));
  };

  // 移除数字变体生成函数（优化性能，依赖相关性评分处理）

  /**
   * 生成中文标点符号的搜索变体
   * @param query 原始查询
   * @returns 标点符号变体数组
   */
  const generateChinesePunctuationVariants = (query: string): string[] => {
    const variants: string[] = [];

    // 检查是否包含中文标点符号
    const chinesePunctuation = /[：；，。！？、""''（）【】《》]/;
    if (!chinesePunctuation.test(query)) {
      return variants;
    }

    // 中文冒号变体 (针对"死神来了：血脉诅咒"这种情况)
    if (query.includes('：')) {
      // 优先级1: 替换为空格 (最可能匹配，如"死神来了 血脉诅咒" 能匹配到 "死神来了6：血脉诅咒")
      const withSpace = query.replace(/：/g, ' ');
      variants.push(withSpace);

      // 优先级2: 完全去除冒号
      const noColon = query.replace(/：/g, '');
      variants.push(noColon);

      // 优先级3: 替换为英文冒号
      const englishColon = query.replace(/：/g, ':');
      variants.push(englishColon);

      // 优先级4: 提取冒号前的主标题 (降低优先级，避免匹配到错误的系列)
      const beforeColon = query.split('：')[0].trim();
      if (beforeColon && beforeColon !== query) {
        variants.push(beforeColon);
      }

      // 优先级5: 提取冒号后的副标题
      const afterColon = query.split('：')[1]?.trim();
      if (afterColon) {
        variants.push(afterColon);
      }
    }

    // 其他中文标点符号处理
    let cleanedQuery = query;

    // 替换中文标点为对应英文标点
    cleanedQuery = cleanedQuery.replace(/；/g, ';');
    cleanedQuery = cleanedQuery.replace(/，/g, ',');
    cleanedQuery = cleanedQuery.replace(/。/g, '.');
    cleanedQuery = cleanedQuery.replace(/！/g, '!');
    cleanedQuery = cleanedQuery.replace(/？/g, '?');
    cleanedQuery = cleanedQuery.replace(/"/g, '"');
    cleanedQuery = cleanedQuery.replace(/"/g, '"');
    cleanedQuery = cleanedQuery.replace(/'/g, "'");
    cleanedQuery = cleanedQuery.replace(/'/g, "'");
    cleanedQuery = cleanedQuery.replace(/（/g, '(');
    cleanedQuery = cleanedQuery.replace(/）/g, ')');
    cleanedQuery = cleanedQuery.replace(/【/g, '[');
    cleanedQuery = cleanedQuery.replace(/】/g, ']');
    cleanedQuery = cleanedQuery.replace(/《/g, '<');
    cleanedQuery = cleanedQuery.replace(/》/g, '>');

    if (cleanedQuery !== query) {
      variants.push(cleanedQuery);
    }

    // 完全去除所有标点符号
    const noPunctuation = query.replace(/[：；，。！？、""''（）【】《》:;,.!?"'()[\]<>]/g, '');
    if (noPunctuation !== query && noPunctuation.trim()) {
      variants.push(noPunctuation);
    }

    return variants;
  };

  // 检查是否包含查询中的所有关键词（与downstream评分逻辑保持一致）
  const checkAllKeywordsMatch = (queryTitle: string, resultTitle: string): boolean => {
    const queryWords = queryTitle.replace(/[^\w\s\u4e00-\u9fff]/g, '').split(/\s+/).filter(w => w.length > 0);

    // 检查结果标题是否包含查询中的所有关键词
    return queryWords.every(word => resultTitle.includes(word));
  };

  // 网盘搜索函数
  const handleNetDiskSearch = async (query: string) => {
    if (!query.trim()) return;

    setNetdiskLoading(true);
    setNetdiskError(null);
    setNetdiskResults(null);
    setNetdiskTotal(0);

    try {
      const response = await fetch(`/api/netdisk/search?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();

      if (data.success) {
        setNetdiskResults(data.data.merged_by_type || {});
        setNetdiskTotal(data.data.total || 0);
        console.log(`网盘搜索完成: "${query}" - ${data.data.total || 0} 个结果`);
      } else {
        setNetdiskError(data.error || '网盘搜索失败');
      }
    } catch (error: any) {
      console.error('网盘搜索请求失败:', error);
      setNetdiskError('网盘搜索请求失败，请稍后重试');
    } finally {
      setNetdiskLoading(false);
    }
  };

  // 处理演员点击事件
  const handleCelebrityClick = async (celebrityName: string) => {
    // 如果点击的是已选中的演员，则收起
    if (selectedCelebrityName === celebrityName) {
      setSelectedCelebrityName(null);
      setCelebrityWorks([]);
      return;
    }

    setSelectedCelebrityName(celebrityName);
    setLoadingCelebrityWorks(true);
    setCelebrityWorks([]);

    try {
      // 检查缓存
      const cacheKey = `douban-celebrity-${celebrityName}`;
      const cached = await ClientCache.get(cacheKey);

      if (cached) {
        console.log(`演员作品缓存命中: ${celebrityName}`);
        setCelebrityWorks(cached);
        setLoadingCelebrityWorks(false);
        return;
      }

      console.log('搜索演员作品:', celebrityName);

      // 使用豆瓣搜索API（通过cmliussss CDN）
      const searchUrl = `https://movie.douban.cmliussss.net/j/search_subjects?type=movie&tag=${encodeURIComponent(celebrityName)}&sort=recommend&page_limit=20&page_start=0`;

      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.subjects && data.subjects.length > 0) {
        const works = data.subjects.map((item: any) => ({
          id: item.id,
          title: item.title,
          poster: item.cover,
          rate: item.rate,
          year: item.url?.match(/\/subject\/(\d+)\//)?.[1] || ''
        }));

        // 保存到缓存（2小时）
        await ClientCache.set(cacheKey, works, 2 * 60 * 60);

        setCelebrityWorks(works);
        console.log(`找到 ${works.length} 部 ${celebrityName} 的作品（豆瓣，已缓存）`);
      } else {
        // 豆瓣没有结果，尝试TMDB fallback
        console.log('豆瓣未找到相关作品，尝试TMDB...');
        try {
          const tmdbResponse = await fetch(`/api/tmdb/actor?actor=${encodeURIComponent(celebrityName)}&type=movie&limit=20`);
          const tmdbResult = await tmdbResponse.json();

          if (tmdbResult.code === 200 && tmdbResult.list && tmdbResult.list.length > 0) {
            // 保存到缓存（2小时）
            await ClientCache.set(cacheKey, tmdbResult.list, 2 * 60 * 60);
            setCelebrityWorks(tmdbResult.list);
            console.log(`找到 ${tmdbResult.list.length} 部 ${celebrityName} 的作品（TMDB，已缓存）`);
          } else {
            console.log('TMDB也未找到相关作品');
            setCelebrityWorks([]);
          }
        } catch (tmdbError) {
          console.error('TMDB搜索失败:', tmdbError);
          setCelebrityWorks([]);
        }
      }
    } catch (error) {
      console.error('获取演员作品出错:', error);
      setCelebrityWorks([]);
    } finally {
      setLoadingCelebrityWorks(false);
    }
  };

  // 播放源优选函数（针对旧iPad做极端保守优化）
  const preferBestSource = async (
    sources: SearchResult[]
  ): Promise<SearchResult> => {
    if (sources.length === 1) return sources[0];

    // 使用全局统一的设备检测结果
    const _isIPad = /iPad/i.test(userAgent) || (userAgent.includes('Macintosh') && navigator.maxTouchPoints >= 1);
    const _isIOS = isIOSGlobal;
    const isIOS13 = isIOS13Global;
    const isMobile = isMobileGlobal;

    // 如果是iPad或iOS13+（包括新iPad在桌面模式下），使用极简策略避免崩溃
    if (isIOS13) {
      console.log('检测到iPad/iOS13+设备，使用无测速优选策略避免崩溃');
      
      // 简单的源名称优先级排序，不进行实际测速
      const sourcePreference = [
        'ok', 'niuhu', 'ying', 'wasu', 'mgtv', 'iqiyi', 'youku', 'qq'
      ];
      
      const sortedSources = sources.sort((a, b) => {
        const aIndex = sourcePreference.findIndex(name => 
          a.source_name?.toLowerCase().includes(name)
        );
        const bIndex = sourcePreference.findIndex(name => 
          b.source_name?.toLowerCase().includes(name)
        );
        
        // 如果都在优先级列表中，按优先级排序
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        }
        // 如果只有一个在优先级列表中，优先选择它
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        
        // 都不在优先级列表中，保持原始顺序
        return 0;
      });
      
      console.log('iPad/iOS13+优选结果:', sortedSources.map(s => s.source_name));
      return sortedSources[0];
    }

    // 移动设备使用轻量级测速（仅ping，不创建HLS）
    if (isMobile) {
      console.log('移动设备使用轻量级优选');
      return await lightweightPreference(sources);
    }

    // 桌面设备使用原来的测速方法（控制并发）
    return await fullSpeedTest(sources);
  };

  // 轻量级优选：仅测试连通性，不创建video和HLS
  const lightweightPreference = async (sources: SearchResult[]): Promise<SearchResult> => {
    console.log('开始轻量级测速，仅测试连通性');
    
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          if (!source.episodes || source.episodes.length === 0) {
            return { source, pingTime: 9999, available: false };
          }

          const episodeUrl = source.episodes.length > 1 
            ? source.episodes[1] 
            : source.episodes[0];
          
          // 仅测试连通性和响应时间
          const startTime = performance.now();
          await fetch(episodeUrl, { 
            method: 'HEAD', 
            mode: 'no-cors',
            signal: AbortSignal.timeout(3000) // 3秒超时
          });
          const pingTime = performance.now() - startTime;
          
          return { 
            source, 
            pingTime: Math.round(pingTime), 
            available: true 
          };
        } catch (error) {
          console.warn(`轻量级测速失败: ${source.source_name}`, error);
          return { source, pingTime: 9999, available: false };
        }
      })
    );

    // 按可用性和响应时间排序
    const sortedResults = results
      .filter(r => r.available)
      .sort((a, b) => a.pingTime - b.pingTime);

    if (sortedResults.length === 0) {
      console.warn('所有源都不可用，返回第一个');
      return sources[0];
    }

    console.log('轻量级优选结果:', sortedResults.map(r => 
      `${r.source.source_name}: ${r.pingTime}ms`
    ));
    
    return sortedResults[0].source;
  };

  // 完整测速（桌面设备）
  const fullSpeedTest = async (sources: SearchResult[]): Promise<SearchResult> => {
    // 桌面设备使用小批量并发，避免创建过多实例
    const concurrency = 2;
    const allResults: Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    } | null> = [];

    for (let i = 0; i < sources.length; i += concurrency) {
      const batch = sources.slice(i, i + concurrency);
      console.log(`测速批次 ${Math.floor(i/concurrency) + 1}/${Math.ceil(sources.length/concurrency)}: ${batch.length} 个源`);
      
      const batchResults = await Promise.all(
        batch.map(async (source) => {
          try {
            if (!source.episodes || source.episodes.length === 0) {
              return null;
            }

            const episodeUrl = source.episodes.length > 1
              ? source.episodes[1]
              : source.episodes[0];
            
            const testResult = await getVideoResolutionFromM3u8(episodeUrl);
            return { source, testResult };
          } catch (error) {
            console.warn(`测速失败: ${source.source_name}`, error);
            return null;
          }
        })
      );
      
      allResults.push(...batchResults);
      
      // 批次间延迟，让资源有时间清理
      if (i + concurrency < sources.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // 等待所有测速完成，包含成功和失败的结果
    // 保存所有测速结果到 precomputedVideoInfo，供 EpisodeSelector 使用（包含错误结果）
    const newVideoInfoMap = new Map<
      string,
      {
        quality: string;
        loadSpeed: string;
        pingTime: number;
        hasError?: boolean;
      }
    >();
    allResults.forEach((result, index) => {
      const source = sources[index];
      const sourceKey = `${source.source}-${source.id}`;

      if (result) {
        // 成功的结果
        newVideoInfoMap.set(sourceKey, result.testResult);
      }
    });

    // 过滤出成功的结果用于优选计算
    const successfulResults = allResults.filter(Boolean) as Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    }>;

    setPrecomputedVideoInfo(newVideoInfoMap);

    if (successfulResults.length === 0) {
      console.warn('所有播放源测速都失败，使用第一个播放源');
      return sources[0];
    }

    // 找出所有有效速度的最大值，用于线性映射
    const validSpeeds = successfulResults
      .map((result) => {
        const speedStr = result.testResult.loadSpeed;
        if (speedStr === '未知' || speedStr === '测量中...') return 0;

        const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2];
        return unit === 'MB/s' ? value * 1024 : value; // 统一转换为 KB/s
      })
      .filter((speed) => speed > 0);

    const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 1024; // 默认1MB/s作为基准

    // 找出所有有效延迟的最小值和最大值，用于线性映射
    const validPings = successfulResults
      .map((result) => result.testResult.pingTime)
      .filter((ping) => ping > 0);

    const minPing = validPings.length > 0 ? Math.min(...validPings) : 50;
    const maxPing = validPings.length > 0 ? Math.max(...validPings) : 1000;

    // 计算每个结果的评分
    const resultsWithScore = successfulResults.map((result) => ({
      ...result,
      score: calculateSourceScore(
        result.testResult,
        maxSpeed,
        minPing,
        maxPing
      ),
    }));

    // 按综合评分排序，选择最佳播放源
    resultsWithScore.sort((a, b) => b.score - a.score);

    console.log('播放源评分排序结果:');
    resultsWithScore.forEach((result, index) => {
      console.log(
        `${index + 1}. ${result.source.source_name
        } - 评分: ${result.score.toFixed(2)} (${result.testResult.quality}, ${result.testResult.loadSpeed
        }, ${result.testResult.pingTime}ms)`
      );
    });

    return resultsWithScore[0].source;
  };

  // 计算播放源综合评分
  const calculateSourceScore = (
    testResult: {
      quality: string;
      loadSpeed: string;
      pingTime: number;
    },
    maxSpeed: number,
    minPing: number,
    maxPing: number
  ): number => {
    let score = 0;

    // 分辨率评分 (40% 权重)
    const qualityScore = (() => {
      switch (testResult.quality) {
        case '4K':
          return 100;
        case '2K':
          return 85;
        case '1080p':
          return 75;
        case '720p':
          return 60;
        case '480p':
          return 40;
        case 'SD':
          return 20;
        default:
          return 0;
      }
    })();
    score += qualityScore * 0.4;

    // 下载速度评分 (40% 权重) - 基于最大速度线性映射
    const speedScore = (() => {
      const speedStr = testResult.loadSpeed;
      if (speedStr === '未知' || speedStr === '测量中...') return 30;

      // 解析速度值
      const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
      if (!match) return 30;

      const value = parseFloat(match[1]);
      const unit = match[2];
      const speedKBps = unit === 'MB/s' ? value * 1024 : value;

      // 基于最大速度线性映射，最高100分
      const speedRatio = speedKBps / maxSpeed;
      return Math.min(100, Math.max(0, speedRatio * 100));
    })();
    score += speedScore * 0.4;

    // 网络延迟评分 (20% 权重) - 基于延迟范围线性映射
    const pingScore = (() => {
      const ping = testResult.pingTime;
      if (ping <= 0) return 0; // 无效延迟给默认分

      // 如果所有延迟都相同，给满分
      if (maxPing === minPing) return 100;

      // 线性映射：最低延迟=100分，最高延迟=0分
      const pingRatio = (maxPing - ping) / (maxPing - minPing);
      return Math.min(100, Math.max(0, pingRatio * 100));
    })();
    score += pingScore * 0.2;

    return Math.round(score * 100) / 100; // 保留两位小数
  };

  // 更新视频地址
  const updateVideoUrl = async (
    detailData: SearchResult | null,
    episodeIndex: number
  ) => {
    if (
      !detailData ||
      !detailData.episodes ||
      episodeIndex >= detailData.episodes.length ||
      episodeIndex < 0 // 增加索引有效性检查
    ) {
      setVideoUrl('');
      return;
    }

    let newUrl = detailData.episodes[episodeIndex] || '';
  
    // 如果是短剧且URL还没有经过代理处理，再次处理
    if (detailData.source === 'shortdrama' && newUrl && !newUrl.includes('/api/proxy/video')) {
      // 检查是否需要使用代理
      const needsProxy = [
        'quark.cn', 'drive.quark.cn', 'dl-c-zb-', 'dl-c-',
        'ffzy-online', 'bfikuncdn.com', 'vip.', 'm3u8'
      ].some(keyword => newUrl.includes(keyword)) ||
        !!newUrl.match(/https?:\/\/[^/]*\.drive\./) &&
        !newUrl.includes('localhost') && !newUrl.includes('127.0.0.1');
  
      if (needsProxy) {
        newUrl = `/api/proxy/video?url=${encodeURIComponent(newUrl)}`;
      }
    } else if (newUrl && newUrl.startsWith('shortdrama:')) { // 兼容旧的短剧格式
      try {
        const [, videoId, episode] = newUrl.split(':');
        const response = await fetch(`/api/shortdrama/parse?id=${videoId}&episode=${episode}`);
        if (response.ok) {
          const result = await response.json();
          newUrl = result.url || '';
        } else {
          setError('短剧解析失败');
          newUrl = '';
        }
      } catch (err) {
        console.error('短剧URL解析失败:', err);
        setError('短剧解析失败');
        newUrl = '';
      }
    }
      // 普通视频格式
    if (newUrl !== videoUrl) {
      setVideoUrl(newUrl);
    }
  };

  const ensureVideoSource = (video: HTMLVideoElement | null, url: string) => {
    if (!video || !url) return;
    const sources = Array.from(video.getElementsByTagName('source'));
    const existed = sources.some((s) => s.src === url);
    if (!existed) {
      // 移除旧的 source，保持唯一
      sources.forEach((s) => s.remove());
      const sourceEl = document.createElement('source');
      sourceEl.src = url;
      video.appendChild(sourceEl);
    }

    // 始终允许远程播放（AirPlay / Cast）
    video.disableRemotePlayback = false;
    // 如果曾经有禁用属性，移除之
    if (video.hasAttribute('disableRemotePlayback')) {
      video.removeAttribute('disableRemotePlayback');
    }
  };

  // 检测移动设备（在组件层级定义）- 参考ArtPlayer compatibility.js
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOSGlobal = /iPad|iPhone|iPod/i.test(userAgent) && !(window as any).MSStream;
  const isIOS13Global = isIOSGlobal || (userAgent.includes('Macintosh') && navigator.maxTouchPoints >= 1);
  const isMobileGlobal = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || isIOS13Global;

  // 内存压力检测和清理（针对移动设备）
  const checkMemoryPressure = async () => {
    // 仅在支持performance.memory的浏览器中执行
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      try {
        const memInfo = (performance as any).memory;
        const usedJSHeapSize = memInfo.usedJSHeapSize;
        const heapLimit = memInfo.jsHeapSizeLimit;
        
        // 计算内存使用率
        const memoryUsageRatio = usedJSHeapSize / heapLimit;
        
        console.log(`内存使用情况: ${(memoryUsageRatio * 100).toFixed(2)}% (${(usedJSHeapSize / 1024 / 1024).toFixed(2)}MB / ${(heapLimit / 1024 / 1024).toFixed(2)}MB)`);
        
        // 如果内存使用超过75%，触发清理
        if (memoryUsageRatio > 0.75) {
          console.warn('内存使用过高，清理缓存...');
          
          // 清理弹幕缓存
          try {
            // 清理统一存储中的弹幕缓存
            await ClientCache.clearExpired('danmu-cache');
            
            // 兜底清理localStorage中的弹幕缓存（兼容性）
            const oldCacheKey = 'lunatv_danmu_cache';
            localStorage.removeItem(oldCacheKey);
            console.log('弹幕缓存已清理');
          } catch (e) {
            console.warn('清理弹幕缓存失败:', e);
          }
          
          // 尝试强制垃圾回收（如果可用）
          if (typeof (window as any).gc === 'function') {
            (window as any).gc();
            console.log('已触发垃圾回收');
          }
          
          return true; // 返回真表示高内存压力
        }
      } catch (error) {
        console.warn('内存检测失败:', error);
      }
    }
    return false;
  };

  // 定期内存检查（仅在移动设备上）
  useEffect(() => {
    if (!isMobileGlobal) return;
    
    const memoryCheckInterval = setInterval(() => {
      // 异步调用内存检查，不阻塞定时器
      checkMemoryPressure().catch(console.error);
    }, 30000); // 每30秒检查一次
    
    return () => {
      clearInterval(memoryCheckInterval);
    };
  }, [isMobileGlobal]);
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request(
          'screen'
        );
        console.log('Wake Lock 已启用');
      }
    } catch (err) {
      console.warn('Wake Lock 请求失败:', err);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('Wake Lock 已释放');
      }
    } catch (err) {
      console.warn('Wake Lock 释放失败:', err);
    }
  };

  // 清理播放器资源的统一函数（添加更完善的清理逻辑）
  const cleanupPlayer = () => {
    // 🚀 新增：清理弹幕优化相关的定时器
    if (danmuOperationTimeoutRef.current) {
      clearTimeout(danmuOperationTimeoutRef.current);
      danmuOperationTimeoutRef.current = null;
    }
    
    if (episodeSwitchTimeoutRef.current) {
      clearTimeout(episodeSwitchTimeoutRef.current);
      episodeSwitchTimeoutRef.current = null;
    }
    
    // 清理弹幕状态引用
    danmuPluginStateRef.current = null;
    
    if (artPlayerRef.current) {
      try {
        // 1. 清理弹幕插件的WebWorker
        if (artPlayerRef.current.plugins?.artplayerPluginDanmuku) {
          const danmukuPlugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
          
          // 尝试获取并清理WebWorker
          if (danmukuPlugin.worker && typeof danmukuPlugin.worker.terminate === 'function') {
            danmukuPlugin.worker.terminate();
            console.log('弹幕WebWorker已清理');
          }
          
          // 清空弹幕数据
          if (typeof danmukuPlugin.reset === 'function') {
            danmukuPlugin.reset();
          }
        }

        // 2. 销毁HLS实例
        if (artPlayerRef.current.video.hls) {
          artPlayerRef.current.video.hls.destroy();
          console.log('HLS实例已销毁');
        }

        // 3. 销毁ArtPlayer实例 (使用false参数避免DOM清理冲突)
        artPlayerRef.current.destroy(false);
        artPlayerRef.current = null;

        console.log('播放器资源已清理');
      } catch (err) {
        console.warn('清理播放器资源时出错:', err);
        // 即使出错也要确保引用被清空
        artPlayerRef.current = null;
      }
    }
  };

  // 去广告相关函数
  function filterAdsFromM3U8(m3u8Content: string): string {
    if (!m3u8Content) return '';

    // 按行分割M3U8内容
    const lines = m3u8Content.split('\n');
    const filteredLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 只过滤#EXT-X-DISCONTINUITY标识
      if (!line.includes('#EXT-X-DISCONTINUITY')) {
        filteredLines.push(line);
      }
    }

    return filteredLines.join('\n');
  }

  const formatTime = (seconds: number): string => {
    if (seconds === 0) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.round(seconds % 60);

    if (hours === 0) {
      // 不到一小时，格式为 00:00
      return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
        .toString()
        .padStart(2, '0')}`;
    } else {
      // 超过一小时，格式为 00:00:00
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  };

  // 🚀 优化的弹幕操作处理函数（防抖 + 性能优化）
  const handleDanmuOperationOptimized = (nextState: boolean) => {
    // 清除之前的防抖定时器
    if (danmuOperationTimeoutRef.current) {
      clearTimeout(danmuOperationTimeoutRef.current);
    }
    
    // 立即更新UI状态（确保响应性）
    externalDanmuEnabledRef.current = nextState;
    setExternalDanmuEnabled(nextState);
    
    // 同步保存到localStorage（快速操作）
    try {
      localStorage.setItem('enable_external_danmu', String(nextState));
    } catch (e) {
      console.warn('localStorage设置失败:', e);
    }
    
    // 防抖处理弹幕数据操作（避免频繁切换时的性能问题）
    danmuOperationTimeoutRef.current = setTimeout(async () => {
      try {
        if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
          const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
          
          if (nextState) {
            // 开启弹幕：使用更温和的加载方式
            console.log('🚀 优化后开启外部弹幕...');
            
            // 使用requestIdleCallback优化性能（如果可用）
            const loadDanmu = async () => {
              const externalDanmu = await loadExternalDanmu();
              // 二次确认状态，防止快速切换导致的状态不一致
              if (externalDanmuEnabledRef.current && artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                plugin.load(externalDanmu);
                plugin.show();
                console.log('✅ 外部弹幕已优化加载:', externalDanmu.length, '条');
                
                if (artPlayerRef.current && externalDanmu.length > 0) {
                  artPlayerRef.current.notice.show = `已加载 ${externalDanmu.length} 条弹幕`;
                }
              }
            };
            
            // 使用 requestIdleCallback 或 setTimeout 来确保不阻塞主线程
            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(loadDanmu, { timeout: 1000 });
            } else {
              setTimeout(loadDanmu, 50);
            }
          } else {
            // 关闭弹幕：立即处理
            console.log('🚀 优化后关闭外部弹幕...');
            plugin.load(); // 不传参数，真正清空弹幕
            plugin.hide();
            console.log('✅ 外部弹幕已关闭');
            
            if (artPlayerRef.current) {
              artPlayerRef.current.notice.show = '外部弹幕已关闭';
            }
          }
        }
      } catch (error) {
        console.error('优化后弹幕操作失败:', error);
      }
    }, 300); // 300ms防抖延迟
  };

  // 加载外部弹幕数据（带缓存和防重复）
  const loadExternalDanmu = async (): Promise<any[]> => {
    if (!externalDanmuEnabledRef.current) {
      console.log('外部弹幕开关已关闭');
      return [];
    }
    
    // 生成当前请求的唯一标识
    const currentVideoTitle = videoTitle;
    const currentVideoYear = videoYear; 
    const currentVideoDoubanId = videoDoubanId;
    const currentEpisodeNum = currentEpisodeIndex + 1;
    const requestKey = `${currentVideoTitle}_${currentVideoYear}_${currentVideoDoubanId}_${currentEpisodeNum}`;
    
    // 🚀 优化加载状态检测：更智能的卡住检测
    const now = Date.now();
    const loadingState = danmuLoadingRef.current as any;
    const lastLoadTime = loadingState?.timestamp || 0;
    const lastRequestKey = loadingState?.requestKey || '';
    const isStuckLoad = now - lastLoadTime > 15000; // 降低到15秒超时
    const isSameRequest = lastRequestKey === requestKey;

    // 智能重复检测：区分真正的重复和卡住的请求
    if (loadingState?.loading && isSameRequest && !isStuckLoad) {
      console.log('⏳ 弹幕正在加载中，跳过重复请求');
      return [];
    }

    // 强制重置卡住的加载状态
    if (isStuckLoad && loadingState?.loading) {
      console.warn('🔧 检测到弹幕加载超时，强制重置 (15秒)');
      danmuLoadingRef.current = false;
    }

    // 设置新的加载状态，包含更多上下文信息
    danmuLoadingRef.current = {
      loading: true,
      timestamp: now,
      requestKey,
      source: currentSource,
      episode: currentEpisodeNum
    } as any;
    lastDanmuLoadKeyRef.current = requestKey;
    
    try {
      const params = new URLSearchParams();
      
      // 使用当前最新的state值而不是ref值
      const currentVideoTitle = videoTitle;
      const currentVideoYear = videoYear; 
      const currentVideoDoubanId = videoDoubanId;
      const currentEpisodeNum = currentEpisodeIndex + 1;
      
      if (currentVideoDoubanId && currentVideoDoubanId > 0) {
        params.append('douban_id', currentVideoDoubanId.toString());
      }
      if (currentVideoTitle) {
        params.append('title', currentVideoTitle);
      }
      if (currentVideoYear) {
        params.append('year', currentVideoYear);
      }
      if (currentEpisodeIndex !== null && currentEpisodeIndex >= 0) {
        params.append('episode', currentEpisodeNum.toString());
      }

      if (!params.toString()) {
        console.log('没有可用的参数获取弹幕');
        return [];
      }

      // 生成缓存键（使用state值确保准确性）
      const cacheKey = `${currentVideoTitle}_${currentVideoYear}_${currentVideoDoubanId}_${currentEpisodeNum}`;
      const now = Date.now();
      
      console.log('🔑 弹幕缓存调试信息:');
      console.log('- 缓存键:', cacheKey);
      console.log('- 当前时间:', now);
      console.log('- 视频标题:', currentVideoTitle);
      console.log('- 视频年份:', currentVideoYear);
      console.log('- 豆瓣ID:', currentVideoDoubanId);
      console.log('- 集数:', currentEpisodeNum);
      
      // 检查缓存
      console.log('🔍 检查弹幕缓存:', cacheKey);
      const cached = await getDanmuCacheItem(cacheKey);
      if (cached) {
        console.log('📦 找到缓存数据:');
        console.log('- 缓存时间:', cached.timestamp);
        console.log('- 时间差:', now - cached.timestamp, 'ms');
        console.log('- 缓存有效期:', DANMU_CACHE_DURATION * 1000, 'ms');
        console.log('- 是否过期:', (now - cached.timestamp) >= (DANMU_CACHE_DURATION * 1000));
        
        if ((now - cached.timestamp) < (DANMU_CACHE_DURATION * 1000)) {
          console.log('✅ 使用弹幕缓存数据，缓存键:', cacheKey);
          console.log('📊 缓存弹幕数量:', cached.data.length);
          return cached.data;
        }
      } else {
        console.log('❌ 未找到缓存数据');
      }

      console.log('开始获取外部弹幕，参数:', params.toString());
      const response = await fetch(`/api/danmu-external?${params}`);
      console.log('弹幕API响应状态:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('弹幕API请求失败:', response.status, errorText);
        return [];
      }

      const data = await response.json();
      console.log('外部弹幕API返回数据:', data);
      console.log('外部弹幕加载成功:', data.total || 0, '条');
      
      const finalDanmu = data.danmu || [];
      console.log('最终弹幕数据:', finalDanmu.length, '条');
      
      // 缓存结果
      console.log('💾 保存弹幕到统一存储:');
      console.log('- 缓存键:', cacheKey);
      console.log('- 弹幕数量:', finalDanmu.length);
      console.log('- 保存时间:', now);
      
      // 保存到统一存储
      await setDanmuCacheItem(cacheKey, finalDanmu);
      
      return finalDanmu;
    } catch (error) {
      console.error('加载外部弹幕失败:', error);
      console.log('弹幕加载失败，返回空结果');
      return [];
    } finally {
      // 重置加载状态
      danmuLoadingRef.current = false;
    }
  };

  // 🚀 优化的集数变化处理（防抖 + 状态保护）
  useEffect(() => {
    // 🔥 标记正在切换集数（只在非换源时）
    if (!isSourceChangingRef.current) {
      isEpisodeChangingRef.current = true;
      // 🔑 立即重置 SkipController 触发标志，允许新集数自动跳过片头片尾
      isSkipControllerTriggeredRef.current = false;
      videoEndedHandledRef.current = false;
      console.log('🔄 开始切换集数，重置自动跳过标志');
    }

    updateVideoUrl(detail, currentEpisodeIndex);

    // 🚀 如果正在换源，跳过弹幕处理（换源会在完成后手动处理）
    if (isSourceChangingRef.current) {
      console.log('⏭️ 正在换源，跳过弹幕处理');
      return;
    }

    // 🔥 关键修复：重置弹幕加载标识，确保新集数能正确加载弹幕
    lastDanmuLoadKeyRef.current = '';
    danmuLoadingRef.current = false; // 重置加载状态

    // 清除之前的集数切换定时器，防止重复执行
    if (episodeSwitchTimeoutRef.current) {
      clearTimeout(episodeSwitchTimeoutRef.current);
    }

    // 如果播放器已经存在且弹幕插件已加载，重新加载弹幕
    if (artPlayerRef.current && artPlayerRef.current.plugins?.artplayerPluginDanmuku) {
      console.log('🚀 集数变化，优化后重新加载弹幕');

      // 🔥 关键修复：立即清空当前弹幕，避免旧弹幕残留
      const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
      plugin.reset(); // 立即回收所有正在显示的弹幕DOM
      plugin.load(); // 不传参数，完全清空弹幕队列
      console.log('🧹 已清空旧弹幕数据');

      // 保存当前弹幕插件状态
      danmuPluginStateRef.current = {
        isHide: artPlayerRef.current.plugins.artplayerPluginDanmuku.isHide,
        isStop: artPlayerRef.current.plugins.artplayerPluginDanmuku.isStop,
        option: artPlayerRef.current.plugins.artplayerPluginDanmuku.option
      };
      
      // 使用防抖处理弹幕重新加载
      episodeSwitchTimeoutRef.current = setTimeout(async () => {
        try {
          // 确保播放器和插件仍然存在（防止快速切换时的状态不一致）
          if (!artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            console.warn('⚠️ 集数切换后弹幕插件不存在，跳过弹幕加载');
            return;
          }
          
          const externalDanmu = await loadExternalDanmu(); // 这里会检查开关状态
          console.log('🔄 集数变化后外部弹幕加载结果:', externalDanmu);
          
          // 再次确认插件状态
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
            
            if (externalDanmu.length > 0) {
              console.log('✅ 向播放器插件重新加载弹幕数据:', externalDanmu.length, '条');
              plugin.load(externalDanmu);
              
              // 恢复弹幕插件的状态
              if (danmuPluginStateRef.current) {
                if (!danmuPluginStateRef.current.isHide) {
                  plugin.show();
                }
              }
              
              if (artPlayerRef.current) {
                artPlayerRef.current.notice.show = `已加载 ${externalDanmu.length} 条弹幕`;
              }
            } else {
              console.log('📭 集数变化后没有弹幕数据可加载');
              plugin.load(); // 不传参数，确保清空弹幕

              if (artPlayerRef.current) {
                artPlayerRef.current.notice.show = '暂无弹幕数据';
              }
            }
          }
        } catch (error) {
          console.error('❌ 集数变化后加载外部弹幕失败:', error);
        } finally {
          // 清理定时器引用
          episodeSwitchTimeoutRef.current = null;
        }
      }, 800); // 缩短延迟时间，提高响应性
    }
  }, [detail, currentEpisodeIndex, videoTitle, videoYear, videoDoubanId]);

  // 进入页面时直接获取全部源信息
  useEffect(() => {
    const fetchSourceDetail = async (
      source: string,
      id: string
    ): Promise<SearchResult[]> => {
      try {
        let detailResponse;

        // 判断是否为短剧源
        if (source === 'shortdrama') {
          detailResponse = await fetch(
            `/api/shortdrama/detail?id=${id}&episode=1`
          );
        } else {
          detailResponse = await fetch(
            `/api/detail?source=${source}&id=${id}`
          );
        }

        if (!detailResponse.ok) {
          throw new Error('获取视频详情失败');
        }
        const detailData = (await detailResponse.json()) as SearchResult;
        setAvailableSources([detailData]);
        return [detailData];
      } catch (err) {
        console.error('获取视频详情失败:', err);
        return [];
      } finally {
        setSourceSearchLoading(false);
      }
    };
    const fetchSourcesData = async (query: string): Promise<SearchResult[]> => {
      // 使用智能搜索变体获取全部源信息
      try {
        console.log('开始智能搜索，原始查询:', query);
        const searchVariants = generateSearchVariants(query.trim());
        console.log('生成的搜索变体:', searchVariants);
        
        const allResults: SearchResult[] = [];
        let bestResults: SearchResult[] = [];
        
        // 依次尝试每个搜索变体，采用早期退出策略
        for (const variant of searchVariants) {
          console.log('尝试搜索变体:', variant);

          const response = await fetch(
            `/api/search?q=${encodeURIComponent(variant)}`
          );
          if (!response.ok) {
            console.warn(`搜索变体 "${variant}" 失败:`, response.statusText);
            continue;
          }
          const data = await response.json();

          if (data.results && data.results.length > 0) {
            allResults.push(...data.results);

            // 移除早期退出策略，让downstream的相关性评分发挥作用

            // 处理搜索结果，使用智能模糊匹配（与downstream评分逻辑保持一致）
            const filteredResults = data.results.filter(
              (result: SearchResult) => {
                const queryTitle = videoTitleRef.current.replaceAll(' ', '').toLowerCase();
                const resultTitle = result.title.replaceAll(' ', '').toLowerCase();

                // 智能标题匹配：支持数字变体和标点符号变化
                const titleMatch = resultTitle.includes(queryTitle) ||
                  queryTitle.includes(resultTitle) ||
                  // 移除数字和标点后匹配（针对"死神来了：血脉诅咒" vs "死神来了6：血脉诅咒"）
                  resultTitle.replace(/\d+|[：:]/g, '') === queryTitle.replace(/\d+|[：:]/g, '') ||
                  // 通用关键词匹配：检查是否包含查询中的所有关键词
                  checkAllKeywordsMatch(queryTitle, resultTitle);

                const yearMatch = videoYearRef.current
                  ? result.year.toLowerCase() === videoYearRef.current.toLowerCase()
                  : true;
                const typeMatch = searchType
                  ? (searchType === 'tv' && result.episodes.length > 1) ||
                    (searchType === 'movie' && result.episodes.length === 1)
                  : true;

                return titleMatch && yearMatch && typeMatch;
              }
            );

            if (filteredResults.length > 0) {
              console.log(`变体 "${variant}" 找到 ${filteredResults.length} 个精确匹配结果`);
              bestResults = filteredResults;
              break; // 找到精确匹配就停止
            }
          }
        }
        
        // 智能匹配：英文标题严格匹配，中文标题宽松匹配
        let finalResults = bestResults;

        // 如果没有精确匹配，根据语言类型进行不同策略的匹配
        if (bestResults.length === 0) {
          const queryTitle = videoTitleRef.current.toLowerCase().trim();
          const allCandidates = allResults;

          // 检测查询主要语言（英文 vs 中文）
          const englishChars = (queryTitle.match(/[a-z\s]/g) || []).length;
          const chineseChars = (queryTitle.match(/[\u4e00-\u9fff]/g) || []).length;
          const isEnglishQuery = englishChars > chineseChars;

          console.log(`搜索语言检测: ${isEnglishQuery ? '英文' : '中文'} - "${queryTitle}"`);

          let relevantMatches;

          if (isEnglishQuery) {
            // 英文查询：使用词汇匹配策略，避免不相关结果
            console.log('使用英文词汇匹配策略');

            // 提取有效英文词汇（过滤停用词）
            const queryWords = queryTitle.toLowerCase()
              .replace(/[^\w\s]/g, ' ')
              .split(/\s+/)
              .filter(word => word.length > 2 && !['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by'].includes(word));

            console.log('英文关键词:', queryWords);

            relevantMatches = allCandidates.filter(result => {
              const title = result.title.toLowerCase();
              const titleWords = title.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(word => word.length > 1);

              // 计算词汇匹配度：标题必须包含至少50%的查询关键词
              const matchedWords = queryWords.filter(queryWord =>
                titleWords.some(titleWord =>
                  titleWord.includes(queryWord) || queryWord.includes(titleWord) ||
                  // 允许部分相似（如gumball vs gum）
                  (queryWord.length > 4 && titleWord.length > 4 &&
                   queryWord.substring(0, 4) === titleWord.substring(0, 4))
                )
              );

              const wordMatchRatio = matchedWords.length / queryWords.length;
              if (wordMatchRatio >= 0.5) {
                console.log(`英文词汇匹配 (${matchedWords.length}/${queryWords.length}): "${result.title}" - 匹配词: [${matchedWords.join(', ')}]`);
                return true;
              }
              return false;
            });
          } else {
            // 中文查询：宽松匹配，保持现有行为
            console.log('使用中文宽松匹配策略');
            relevantMatches = allCandidates.filter(result => {
              const title = result.title.toLowerCase();
              const normalizedQuery = queryTitle.replace(/[^\w\u4e00-\u9fff]/g, '');
              const normalizedTitle = title.replace(/[^\w\u4e00-\u9fff]/g, '');

              // 包含匹配或50%相似度
              if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) {
                console.log(`中文包含匹配: "${result.title}"`);
                return true;
              }

              const commonChars = Array.from(normalizedQuery).filter(char => normalizedTitle.includes(char)).length;
              const similarity = commonChars / normalizedQuery.length;
              if (similarity >= 0.5) {
                console.log(`中文相似匹配 (${(similarity*100).toFixed(1)}%): "${result.title}"`);
                return true;
              }
              return false;
            });
          }

          console.log(`匹配结果: ${relevantMatches.length}/${allCandidates.length}`);

          const maxResults = isEnglishQuery ? 5 : 20; // 英文更严格控制结果数
          if (relevantMatches.length > 0 && relevantMatches.length <= maxResults) {
            finalResults = Array.from(
              new Map(relevantMatches.map(item => [`${item.source}-${item.id}`, item])).values()
            );
          } else {
            console.log('没有找到合理的匹配，返回空结果');
            finalResults = [];
          }
        }
          
        console.log(`智能搜索完成，最终返回 ${finalResults.length} 个结果`);
        setAvailableSources(finalResults);
        // 对最优源进行预连接
        preconnectTopSources(finalResults);
        return finalResults;
      } catch (err) {
        console.error('智能搜索失败:', err);
        setSourceSearchError(err instanceof Error ? err.message : '搜索失败');
        setAvailableSources([]);
        return [];
      } finally {
        setSourceSearchLoading(false);
      }
    };

    const initAll = async () => {
      if (shortdramaId) {
        try {
          setLoading(true);
          setLoadingStage('fetching');
          setLoadingMessage('🎬 正在获取短剧播放信息...');
          const shortDramaData = await fetchShortDramaData(shortdramaId);
          setCurrentSource(shortDramaData.source);
          setCurrentId(shortDramaData.id);
          setVideoTitle(shortDramaData.title);
          setVideoYear(shortDramaData.year);
          setVideoCover(shortDramaData.poster);
          setVideoDoubanId(shortDramaData.douban_id || 0);
          setDetail(shortDramaData);
          setAvailableSources([shortDramaData]);
          if (currentEpisodeIndex >= shortDramaData.episodes.length) {
            setCurrentEpisodeIndex(0);
          }
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('source', shortDramaData.source);
          newUrl.searchParams.set('id', shortDramaData.id);
          newUrl.searchParams.set('title', shortDramaData.title);
          newUrl.searchParams.set('year', shortDramaData.year);
          window.history.replaceState({}, '', newUrl.toString());
          setLoadingStage('ready');
          setLoadingMessage('✨ 短剧准备就绪，即将开始播放...');
          setTimeout(() => setLoading(false), 1000);
          return;
        } catch (error) {
          setError(error instanceof Error ? error.message : '短剧加载失败');
          setLoading(false);
          return;
        }
      }

      if (!currentSource && !currentId && !videoTitle && !searchTitle) {
        setError('缺少必要参数');
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadingStage(currentSource && currentId ? 'fetching' : 'searching');
      setLoadingMessage(
        currentSource && currentId
          ? '🎬 正在获取视频详情...'
          : '🔍 正在搜索播放源...'
      );

      let sourcesInfo: SearchResult[] = [];

      // 对于短剧，直接获取详情，跳过搜索
      if (currentSource === 'shortdrama' && currentId) {
        sourcesInfo = await fetchSourceDetail(currentSource, currentId);
      } else {
        // 其他情况先搜索
        sourcesInfo = await fetchSourcesData(searchTitle || videoTitle);
        if (
          currentSource &&
          currentId &&
          !sourcesInfo.some(
            (source) => source.source === currentSource && source.id === currentId
          )
        ) {
          sourcesInfo = await fetchSourceDetail(currentSource, currentId);
        }
      }
      if (sourcesInfo.length === 0) {
        setError('未找到匹配结果');
        setLoading(false);
        return;
      }

      let detailData: SearchResult = sourcesInfo[0];
      // 指定源和id且无需优选
      if (currentSource && currentId && !needPreferRef.current) {
        const target = sourcesInfo.find(
          (source) => source.source === currentSource && source.id === currentId
        );
        if (target) {
          detailData = target;
        } else {
          setError('未找到匹配结果');
          setLoading(false);
          return;
        }
      }

      // 未指定源和 id 或需要优选，且开启优选开关
      if (
        (!currentSource || !currentId || needPreferRef.current) &&
        optimizationEnabled
      ) {
        setLoadingStage('preferring');
        setLoadingMessage('⚡ 正在优选最佳播放源...');

        detailData = await preferBestSource(sourcesInfo);
      }

      console.log(detailData.source, detailData.id);

      setNeedPrefer(false);
      setCurrentSource(detailData.source);
      setCurrentId(detailData.id);
      setVideoYear(detailData.year);
      setVideoTitle(detailData.title || videoTitleRef.current);
      setVideoCover(detailData.poster);
      // 优先保留URL参数中的豆瓣ID，如果URL中没有则使用详情数据中的
      setVideoDoubanId(videoDoubanIdRef.current || detailData.douban_id || 0);
      setDetail(detailData);
      if (currentEpisodeIndex >= detailData.episodes.length) {
        setCurrentEpisodeIndex(0);
      }

      // 规范URL参数
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', detailData.source);
      newUrl.searchParams.set('id', detailData.id);
      newUrl.searchParams.set('year', detailData.year);
      newUrl.searchParams.set('title', detailData.title);
      newUrl.searchParams.delete('prefer');
      window.history.replaceState({}, '', newUrl.toString());

      setLoadingStage('ready');
      setLoadingMessage('✨ 准备就绪，即将开始播放...');

      // 短暂延迟让用户看到完成状态
      setTimeout(() => {
        setLoading(false);
      }, 1000);
    };

    initAll();
  }, []);

  // 播放记录和跳过配置处理
  useEffect(() => {
    // 仅在初次挂载时检查播放记录
    const initFromHistory = async () => {
      if (!currentSource || !currentId) return;

      try {
        const allRecords = await getAllPlayRecords();
        const key = generateStorageKey(currentSource, currentId);
        const record = allRecords[key];

        if (record) {
          const targetIndex = record.index - 1;
          const targetTime = record.play_time;

          // 更新当前选集索引
          if (targetIndex !== currentEpisodeIndex) {
            setCurrentEpisodeIndex(targetIndex);
          }

          // 保存待恢复的播放进度，待播放器就绪后跳转
          resumeTimeRef.current = targetTime;
        }
      } catch (err) {
        console.error('读取播放记录失败:', err);
      }
    };

  // 新增：加载跳过片头片尾配置的函数
  const initSkipConfig = async () => {
    if (!currentSource || !currentId) return;

    try {
      // 优先从 SkipController 的API获取，支持远程配置
      const response = await fetch(`/api/episode-skip-config?source=${currentSource}&id=${currentId}`);
      if (response.ok) {
          const config = await response.json();
          if (config && config.segments && config.segments.length > 0) {
              // 从segments推导出intro_time和outro_time
              const introSegment = config.segments.find((s: SkipSegment) => s.type === 'opening');
              const outroSegment = config.segments.find((s: SkipSegment) => s.type === 'ending');
              const isEnabled = config.segments.some((s: SkipSegment) => s.autoSkip);
              
              const uiConfig: UiAndDbSkipConfig = {
                ...config,
                enable: isEnabled,
                intro_time: introSegment ? introSegment.end : 0,
                outro_time: outroSegment ? (outroSegment.start - (artPlayerRef.current?.duration || 0)) : 0,
              };
              setSkipConfig(uiConfig);
              console.log('加载远程跳过配置成功:', uiConfig);
              return;
          }
      }

      // 如果API没有返回，再从本地IndexedDB存储获取
      const localConfig = await getSkipConfig(currentSource, currentId);
      if (localConfig) {
        // 从本地配置推导UI所需属性
        const introSegment = localConfig.segments.find(s => s.type === 'opening');
        const outroSegment = localConfig.segments.find(s => s.type === 'ending');
        const isEnabled = localConfig.segments.some(s => s.autoSkip);
        
        const uiConfig: UiAndDbSkipConfig = {
          ...localConfig,
          enable: isEnabled,
          intro_time: introSegment ? introSegment.end : 0,
          outro_time: outroSegment ? (outroSegment.start - (artPlayerRef.current?.duration || 0)) : 0,
        };
        setSkipConfig(uiConfig);
        console.log('加载本地跳过配置成功:', uiConfig);
      }
    } catch (err) {
      console.error('读取跳过片头片尾配置失败:', err);
    }
  };

    initFromHistory();
    initSkipConfig(); // 调用新增的函数
  }, []); // 依赖项为空，确保只在组件挂载时执行一次

  // 🚀 优化的换源处理（防连续点击）
  const handleSourceChange = async (
    newSource: string,
    newId: string,
    newTitle: string
  ) => {
    try {
      // 防止连续点击换源
      if (isSourceChangingRef.current) {
        console.log('⏸️ 正在换源中，忽略重复点击');
        return;
      }

      // 🚀 设置换源标识，防止useEffect重复处理弹幕
      isSourceChangingRef.current = true;

      // 显示换源加载状态
      setVideoLoadingStage('sourceChanging');
      setIsVideoLoading(true);

      // 🚀 立即重置弹幕相关状态，避免残留
      lastDanmuLoadKeyRef.current = '';
      danmuLoadingRef.current = false;

      // 清除弹幕操作定时器
      if (danmuOperationTimeoutRef.current) {
        clearTimeout(danmuOperationTimeoutRef.current);
        danmuOperationTimeoutRef.current = null;
      }
      if (episodeSwitchTimeoutRef.current) {
        clearTimeout(episodeSwitchTimeoutRef.current);
        episodeSwitchTimeoutRef.current = null;
      }

      // 🚀 正确地清空弹幕状态（基于ArtPlayer插件API）
      if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
        const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;

        try {
          // 🚀 正确清空弹幕：先reset回收DOM，再load清空队列
          if (typeof plugin.reset === 'function') {
            plugin.reset(); // 立即回收所有正在显示的弹幕DOM
          }

          if (typeof plugin.load === 'function') {
            // 关键：load()不传参数会触发清空逻辑（danmuku === undefined）
            plugin.load();
            console.log('✅ 已完全清空弹幕队列');
          }

          // 然后隐藏弹幕层
          if (typeof plugin.hide === 'function') {
            plugin.hide();
          }

          console.log('🧹 换源时已清空旧弹幕数据');
        } catch (error) {
          console.warn('清空弹幕时出错，但继续换源:', error);
        }
      }

      // 记录当前播放进度（仅在同一集数切换时恢复）
      const currentPlayTime = artPlayerRef.current?.currentTime || 0;
      console.log('换源前当前播放时间:', currentPlayTime);

      // 清除前一个历史记录
      if (currentSourceRef.current && currentIdRef.current) {
        try {
          await deletePlayRecord(
            currentSourceRef.current,
            currentIdRef.current
          );
          console.log('已清除前一个播放记录');
        } catch (err) {
          console.error('清除播放记录失败:', err);
        }
      }

      const newDetail = availableSources.find(
        (source) => source.source === newSource && source.id === newId
      );
      if (!newDetail) {
        setError('未找到匹配结果');
        return;
      }

      // 尝试跳转到当前正在播放的集数
      let targetIndex = currentEpisodeIndex;

      // 如果当前集数超出新源的范围，则跳转到第一集
      if (!newDetail.episodes || targetIndex >= newDetail.episodes.length) {
        targetIndex = 0;
      }

      // 如果仍然是同一集数且播放进度有效，则在播放器就绪后恢复到原始进度
      if (targetIndex !== currentEpisodeIndex) {
        resumeTimeRef.current = 0;
      } else if (
        (!resumeTimeRef.current || resumeTimeRef.current === 0) &&
        currentPlayTime > 1
      ) {
        resumeTimeRef.current = currentPlayTime;
      }

      // 更新URL参数（不刷新页面）
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', newSource);
      newUrl.searchParams.set('id', newId);
      newUrl.searchParams.set('year', newDetail.year);
      window.history.replaceState({}, '', newUrl.toString());

      setVideoTitle(newDetail.title || newTitle);
      setVideoYear(newDetail.year);
      setVideoCover(newDetail.poster);
      // 优先保留URL参数中的豆瓣ID，如果URL中没有则使用详情数据中的
      setVideoDoubanId(videoDoubanIdRef.current || newDetail.douban_id || 0);
      setCurrentSource(newSource);
      setCurrentId(newId);
      setDetail(newDetail);
      setCurrentEpisodeIndex(targetIndex);
      
      // 预加载下一个备选源
      const newSourceIndex = availableSources.findIndex(s => s.source === newSource && s.id === newId);
      if (newSourceIndex !== -1) {
        preloadNextSource(newSourceIndex, availableSources);
      }
      
      // 🚀 换源完成后，优化弹幕加载流程
      setTimeout(async () => {
        isSourceChangingRef.current = false; // 重置换源标识

        if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku && externalDanmuEnabledRef.current) {
          console.log('🔄 换源完成，开始优化弹幕加载...');

          // 确保状态完全重置
          lastDanmuLoadKeyRef.current = '';
          danmuLoadingRef.current = false;

          try {
            const startTime = performance.now();
            const danmuData = await loadExternalDanmu();

            if (danmuData.length > 0 && artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
              const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;

              // 🚀 确保在加载新弹幕前完全清空旧弹幕
              plugin.reset(); // 立即回收所有正在显示的弹幕DOM
              plugin.load(); // 不传参数，完全清空队列
              console.log('🧹 换源后已清空旧弹幕，准备加载新弹幕');

              // 🚀 优化大量弹幕的加载：分批处理，减少阻塞
              if (danmuData.length > 1000) {
                console.log(`📊 检测到大量弹幕 (${danmuData.length}条)，启用分批加载`);

                // 先加载前500条，快速显示
                const firstBatch = danmuData.slice(0, 500);
                plugin.load(firstBatch);

                // 剩余弹幕分批异步加载，避免阻塞
                const remainingBatches = [];
                for (let i = 500; i < danmuData.length; i += 300) {
                  remainingBatches.push(danmuData.slice(i, i + 300));
                }

                // 使用requestIdleCallback分批加载剩余弹幕
                remainingBatches.forEach((batch, index) => {
                  setTimeout(() => {
                    if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                      // 将批次弹幕追加到现有队列
                      batch.forEach(danmu => {
                        plugin.emit(danmu).catch(console.warn);
                      });
                    }
                  }, (index + 1) * 100); // 每100ms加载一批
                });

                console.log(`⚡ 分批加载完成: 首批${firstBatch.length}条 + ${remainingBatches.length}个后续批次`);
              } else {
                // 弹幕数量较少，正常加载
                plugin.load(danmuData);
                console.log(`✅ 换源后弹幕加载完成: ${danmuData.length} 条`);
              }

              const loadTime = performance.now() - startTime;
              console.log(`⏱️ 弹幕加载耗时: ${loadTime.toFixed(2)}ms`);
            } else {
              console.log('📭 换源后没有弹幕数据');
            }
          } catch (error) {
            console.error('❌ 换源后弹幕加载失败:', error);
          }
        }
      }, 1000); // 减少到1秒延迟，加快响应

    } catch (err) {
      // 重置换源标识
      isSourceChangingRef.current = false;

      // 隐藏换源加载状态
      setIsVideoLoading(false);
      setError(err instanceof Error ? err.message : '换源失败');
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, []);

  // 🚀 组件卸载时清理所有定时器和状态
  useEffect(() => {
    return () => {
      // 清理所有定时器
      if (danmuOperationTimeoutRef.current) {
        clearTimeout(danmuOperationTimeoutRef.current);
      }
      if (episodeSwitchTimeoutRef.current) {
        clearTimeout(episodeSwitchTimeoutRef.current);
      }
      if (sourceSwitchTimeoutRef.current) {
        clearTimeout(sourceSwitchTimeoutRef.current);
      }

      // 重置状态
      isSourceChangingRef.current = false;
      switchPromiseRef.current = null;
      pendingSwitchRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 集数切换
  // ---------------------------------------------------------------------------
  // 处理集数切换
  const handleEpisodeChange = (episodeNumber: number) => {
    setLongPressedTitle(null);
    setIsFadingOut(false); // 确保没有淡出动画在进行
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (fadeOutTimerRef.current) {
      clearTimeout(fadeOutTimerRef.current);
      fadeOutTimerRef.current = null;
    }
    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
      // 在更换集数前保存当前播放进度
      if (artPlayerRef.current && artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(episodeNumber);
    }
  };

  const handleLongPress = (title: string) => {
    // 清除任何现有计时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    if (fadeOutTimerRef.current) {
      clearTimeout(fadeOutTimerRef.current);
    }

    setIsFadingOut(false); // 确保新标题出现时不是淡出状态
    setLongPressedTitle(title); // 显示标题

    longPressTimerRef.current = setTimeout(() => {
      setIsFadingOut(true); // 触发淡出动画
      fadeOutTimerRef.current = setTimeout(() => {
        setLongPressedTitle(null); // 淡出动画完成后隐藏元素
        longPressTimerRef.current = null;
        fadeOutTimerRef.current = null;
        setIsFadingOut(false); // 重置状态以便下次使用
      }, 500); // 淡出动画的持续时间
    }, 2500); // 淡出动画开始前的延迟（总共3秒）
  };

  const handlePreviousEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx > 0) {
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(idx - 1);
    }
  };

  const handleNextEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx < d.episodes.length - 1) {
      // 🔥 关键修复：通过 SkipController 自动跳下一集时，不保存播放进度
      // 因为此时的播放位置是片尾，用户并没有真正看到这个位置
      // 如果保存了片尾的进度，下次"继续观看"会从片尾开始，导致进度错误
      // if (artPlayerRef.current && !artPlayerRef.current.paused) {
      //   saveCurrentPlayProgress();
      // }

      // 🔑 标记通过 SkipController 触发了下一集
      isSkipControllerTriggeredRef.current = true;
      setCurrentEpisodeIndex(idx + 1);
    }
  };

  // ---------------------------------------------------------------------------
  // 键盘快捷键
  // ---------------------------------------------------------------------------
  // 处理全局快捷键
  const handleKeyboardShortcuts = (e: KeyboardEvent) => {
    // 忽略输入框中的按键事件
    if (
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).tagName === 'TEXTAREA'
    )
      return;

    // Alt + 左箭头 = 上一集
    if (e.altKey && e.key === 'ArrowLeft') {
      if (detailRef.current && currentEpisodeIndexRef.current > 0) {
        handlePreviousEpisode();
        e.preventDefault();
      }
    }

    // Alt + 右箭头 = 下一集
    if (e.altKey && e.key === 'ArrowRight') {
      const d = detailRef.current;
      const idx = currentEpisodeIndexRef.current;
      if (d && idx < d.episodes.length - 1) {
        handleNextEpisode();
        e.preventDefault();
      }
    }

    // 左箭头 = 快退
    if (!e.altKey && e.key === 'ArrowLeft') {
      if (artPlayerRef.current && artPlayerRef.current.currentTime > 5) {
        artPlayerRef.current.currentTime -= 10;
        e.preventDefault();
      }
    }

    // 右箭头 = 快进
    if (!e.altKey && e.key === 'ArrowRight') {
      if (
        artPlayerRef.current &&
        artPlayerRef.current.currentTime < artPlayerRef.current.duration - 5
      ) {
        artPlayerRef.current.currentTime += 10;
        e.preventDefault();
      }
    }

    // 上箭头 = 音量+
    if (e.key === 'ArrowUp') {
      if (artPlayerRef.current && artPlayerRef.current.volume < 1) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume + 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `音量: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 下箭头 = 音量-
    if (e.key === 'ArrowDown') {
      if (artPlayerRef.current && artPlayerRef.current.volume > 0) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume - 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `音量: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 空格 = 播放/暂停
    if (e.key === ' ') {
      if (artPlayerRef.current) {
        artPlayerRef.current.toggle();
        e.preventDefault();
      }
    }

    // f 键 = 切换全屏
    if (e.key === 'f' || e.key === 'F') {
      if (artPlayerRef.current) {
        // 在 Electron 环境下使用系统级全屏
        if (typeof window !== 'undefined' && (window as any).electronAPI) {
          (async () => {
            try {
              const isFullScreen = await (window as any).electronAPI.isFullScreen();
              await (window as any).electronAPI.setFullScreen(!isFullScreen);
            } catch (err) {
              console.error('切换全屏失败:', err);
            }
          })();
        } else {
          // 非 Electron 环境使用网页全屏
          artPlayerRef.current.fullscreen = !artPlayerRef.current.fullscreen;
        }
        e.preventDefault();
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 播放记录相关
  // ---------------------------------------------------------------------------
  // 保存播放进度
  const saveCurrentPlayProgress = async () => {
    if (
      !artPlayerRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current ||
      !videoTitleRef.current ||
      !detailRef.current?.source_name
    ) {
      return;
    }

    const player = artPlayerRef.current;
    const currentTime = player.currentTime || 0;
    const duration = player.duration || 0;

    // 如果播放时间太短（少于5秒）或者视频时长无效，不保存
    if (currentTime < 1 || !duration) {
      return;
    }

    try {
      // 获取现有播放记录以保持原始集数
      const existingRecord = await getAllPlayRecords().then(records => {
        const key = generateStorageKey(currentSourceRef.current, currentIdRef.current);
        return records[key];
      }).catch(() => null);

      const currentTotalEpisodes = detailRef.current?.episodes.length || 1;

      // 尝试从换源列表中获取更准确的 remarks（搜索接口比详情接口更可能有 remarks）
      const sourceFromList = availableSourcesRef.current?.find(
        s => s.source === currentSourceRef.current && s.id === currentIdRef.current
      );
      const remarksToSave = sourceFromList?.remarks || detailRef.current?.remarks;

      await savePlayRecord(currentSourceRef.current, currentIdRef.current, {
        title: videoTitleRef.current,
        source_name: detailRef.current?.source_name || '',
        year: detailRef.current?.year,
        cover: detailRef.current?.poster || '',
        index: currentEpisodeIndexRef.current + 1, // 转换为1基索引
        total_episodes: currentTotalEpisodes,
        // 🔑 关键：不要在这里设置 original_episodes
        // 让 savePlayRecord 自己处理：
        // - 首次保存时会自动设置为 total_episodes
        // - 后续保存时会从数据库读取并保持不变
        // - 只有当用户看了新集数时才会更新
        // 这样避免了播放器传入错误的 original_episodes（可能是更新后的值）
        original_episodes: existingRecord?.original_episodes, // 只传递已有值，不自动填充
        play_time: Math.floor(currentTime),
        total_time: Math.floor(duration),
        save_time: Date.now(),
        search_title: searchTitle,
        remarks: remarksToSave, // 优先使用搜索结果的 remarks，因为详情接口可能没有
      });

      lastSaveTimeRef.current = Date.now();
      console.log('播放进度已保存:', {
        title: videoTitleRef.current,
        episode: currentEpisodeIndexRef.current + 1,
        year: detailRef.current?.year,
        progress: `${Math.floor(currentTime)}/${Math.floor(duration)}`,
      });
    } catch (err) {
      console.error('保存播放进度失败:', err);
    }
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 收藏相关
  // ---------------------------------------------------------------------------
  // 每当 source 或 id 变化时检查收藏状态
  useEffect(() => {
    if (!currentSource || !currentId) return;
    (async () => {
      try {
        const fav = await isFavorited(currentSource, currentId);
        setFavorited(fav);
      } catch (err) {
        console.error('检查收藏状态失败:', err);
      }
    })();
  }, [currentSource, currentId]);

  // 监听收藏数据更新事件
  useEffect(() => {
    if (!currentSource || !currentId) return;

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (favorites: Record<string, any>) => {
        const key = generateStorageKey(currentSource, currentId);
        const isFav = !!favorites[key];
        setFavorited(isFav);
      }
    );

    return unsubscribe;
  }, [currentSource, currentId]);

  // 自动更新收藏的集数信息（解决即将上映占位符数据问题）
  useEffect(() => {
    if (!detail || !favorited || !currentSource || !currentId) return;

    const updateFavoriteEpisodes = async () => {
      try {
        const realEpisodes = detail.episodes.length || 1;

        // 获取当前收藏的数据
        const favorites = await getAllFavorites();
        const key = `${currentSource}+${currentId}`;
        const currentFavorite = favorites[key];

        // 如果收藏的集数是占位符（99）或与真实集数不同，则更新
        if (currentFavorite && (currentFavorite.total_episodes === 99 || currentFavorite.total_episodes !== realEpisodes)) {
          console.log(`🔄 更新收藏集数: ${currentFavorite.total_episodes} → ${realEpisodes}`);

          await saveFavorite(currentSource, currentId, {
            title: videoTitleRef.current || detail.title,
            source_name: detail.source_name || currentFavorite.source_name || '',
            year: detail.year || currentFavorite.year || '',
            cover: detail.poster || currentFavorite.cover || '',
            total_episodes: realEpisodes, // 更新为真实集数
            save_time: currentFavorite.save_time || Date.now(), // 保持原收藏时间
            search_title: currentFavorite.search_title || searchTitle,
          });
        }
      } catch (err) {
        console.error('自动更新收藏集数失败:', err);
      }
    };

    updateFavoriteEpisodes();
  }, [detail, favorited, currentSource, currentId, searchTitle]);

  // 切换收藏
  const handleToggleFavorite = async () => {
    if (
      !videoTitleRef.current ||
      !detailRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current
    )
      return;

    try {
      if (favorited) {
        // 如果已收藏，删除收藏
        await deleteFavorite(currentSourceRef.current, currentIdRef.current);
        setFavorited(false);
      } else {
        // 根据 type_name 推断内容类型
        const contentType = inferTypeFromName(detailRef.current?.type_name, detailRef.current?.episodes.length);
        // 如果未收藏，添加收藏
        await saveFavorite(currentSourceRef.current, currentIdRef.current, {
          title: videoTitleRef.current,
          source_name: detailRef.current?.source_name || '',
          year: detailRef.current?.year,
          cover: detailRef.current?.poster || '',
          total_episodes: detailRef.current?.episodes.length || 1,
          save_time: Date.now(),
          search_title: searchTitle,
          type: contentType,
        });
        setFavorited(true);
      }
    } catch (err) {
      console.error('切换收藏失败:', err);
    }
  };

  useEffect(() => {
    // 异步初始化播放器，避免SSR问题
    const initPlayer = async () => {
      if (
        !Artplayer ||
        !Hls ||
        !artplayerPluginDanmuku ||
        !videoUrl ||
        loading ||
        currentEpisodeIndex === null ||
        !artRef.current
      ) {
        return;
      }

    // 确保选集索引有效
    if (
      !detail ||
      !detail.episodes ||
      currentEpisodeIndex >= detail.episodes.length ||
      currentEpisodeIndex < 0
    ) {
      setError(`选集索引无效，当前共 ${totalEpisodes} 集`);
      return;
    }

    if (!videoUrl) {
      setError('视频地址无效');
      return;
    }
    console.log(videoUrl);

    // 检测移动设备和浏览器类型 - 使用统一的全局检测结果
    const isSafari = /^(?:(?!chrome|android).)*safari/i.test(userAgent);
    const isIOS = isIOSGlobal;
    const isIOS13 = isIOS13Global;
    const isMobile = isMobileGlobal;
    const isWebKit = isSafari || isIOS;
    // Chrome浏览器检测 - 只有真正的Chrome才支持Chromecast
    // 排除各种厂商浏览器，即使它们的UA包含Chrome字样
    const isChrome = /Chrome/i.test(userAgent) && 
                    !/Edg/i.test(userAgent) &&      // 排除Edge
                    !/OPR/i.test(userAgent) &&      // 排除Opera
                    !/SamsungBrowser/i.test(userAgent) && // 排除三星浏览器
                    !/OPPO/i.test(userAgent) &&     // 排除OPPO浏览器
                    !/OppoBrowser/i.test(userAgent) && // 排除OppoBrowser
                    !/HeyTapBrowser/i.test(userAgent) && // 排除HeyTapBrowser (OPPO新版浏览器)
                    !/OnePlus/i.test(userAgent) &&  // 排除OnePlus浏览器
                    !/Xiaomi/i.test(userAgent) &&   // 排除小米浏览器
                    !/MIUI/i.test(userAgent) &&     // 排除MIUI浏览器
                    !/Huawei/i.test(userAgent) &&   // 排除华为浏览器
                    !/Vivo/i.test(userAgent) &&     // 排除Vivo浏览器
                    !/UCBrowser/i.test(userAgent) && // 排除UC浏览器
                    !/QQBrowser/i.test(userAgent) && // 排除QQ浏览器
                    !/Baidu/i.test(userAgent) &&    // 排除百度浏览器
                    !/SogouMobileBrowser/i.test(userAgent); // 排除搜狗浏览器

    // 调试信息：输出设备检测结果和投屏策略
    console.log('🔍 设备检测结果:', {
      userAgent,
      isIOS,
      isSafari,
      isMobile,
      isWebKit,
      isChrome,
      'AirPlay按钮': isIOS || isSafari ? '✅ 显示' : '❌ 隐藏',
      'Chromecast按钮': isChrome && !isIOS ? '✅ 显示' : '❌ 隐藏',
      '投屏策略': isIOS || isSafari ? '🍎 AirPlay (WebKit)' : isChrome ? '📺 Chromecast (Cast API)' : '❌ 不支持投屏'
    });

    // 🚀 优化连续切换：防抖机制 + 资源管理
    if (artPlayerRef.current && !loading) {
      try {
        // 清除之前的切换定时器
        if (sourceSwitchTimeoutRef.current) {
          clearTimeout(sourceSwitchTimeoutRef.current);
          sourceSwitchTimeoutRef.current = null;
        }

        // 如果有正在进行的切换，先取消
        if (switchPromiseRef.current) {
          console.log('⏸️ 取消前一个切换操作，开始新的切换');
          // ArtPlayer没有提供取消机制，但我们可以忽略旧的结果
          switchPromiseRef.current = null;
        }

        // 保存弹幕状态
        if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
          danmuPluginStateRef.current = {
            isHide: artPlayerRef.current.plugins.artplayerPluginDanmuku.isHide,
            isStop: artPlayerRef.current.plugins.artplayerPluginDanmuku.isStop,
            option: artPlayerRef.current.plugins.artplayerPluginDanmuku.option
          };
        }

        // 🚀 关键修复：区分换源和切换集数
        const isEpisodeChange = isEpisodeChangingRef.current;
        const currentTime = artPlayerRef.current.currentTime || 0;

        let switchPromise: Promise<any>;
        if (isEpisodeChange) {
          console.log(`🎯 开始切换集数: ${videoUrl} (重置播放时间到0)`);
          // 切换集数时重置播放时间到0
          switchPromise = artPlayerRef.current.switchUrl(videoUrl);
        } else {
          console.log(`🎯 开始切换源: ${videoUrl} (保持进度: ${currentTime.toFixed(2)}s)`);
          // 换源时保持播放进度
          switchPromise = artPlayerRef.current.switchQuality(videoUrl);
        }

        // 创建切换Promise
        switchPromise = switchPromise.then(() => {
          // 只有当前Promise还是活跃的才执行后续操作
          if (switchPromiseRef.current === switchPromise) {
            artPlayerRef.current.title = `${videoTitle} - 第${currentEpisodeIndex + 1}集`;
            artPlayerRef.current.poster = videoCover;
            console.log('✅ 源切换完成');

            // 🔥 重置集数切换标识
            if (isEpisodeChange) {
              // 🔑 关键修复：切换集数后显式重置播放时间为 0，确保片头自动跳过能触发
              artPlayerRef.current.currentTime = 0;
              console.log('🎯 集数切换完成，重置播放时间为 0');
              isEpisodeChangingRef.current = false;
            }
          }
        }).catch((error: any) => {
          if (switchPromiseRef.current === switchPromise) {
            console.warn('⚠️ 源切换失败，将重建播放器:', error);
            // 重置集数切换标识
            if (isEpisodeChange) {
              isEpisodeChangingRef.current = false;
            }
            throw error; // 让外层catch处理
          }
        });

        switchPromiseRef.current = switchPromise;
        await switchPromise;
        
        if (artPlayerRef.current?.video) {
          ensureVideoSource(
            artPlayerRef.current.video as HTMLVideoElement,
            videoUrl
          );
        }
        
        // 🚀 移除原有的 setTimeout 弹幕加载逻辑，交由 useEffect 统一优化处理
        
        console.log('使用switch方法成功切换视频');
        return;
      } catch (error) {
        console.warn('Switch方法失败，将重建播放器:', error);
        // 重置集数切换标识
        isEpisodeChangingRef.current = false;
        // 如果switch失败，清理播放器并重新创建
        cleanupPlayer();
      }
    }
    if (artPlayerRef.current) {
      cleanupPlayer();
    }

    // 确保 DOM 容器完全清空，避免多实例冲突
    if (artRef.current) {
      artRef.current.innerHTML = '';
    }

    try {
      // 创建自定义HLS加载器的工厂函数
      const createCustomHlsLoader = (HlsClass: any) => {
        if (!HlsClass || !HlsClass.DefaultConfig) {
          return null;
        }
        class CustomHlsJsLoader extends HlsClass.DefaultConfig.loader {
          constructor(config: any) {
            super(config);
            const load = this.load.bind(this);
            this.load = function (context: any, config: any, callbacks: any) {
              // 拦截manifest和level请求
              if (
                (context as any).type === 'manifest' ||
                (context as any).type === 'level'
              ) {
                const onSuccess = callbacks.onSuccess;
                callbacks.onSuccess = function (
                  response: any,
                  stats: any,
                  context: any
                ) {
                  // 如果是m3u8文件，处理内容以移除广告分段
                  if (response.data && typeof response.data === 'string') {
                    // 过滤掉广告段 - 实现更精确的广告过滤逻辑
                    response.data = filterAdsFromM3U8(response.data);
                  }
                  return onSuccess(response, stats, context, null);
                };
              }
              // 执行原始load方法
              load(context, config, callbacks);
            };
          }
        }
        return CustomHlsJsLoader;
      };

      // 使用动态导入的 Artplayer
      // const Artplayer = (window as any).DynamicArtplayer; // 不再需要，已从 state 获取
      // const artplayerPluginDanmuku = (window as any).DynamicArtplayerPluginDanmuku; // 不再需要，已从 state 获取

      // 创建新的播放器实例
      Artplayer.PLAYBACK_RATE = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
      Artplayer.USE_RAF = true;
      // 确保网页全屏在 body 元素上，避免布局问题
      Artplayer.FULLSCREEN_WEB_IN_BODY = true;
      // 重新启用5.3.0内存优化功能，但使用false参数避免清空DOM
      Artplayer.REMOVE_SRC_WHEN_DESTROY = true;

      const CustomLoader = blockAdEnabledRef.current 
              ? createCustomHlsLoader(Hls) 
              : null;

      // [整合] 从localStorage读取用户保存的设置
      const savedVolume = parseFloat(localStorage.getItem('artplayer_volume') || '0.7');
      const savedPlaybackRate = parseFloat(localStorage.getItem('artplayer_playbackRate') || '1');
      const savedQuality = JSON.parse(localStorage.getItem('artplayer_quality') || 'null');

      artPlayerRef.current = new Artplayer({
        container: artRef.current,
        url: videoUrl,
        poster: videoCover,
        volume: savedVolume, // [整合] 使用保存的音量
        isLive: false,
        // iOS设备需要静音才能自动播放，参考ArtPlayer源码处理
        muted: isIOS || isSafari,
        autoplay: true,
        pip: true,
        autoSize: false,
        autoMini: false,
        screenshot: false,
        setting: true,
        loop: false,
        flip: false,
        playbackRate: true,
        aspectRatio: false,
        fullscreen: true,
        fullscreenWeb: true,
        subtitleOffset: false,
        miniProgressBar: false,
        mutex: true,
        playsInline: true,
        autoPlayback: false,
        theme: '#22c55e',
        lang: 'zh-cn',
        hotkey: false,
        fastForward: true,
        autoOrientation: true,
        lock: true,
        // AirPlay 仅在支持 WebKit API 的浏览器中启用
        // 主要是 Safari (桌面和移动端) 和 iOS 上的其他浏览器
        airplay: isIOS || isSafari,
        moreVideoAttr: {
          crossOrigin: 'anonymous',
        },
        // HLS 支持配置
        customType: {
          m3u8: function (video: HTMLVideoElement, url: string) {
            if (!Hls) {
              console.error('HLS.js 未加载');
              return;
            }

            if (video.hls) {
              video.hls.destroy();
            }
            
            // 在函数内部重新检测iOS13+设备
            const localIsIOS13 = isIOS13;
            
            // 🚀 根据 HLS.js 官方源码的最佳实践配置
            const hls = new Hls({
              debug: false,
              enableWorker: true,
              // 参考 HLS.js config.ts：移动设备关闭低延迟模式以节省资源
              lowLatencyMode: !isMobile,
              
              // 🎯 官方推荐的缓冲策略 - iOS13+ 特别优化
              /* 缓冲长度配置 - 参考 hlsDefaultConfig */
              maxBufferLength: isMobile 
                ? (localIsIOS13 ? 8 : isIOS ? 10 : 15)  // iOS13+: 8s, iOS: 10s, Android: 15s
                : 30, // 桌面默认30s
              backBufferLength: isMobile 
                ? (localIsIOS13 ? 5 : isIOS ? 8 : 10)   // iOS13+更保守
                : Infinity, // 桌面使用无限回退缓冲

              /* 缓冲大小配置 - 基于官方 maxBufferSize */
              maxBufferSize: isMobile 
                ? (localIsIOS13 ? 20 * 1000 * 1000 : isIOS ? 30 * 1000 * 1000 : 40 * 1000 * 1000) // iOS13+: 20MB, iOS: 30MB, Android: 40MB
                : 60 * 1000 * 1000, // 桌面: 60MB (官方默认)

              /* 网络加载优化 - 参考 defaultLoadPolicy */
              maxLoadingDelay: isMobile ? (localIsIOS13 ? 2 : 3) : 4, // iOS13+设备更快超时
              maxBufferHole: isMobile ? (localIsIOS13 ? 0.05 : 0.1) : 0.1, // 减少缓冲洞容忍度
              
              /* Fragment管理 - 参考官方配置 */
              liveDurationInfinity: false, // 避免无限缓冲 (官方默认false)
              liveBackBufferLength: isMobile ? (localIsIOS13 ? 3 : 5) : null, // 已废弃，保持兼容

              /* 高级优化配置 - 参考 StreamControllerConfig */
              maxMaxBufferLength: isMobile ? (localIsIOS13 ? 60 : 120) : 600, // 最大缓冲长度限制
              maxFragLookUpTolerance: isMobile ? 0.1 : 0.25, // 片段查找容忍度
              
              /* ABR优化 - 参考 ABRControllerConfig */
              abrEwmaFastLive: isMobile ? 2 : 3, // 移动端更快的码率切换
              abrEwmaSlowLive: isMobile ? 6 : 9,
              abrBandWidthFactor: isMobile ? 0.8 : 0.95, // 移动端更保守的带宽估计
              
              /* 启动优化 */
              startFragPrefetch: !isMobile, // 移动端关闭预取以节省资源
              testBandwidth: !localIsIOS13, // iOS13+关闭带宽测试以快速启动
              
              /* Loader配置 - 参考官方 fragLoadPolicy */
              fragLoadPolicy: {
                default: {
                  maxTimeToFirstByteMs: isMobile ? 6000 : 10000,
                  maxLoadTimeMs: isMobile ? 60000 : 120000,
                  timeoutRetry: {
                    maxNumRetry: isMobile ? 2 : 4,
                    retryDelayMs: 0,
                    maxRetryDelayMs: 0,
                  },
                  errorRetry: {
                    maxNumRetry: isMobile ? 3 : 6,
                    retryDelayMs: 1000,
                    maxRetryDelayMs: isMobile ? 4000 : 8000,
                  },
                },
              },

              /* 自定义loader */
              loader: blockAdEnabledRef.current
                ? createCustomHlsLoader(Hls)
                : Hls.DefaultConfig.loader,
            });
            
            // 为HLS实例初始化重试计数器
            (hls as any).retryCount = 0;
            
            const proxyUrl = `/api/proxy/m3u8?url=${encodeURIComponent(
              url
            )}&moontv-source=${currentSourceRef.current}`;
            hls.loadSource(proxyUrl);
            hls.attachMedia(video);
            video.hls = hls;

            ensureVideoSource(video, url);

            hls.on(Hls.Events.ERROR, function (event: any, data: any) {
              console.error('HLS Error:', event, data);

              // v1.6.13 增强：处理片段解析错误（针对initPTS修复）
              if (data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR) {
                console.log('片段解析错误，尝试重新加载...');
                // 重新开始加载，利用v1.6.13的initPTS修复
                hls.startLoad();
                return;
              }

              // v1.6.13 增强：处理时间戳相关错误（直播回搜修复）
              if (data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR &&
                  data.err && data.err.message &&
                  data.err.message.includes('timestamp')) {
                console.log('时间戳错误，清理缓冲区并重新加载...');
                try {
                  // 清理缓冲区后重新开始，利用v1.6.13的时间戳包装修复
                  const currentTime = video.currentTime;
                  hls.trigger(Hls.Events.BUFFER_RESET, undefined);
                  hls.startLoad(currentTime);
                } catch (e) {
                  console.warn('缓冲区重置失败:', e);
                  hls.startLoad();
                }
                return;
              }
              
              const tryNextSource = () => {
                if (artPlayerRef.current) {
                  artPlayerRef.current.notice.show =
                    '当前源播放失败，正在尝试下一个...';
                }
                const currentIndex = availableSourcesRef.current.findIndex(
                  (s) =>
                    s.source === currentSourceRef.current &&
                    s.id === currentIdRef.current
                );

                // 将当前失败的源加入尝试过的集合
                const currentKey = `${currentSourceRef.current}-${currentIdRef.current}`;
                autoSwitchAttemptRef.current.add(currentKey);

                // 寻找下一个未尝试过的源
                let nextIndex = -1;
                for (let i = currentIndex + 1; i < availableSourcesRef.current.length; i++) {
                  const nextSource = availableSourcesRef.current[i];
                  const nextKey = `${nextSource.source}-${nextSource.id}`;
                  if (!autoSwitchAttemptRef.current.has(nextKey)) {
                    nextIndex = i;
                    break;
                  }
                }
                
                if (nextIndex !== -1) {
                  const nextSource = availableSourcesRef.current[nextIndex];
                  handleSourceChange(
                    nextSource.source,
                    nextSource.id,
                    nextSource.title
                  );
                } else {
                  if (artPlayerRef.current) {
                    artPlayerRef.current.notice.show = '所有播放源均尝试失败';
                  }
                  setError('所有可用播放源均无法播放');
                  // 重置尝试记录，以便用户可以手动重试
                  autoSwitchAttemptRef.current.clear();
                }
              };
              
              if (data.fatal) {
                const retryLimit = 3;
                (hls as any).retryCount = (hls as any).retryCount || 0;

                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    if ((hls as any).retryCount < retryLimit) {
                      console.log(`网络错误，尝试恢复... (第 ${(hls as any).retryCount + 1} 次)`);
                      (hls as any).retryCount++;
                      hls.startLoad();
                    } else {
                      console.log('网络错误恢复失败，尝试切换到下一个播放源...');
                      tryNextSource();
                    }
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    if ((hls as any).retryCount < retryLimit) {
                      console.log(`媒体错误，尝试恢复... (第 ${(hls as any).retryCount + 1} 次)`);
                      (hls as any).retryCount++;
                      hls.recoverMediaError();
                    } else {
                      console.log('媒体错误恢复失败，尝试切换到下一个播放源...');
                      tryNextSource();
                    }
                    break;
                  default:
                    console.log('无法恢复的错误，尝试切换播放源');
                    tryNextSource();
                    break;
                }
              }
            });
          },
        },
        icons: {
          loading:
            '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCIgdmlld0JveD0iMCAwIDUwIDUwIj48cGF0aCBkPSJNMjUuMjUxIDYuNDYxYy0xMC4zMTggMC0xOC42ODMgOC4zNjUtMTguNjgzIDE4LjY4M2g0LjA2OGMwLTguMDcgNi41NDUtMTQuNjE1IDE0LjYxNS0xNC42MTVWNi40NjF6IiBmaWxsPSIjMDA5Njg4Ij48YW5pbWF0ZVRyYW5zZm9ybSBhdHRyaWJ1dGVOYW1lPSJ0cmFuc2Zvcm0iIGF0dHJpYnV0ZVR5cGU9IlhNTCIgZHVyPSIxcyIgZnJvbT0iMCAyNSAyNSIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiIHRvPSIzNjAgMjUgMjUiIHR5cGU9InJvdGF0ZSIvPjwvcGF0aD48L3N2Zz4=">',
        },
        settings: [
          {
            html: '去广告',
            icon: '<text x="50%" y="50%" font-size="20" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">AD</text>',
            tooltip: blockAdEnabled ? '已开启' : '已关闭',
            onClick() {
              const newVal = !blockAdEnabled;
              try {
                localStorage.setItem('enable_blockad', String(newVal));
                if (artPlayerRef.current) {
                  resumeTimeRef.current = artPlayerRef.current.currentTime;
                  if (
                    artPlayerRef.current.video &&
                    artPlayerRef.current.video.hls
                  ) {
                    artPlayerRef.current.video.hls.destroy();
                  }
                  artPlayerRef.current.destroy();
                  artPlayerRef.current = null;
                }
                setBlockAdEnabled(newVal);
              } catch (_){
                // ignore
              }
              return newVal ? '当前开启' : '当前关闭';
            },
          },

          // 跳过片头片尾设置
          {
            name: '跳过片头片尾',
            html: '跳过片头片尾',
            switch: skipConfigRef.current?.enable,
            onSwitch: function (item: any) {
              if (skipConfigRef.current) {
                const newConfig = {
                  ...skipConfigRef.current,
                  enable: !item.switch,
                };
                handleSkipConfigChange(newConfig);
              }
              return !item.switch;
            },
          },
          {
            html: '删除跳过配置',
            onClick: function () {
              if (skipConfigRef.current) {
                handleSkipConfigChange({
                  ...skipConfigRef.current,
                  enable: false,
                  intro_time: 0,
                  outro_time: 0,
                });
              }
              return '';
            },
          },
          {
            name: '设置片头',
            html: '设置片头',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2" fill="#ffffff"/><path d="M9 12L17 12" stroke="#ffffff" stroke-width="2"/><path d="M17 6L17 18" stroke="#ffffff" stroke-width="2"/></svg>',
            tooltip:
              skipConfigRef.current?.intro_time === 0
                ? '设置片头时间'
                : `${formatTime(skipConfigRef.current?.intro_time || 0)}`,
            onClick: function () {
              const currentTime = artPlayerRef.current?.currentTime || 0;
              if (currentTime > 0 && skipConfigRef.current) {
                const newConfig = {
                  ...skipConfigRef.current,
                  intro_time: currentTime,
                };
                handleSkipConfigChange(newConfig);
                return `${formatTime(currentTime)}`;
              }
            },
          },
          {
            name: '设置片尾',
            html: '设置片尾',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 6L7 18" stroke="#ffffff" stroke-width="2"/><path d="M7 12L15 12" stroke="#ffffff" stroke-width="2"/><circle cx="19" cy="12" r="2" fill="#ffffff"/></svg>',
            tooltip:
              (skipConfigRef.current?.outro_time || 0) >= 0
                ? '设置片尾时间'
                : `-${formatTime(-(skipConfigRef.current?.outro_time || 0))}`,
            onClick: function () {
              const outroTime =
                -(
                  artPlayerRef.current?.duration -
                  artPlayerRef.current?.currentTime
                ) || 0;
              if (outroTime < 0 && skipConfigRef.current) {
                const newConfig = {
                  ...skipConfigRef.current,
                  outro_time: outroTime,
                };
                handleSkipConfigChange(newConfig);
                return `-${formatTime(-outroTime)}`;
              }
            },
          },
          {
            html: '下载弹幕',
            tooltip: '下载当前弹幕为XML文件',
            onClick: async () => {
              const plugin = getDanmakuPlugin();
              if (plugin && plugin.danmus && plugin.danmus.length > 0) {
                try {
                  const xmlContent = artplayerPluginDanmuku.utils.parseToXml(plugin.danmus);
                  const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  const title = videoTitleRef.current || 'danmaku';
                  const episode = currentEpisodeIndexRef.current + 1;
                  a.href = url;
                  a.download = `${title}_EP${episode}.xml`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  showPlayerNotice('弹幕下载成功', 2000);
                } catch (err) {
                  showPlayerNotice('弹幕下载失败', 2000);
                  console.error('弹幕下载失败:', err);
                }
              } else {
                showPlayerNotice('当前没有弹幕可下载', 2000);
              }
              return ' '; // 返回非空字符串以关闭设置面板
            }
          },
          {
            html: '弹幕合并',
            tooltip: danmakuMergeEnabled ? '已开启' : '已关闭',
            switch: danmakuMergeEnabled,
            onSwitch: function (item: any) {
              const newState = !item.switch;
              try {
                localStorage.setItem('danmaku_merge_enabled', String(newState));
                showPlayerNotice(`弹幕合并已${newState ? '开启' : '关闭'}`, 1500);
                // 刷新页面以应用新状态
                setTimeout(() => {
                  window.location.reload();
                }, 500);
              } catch (e) {
                console.error('[DanmuTV] 保存弹幕合并开关失败:', e);
                showPlayerNotice('切换失败', 1500);
              }
              return newState;
            },
          },
          {
            html: '合并窗口',
            tooltip: `${danmakuMergeWindow}秒`,
            onClick: async function () {
              const val = await showInputDialog(
                '合并窗口时长（秒）\n在此时间内的相同弹幕将被合并',
                String(danmakuMergeWindow)
              );
              if (val === null) return;
              
              const n = Math.max(1, Number(val) || 5);
              try {
                localStorage.setItem('danmaku_merge_window', String(n));
                const mergeEnabled = localStorage.getItem('danmaku_merge_enabled') === 'true';
                if (mergeEnabled) {
                  showPlayerNotice(`合并窗口已设为 ${n} 秒，正在刷新...`, 1500);
                  setTimeout(() => {
                    window.location.reload();
                  }, 500);
                } else {
                  showPlayerNotice(`合并窗口已设为 ${n} 秒`, 1500);
                }
              } catch (e) {
                console.error('[DanmuTV] 保存合并窗口失败:', e);
                showPlayerNotice('设置失败', 1500);
              }
            },
          },
        ],
        // 控制栏配置
        controls: [
          {
            position: 'left',
            index: 13,
            html: '<i class="art-icon flex"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg></i>',
            tooltip: '播放下一集',
            click: function () {
              handleNextEpisode();
            },
          },

          // 新增：外部弹幕开关按钮（TV-弹 图标）
          {
            name: 'external-danmaku-toggle',
            position: 'right',
            html: `
                <svg width="24" height="24" viewBox="0 0 24 24" style="position: relative;">
                    <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" fill="${externalDanmuEnabled ? '#22c55e' : 'currentColor'}"></path>
                    <text x="12" y="14" font-size="8" font-weight="bold" text-anchor="middle" fill="${externalDanmuEnabled ? '#FFFFFF' : '#AAAAAA'}">弹</text>
                </svg>
            `,
            tooltip: externalDanmuEnabled ? '关闭外部弹幕' : '开启外部弹幕',
            click: function (control: any) {
              const nextState = !externalDanmuEnabledRef.current;
              // 使用优化函数处理弹幕开关逻辑
              handleDanmuOperationOptimized(nextState);

              // 动态更新按钮UI
              control.tooltip = nextState ? '关闭外部弹幕' : '开启外部弹幕';
              control.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" style="position: relative;">
                    <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" fill="${nextState ? '#22c55e' : 'currentColor'}"></path>
                    <text x="12" y="14" font-size="8" font-weight="bold" text-anchor="middle" fill="${nextState ? '#FFFFFF' : '#AAAAAA'}">弹</text>
                </svg>
              `;
            },
          },

          // 升级：集成高级设置的“发送弹幕”按钮
          {
            name: 'danmaku-settings',
            position: 'right',
            html: `
              <div class="art-danmaku-settings-wrapper" style="position: relative;">
                <span style="font-size: 16px; font-weight: bold;">弹</span>
                <div class="art-danmaku-menu" style="
                  display: none;
                  position: absolute;
                  bottom: 100%;
                  right: 0;
                  margin-bottom: 10px;
                  background: rgba(0, 0, 0, 0.9);
                  border-radius: 4px;
                  padding: 5px 0;
                  min-width: 200px;
                  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                  z-index: 100;
                ">
                  <div class="art-danmaku-menu-item" data-action="load" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #fff;">加载弹幕</div>
                  <div class="art-danmaku-menu-item" data-action="offset-left-1" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #fff;">对轴 - 左1秒</div>
                  <div class="art-danmaku-menu-item" data-action="offset-left-5" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #fff;">对轴 - 左5秒</div>
                  <div class="art-danmaku-menu-item" data-action="offset-right-1" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #fff;">对轴 - 右1秒</div>
                  <div class="art-danmaku-menu-item" data-action="offset-right-5" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #fff;">对轴 - 右5秒</div>
                  <div class="art-danmaku-menu-item" data-action="keywords" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #fff;">关键词屏蔽</div>
                  <div class="art-danmaku-menu-item" data-action="density" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #fff;">密度限制(条/秒)</div>
                  <div class="art-danmaku-menu-item" data-action="toggle-merge" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #fff;">弹幕合并: ${danmakuMergeEnabled ? '已开启' : '已关闭'}</div>
                  <div class="art-danmaku-menu-item" data-action="merge-window" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #fff;">合并窗口(秒)</div>
                  <div class="art-danmaku-menu-item" data-action="apply-filter" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #fff;">应用当前过滤规则</div>
                  <div class="art-danmaku-menu-item" data-action="send" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #ff5722;">发送弹幕</div>
                  <div class="art-danmaku-menu-item" data-action="settings" style="padding: 8px 16px; cursor: pointer; white-space: nowrap; font-size: 14px; color: #fff;">弹幕设置</div>
                </div>
              </div>
            `,
            tooltip: '点击发送 / 悬停设置',
            // 修正：新增 click 事件处理函数，用于发送弹幕
            click: function () {
              const plugin = getDanmakuPlugin();
              
              // 检查弹幕是否已开启且可见
              if (plugin && !plugin.isHide) {
                // 如果弹幕可见，则点击行为是“发送弹幕”
                // 调用插件自带的输入框
                if (plugin.emitter && typeof plugin.emitter.show === 'function') {
                  plugin.emitter.show();
                } else {
                  // 备用方案
                  showInputDialog('请输入弹幕内容:').then(text => {
                    if (text && text.trim()) {
                      plugin.emit({
                        text: text.trim(),
                        color: '#fff',
                        border: false,
                      });
                      showPlayerNotice('弹幕发送成功!');
                    }
                  });
                }
              } else if (plugin) {
                // 如果弹幕已加载但被隐藏了，则点击行为是“显示弹幕”
                plugin.show();
                // 可以在显示后给用户一个提示
                showPlayerNotice('弹幕已显示，再次点击可发送', 2000);
              } else {
                // 如果弹幕功能根本没加载
                showPlayerNotice('请先从弹幕菜单加载弹幕', 2000);
              }
            },
            mounted: function (element: HTMLElement) {
              const wrapper = element.querySelector('.art-danmaku-settings-wrapper');
              const menu = element.querySelector('.art-danmaku-menu') as HTMLElement;
              if (!wrapper || !menu) return;

              let hideTimeout: any = null;

              const showMenu = () => {
                if (hideTimeout) clearTimeout(hideTimeout);
                const mergeItem = menu.querySelector('[data-action="toggle-merge"]');
                if (mergeItem) {
                  try {
                    const currentMergeState = localStorage.getItem('danmaku_merge_enabled') === 'true';
                    mergeItem.textContent = `弹幕合并: ${currentMergeState ? '已开启' : '已关闭'}`;
                  } catch (e) { console.warn('读取合并状态失败', e); }
                }
                menu.style.display = 'block';
              };

              const hideMenu = () => {
                hideTimeout = setTimeout(() => { menu.style.display = 'none'; }, 200);
              };

              wrapper.addEventListener('mouseenter', showMenu);
              wrapper.addEventListener('mouseleave', hideMenu);
              menu.addEventListener('mouseenter', showMenu);
              menu.addEventListener('mouseleave', hideMenu);

              menu.querySelectorAll('.art-danmaku-menu-item').forEach(item => {
                item.addEventListener('mouseenter', () => { (item as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; });
                item.addEventListener('mouseleave', () => { (item as HTMLElement).style.backgroundColor = 'transparent'; });
              });

              menu.addEventListener('click', async (e) => {
                e.stopPropagation(); // 阻止事件冒泡到父按钮
                const target = e.target as HTMLElement;
                if (!target.classList.contains('art-danmaku-menu-item')) return;
                const action = target.getAttribute('data-action');
                if (hideTimeout) clearTimeout(hideTimeout);
                menu.style.display = 'none';

                const plugin = getDanmakuPlugin();

                switch (action) {
                  case 'send':
                    if (plugin && !plugin.isHide) {
                      if (plugin.emitter && typeof plugin.emitter.show === 'function') {
                        plugin.emitter.show();
                      }
                    } else {
                      showPlayerNotice('请先开启并加载弹幕', 2000);
                    }
                    break;
                  case 'load':
                    if (!danmakuEnabled) setDanmakuEnabled(true);
                    setDanmakuPanelOpen(true);
                    break;
                  case 'offset-left-1': case 'offset-left-5': case 'offset-right-1': case 'offset-right-5':
                    const offsetMap: Record<string, number> = {'offset-left-1': -1, 'offset-left-5': -5, 'offset-right-1': 1, 'offset-right-5': 5};
                    const offset = offsetMap[action];
                    const newOffset = danmakuOffset + offset;
                    setDanmakuOffset(newOffset);
                    if (plugin) {
                      plugin.config.offset = newOffset;
                      if (typeof plugin.update === 'function') plugin.update();
                      showPlayerNotice(`弹幕对轴：${newOffset}秒`, 1500);
                    }
                    break;
                  case 'keywords': {
                    const currentKeywords = danmakuKeywords.split(/[,\n;\s]+/).filter(Boolean).join(', ');
                    const promptText = currentKeywords ? `当前屏蔽关键词：\n${currentKeywords}\n\n请修改（用逗号/空格/分号/换行分隔）：` : '请输入要屏蔽的关键词（用逗号/空格/分号/换行分隔）：';
                    const keywords = await showInputDialog(promptText, danmakuKeywords);
                    if (keywords === null) break;
                    setDanmakuKeywords(keywords);
                    try { localStorage.setItem('danmaku_keywords', keywords); } catch (e) { console.error('保存关键词失败:', e); }
                    await reloadDanmakuWithFilter(keywords, danmakuLimitPerSec);
                    if (!keywords.trim()) showPlayerNotice('已清空关键词屏蔽', 1500);
                    break;
                  }
                  case 'density': {
                    const val = await showInputDialog('每秒最大弹幕数(0 表示不限)', String(danmakuLimitPerSec));
                    if (val === null) break;
                    const n = Math.max(0, Number(val) || 0);
                    setDanmakuLimitPerSec(n);
                    try { localStorage.setItem('danmaku_limit_per_sec', String(n)); } catch (e) { console.error('保存密度限制失败:', e); }
                    await reloadDanmakuWithFilter(danmakuKeywords, n);
                    break;
                  }
                  case 'apply-filter':
                    await reloadDanmakuWithFilter();
                    break;
                  case 'toggle-merge': {
                    let currentState = false;
                    try { currentState = localStorage.getItem('danmaku_merge_enabled') === 'true'; } catch (e) { console.warn('读取合并状态失败', e); }
                    const newState = !currentState;
                    try {
                      localStorage.setItem('danmaku_merge_enabled', String(newState));
                      showPlayerNotice(`弹幕合并已${newState ? '开启' : '关闭'}，正在刷新...`, 1500);
                      setTimeout(() => { window.location.reload(); }, 500);
                    } catch (e) { showPlayerNotice('切换失败', 1500); }
                    break;
                  }
                  case 'merge-window': {
                    const val = await showInputDialog('合并窗口时长（秒）', String(danmakuMergeWindow));
                    if (val === null) break;
                    const n = Math.max(1, Number(val) || 5);
                    try {
                      localStorage.setItem('danmaku_merge_window', String(n));
                      const mergeEnabled = localStorage.getItem('danmaku_merge_enabled') === 'true';
                      if (mergeEnabled) {
                        showPlayerNotice(`合并窗口已设为 ${n} 秒，正在刷新...`, 1500);
                        setTimeout(() => { window.location.reload(); }, 500);
                      } else { showPlayerNotice(`合并窗口已设为 ${n} 秒`, 1500); }
                    } catch (e) { showPlayerNotice('设置失败', 1500); }
                    break;
                  }
                  case 'settings': {
                    // 触发 artplayer-plugin-danmuku 自带的设置面板
                    const danmakuConfigButton = artRef.current?.querySelector('.artplayer-plugin-danmuku .apd-config');
                    if (danmakuConfigButton instanceof HTMLElement) {
                      danmakuConfigButton.click();
                    } else {
                      showPlayerNotice('无法打开弹幕设置', 2000);
                    }
                    break;
                  }
                }
              });
            },
          },
        ],
        // 🚀 性能优化的弹幕插件配置 - 保持弹幕数量，优化渲染性能
        plugins: [
          artplayerPluginDanmuku((() => {
            // 🎯 设备性能检测
            const getDevicePerformance = () => {
              const hardwareConcurrency = navigator.hardwareConcurrency || 2
              const memory = (performance as any).memory?.jsHeapSizeLimit || 0
              
              // 简单性能评分（0-1）
              let score = 0
              score += Math.min(hardwareConcurrency / 4, 1) * 0.5 // CPU核心数权重
              score += Math.min(memory / (1024 * 1024 * 1024), 1) * 0.3 // 内存权重
              score += (isMobile ? 0.2 : 0.5) * 0.2 // 设备类型权重
              
              if (score > 0.7) return 'high'
              if (score > 0.4) return 'medium' 
              return 'low'
            }
            
            const devicePerformance = getDevicePerformance()
            console.log(`🎯 设备性能等级: ${devicePerformance}`)
            
            // 🚀 激进性能优化：针对大量弹幕的渲染策略
            const getOptimizedConfig = () => {
              const baseConfig = {
                danmuku: [], // 初始为空数组，后续通过load方法加载
                speed: parseInt(localStorage.getItem('danmaku_speed') || '6'),
                opacity: parseFloat(localStorage.getItem('danmaku_opacity') || '0.8'),
                fontSize: parseInt(localStorage.getItem('danmaku_fontSize') || '25'),
                color: '#FFFFFF',
                mode: 0 as const,
                modes: JSON.parse(localStorage.getItem('danmaku_modes') || '[0, 1, 2]') as Array<0 | 1 | 2>,
                margin: JSON.parse(localStorage.getItem('danmaku_margin') || '[10, "75%"]') as [number | `${number}%`, number | `${number}%`],
                visible: localStorage.getItem('danmaku_visible') !== 'false',
                emitter: true, // 启用弹幕发送
                maxLength: 50,
                lockTime: 1, // 🎯 进一步减少锁定时间，提升进度跳转响应
                theme: 'dark' as const,
                width: 300,
                placeholder: '发个弹幕呗~', // 发送框提示文字
                beforeEmit: async (danmu: any) => {
                  try {
                    // 生成当前视频唯一的ID用于弹幕存储
                    const videoId = `${currentSourceRef.current}_${currentIdRef.current}_${currentEpisodeIndexRef.current}`;
                    const response = await fetch('/api/danmu-external', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        videoId,
                        text: danmu.text,
                        color: danmu.color || '#FFFFFF',
                        mode: danmu.mode || 0,
                        time: artPlayerRef.current?.currentTime || 0
                      }),
                    });

                    if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.error || '发送弹幕失败');
                    }
                    
                    if (artPlayerRef.current?.notice) {
                      artPlayerRef.current.notice.show = '✅ 弹幕发送成功！';
                    }

                    // 返回弹幕对象让插件自动处理，并稍微延迟一点时间避免重叠
                    return {
                      ...danmu,
                      time: (artPlayerRef.current?.currentTime || 0) + 0.5,
                    };
                  } catch (error) {
                    console.error('发送弹幕失败:', error);
                    if (artPlayerRef.current?.notice) {
                      artPlayerRef.current.notice.show = '❌ 发送弹幕失败：' + (error as any).message;
                    }
                    throw error; // 抛出错误以阻止弹幕在本地显示
                  }
                },

                // 🎯 激进优化配置 - 保持功能完整性
                antiOverlap: devicePerformance === 'high', // 只有高性能设备开启防重叠，避免重叠计算
                synchronousPlayback: true, // ✅ 必须保持true！确保弹幕与视频播放速度同步
                heatmap: false, // 关闭热力图，减少DOM计算开销
                
                // 🧠 智能过滤器 - 激进性能优化，过滤影响性能的弹幕
                filter: (danmu: any) => {
                  // 基础验证
                  if (!danmu.text || !danmu.text.trim()) return false

                  const text = danmu.text.trim();

                  // 🔥 激进长度限制，减少DOM渲染负担
                  if (text.length > 50) return false // 从100改为50，更激进
                  if (text.length < 2) return false  // 过短弹幕通常无意义

                  // 🔥 激进特殊字符过滤，避免复杂渲染
                  const specialCharCount = (text.match(/[^\u4e00-\u9fa5a-zA-Z0-9\s.,!?；，。！？]/g) || []).length
                  if (specialCharCount > 5) return false // 从10改为5，更严格

                  // 🔥 过滤纯数字或纯符号弹幕，减少无意义渲染
                  if (/^\d+$/.test(text)) return false
                  if (/^[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+$/.test(text)) return false

                  // 🔥 过滤常见低质量弹幕，提升整体质量
                  const lowQualityPatterns = [
                    /^666+$/, /^好+$/, /^哈+$/, /^啊+$/,
                    /^[!！.。？?]+$/, /^牛+$/, /^强+$/
                  ];
                  if (lowQualityPatterns.some(pattern => pattern.test(text))) return false

                  return true
                },
                
                // 🚀 优化的弹幕显示前检查（换源时性能优化）
                beforeVisible: (danmu: any) => {
                  return new Promise<boolean>((resolve) => {
                    // 换源期间快速拒绝弹幕显示，减少处理开销
                    if (isSourceChangingRef.current) {
                      resolve(false);
                      return;
                    }

                    // 🎯 动态弹幕密度控制 - 根据当前屏幕上的弹幕数量决定是否显示
                    const currentVisibleCount = document.querySelectorAll('.art-danmuku [data-state="emit"]').length;
                    const maxConcurrentDanmu = devicePerformance === 'high' ? 60 :
                                             devicePerformance === 'medium' ? 40 : 25;

                    if (currentVisibleCount >= maxConcurrentDanmu) {
                      // 🔥 当弹幕密度过高时，随机丢弃部分弹幕，保持流畅性
                      const dropRate = devicePerformance === 'high' ? 0.1 :
                                      devicePerformance === 'medium' ? 0.3 : 0.5;
                      if (Math.random() < dropRate) {
                        resolve(false); // 丢弃当前弹幕
                        return;
                      }
                    }

                    // 🎯 硬件加速优化
                    if (danmu.$ref && danmu.mode === 0) {
                      danmu.$ref.style.willChange = 'transform';
                      danmu.$ref.style.backfaceVisibility = 'hidden';

                      // 低性能设备额外优化
                      if (devicePerformance === 'low') {
                        danmu.$ref.style.transform = 'translateZ(0)'; // 强制硬件加速
                        danmu.$ref.classList.add('art-danmuku-optimized');
                      }
                    }

                    resolve(true);
                  });
                },
              }
              
              // 根据设备性能调整核心配置
              switch (devicePerformance) {
                case 'high': // 高性能设备 - 完整功能
                  return {
                    ...baseConfig,
                    antiOverlap: true, // 开启防重叠
                    synchronousPlayback: true, // 保持弹幕与视频播放速度同步
                    useWorker: true, // v5.2.0: 启用Web Worker优化
                  }
                
                case 'medium': // 中等性能设备 - 适度优化
                  return {
                    ...baseConfig,
                    antiOverlap: !isMobile, // 移动端关闭防重叠
                    synchronousPlayback: true, // 保持同步播放以确保体验一致
                    useWorker: true, // v5.2.0: 中等设备也启用Worker
                  }
                
                case 'low': // 低性能设备 - 平衡优化
                  return {
                    ...baseConfig,
                    antiOverlap: false, // 关闭复杂的防重叠算法
                    synchronousPlayback: true, // 保持同步以确保体验，计算量不大
                    useWorker: true, // 开启Worker减少主线程负担
                    maxLength: 30, // v5.2.0优化: 减少弹幕数量是关键优化
                  }
              }
            }
            
            const config = getOptimizedConfig()
            
            // 🎨 为低性能设备添加CSS硬件加速样式
            if (devicePerformance === 'low') {
              // 创建CSS动画样式（硬件加速）
              if (!document.getElementById('danmaku-performance-css')) {
                const style = document.createElement('style')
                style.id = 'danmaku-performance-css'
                style.textContent = `
                  /* 🚀 硬件加速的弹幕优化 */
                  .art-danmuku-optimized {
                    will-change: transform !important;
                    backface-visibility: hidden !important;
                    transform: translateZ(0) !important;
                    transition: transform linear !important;
                  }
                `
                document.head.appendChild(style)
                console.log('🎨 已加载CSS硬件加速优化')
              }
            }
            
            return config
          })()),
          // Chromecast 插件加载策略：
          // 只在 Chrome 浏览器中显示 Chromecast（排除 iOS Chrome）
          // Safari 和 iOS：不显示 Chromecast（用原生 AirPlay）
          // 其他浏览器：不显示 Chromecast（不支持 Cast API）
          ...(isChrome && !isIOS ? [
            artplayerPluginChromecast({
              onStateChange: (state) => {
                console.log('Chromecast state changed:', state);
              },
              onCastAvailable: (available) => {
                console.log('Chromecast available:', available);
              },
              onCastStart: () => {
                console.log('Chromecast started');
              },
              onError: (error) => {
                console.error('Chromecast error:', error);
              }
            })
          ] : []),
          // 毛玻璃效果控制栏插件
          artplayerPluginLiquidGlass()
        ],
      });
      // [整合] 监听并保存播放速度和画质
      artPlayerRef.current.on('playbackRate', (rate: number) => {
        localStorage.setItem('artplayer_playbackRate', rate.toString());
      });

      artPlayerRef.current.on('quality', (quality: any) => {
        localStorage.setItem('artplayer_quality', JSON.stringify(quality));
      });
      // Electron 环境下，使用系统级全屏替代网页全屏
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const fullscreenBtn = artPlayerRef.current?.template?.$fullscreen;
        if (fullscreenBtn) {
          // 移除原有的点击事件监听器
          const newFullscreenBtn = fullscreenBtn.cloneNode(true);
          fullscreenBtn.parentNode?.replaceChild(newFullscreenBtn, fullscreenBtn);
          
          // 添加新的点击事件
          newFullscreenBtn.addEventListener('click', async () => {
            try {
              const isFullScreen = await (window as any).electronAPI.isFullScreen();
              await (window as any).electronAPI.setFullScreen(!isFullScreen);
            } catch (err) {
              console.error('切换全屏失败:', err);
            }
          });
        }
        
        // 监听 Electron 全屏状态变化，同步到播放器 UI
        if ((window as any).electronAPI.onFullScreenChange) {
          (window as any).electronAPI.onFullScreenChange((isFullScreen: boolean) => {
            // 更新播放器的全屏状态显示（不触发实际全屏切换）
            if (artPlayerRef.current) {
              artPlayerRef.current.fullscreen = isFullScreen;
            }
          });
        }
      }

      // 监听播放器事件
      artPlayerRef.current.on('ready', async () => {
        setError(null);

        // [整合] 恢复播放速度和画质
        artPlayerRef.current!.playbackRate = savedPlaybackRate;
        if (savedQuality) {
          const quality = artPlayerRef.current!.quality.find((q: any) => q.html === savedQuality.html);
          if (quality) {
            artPlayerRef.current!.switchQuality = quality.url;
          }
        }

        // 在播放器就绪后添加全局事件监听器
        const handleBeforeUnload = () => {
          saveCurrentPlayProgress();
          releaseWakeLock();
        };
    
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'hidden') {
            saveCurrentPlayProgress();
            releaseWakeLock();
          } else if (document.visibilityState === 'visible') {
            if (artPlayerRef.current && !artPlayerRef.current.paused) {
              requestWakeLock();
            }
          }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 将清理函数存储在 ref 中，以便组件卸载时调用
        cleanupListenersRef.current = () => {
          window.removeEventListener('beforeunload', handleBeforeUnload);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        };

        // iOS设备自动播放优化：如果是静音启动的，在开始播放后恢复音量
        if ((isIOS || isSafari) && artPlayerRef.current.muted) {
          console.log('iOS设备静音自动播放，准备在播放开始后恢复音量');
          
          const handleFirstPlay = () => {
            setTimeout(() => {
              if (artPlayerRef.current && artPlayerRef.current.muted) {
                artPlayerRef.current.muted = false;
                artPlayerRef.current.volume = lastVolumeRef.current || 0.7;
                console.log('iOS设备已恢复音量:', artPlayerRef.current.volume);
              }
            }, 500); // 延迟500ms确保播放稳定
            
            // 只执行一次
            artPlayerRef.current.off('video:play', handleFirstPlay);
          };
          
          artPlayerRef.current.on('video:play', handleFirstPlay);
        }

        // 添加弹幕插件按钮选择性隐藏CSS
        const optimizeDanmukuControlsCSS = () => {
          if (document.getElementById('danmuku-controls-optimize')) return;

          const style = document.createElement('style');
          style.id = 'danmuku-controls-optimize';
          style.textContent = `
            /* 隐藏弹幕开关按钮 */
            .artplayer-plugin-danmuku .apd-toggle {
              display: none !important;
            }

            /* 隐藏弹幕发射器，因为我们将使用外部弹幕设置来控制 */
            .artplayer-plugin-danmuku .apd-emitter {
              display: none !important;
            }

            
            /* 弹幕配置面板优化 - 修复全屏模式下点击问题 */
            .artplayer-plugin-danmuku .apd-config {
              position: relative;
            }
            
            .artplayer-plugin-danmuku .apd-config-panel {
              /* 使用绝对定位而不是fixed，让ArtPlayer的动态定位生效 */
              position: absolute !important;
              /* 保持ArtPlayer原版的默认left: 0，让JS动态覆盖 */
              /* 保留z-index确保层级正确 */
              z-index: 2147483647 !important; /* 使用最大z-index确保在全屏模式下也能显示在最顶层 */
              /* 确保面板可以接收点击事件 */
              pointer-events: auto !important;
              /* 添加一些基础样式确保可见性 */
              background: rgba(0, 0, 0, 0.8);
              border-radius: 6px;
              backdrop-filter: blur(10px);
            }
            
            /* 全屏模式下的特殊优化 */
            .artplayer[data-fullscreen="true"] .artplayer-plugin-danmuku .apd-config-panel {
              /* 全屏时使用固定定位并调整位置 */
              position: fixed !important;
              top: auto !important;
              bottom: 80px !important; /* 距离底部控制栏80px */
              right: 20px !important; /* 距离右边20px */
              left: auto !important;
              z-index: 2147483647 !important;
            }
            
            /* 确保全屏模式下弹幕面板内部元素可点击 */
            .artplayer[data-fullscreen="true"] .artplayer-plugin-danmuku .apd-config-panel * {
              pointer-events: auto !important;
            }
          `;
          document.head.appendChild(style);
        };
        
        // 应用CSS优化
        optimizeDanmukuControlsCSS();

        // 精确解决弹幕菜单与进度条拖拽冲突 - 基于ArtPlayer原生拖拽逻辑
        const fixDanmakuProgressConflict = () => {
          // 这个定时器ID需要在函数外部可访问，以便清理
          let danmakuResetInterval: NodeJS.Timeout | null = null;
          
          // 将事件处理函数定义在 setTimeout 外部，以便在清理时引用它们
          const handleProgressMouseDown = (event: MouseEvent) => {
            // 只有左键才开始拖拽检测
            if (event.button === 0) {
              const artplayer = document.querySelector('.artplayer') as HTMLElement;
              if (artplayer) {
                artplayer.setAttribute('data-dragging', 'true');
              }
            }
          };
          
          const handleDocumentMouseMove = () => {
            const artplayer = document.querySelector('.artplayer') as HTMLElement;
            // 如果正在拖拽，确保弹幕菜单被隐藏
            if (artplayer && artplayer.hasAttribute('data-dragging')) {
              const panels = document.querySelectorAll('.artplayer-plugin-danmuku .apd-config-panel, .artplayer-plugin-danmuku .apd-style-panel') as NodeListOf<HTMLElement>;
              panels.forEach(panel => {
                if (panel.style.opacity !== '0') {
                  panel.style.opacity = '0';
                  panel.style.pointerEvents = 'none';
                }
              });
            }
          };
          
          const handleDocumentMouseUp = () => {
            const artplayer = document.querySelector('.artplayer') as HTMLElement;
            if (artplayer && artplayer.hasAttribute('data-dragging')) {
              artplayer.removeAttribute('data-dragging');
              // 立即恢复，不使用延迟
            }
          };

          setTimeout(() => {
            const progressControl = document.querySelector('.art-control-progress') as HTMLElement;
            if (!progressControl) return;
            
            // 添加精确的CSS控制
            const addPrecisionCSS = () => {
              if (document.getElementById('danmaku-drag-fix')) return;
              
              const style = document.createElement('style');
              style.id = 'danmaku-drag-fix';
              style.textContent = `
                /* 🔧 修复长时间播放后弹幕菜单hover失效问题 */

                /* 确保控制元素本身可以接收鼠标事件，恢复原生hover机制 */
                .artplayer-plugin-danmuku .apd-config,
                .artplayer-plugin-danmuku .apd-style {
                  pointer-events: auto !important;
                }

                /* 简化：依赖全局CSS中的hover处理 */

                /* 确保进度条层级足够高，避免被弹幕面板遮挡 */
                .art-progress {
                  position: relative;
                  z-index: 1000 !important;
                }

                /* 面板背景在非hover状态下不拦截事件，但允许hover检测 */
                .artplayer-plugin-danmuku .apd-config-panel:not(:hover),
                .artplayer-plugin-danmuku .apd-style-panel:not(:hover) {
                  pointer-events: none;
                }

                /* 面板内的具体控件始终可以交互 */
                .artplayer-plugin-danmuku .apd-config-panel-inner,
                .artplayer-plugin-danmuku .apd-style-panel-inner,
                .artplayer-plugin-danmuku .apd-config-panel .apd-mode,
                .artplayer-plugin-danmuku .apd-config-panel .apd-other,
                .artplayer-plugin-danmuku .apd-config-panel .apd-slider,
                .artplayer-plugin-danmuku .apd-style-panel .apd-mode,
                .artplayer-plugin-danmuku .apd-style-panel .apd-color {
                  pointer-events: auto !important;
                }
              `;
              document.head.appendChild(style);
            };
            
            // 绑定事件 - 与ArtPlayer使用相同的事件绑定方式
            progressControl.addEventListener('mousedown', handleProgressMouseDown);
            document.addEventListener('mousemove', handleDocumentMouseMove);
            document.addEventListener('mouseup', handleDocumentMouseUp);
            
            // 应用CSS
            addPrecisionCSS();

            // 🔄 添加定期重置机制，防止长时间播放后状态污染
            danmakuResetInterval = setInterval(() => {
              if (!artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                if (danmakuResetInterval) clearInterval(danmakuResetInterval);
                return;
              }

              try {
                // 重置弹幕控件和面板状态
                const controls = document.querySelectorAll('.artplayer-plugin-danmuku .apd-config, .artplayer-plugin-danmuku .apd-style') as NodeListOf<HTMLElement>;
                const panels = document.querySelectorAll('.artplayer-plugin-danmuku .apd-config-panel, .artplayer-plugin-danmuku .apd-style-panel') as NodeListOf<HTMLElement>;

                // 强制重置控制元素的事件接收能力
                controls.forEach(control => {
                  if (control.style.pointerEvents === 'none') {
                    control.style.pointerEvents = 'auto';
                  }
                });

                // 重置面板状态，但不影响当前hover状态
                panels.forEach(panel => {
                  if (!panel.matches(':hover') && panel.style.opacity === '0') {
                    panel.style.opacity = '';
                    panel.style.pointerEvents = '';
                    panel.style.visibility = '';
                  }
                });

                console.log('🔄 弹幕菜单hover状态已重置');
              } catch (error) {
                console.warn('弹幕状态重置失败:', error);
              }
            }, 300000); // 每5分钟重置一次

            // 将此函数的清理逻辑附加到主清理函数中
            const originalCleanup = cleanupListenersRef.current;
            cleanupListenersRef.current = () => {
              originalCleanup?.(); // 确保之前的清理逻辑（beforeunload等）被调用
              
              // 清理事件监听器
              progressControl.removeEventListener('mousedown', handleProgressMouseDown);
              document.removeEventListener('mousemove', handleDocumentMouseMove);
              document.removeEventListener('mouseup', handleDocumentMouseUp);
              
              // 清理定时器
              if (danmakuResetInterval) {
                clearInterval(danmakuResetInterval);
              }
              
              console.log('✅ 弹幕冲突修复的事件监听器和定时器已清理');
            };

            // 🚀 立即恢复hover状态（修复当前可能已存在的问题）
            const immediateRestore = () => {
              const controls = document.querySelectorAll('.artplayer-plugin-danmuku .apd-config, .artplayer-plugin-danmuku .apd-style') as NodeListOf<HTMLElement>;
              controls.forEach(control => {
                control.style.pointerEvents = 'auto';
              });
              console.log('🚀 弹幕菜单hover状态已立即恢复');
            };

            // 立即执行一次恢复
            setTimeout(immediateRestore, 100);

          }, 1500); // 等待弹幕插件加载
        };

        // 启用精确修复
        fixDanmakuProgressConflict();

        // 移动端弹幕配置按钮点击切换支持 - 基于ArtPlayer设置按钮原理
        const addMobileDanmakuToggle = () => {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

          setTimeout(() => {
            const configButton = document.querySelector('.artplayer-plugin-danmuku .apd-config');
            const configPanel = document.querySelector('.artplayer-plugin-danmuku .apd-config-panel');

            if (!configButton || !configPanel) {
              console.warn('弹幕配置按钮或面板未找到');
              return;
            }

            console.log('设备类型:', isMobile ? '移动端' : '桌面端');

            // 桌面端：简化处理，依赖CSS hover，移除复杂的JavaScript事件
            if (!isMobile) {
              console.log('桌面端：使用CSS原生hover，避免JavaScript事件冲突');
              return;
            }
            
            if (isMobile) {
              // 移动端：添加点击切换支持 + 持久位置修正
              console.log('为移动端添加弹幕配置按钮点击切换功能');
              
              let isConfigVisible = false;
              
              // 弹幕面板位置修正函数 - 简化版本
              const adjustPanelPosition = () => {
                const player = document.querySelector('.artplayer');
                if (!player || !configButton || !configPanel) return;

                try {
                  const panelElement = configPanel as HTMLElement;

                  // 始终清除内联样式，使用CSS默认定位
                  panelElement.style.left = '';
                  panelElement.style.right = '';
                  panelElement.style.transform = '';

                  console.log('弹幕面板：使用CSS默认定位，自动适配屏幕方向');
                } catch (error) {
                  console.warn('弹幕面板位置调整失败:', error);
                }
              };
              
              // 添加点击事件监听器
              configButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                isConfigVisible = !isConfigVisible;
                
                if (isConfigVisible) {
                  (configPanel as HTMLElement).style.display = 'block';
                  // 显示后立即调整位置
                  setTimeout(adjustPanelPosition, 10);
                  console.log('移动端弹幕配置面板：显示');
                } else {
                  (configPanel as HTMLElement).style.display = 'none';
                  console.log('移动端弹幕配置面板：隐藏');
                }
              });
              
              // 监听ArtPlayer的resize事件
              if (artPlayerRef.current) {
                artPlayerRef.current.on('resize', () => {
                  if (isConfigVisible) {
                    console.log('检测到ArtPlayer resize事件，重新调整弹幕面板位置');
                    setTimeout(adjustPanelPosition, 50); // 短暂延迟确保resize完成
                  }
                });
                console.log('已监听ArtPlayer resize事件，实现自动适配');
              }
              
              // 额外监听屏幕方向变化事件，确保完全自动适配
              const handleOrientationChange = () => {
                if (isConfigVisible) {
                  console.log('检测到屏幕方向变化，重新调整弹幕面板位置');
                  setTimeout(adjustPanelPosition, 100); // 稍长延迟等待方向变化完成
                }
              };

              window.addEventListener('orientationchange', handleOrientationChange);
              window.addEventListener('resize', handleOrientationChange);

              // 清理函数
              const _cleanup = () => {
                window.removeEventListener('orientationchange', handleOrientationChange);
                window.removeEventListener('resize', handleOrientationChange);
              };

              // 点击其他地方自动隐藏
              document.addEventListener('click', (e) => {
                if (isConfigVisible &&
                    !configButton.contains(e.target as Node) &&
                    !configPanel.contains(e.target as Node)) {
                  isConfigVisible = false;
                  (configPanel as HTMLElement).style.display = 'none';
                  console.log('点击外部区域，隐藏弹幕配置面板');
                }
              });

              console.log('移动端弹幕配置切换功能已激活');
            }
          }, 2000); // 延迟2秒确保弹幕插件完全初始化
        };
        
        // 启用移动端弹幕配置切换
        addMobileDanmakuToggle();

        // 播放器就绪后，加载外部弹幕数据
        console.log('播放器已就绪，开始加载外部弹幕');
        setTimeout(async () => {
          try {
            const externalDanmu = await loadExternalDanmu(); // 这里会检查开关状态
            console.log('外部弹幕加载结果:', externalDanmu);
            
            if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
              if (externalDanmu.length > 0) {
                console.log('向播放器插件加载弹幕数据:', externalDanmu.length, '条');
                artPlayerRef.current.plugins.artplayerPluginDanmuku.load(externalDanmu);
                artPlayerRef.current.notice.show = `已加载 ${externalDanmu.length} 条弹幕`;
              } else {
                console.log('没有弹幕数据可加载');
                artPlayerRef.current.notice.show = '暂无弹幕数据';
              }
            } else {
              console.error('弹幕插件未找到');
            }
          } catch (error) {
            console.error('加载外部弹幕失败:', error);
          }
        }, 1000); // 延迟1秒确保插件完全初始化

        // 监听弹幕插件的显示/隐藏事件，自动保存状态到localStorage
        artPlayerRef.current.on('artplayerPluginDanmuku:show', () => {
          localStorage.setItem('danmaku_visible', 'true');
          console.log('弹幕显示状态已保存');
        });
        
        artPlayerRef.current.on('artplayerPluginDanmuku:hide', () => {
          localStorage.setItem('danmaku_visible', 'false');
          console.log('弹幕隐藏状态已保存');
        });

        // 监听弹幕插件的配置变更事件，自动保存所有设置到localStorage
        artPlayerRef.current.on('artplayerPluginDanmuku:config', (option: any) => {
          try {
            // 保存所有弹幕配置到localStorage
            if (typeof option.fontSize !== 'undefined') {
              localStorage.setItem('danmaku_fontSize', option.fontSize.toString());
            }
            if (typeof option.opacity !== 'undefined') {
              localStorage.setItem('danmaku_opacity', option.opacity.toString());
            }
            if (typeof option.speed !== 'undefined') {
              localStorage.setItem('danmaku_speed', option.speed.toString());
            }
            if (typeof option.margin !== 'undefined') {
              localStorage.setItem('danmaku_margin', JSON.stringify(option.margin));
            }
            if (typeof option.modes !== 'undefined') {
              localStorage.setItem('danmaku_modes', JSON.stringify(option.modes));
            }
            if (typeof option.antiOverlap !== 'undefined') {
              localStorage.setItem('danmaku_antiOverlap', option.antiOverlap.toString());
            }
            if (typeof option.visible !== 'undefined') {
              localStorage.setItem('danmaku_visible', option.visible.toString());
            }
            console.log('弹幕配置已自动保存:', option);
          } catch (error) {
            console.error('保存弹幕配置失败:', error);
          }
        });

        // 监听播放进度跳转，优化弹幕重置（减少闪烁）
        artPlayerRef.current.on('seek', () => {
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            // 清除之前的重置计时器
            if (seekResetTimeoutRef.current) {
              clearTimeout(seekResetTimeoutRef.current);
            }
            
            // 增加延迟并只在非拖拽状态下重置，减少快进时的闪烁
            seekResetTimeoutRef.current = setTimeout(() => {
              if (!isDraggingProgressRef.current && artPlayerRef.current?.plugins?.artplayerPluginDanmuku && !artPlayerRef.current.seeking) {
                artPlayerRef.current.plugins.artplayerPluginDanmuku.reset();
                console.log('进度跳转，弹幕已重置');
              }
            }, 500); // 增加到500ms延迟，减少频繁重置导致的闪烁
          }
        });

        // 监听拖拽状态 - v5.2.0优化: 在拖拽期间暂停弹幕更新以减少闪烁
        artPlayerRef.current.on('video:seeking', () => {
          isDraggingProgressRef.current = true;
          // v5.2.0新增: 拖拽时隐藏弹幕，减少CPU占用和闪烁
          // 只有在外部弹幕开启且当前显示时才隐藏
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku && 
              externalDanmuEnabledRef.current && 
              !artPlayerRef.current.plugins.artplayerPluginDanmuku.isHide) {
            artPlayerRef.current.plugins.artplayerPluginDanmuku.hide();
          }
        });

        artPlayerRef.current.on('video:seeked', () => {
          isDraggingProgressRef.current = false;
          // v5.2.0优化: 拖拽结束后根据外部弹幕开关状态决定是否恢复弹幕显示
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            // 只有在外部弹幕开启时才恢复显示
            if (externalDanmuEnabledRef.current) {
              artPlayerRef.current.plugins.artplayerPluginDanmuku.show(); // 先恢复显示
              setTimeout(() => {
                // 延迟重置以确保播放状态稳定
                if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                  artPlayerRef.current.plugins.artplayerPluginDanmuku.reset();
                  console.log('拖拽结束，弹幕已重置');
                }
              }, 100);
            } else {
              // 外部弹幕关闭时，确保保持隐藏状态
              artPlayerRef.current.plugins.artplayerPluginDanmuku.hide();
              console.log('拖拽结束，外部弹幕已关闭，保持隐藏状态');
            }
          }
        });

        // 监听播放器窗口尺寸变化，触发弹幕重置（双重保障）
        artPlayerRef.current.on('resize', () => {
          // 清除之前的重置计时器
          if (resizeResetTimeoutRef.current) {
            clearTimeout(resizeResetTimeoutRef.current);
          }
          
          // 延迟重置弹幕，避免连续触发（全屏切换优化）
          resizeResetTimeoutRef.current = setTimeout(() => {
            if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
              artPlayerRef.current.plugins.artplayerPluginDanmuku.reset();
              console.log('窗口尺寸变化，弹幕已重置（防抖优化）');
            }
          }, 300); // 300ms防抖，减少全屏切换时的卡顿
        });

        // 播放器就绪后，如果正在播放则请求 Wake Lock
        if (artPlayerRef.current && !artPlayerRef.current.paused) {
          requestWakeLock();
        }
      });

      // [整合] 监听并保存播放速度和画质
      artPlayerRef.current.on('playbackRate', (rate: number) => {
        localStorage.setItem('artplayer_playbackRate', rate.toString());
      });

      artPlayerRef.current.on('quality', (quality: any) => {
        localStorage.setItem('artplayer_quality', JSON.stringify(quality));
      });

      // 监听播放状态变化，控制 Wake Lock
      artPlayerRef.current.on('play', () => {
        requestWakeLock();
      });

      artPlayerRef.current.on('pause', () => {
        releaseWakeLock();
        // 🔥 关键修复：暂停时也检查是否在片尾，避免保存错误的进度
        const currentTime = artPlayerRef.current?.currentTime || 0;
        const duration = artPlayerRef.current?.duration || 0;
        const remainingTime = duration - currentTime;
        const isNearEnd = duration > 0 && remainingTime < 180; // 最后3分钟

        if (!isNearEnd) {
          saveCurrentPlayProgress();
        }
      });

      artPlayerRef.current.on('video:ended', () => {
        releaseWakeLock();
      });

      // 如果播放器初始化时已经在播放状态，则请求 Wake Lock
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        requestWakeLock();
      }

      artPlayerRef.current.on('video:volumechange', () => {
        lastVolumeRef.current = artPlayerRef.current.volume;
        localStorage.setItem('artplayer_volume', artPlayerRef.current.volume.toString());
      });
      artPlayerRef.current.on('video:ratechange', () => {
        lastPlaybackRateRef.current = artPlayerRef.current.playbackRate;
        localStorage.setItem('artplayer_playbackRate', artPlayerRef.current.playbackRate.toString());
      });

      // 监听视频可播放事件，这时恢复播放进度更可靠
      artPlayerRef.current.on('video:canplay', () => {
        // 🔥 重置 video:ended 处理标志，因为这是新视频
        videoEndedHandledRef.current = false;

        // 源成功播放，清空自动切换的失败记录
        autoSwitchAttemptRef.current.clear();
        
        // 若存在需要恢复的播放进度，则跳转
        if (resumeTimeRef.current && resumeTimeRef.current > 0) {
          try {
            const duration = artPlayerRef.current.duration || 0;
            let target = resumeTimeRef.current;
            if (duration && target >= duration - 2) {
              target = Math.max(0, duration - 5);
            }
            artPlayerRef.current.currentTime = target;
            console.log('成功恢复播放进度到:', resumeTimeRef.current);
          } catch (err) {
            console.warn('恢复播放进度失败:', err);
          }
        }
        resumeTimeRef.current = null;

        // iOS设备自动播放回退机制：如果自动播放失败，尝试用户交互触发播放
        if ((isIOS || isSafari) && artPlayerRef.current.paused) {
          console.log('iOS设备检测到视频未自动播放，准备交互触发机制');
          
          const tryAutoPlay = async () => {
            try {
              // 多重尝试策略
              let playAttempts = 0;
              const maxAttempts = 3;
              
              const attemptPlay = async (): Promise<boolean> => {
                playAttempts++;
                console.log(`iOS自动播放尝试 ${playAttempts}/${maxAttempts}`);
                
                try {
                  await artPlayerRef.current.play();
                  console.log('iOS设备自动播放成功');
                  return true;
                } catch (playError: any) {
                  console.log(`播放尝试 ${playAttempts} 失败:`, playError.name);
                  
                  // 根据错误类型采用不同策略
                  if (playError.name === 'NotAllowedError') {
                    // 用户交互需求错误 - 最常见
                    if (playAttempts < maxAttempts) {
                      // 尝试降低音量再播放
                      artPlayerRef.current.volume = 0.1;
                      await new Promise(resolve => setTimeout(resolve, 200));
                      return attemptPlay();
                    }
                    return false;
                  } else if (playError.name === 'AbortError') {
                    // 播放被中断 - 等待后重试
                    if (playAttempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 500));
                      return attemptPlay();
                    }
                    return false;
                  }
                  return false;
                }
              };
              
              const success = await attemptPlay();
              
              if (!success) {
                console.log('iOS设备需要用户交互才能播放，这是正常的浏览器行为');
                // 显示友好的播放提示
                if (artPlayerRef.current) {
                  artPlayerRef.current.notice.show = '轻触播放按钮开始观看';
                  
                  // 添加一次性点击监听器用于首次播放
                  let hasHandledFirstInteraction = false;
                  const handleFirstUserInteraction = async () => {
                    if (hasHandledFirstInteraction) return;
                    hasHandledFirstInteraction = true;
                    
                    try {
                      await artPlayerRef.current.play();
                      // 首次成功播放后恢复正常音量
                      setTimeout(() => {
                        if (artPlayerRef.current && !artPlayerRef.current.muted) {
                          artPlayerRef.current.volume = lastVolumeRef.current || 0.7;
                        }
                      }, 1000);
                    } catch (error) {
                      console.warn('用户交互播放失败:', error);
                    }
                    
                    // 移除监听器
                    artPlayerRef.current?.off('video:play', handleFirstUserInteraction);
                    document.removeEventListener('click', handleFirstUserInteraction);
                  };
                  
                  // 监听播放事件和点击事件
                  artPlayerRef.current.on('video:play', handleFirstUserInteraction);
                  document.addEventListener('click', handleFirstUserInteraction);
                }
              }
            } catch (error) {
              console.warn('自动播放回退机制执行失败:', error);
            }
          };
          
          // 延迟尝试，避免与进度恢复冲突
          setTimeout(tryAutoPlay, 200);
        }

        setTimeout(() => {
          if (
            Math.abs(artPlayerRef.current.volume - lastVolumeRef.current) > 0.01
          ) {
            artPlayerRef.current.volume = lastVolumeRef.current;
          }
          if (
            Math.abs(
              artPlayerRef.current.playbackRate - lastPlaybackRateRef.current
            ) > 0.01 &&
            isWebKit
          ) {
            artPlayerRef.current.playbackRate = lastPlaybackRateRef.current;
          }
          artPlayerRef.current.notice.show = '';
        }, 0);

        // 隐藏换源加载状态
        setIsVideoLoading(false);

        // 🔥 重置集数切换标识（播放器成功创建后）
        if (isEpisodeChangingRef.current) {
          isEpisodeChangingRef.current = false;
          console.log('🎯 播放器创建完成，重置集数切换标识');
        }
      });

      // 监听播放器错误
      artPlayerRef.current.on('error', (err: any) => {
        console.error('播放器错误:', err);
        if (artPlayerRef.current.currentTime > 0) {
          return;
        }
      });

      // 监听视频播放结束事件，自动播放下一集
      artPlayerRef.current.on('video:ended', () => {
        const idx = currentEpisodeIndexRef.current;

        // 🔥 关键修复：首先检查这个 video:ended 事件是否已经被处理过
        if (videoEndedHandledRef.current) {
          return;
        }

        // 🔑 检查是否已经通过 SkipController 触发了下一集，避免重复触发
        if (isSkipControllerTriggeredRef.current) {
          videoEndedHandledRef.current = true;
          // 🔥 关键修复：延迟重置标志，等待新集数开始加载
          setTimeout(() => {
            isSkipControllerTriggeredRef.current = false;
          }, 2000);
          return;
        }

        const d = detailRef.current;
        if (d && d.episodes && idx < d.episodes.length - 1) {
          videoEndedHandledRef.current = true;
          setTimeout(() => {
            setCurrentEpisodeIndex(idx + 1);
          }, 1000);
        }
      });

      // 合并的timeupdate监听器 - 处理跳过片头片尾和保存进度
      artPlayerRef.current.on('video:timeupdate', () => {
        const currentTime = artPlayerRef.current.currentTime || 0;
        const duration = artPlayerRef.current.duration || 0;
        const now = performance.now(); // 使用performance.now()更精确

        // 更新 SkipController 所需的时间信息
        setCurrentPlayTime(currentTime);
        setVideoDuration(duration);

        // 保存播放进度逻辑 - 优化所有存储类型的保存间隔
        const saveNow = Date.now();
        // upstash需要更长间隔避免频率限制，其他存储类型也适当降低频率减少性能开销
        const interval = process.env.NEXT_PUBLIC_STORAGE_TYPE === 'upstash' ? 20000 : 10000; // 统一提高到10秒

        // 🔥 关键修复：如果当前播放位置接近视频结尾（最后3分钟），不保存进度
        // 这是为了避免自动跳过片尾时保存了片尾位置的进度，导致"继续观看"从错误位置开始
        const remainingTime = duration - currentTime;
        const isNearEnd = duration > 0 && remainingTime < 180; // 最后3分钟

        if (saveNow - lastSaveTimeRef.current > interval && !isNearEnd) {
          saveCurrentPlayProgress();
          lastSaveTimeRef.current = saveNow;
        }
      });

      artPlayerRef.current.on('pause', () => {
        // 🔥 关键修复：暂停时也检查是否在片尾，避免保存错误的进度
        const currentTime = artPlayerRef.current?.currentTime || 0;
        const duration = artPlayerRef.current?.duration || 0;
        const remainingTime = duration - currentTime;
        const isNearEnd = duration > 0 && remainingTime < 180; // 最后3分钟

        if (!isNearEnd) {
          saveCurrentPlayProgress();
        }
      });

      if (artPlayerRef.current?.video) {
        ensureVideoSource(
          artPlayerRef.current.video as HTMLVideoElement,
          videoUrl
        );
      }
    } catch (err) {
      console.error('创建播放器失败:', err);
      // 重置集数切换标识
      isEpisodeChangingRef.current = false;
      setError('播放器初始化失败');
    }
    }; // 结束 initPlayer 函数

    // 动态库加载完成后初始化播放器
    initPlayer();
  }, [Artplayer, Hls, artplayerPluginDanmuku, videoUrl, loading, blockAdEnabled]);

  // 当组件卸载时清理定时器、Wake Lock 和播放器资源
  useEffect(() => {
    return () => {
      // 清理定时器
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }

      // 清理弹幕重置定时器
      if (seekResetTimeoutRef.current) {
        clearTimeout(seekResetTimeoutRef.current);
      }
      
      // 清理resize防抖定时器
      if (resizeResetTimeoutRef.current) {
        clearTimeout(resizeResetTimeoutRef.current);
      }

      // 清理长按计时器
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (fadeOutTimerRef.current) {
        clearTimeout(fadeOutTimerRef.current);
      }

      // 释放 Wake Lock
      releaseWakeLock();

      // 调用存储的清理函数来移除 window/document 监听器
      if (cleanupListenersRef.current) {
        cleanupListenersRef.current();
      }

      // 清理动态注入的 CSS 样式
      document.getElementById('danmuku-controls-optimize')?.remove();
      document.getElementById('danmaku-drag-fix')?.remove();
      document.getElementById('danmaku-performance-css')?.remove();

      // 在组件卸载前最后保存一次进度
      saveCurrentPlayProgress();

      // 销毁播放器实例
      cleanupPlayer();
    };
  }, []);

  // 返回顶部功能相关
  useEffect(() => {
    // 获取滚动位置的函数 - 专门针对 body 滚动
    const getScrollTop = () => {
      return document.body.scrollTop || 0;
    };

    // 使用 requestAnimationFrame 持续检测滚动位置
    let isRunning = false;
    const checkScrollPosition = () => {
      if (!isRunning) return;

      const scrollTop = getScrollTop();
      const shouldShow = scrollTop > 300;
      setShowBackToTop(shouldShow);

      requestAnimationFrame(checkScrollPosition);
    };

    // 启动持续检测
    isRunning = true;
    checkScrollPosition();

    // 监听 body 元素的滚动事件
    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
    };

    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      isRunning = false; // 停止 requestAnimationFrame 循环
      // 移除 body 滚动事件监听器
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 返回顶部功能
  const scrollToTop = () => {
    try {
      // 根据调试结果，真正的滚动容器是 document.body
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      // 如果平滑滚动完全失败，使用立即滚动
      document.body.scrollTop = 0;
    }
  };

  if (loading) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 动画影院图标 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                <div className='text-white text-4xl'>
                  {loadingStage === 'searching' && '🔍'}
                  {loadingStage === 'preferring' && '⚡'}
                  {loadingStage === 'fetching' && '🎬'}
                  {loadingStage === 'ready' && '✨'}
                </div>
                {/* 旋转光环 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
              </div>

              {/* 浮动粒子效果 */}
              <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
                <div
                  className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                  style={{ animationDelay: '0.5s' }}
                ></div>
                <div
                  className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                  style={{ animationDelay: '1s' }}
                ></div>
              </div>
            </div>

            {/* 进度指示器 */}
            <div className='mb-6 w-80 mx-auto'>
              <div className='flex justify-center space-x-2 mb-4'>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${loadingStage === 'searching' || loadingStage === 'fetching'
                    ? 'bg-green-500 scale-125'
                    : loadingStage === 'preferring' ||
                      loadingStage === 'ready'
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                    }`}
                ></div>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${loadingStage === 'preferring'
                    ? 'bg-green-500 scale-125'
                    : loadingStage === 'ready'
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                    }`}
                ></div>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${loadingStage === 'ready'
                    ? 'bg-green-500 scale-125'
                    : 'bg-gray-300'
                    }`}
                ></div>
              </div>

              {/* 进度条 */}
              <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden'>
                <div
                  className='h-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-full transition-all duration-1000 ease-out'
                  style={{
                    width:
                      loadingStage === 'searching' ||
                        loadingStage === 'fetching'
                        ? '33%'
                        : loadingStage === 'preferring'
                          ? '66%'
                          : '100%',
                  }}
                ></div>
              </div>
            </div>

            {/* 加载消息 */}
            <div className='space-y-2'>
              <p className='text-xl font-semibold text-gray-800 dark:text-gray-200 animate-pulse'>
                {loadingMessage}
              </p>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 错误图标 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                <div className='text-white text-4xl'>😵</div>
                {/* 脉冲效果 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl opacity-20 animate-pulse'></div>
              </div>

              {/* 浮动错误粒子 */}
              <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                <div className='absolute top-2 left-2 w-2 h-2 bg-red-400 rounded-full animate-bounce'></div>
                <div
                  className='absolute top-4 right-4 w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce'
                  style={{ animationDelay: '0.5s' }}
                ></div>
                <div
                  className='absolute bottom-3 left-6 w-1 h-1 bg-yellow-400 rounded-full animate-bounce'
                  style={{ animationDelay: '1s' }}
                ></div>
              </div>
            </div>

            {/* 错误信息 */}
            <div className='space-y-4 mb-8'>
              <h2 className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
                哎呀，出现了一些问题
              </h2>
              <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4'>
                <p className='text-red-600 dark:text-red-400 font-medium'>
                  {error}
                </p>
              </div>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                请检查网络连接或尝试刷新页面
              </p>
            </div>

            {/* 操作按钮 */}
            <div className='space-y-3'>
              <button
                onClick={() =>
                  videoTitle
                    ? router.push(`/search?q=${encodeURIComponent(videoTitle)}`)
                    : router.back()
                }
                className='w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl'
              >
                {videoTitle ? '🔍 返回搜索' : '← 返回上页'}
              </button>

              <button
                onClick={() => window.location.reload()}
                className='w-full px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200'
              >
                🔄 重新尝试
              </button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/play'>
      {/* Telegram 新用户欢迎弹窗 */}
      <TelegramWelcomeModal />
      <div className='flex flex-col gap-3 py-4 px-5 lg:px-[3rem] 2xl:px-20'>
        {/* 第一行：影片标题 */}
        <div className='py-1'>
          <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
            {videoTitle || '影片标题'}
            {totalEpisodes > 1 && (
              <span className='text-gray-500 dark:text-gray-400'>
                {` > ${detail?.episodes_titles?.[currentEpisodeIndex] || `第 ${currentEpisodeIndex + 1} 集`}`}
              </span>
            )}
          </h1>
        </div>
        {/* 第二行：播放器和选集 */}
        <div className='space-y-2'>
          {/* 折叠控制 */}
          <div className='flex justify-end items-center'>
            {/* 折叠控制按钮 - 仅在 lg 及以上屏幕显示 */}
            <button
              onClick={() =>
                setIsEpisodeSelectorCollapsed(!isEpisodeSelectorCollapsed)
              }
              className='hidden lg:flex group relative items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-all duration-200'
              title={
                isEpisodeSelectorCollapsed ? '显示选集面板' : '隐藏选集面板'
              }
            >
              <svg
                className={`w-3.5 h-3.5 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isEpisodeSelectorCollapsed ? 'rotate-180' : 'rotate-0'
                  }`}
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M9 5l7 7-7 7'
                />
              </svg>
              <span className='text-xs font-medium text-gray-600 dark:text-gray-300'>
                {isEpisodeSelectorCollapsed ? '显示' : '隐藏'}
              </span>

              {/* 精致的状态指示点 */}
              <div
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full transition-all duration-200 ${isEpisodeSelectorCollapsed
                  ? 'bg-orange-400 animate-pulse'
                  : 'bg-green-400'
                  }`}
              ></div>
            </button>
          </div>

          <div
            className={`grid gap-4 lg:h-[500px] xl:h-[650px] 2xl:h-[750px] transition-all duration-300 ease-in-out ${isEpisodeSelectorCollapsed
              ? 'grid-cols-1'
              : 'grid-cols-1 md:grid-cols-4'
              }`}
          >
            {/* 播放器 */}
            <div
              className={`h-full transition-all duration-300 ease-in-out rounded-xl border border-white/0 dark:border-white/30 ${isEpisodeSelectorCollapsed ? 'col-span-1' : 'md:col-span-3'
                }`}
            >
              <div className='relative w-full h-[300px] lg:h-full'>
                <div
                  ref={artRef}
                  className='bg-black w-full h-full rounded-xl overflow-hidden shadow-lg'
                ></div>

                {/* 跳过设置按钮 - 播放器内右上角 */}
                {currentSource && currentId && (
                  <div className='absolute top-4 right-4 z-10'>
                    <button
                      onClick={() => setIsSkipSettingOpen(true)}
                      className='group flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-xl border border-white/30 hover:border-white/50 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] hover:shadow-[0_8px_32px_0_rgba(255,255,255,0.18)] hover:scale-105 transition-all duration-300 ease-out'
                      title='跳过设置'
                      style={{
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                      }}
                    >
                      <svg
                        className='w-5 h-5 text-white drop-shadow-lg group-hover:rotate-90 transition-all duration-300'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4'
                        />
                      </svg>
                      <span className='text-sm font-medium text-white drop-shadow-lg transition-all duration-300 hidden sm:inline'>
                        跳过设置
                      </span>
                    </button>
                  </div>
                )}

                {/* SkipController 组件 */}
                {currentSource && currentId && detail?.title && (
                  <SkipController
                    source={currentSource}
                    id={currentId}
                    title={detail.title}
                    episodeIndex={currentEpisodeIndex}
                    artPlayerRef={artPlayerRef}
                    currentTime={currentPlayTime}
                    duration={videoDuration}
                    isSettingMode={isSkipSettingOpen}
                    onSettingModeChange={setIsSkipSettingOpen}
                    onNextEpisode={handleNextEpisode}
                  />
                )}

                {/* 换源加载蒙层 */}
                {isVideoLoading && (
                  <div className='absolute inset-0 bg-black/85 backdrop-blur-sm rounded-xl flex items-center justify-center z-[500] transition-all duration-300'>
                    <div className='text-center max-w-md mx-auto px-6'>
                      {/* 动画影院图标 */}
                      <div className='relative mb-8'>
                        <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                          <div className='text-white text-4xl'>🎬</div>
                          {/* 旋转光环 */}
                          <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
                        </div>

                        {/* 浮动粒子效果 */}
                        <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                          <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
                          <div
                            className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                            style={{ animationDelay: '0.5s' }}
                          ></div>
                          <div
                            className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                            style={{ animationDelay: '1s' }}
                          ></div>
                        </div>
                      </div>

                      {/* 换源消息 */}
                      <div className='space-y-2'>
                        <p className='text-xl font-semibold text-white animate-pulse'>
                          {videoLoadingStage === 'sourceChanging'
                            ? '🔄 切换播放源...'
                            : '🔄 视频加载中...'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 选集和换源 - 在移动端始终显示，在 lg 及以上可折叠 */}
            <div
              className={`relative h-[300px] lg:h-full md:overflow-hidden transition-all duration-300 ease-in-out ${isEpisodeSelectorCollapsed
                ? 'md:col-span-1 lg:hidden lg:opacity-0 lg:scale-95'
                : 'md:col-span-1 lg:opacity-100 lg:scale-100'
                }`}
            >
              {longPressedTitle && (
                <div className={`absolute top-0 left-0 right-0 z-20 p-2 bg-gray-800/90 text-white text-center text-sm shadow-lg ${isFadingOut ? 'animate-fade-out' : 'animate-fade-in-down'}`}>
                  {longPressedTitle}
                </div>
              )}
              <EpisodeSelector
                totalEpisodes={totalEpisodes}
                episodes_titles={detail?.episodes_titles || []}
                value={currentEpisodeIndex + 1}
                onChange={handleEpisodeChange}
                // onLongPress={handleLongPress}
                onSourceChange={handleSourceChange}
                currentSource={currentSource}
                currentId={currentId}
                videoTitle={searchTitle || videoTitle}
                availableSources={availableSources.filter(source => {
                  // 必须有集数数据
                  if (!source.episodes || source.episodes.length < 1) return false;

                  // 短剧源始终显示，不受集数差异限制
                  if (source.source === 'shortdrama') return true;

                  // 如果当前有 detail，只显示集数相近的源（允许 ±30% 的差异）
                  if (detail && detail.episodes && detail.episodes.length > 0) {
                    const currentEpisodes = detail.episodes.length;
                    const sourceEpisodes = source.episodes.length;
                    const tolerance = Math.max(5, Math.ceil(currentEpisodes * 0.3)); // 至少5集的容差

                    // 在合理范围内
                    return Math.abs(sourceEpisodes - currentEpisodes) <= tolerance;
                  }

                  return true;
                })}
                sourceSearchLoading={sourceSearchLoading}
                sourceSearchError={sourceSearchError}
                precomputedVideoInfo={precomputedVideoInfo}
              />
            </div>
          </div>
        </div>

        {/* 详情展示 */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          {/* 文字区 */}
          <div className='md:col-span-3'>
            <div className='p-6 flex flex-col min-h-0'>
              {/* 标题 */}
              <div className='mb-4 flex-shrink-0'>
                <div className='flex flex-col md:flex-row md:items-center gap-3'>
                  <h1 className='text-2xl md:text-3xl font-bold tracking-wide text-center md:text-left bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent'>
                    {videoTitle || '影片标题'}
                  </h1>

                  {/* 按钮组 */}
                  <div className='flex items-center justify-center md:justify-start gap-2 flex-wrap'>
                    {/* 收藏按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite();
                      }}
                      className='group relative flex-shrink-0 transition-all duration-300 hover:scale-110'
                    >
                      <div className='absolute inset-0 bg-gradient-to-r from-red-400 to-pink-400 rounded-full opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300'></div>
                      <FavoriteIcon filled={favorited} />
                    </button>

                    {/* 网盘资源按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // 触发网盘搜索（如果还没搜索过）
                        if (!netdiskResults && !netdiskLoading && videoTitle) {
                          handleNetDiskSearch(videoTitle);
                        }
                        // 滚动到网盘区域
                        setTimeout(() => {
                          const element = document.getElementById('netdisk-section');
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }, 100);
                      }}
                      className='group relative flex-shrink-0 transition-all duration-300 hover:scale-105'
                    >
                      <div className='absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-300'></div>
                      <div className='relative flex items-center gap-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg hover:shadow-xl transition-all duration-300'>
                        📁
                        {netdiskLoading ? (
                          <span className='flex items-center gap-1'>
                            <span className='inline-block h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin'></span>
                            搜索中...
                          </span>
                        ) : netdiskTotal > 0 ? (
                          <span>{netdiskTotal}个资源</span>
                        ) : (
                          <span>网盘资源</span>
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* 关键信息行 */}
              <div className='flex flex-wrap items-center gap-3 text-base mb-4 opacity-80 flex-shrink-0'>
                {detail?.class && (
                  <span className='text-green-600 font-semibold'>
                    {detail.class}
                  </span>
                )}
                {(detail?.year || videoYear) && (
                  <span>{detail?.year || videoYear}</span>
                )}
                {detail?.source_name && (
                  <span className='border border-gray-500/60 px-2 py-[1px] rounded'>
                    {detail.source_name}
                  </span>
                )}
                {detail?.type_name && <span>{detail.type_name}</span>}
              </div>

              {/* 短剧专用标签展示 */}
              {shortdramaId && (vodClass || vodTag) && (
                <div className='mb-4 flex-shrink-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    {/* vod_class 标签 - 分类标签 */}
                    {vodClass && (
                      <div className='flex items-center gap-1'>
                        <span className='text-xs text-gray-500 dark:text-gray-400 font-medium'>
                          分类:
                        </span>
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getTagColor(vodClass, true)}`}
                        >
                          📂 {vodClass}
                        </span>
                      </div>
                    )}

                    {/* vod_tag 标签 - 内容标签 */}
                    {vodTag && parseVodTags(vodTag).length > 0 && (
                      <div className='flex items-center gap-1 flex-wrap'>
                        <span className='text-xs text-gray-500 dark:text-gray-400 font-medium'>
                          标签:
                        </span>
                        {parseVodTags(vodTag).map((tag, index) => (
                          <span
                            key={index}
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getTagColor(tag, false)}`}
                          >
                            🏷️ {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 详细信息（豆瓣或bangumi） */}
              {currentSource !== 'shortdrama' && videoDoubanId && videoDoubanId !== 0 && detail && detail.source !== 'shortdrama' && (
                <div className='mb-4 flex-shrink-0'>
                  {/* 加载状态 */}
                  {(loadingMovieDetails || loadingBangumiDetails) && !movieDetails && !bangumiDetails && (
                    <div className='animate-pulse'>
                      <div className='h-4 bg-gray-300 rounded w-64 mb-2'></div>
                      <div className='h-4 bg-gray-300 rounded w-48'></div>
                    </div>
                  )}
                  
                  {/* Bangumi详情 */}
                  {bangumiDetails && (
                    <div className='space-y-2 text-sm'>
                      {/* Bangumi评分 */}
                      {bangumiDetails.rating?.score && parseFloat(bangumiDetails.rating.score) > 0 && (
                        <div className='flex items-center gap-2'>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>Bangumi评分: </span>
                          <div className='flex items-center group'>
                            <span className='relative text-transparent bg-clip-text bg-gradient-to-r from-pink-600 via-rose-600 to-pink-600 dark:from-pink-400 dark:via-rose-400 dark:to-pink-400 font-bold text-lg transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_2px_8px_rgba(236,72,153,0.5)]'>
                              {bangumiDetails.rating.score}
                            </span>
                            <div className='flex ml-2 gap-0.5'>
                              {[...Array(5)].map((_, i) => (
                                <svg
                                  key={i}
                                  className={`w-4 h-4 transition-all duration-300 ${
                                    i < Math.floor(parseFloat(bangumiDetails.rating.score) / 2)
                                      ? 'text-pink-500 drop-shadow-[0_0_4px_rgba(236,72,153,0.5)] group-hover:scale-110'
                                      : 'text-gray-300 dark:text-gray-600'
                                  }`}
                                  fill='currentColor'
                                  viewBox='0 0 20 20'
                                  style={{ transitionDelay: `${i * 50}ms` }}
                                >
                                  <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                                </svg>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 制作信息从infobox提取 */}
                      {bangumiDetails.infobox && bangumiDetails.infobox.map((info: any, index: number) => {
                        if (info.key === '导演' && info.value) {
                          const directors = Array.isArray(info.value) ? info.value.map((v: any) => v.v || v).join('、') : info.value;
                          return (
                            <div key={index}>
                              <span className='font-semibold text-gray-700 dark:text-gray-300'>导演: </span>
                              <span className='text-gray-600 dark:text-gray-400'>{directors}</span>
                            </div>
                          );
                        }
                        if (info.key === '制作' && info.value) {
                          const studios = Array.isArray(info.value) ? info.value.map((v: any) => v.v || v).join('、') : info.value;
                          return (
                            <div key={index}>
                              <span className='font-semibold text-gray-700 dark:text-gray-300'>制作: </span>
                              <span className='text-gray-600 dark:text-gray-400'>{studios}</span>
                            </div>
                          );
                        }
                        return null;
                      })}
                      
                      {/* 播出日期 */}
                      {bangumiDetails.date && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>播出日期: </span>
                          <span className='text-gray-600 dark:text-gray-400'>{bangumiDetails.date}</span>
                        </div>
                      )}
                      
                      {/* 标签信息 */}
                      <div className='flex flex-wrap gap-2 mt-3'>
                        {bangumiDetails.tags && bangumiDetails.tags.slice(0, 4).map((tag: any, index: number) => (
                          <span key={index} className='relative group bg-gradient-to-r from-blue-500/90 to-indigo-500/90 dark:from-blue-600/90 dark:to-indigo-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{tag.name}</span>
                          </span>
                        ))}
                        {bangumiDetails.total_episodes && (
                          <span className='relative group bg-gradient-to-r from-green-500/90 to-emerald-500/90 dark:from-green-600/90 dark:to-emerald-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>共{bangumiDetails.total_episodes}话</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 豆瓣详情 */}
                  {movieDetails && (
                    <div className='space-y-2 text-sm'>
                      {/* 豆瓣评分 */}
                      {movieDetails.rate && movieDetails.rate !== "0" && parseFloat(movieDetails.rate) > 0 && (
                        <div className='flex items-center gap-2'>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>豆瓣评分: </span>
                          <div className='flex items-center group'>
                            <span className='relative text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 via-amber-600 to-yellow-600 dark:from-yellow-400 dark:via-amber-400 dark:to-yellow-400 font-bold text-lg transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_2px_8px_rgba(251,191,36,0.5)]'>
                              {movieDetails.rate}
                            </span>
                            <div className='flex ml-2 gap-0.5'>
                              {[...Array(5)].map((_, i) => (
                                <svg
                                  key={i}
                                  className={`w-4 h-4 transition-all duration-300 ${
                                    i < Math.floor(parseFloat(movieDetails.rate) / 2)
                                      ? 'text-yellow-500 drop-shadow-[0_0_4px_rgba(234,179,8,0.5)] group-hover:scale-110'
                                      : 'text-gray-300 dark:text-gray-600'
                                  }`}
                                  fill='currentColor'
                                  viewBox='0 0 20 20'
                                  style={{ transitionDelay: `${i * 50}ms` }}
                                >
                                  <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                                </svg>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 导演 */}
                      {movieDetails.directors && movieDetails.directors.length > 0 && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>导演: </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {movieDetails.directors.join('、')}
                          </span>
                        </div>
                      )}
                      
                      {/* 编剧 */}
                      {movieDetails.screenwriters && movieDetails.screenwriters.length > 0 && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>编剧: </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {movieDetails.screenwriters.join('、')}
                          </span>
                        </div>
                      )}
                      
                      {/* 主演 */}
                      {movieDetails.cast && movieDetails.cast.length > 0 && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>主演: </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {movieDetails.cast.join('、')}
                          </span>
                        </div>
                      )}
                      
                      {/* 首播日期 */}
                      {movieDetails.first_aired && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>
                            {movieDetails.episodes ? '首播' : '上映'}: 
                          </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {movieDetails.first_aired}
                          </span>
                        </div>
                      )}
                      
                      {/* 标签信息 */}
                      <div className='flex flex-wrap gap-2 mt-3'>
                        {movieDetails.countries && movieDetails.countries.slice(0, 2).map((country: string, index: number) => (
                          <span key={index} className='relative group bg-gradient-to-r from-blue-500/90 to-cyan-500/90 dark:from-blue-600/90 dark:to-cyan-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{country}</span>
                          </span>
                        ))}
                        {movieDetails.languages && movieDetails.languages.slice(0, 2).map((language: string, index: number) => (
                          <span key={index} className='relative group bg-gradient-to-r from-purple-500/90 to-pink-500/90 dark:from-purple-600/90 dark:to-pink-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{language}</span>
                          </span>
                        ))}
                        {movieDetails.episodes && (
                          <span className='relative group bg-gradient-to-r from-green-500/90 to-emerald-500/90 dark:from-green-600/90 dark:to-emerald-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>共{movieDetails.episodes}集</span>
                          </span>
                        )}
                        {movieDetails.episode_length && (
                          <span className='relative group bg-gradient-to-r from-orange-500/90 to-amber-500/90 dark:from-orange-600/90 dark:to-amber-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-orange-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-orange-400 to-amber-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>单集{movieDetails.episode_length}分钟</span>
                          </span>
                        )}
                        {movieDetails.movie_duration && (
                          <span className='relative group bg-gradient-to-r from-red-500/90 to-rose-500/90 dark:from-red-600/90 dark:to-rose-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-red-400 to-rose-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{movieDetails.movie_duration}分钟</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 短剧详细信息 */}
              {detail?.source === 'shortdrama' && (
                <div className='mb-4 flex-shrink-0'>
                  <div className='space-y-2 text-sm'>
                    {/* 集数信息 */}
                    {detail?.episodes && detail.episodes.length > 0 && (
                      <div className='flex flex-wrap gap-2'>
                        <span className='relative group bg-gradient-to-r from-blue-500/90 to-indigo-500/90 dark:from-blue-600/90 dark:to-indigo-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105'>
                          <span className='absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                          <span className='relative'>共{detail.episodes.length}集</span>
                        </span>
                        <span className='relative group bg-gradient-to-r from-green-500/90 to-emerald-500/90 dark:from-green-600/90 dark:to-emerald-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-105'>
                          <span className='absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                          <span className='relative'>短剧</span>
                        </span>
                        <span className='relative group bg-gradient-to-r from-purple-500/90 to-pink-500/90 dark:from-purple-600/90 dark:to-pink-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300 hover:scale-105'>
                          <span className='absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                          <span className='relative'>{detail.year}年</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 剧情简介 */}
              {(detail?.desc || bangumiDetails?.summary) && (
                <div
                  className='mt-0 text-base leading-relaxed opacity-90 overflow-y-auto pr-2 flex-1 min-h-0 scrollbar-hide'
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {bangumiDetails?.summary || detail?.desc}
                </div>
              )}

              {/* 演员阵容 */}
              {movieDetails?.celebrities && movieDetails.celebrities.length > 0 && (
                <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-6'>
                  <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2'>
                    <span>🎭</span>
                    <span>演员阵容</span>
                  </h3>
                  <div className='flex gap-4 overflow-x-auto pb-4 scrollbar-hide'>
                    {movieDetails.celebrities.slice(0, 15).map((celebrity: any) => (
                      <div
                        key={celebrity.id}
                        onClick={() => handleCelebrityClick(celebrity.name)}
                        className='flex-shrink-0 text-center group cursor-pointer'
                      >
                        <div className='w-20 h-20 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 mb-2 ring-2 ring-transparent group-hover:ring-blue-500 transition-all duration-300 group-hover:scale-110 shadow-md group-hover:shadow-xl'>
                          <img
                            src={processImageUrl(celebrity.avatar)}
                            alt={celebrity.name}
                            className='w-full h-full object-cover'
                            loading='lazy'
                            onError={(e) => {
                              console.error('演员头像加载失败:', celebrity.name, celebrity.avatar, processImageUrl(celebrity.avatar));
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                        <p className='text-xs font-medium text-gray-700 dark:text-gray-300 w-20 truncate group-hover:text-blue-500 transition-colors' title={celebrity.name}>
                          {celebrity.name}
                        </p>
                        {celebrity.role && (
                          <p className='text-[10px] text-gray-500 dark:text-gray-500 w-20 truncate mt-0.5' title={celebrity.role}>
                            {celebrity.role}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 演员作品展示 */}
              {selectedCelebrityName && (
                <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-6'>
                  <div className='flex justify-between items-center mb-4'>
                    <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2'>
                      <span>🎬</span>
                      <span>{selectedCelebrityName} 的作品</span>
                    </h3>
                    <button
                      onClick={() => {
                        setSelectedCelebrityName(null);
                        setCelebrityWorks([]);
                      }}
                      className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    >
                      收起 ✕
                    </button>
                  </div>

                  {loadingCelebrityWorks ? (
                    <div className='flex flex-col items-center justify-center py-12'>
                      <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4'></div>
                      <p className='text-gray-600 dark:text-gray-400'>正在加载作品...</p>
                    </div>
                  ) : celebrityWorks.length > 0 ? (
                    <>
                      <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                        找到 {celebrityWorks.length} 部相关作品
                      </p>
                      <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
                        {celebrityWorks.map((work: any) => {
                          const playUrl = `/play?title=${encodeURIComponent(work.title)}&douban_id=${work.id}&prefer=true`;
                          return (
                            <div
                              key={work.id}
                              ref={(node) => {
                                if (node) {
                                  // 移除旧的监听器
                                  const oldClick = (node as any)._clickHandler;
                                  const oldTouchStart = (node as any)._touchStartHandler;
                                  const oldTouchEnd = (node as any)._touchEndHandler;
                                  if (oldClick) node.removeEventListener('click', oldClick, true);
                                  if (oldTouchStart) node.removeEventListener('touchstart', oldTouchStart, true);
                                  if (oldTouchEnd) node.removeEventListener('touchend', oldTouchEnd, true);

                                  // 长按检测
                                  let touchStartTime = 0;
                                  let isLongPress = false;
                                  let longPressTimer: NodeJS.Timeout | null = null;

                                  const touchStartHandler = (e: Event) => {
                                    touchStartTime = Date.now();
                                    isLongPress = false;

                                    // 设置长按定时器（500ms）
                                    longPressTimer = setTimeout(() => {
                                      isLongPress = true;
                                    }, 500);
                                  };

                                  const touchEndHandler = (e: Event) => {
                                    // 清除长按定时器
                                    if (longPressTimer) {
                                      clearTimeout(longPressTimer);
                                      longPressTimer = null;
                                    }

                                    const touchDuration = Date.now() - touchStartTime;

                                    // 如果是长按（超过500ms）或已标记为长按，不跳转
                                    if (isLongPress || touchDuration >= 500) {
                                      // 让 VideoCard 的长按菜单正常工作
                                      return;
                                    }

                                    // 否则是短按，执行跳转
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.stopImmediatePropagation();
                                    window.location.href = playUrl;
                                  };

                                  const clickHandler = (e: Event) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.stopImmediatePropagation();
                                    window.location.href = playUrl;
                                  };

                                  node.addEventListener('touchstart', touchStartHandler, true);
                                  node.addEventListener('touchend', touchEndHandler, true);
                                  node.addEventListener('click', clickHandler, true);

                                  // 保存引用以便清理
                                  (node as any)._touchStartHandler = touchStartHandler;
                                  (node as any)._touchEndHandler = touchEndHandler;
                                  (node as any)._clickHandler = clickHandler;
                                }
                              }}
                              style={{
                                WebkitTapHighlightColor: 'transparent',
                                touchAction: 'manipulation'
                              }}
                            >
                              <VideoCard
                                id={work.id}
                                title={work.title}
                                poster={work.poster}
                                rate={work.rate}
                                year={work.year}
                                from='douban'
                                douban_id={parseInt(work.id)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className='text-center py-12'>
                      <p className='text-gray-500 dark:text-gray-400 mb-2'>暂无相关作品</p>
                      <p className='text-sm text-gray-400 dark:text-gray-500'>
                        可能该演员的作品暂未收录
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 网盘资源区域 */}
              <div id="netdisk-section" className='mt-6'>
                <div className='border-t border-gray-200 dark:border-gray-700 pt-6'>
                  <div className='mb-4'>
                    <h3 className='text-xl font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2'>
                      📁 网盘资源
                      {netdiskLoading && (
                        <span className='inline-block align-middle'>
                          <span className='inline-block h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin'></span>
                        </span>
                      )}
                      {netdiskTotal > 0 && (
                        <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'>
                          {netdiskTotal} 个资源
                        </span>
                      )}
                    </h3>
                    {videoTitle && !netdiskLoading && !netdiskResults && (
                      <p className='text-sm text-gray-500 dark:text-gray-400 mt-2'>
                        点击上方"📁 网盘资源"按钮开始搜索
                      </p>
                    )}
                    {videoTitle && !netdiskLoading && (netdiskResults || netdiskError) && (
                      <p className='text-sm text-gray-500 dark:text-gray-400 mt-2'>
                        搜索关键词：{videoTitle}
                      </p>
                    )}
                  </div>
                  
                  <NetDiskSearchResults
                    results={netdiskResults}
                    loading={netdiskLoading}
                    error={netdiskError}
                    total={netdiskTotal}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 封面展示 */}
          <div className='hidden md:block md:col-span-1 md:order-first'>
            <div className='pl-0 py-4 pr-6'>
              <div className='group relative bg-gray-300 dark:bg-gray-700 aspect-[2/3] flex items-center justify-center rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]'>
                {(videoCover || bangumiDetails?.images?.large) ? (
                  <>
                    {/* 渐变光泽动画层 */}
                    <div
                      className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10'
                      style={{
                        background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.15) 55%, transparent 70%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 2.5s ease-in-out infinite',
                      }}
                    />

                    <img
                      src={processImageUrl(bangumiDetails?.images?.large || videoCover)}
                      alt={videoTitle}
                      className='w-full h-full object-cover transition-transform duration-500 group-hover:scale-105'
                    />

                    {/* 悬浮遮罩 */}
                    <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500'></div>

                    {/* 链接按钮（bangumi或豆瓣） */}
                    {videoDoubanId !== 0 && (
                      <a
                        href={
                          bangumiDetails
                            ? `https://bgm.tv/subject/${videoDoubanId.toString()}`
                            : `https://movie.douban.com/subject/${videoDoubanId.toString()}`
                        }
                        target='_blank'
                        rel='noopener noreferrer'
                        className='absolute top-3 left-3 z-20'
                      >
                        <div className={`relative ${bangumiDetails ? 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600' : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'} text-white text-xs font-bold w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 ease-out hover:scale-110 group/link`}>
                          <div className={`absolute inset-0 ${bangumiDetails ? 'bg-pink-400' : 'bg-green-400'} rounded-full opacity-0 group-hover/link:opacity-30 blur transition-opacity duration-300`}></div>
                          <svg
                            width='18'
                            height='18'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            className='relative z-10'
                          >
                            <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'></path>
                            <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'></path>
                          </svg>
                        </div>
                      </a>
                    )}
                  </>
                ) : (
                  <span className='text-gray-600 dark:text-gray-400'>
                    封面图片
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 返回顶部悬浮按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed right-6 z-[500] w-12 h-12 rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group relative overflow-hidden ${
          showBackToTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        style={{
          position: 'fixed',
          right: '1.5rem',
          bottom: typeof window !== 'undefined' && window.innerWidth < 768 ? '5rem' : '1.5rem',
          left: 'auto'
        }}
        aria-label='返回顶部'
      >
        {/* 渐变背景 */}
        <div className='absolute inset-0 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 group-hover:from-green-600 group-hover:via-emerald-600 group-hover:to-teal-600 transition-all duration-300'></div>

        {/* 发光效果 */}
        <div className='absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 opacity-0 group-hover:opacity-50 blur-md transition-all duration-300'></div>

        {/* 脉冲光环 */}
        <div className='absolute inset-0 rounded-full border-2 border-white/30 animate-ping group-hover:opacity-0 transition-opacity duration-300'></div>

        <ChevronUp className='w-6 h-6 text-white relative z-10 transition-all duration-300 group-hover:scale-110 group-hover:-translate-y-1' />
      </button>
      {/* 新增：弹幕加载面板 */}
      {danmakuPanelOpen && (
        <div className='fixed inset-0 z-[710] flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm'>
          <div className='relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 dark:text-gray-100'>
            <button
              onClick={() => setDanmakuPanelOpen(false)}
              className='absolute right-3 top-3 rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              aria-label='关闭弹幕面板'
            >
              <X className='h-4 w-4' />
            </button>

            <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
              在线弹幕
            </h2>

            <div className='mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'>
              <p className='font-medium'>💡 推荐使用剧集弹幕</p>
              <p className='mt-1 text-xs'>
                对于连续剧，建议使用含"ss"或"md"的番剧链接、season_id 或
                media_id 加载弹幕。
                系统会自动记住该剧的弹幕配置，切换集数时自动加载对应弹幕。
              </p>
            </div>

            <div className='mt-4 space-y-3'>
              <div className='flex items-center gap-3'>
                <label className='w-24 text-sm text-gray-600 dark:text-gray-400'>
                  类型
                </label>
                <select
                  value={danmakuSourceType}
                  onChange={(e) => setDanmakuSourceType(e.target.value as any)}
                  className='flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800'
                >
                  <option value='link'>链接</option>
                  <option value='bv'>BV</option>
                  <option value='season_id'>season_id</option>
                  <option value='media_id'>media_id</option>
                  <option value='cid'>cid</option>
                  <option value='local'>本地</option>
                </select>
              </div>
              {danmakuSourceType !== 'local' ? (
                <div className='flex items-center gap-3'>
                  <label className='w-24 text-sm text-gray-600 dark:text-gray-400'>
                    输入
                  </label>
                  <input
                    value={danmakuInput}
                    onChange={(e) => setDanmakuInput(e.target.value)}
                    placeholder={
                      danmakuSourceType === 'bv'
                        ? '例如 BV1xx411c7mD 或含 BV 的链接'
                        : danmakuSourceType === 'season_id'
                        ? '例如 33802'
                        : danmakuSourceType === 'media_id'
                        ? '例如 28237168'
                        : danmakuSourceType === 'cid'
                        ? '例如 210288241'
                        : '粘贴 B站链接（含 BV/番剧 ss 或 md）或任意可解析链接'
                    }
                    className='flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800'
                  />
                </div>
              ) : (
                <div className='flex flex-col gap-2'>
                  <div className='flex items-center gap-3'>
                    <label className='w-24 text-sm text-gray-600 dark:text-gray-400'>
                      文件
                    </label>
                    <input
                      type='file'
                      accept='.xml,.XML,.ass,.ASS,.json,.JSON'
                      multiple
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          const fileArray = Array.from(files);
                          if (fileArray.length === 1) {
                            // 单文件：保持原逻辑
                            danmakuFileRef.current = fileArray[0];
                            danmakuFilesRef.current = [];
                            setDanmakuFilesList([]);
                            setDanmakuInput(fileArray[0].name);
                          } else {
                            // 多文件：批量模式 - 智能排序
                            const extractEpisodeNumber = (filename: string): number => {
                              // 尝试多种模式提取集数
                              // 模式1: 第X集、第X话、第X期
                              let match = filename.match(/第(\d+)[集话期]/);
                              if (match) return parseInt(match[1]);
                              
                              // 模式2: 正片_数字 (如：正片_01)
                              match = filename.match(/正片[_\s](\d+)/);
                              if (match) return parseInt(match[1]);
                              
                              // 模式3: EP数字、ep数字、E数字 (如：EP01, E01)
                              match = filename.match(/[Ee][Pp]?(\d+)/);
                              if (match) return parseInt(match[1]);
                              
                              // 模式4: 纯数字开头 (如：01、001)
                              match = filename.match(/^(\d+)/);
                              if (match) return parseInt(match[1]);
                              
                              // 模式5: 文件名中的任意连续数字 (如：包含"12"的文件)
                              match = filename.match(/(\d+)/);
                              if (match) return parseInt(match[1]);
                              
                              // 无法提取，返回一个大数使其排在最后
                              return 999999;
                            };
                            
                            const sortedFiles = fileArray.sort((a, b) => {
                              const numA = extractEpisodeNumber(a.name);
                              const numB = extractEpisodeNumber(b.name);
                              
                              // 如果集数不同，按集数排序
                              if (numA !== numB) {
                                return numA - numB;
                              }
                              
                              // 集数相同，按文件名字母顺序排序
                              return a.name.localeCompare(b.name, 'zh-CN');
                            });
                            
                            danmakuFileRef.current = null;
                            danmakuFilesRef.current = sortedFiles;
                            setDanmakuFilesList(sortedFiles);
                            setDanmakuInput(`已选择 ${fileArray.length} 个文件`);
                          }
                        }
                      }}
                      className='flex-1 text-sm text-gray-600 dark:text-gray-400'
                    />
                  </div>
                  {danmakuFilesList.length > 0 && (
                    <div className='ml-24 pl-2 border-l-2 border-blue-400 dark:border-blue-600'>
                      <div className='text-xs font-medium text-blue-600 dark:text-blue-400 mb-1'>
                        将从第1集开始匹配 ({danmakuFilesList.length} 个文件):
                      </div>
                      <div className='text-xs text-gray-500 dark:text-gray-400 space-y-0.5 max-h-32 overflow-y-auto'>
                        {danmakuFilesList.map((f, idx) => (
                          <div key={idx} className='flex items-center gap-2'>
                            <span className='text-blue-500 dark:text-blue-400 font-mono'>第{idx + 1}集</span>
                            <span className='text-gray-600 dark:text-gray-300'>→</span>
                            <span className='truncate'>{f.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(danmakuSourceType === 'season_id' ||
                danmakuSourceType === 'media_id') && (
                <div className='flex items-center gap-3'>
                  <label className='w-24 text-sm text-gray-600 dark:text-gray-400'>
                    集数(ep)
                  </label>
                  <input
                    type='number'
                    min={1}
                    value={danmakuEp}
                    onChange={(e) =>
                      setDanmakuEp(Math.max(1, Number(e.target.value) || 1))
                    }
                    className='w-28 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800'
                  />
                </div>
              )}
              {danmakuSourceType === 'bv' && (
                <div className='flex items-center gap-3'>
                  <label className='w-24 text-sm text-gray-600 dark:text-gray-400'>
                    分P(p)
                  </label>
                  <input
                    type='number'
                    min={1}
                    value={danmakuP}
                    onChange={(e) =>
                      setDanmakuP(Math.max(1, Number(e.target.value) || 1))
                    }
                    className='w-28 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800'
                  />
                </div>
              )}

              {danmakuMsg ? (
                <div className='text-sm text-amber-700 dark:text-amber-300'>
                  {danmakuMsg}
                </div>
              ) : null}

              <div className='mt-2 flex justify-end gap-2'>
                <button
                  onClick={() => setDanmakuPanelOpen(false)}
                  className='rounded-md border border-gray-300 px-3 py-1.5 text-sm transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
                >
                  取消
                </button>
                <button
                  disabled={danmakuLoading}
                  onClick={async () => {
                    try {
                      setDanmakuLoading(true);
                      setDanmakuMsg(null);
                      if (!danmakuEnabled) setDanmakuEnabled(true);

                      // 处理本地文件上传
                      if (danmakuSourceType === 'local') {
                        // 批量模式
                        if (danmakuFilesRef.current.length > 1) {
                          const files = danmakuFilesRef.current;
                          await saveBatchDanmakuConfig(files);
                          
                          // 加载第一个文件(对应第1集)
                          const firstFile = files[0];
                          const text = await firstFile.text();
                          await loadDanmakuFromText(text);
                          
                          setDanmakuMsg(`已加载批量弹幕 (1/${files.length}): ${firstFile.name}`);
                          setTimeout(() => setDanmakuPanelOpen(false), 1000);
                          return;
                        }
                        
                        // 单文件模式
                        const file = danmakuFileRef.current;
                        if (!file) throw new Error('请选择文件');
                        const text = await file.text();
                        await loadDanmakuFromText(text);
                        setDanmakuMsg('已加载');
                        setTimeout(() => setDanmakuPanelOpen(false), 300);
                        return;
                      }

                      // 处理在线弹幕
                      let url = '';
                      if (danmakuSourceType === 'cid') {
                        const cid = danmakuInput.trim();
                        if (!cid) throw new Error('请输入 cid');
                        url = `/api/danmaku/bilibili?cid=${encodeURIComponent(
                          cid
                        )}`;
                      } else if (danmakuSourceType === 'bv') {
                        const v = danmakuInput.trim();
                        if (!v) throw new Error('请输入 BV 或含 BV 的链接');
                        url = `/api/danmaku/bilibili?bv=${encodeURIComponent(
                          v
                        )}&p=${encodeURIComponent(String(danmakuP))}`;
                      } else if (danmakuSourceType === 'season_id') {
                        const id = danmakuInput.trim();
                        if (!id) throw new Error('请输入 season_id');
                        url = `/api/danmaku/bilibili?season_id=${encodeURIComponent(
                          id
                        )}&ep=${encodeURIComponent(String(danmakuEp))}`;
                      } else if (danmakuSourceType === 'media_id') {
                        const id = danmakuInput.trim();
                        if (!id) throw new Error('请输入 media_id');
                        url = `/api/danmaku/bilibili?media_id=${encodeURIComponent(
                          id
                        )}&ep=${encodeURIComponent(String(danmakuEp))}`;
                      } else {
                        // link：支持 BV 普链，或番剧 ss/md 链接
                        const link = danmakuInput.trim();
                        if (!link) throw new Error('请输入链接');
                        url = `/api/danmaku/bilibili?link=${encodeURIComponent(
                          link
                        )}`;
                      }

                      // 直接把 API URL 交由插件加载，避免前端解析失败
                      await loadDanmakuFromUrl(url);

                      // 保存加载历史
                      saveDanmakuHistory(
                        danmakuSourceType,
                        danmakuInput.trim(),
                        danmakuSourceType === 'season_id' ||
                          danmakuSourceType === 'media_id'
                          ? danmakuEp
                          : undefined,
                        danmakuSourceType === 'bv' ? danmakuP : undefined
                      );

                      // 标记成功并关闭面板（若插件未就绪，会延迟应用）
                      setDanmakuMsg('已加载');
                      setTimeout(() => setDanmakuPanelOpen(false), 300);
                    } catch (e: any) {
                      console.error('加载在线弹幕失败', e);
                      const msg = e?.message || '加载失败';
                      setDanmakuMsg(msg);
                      triggerGlobalError(msg);
                    } finally {
                      setDanmakuLoading(false);
                    }
                  }}
                  className='rounded-md border border-blue-500 bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:border-blue-600 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:border-blue-500 disabled:hover:bg-blue-500'
                >
                  {danmakuLoading ? '加载中...' : '加载弹幕'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

// FavoriteIcon 组件
const FavoriteIcon = ({ filled }: { filled: boolean }) => {
  if (filled) {
    return (
      <svg
        className='h-7 w-7'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'
      >
        <path
          d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
          fill='#ef4444' /* Tailwind red-500 */
          stroke='#ef4444'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    );
  }
  return (
    <Heart className='h-7 w-7 stroke-[1] text-gray-600 dark:text-gray-300' />
  );
};

// 新增：错误边界组件
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-900">
          <div className="rounded-lg bg-red-900/20 p-8 text-center">
            <h2 className="mb-4 text-2xl font-bold text-red-500">页面加载失败</h2>
            <p className="mb-4 text-gray-300">
              {this.state.error?.message || '未知错误'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function PlayPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div>Loading...</div>}>
        <PlayPageClient />
      </Suspense>
    </ErrorBoundary>
  );
}
