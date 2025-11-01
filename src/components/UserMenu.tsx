/* eslint-disable no-console,@typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

'use client';

import {
  BarChart3,
  Bell,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  Database,
  ExternalLink,
  Heart,
  KeyRound,
  LogOut,
  PlayCircle,
  Settings,
  Shield,
  Tv,
  User,
  Upload,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { DEFAULT_CMS_VIDEO_SOURCES } from '@/lib/default-video-sources';
import { CURRENT_VERSION } from '@/lib/version';
import { checkForUpdates, UpdateStatus } from '@/lib/version_check';
import {
  getCachedWatchingUpdates,
  getDetailedWatchingUpdates,
  subscribeToWatchingUpdatesEvent,
  checkWatchingUpdates,
  type WatchingUpdate,
} from '@/lib/watching-updates';
import {
  getAllPlayRecords,
  forceRefreshPlayRecordsCache,
  type PlayRecord,
} from '@/lib/db.client';
import type { Favorite } from '@/lib/types';

import { VersionPanel } from './VersionPanel';
import VideoCard from './VideoCard';
import { useToast } from './Toast';
import { speedTestAllSources } from './SourceAvailabilityChecker';

interface AuthInfo {
  username?: string;
  role?: 'owner' | 'admin' | 'user';
  avatar?: string;
}

export const UserMenu: React.FC<{ className?: string }> = ({ className }) => {
  const router = useRouter();
  const { showError, showSuccess, showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isChangeAvatarOpen, setIsChangeAvatarOpen] = useState(false);
  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);
  const [isWatchingUpdatesOpen, setIsWatchingUpdatesOpen] = useState(false);
  const [isContinueWatchingOpen, setIsContinueWatchingOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [storageType, setStorageType] = useState<string>('localstorage');
  
  useEffect(() => {
    // 🔧 优化：在客户端挂载后从 RUNTIME_CONFIG 读取，避免水合错误
    if (typeof window !== 'undefined') {
      setStorageType((window as any).RUNTIME_CONFIG?.STORAGE_TYPE || 'localstorage');
    }
  }, []);
  const [mounted, setMounted] = useState(false);
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(null);
  const [playRecords, setPlayRecords] = useState<(PlayRecord & { key: string })[]>([]);
  const [favorites, setFavorites] = useState<(Favorite & { key: string })[]>([]);
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(false);

  // --- 以下为新增状态变量 ---
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const isAdmin = authInfo?.role === 'owner' || authInfo?.role === 'admin';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 裁剪相关状态
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    width: 80,
    height: 80,
    x: 10,
    y: 10,
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imageRef = useRef<HTMLImageElement>(null);
  const [showCropper, setShowCropper] = useState(false);

  // Body 滚动锁定 - 使用 overflow 方式避免布局问题
  useEffect(() => {
    if (isSettingsOpen || isChangePasswordOpen || isWatchingUpdatesOpen || isContinueWatchingOpen || isFavoritesOpen || isChangeAvatarOpen) {
      const body = document.body;
      const html = document.documentElement;

      // 保存原始样式
      const originalBodyOverflow = body.style.overflow;
      const originalHtmlOverflow = html.style.overflow;

      // 只设置 overflow 来阻止滚动
      body.style.overflow = 'hidden';
      html.style.overflow = 'hidden';

      return () => {

        // 恢复所有原始样式
        body.style.overflow = originalBodyOverflow;
        html.style.overflow = originalHtmlOverflow;
      };
    }
  }, [isSettingsOpen, isChangePasswordOpen, isWatchingUpdatesOpen, isContinueWatchingOpen, isFavoritesOpen, isChangeAvatarOpen]);
  // 设置相关状态
  const [defaultAggregateSearch, setDefaultAggregateSearch] = useState(true);
  const [doubanProxyUrl, setDoubanProxyUrl] = useState('');
  const [enableOptimization, setEnableOptimization] = useState(false);
  const [fluidSearch, setFluidSearch] = useState(true);
  const [liveDirectConnect, setLiveDirectConnect] = useState(false);
  const [doubanDataSource, setDoubanDataSource] = useState('direct');
  const [doubanImageProxyType, setDoubanImageProxyType] = useState('direct');
  const [doubanImageProxyUrl, setDoubanImageProxyUrl] = useState('');
  const [continueWatchingMinProgress, setContinueWatchingMinProgress] = useState(5);
  const [continueWatchingMaxProgress, setContinueWatchingMaxProgress] = useState(100);
  const [enableContinueWatchingFilter, setEnableContinueWatchingFilter] = useState(false);
  const [isDoubanDropdownOpen, setIsDoubanDropdownOpen] = useState(false);
  const [isDoubanImageProxyDropdownOpen, setIsDoubanImageProxyDropdownOpen] =
    useState(false);
  // 跳过片头片尾相关设置
  const [enableAutoSkip, setEnableAutoSkip] = useState(true);
  const [enableAutoNextEpisode, setEnableAutoNextEpisode] = useState(true);

  // 豆瓣数据源选项
  const doubanDataSourceOptions = [
    { value: 'direct', label: '直连（服务器直接请求豆瓣）' },
    { value: 'cors-proxy-zwei', label: 'Cors Proxy By Zwei' },
    {
      value: 'cmliussss-cdn-tencent',
      label: '豆瓣 CDN By CMLiussss（腾讯云）',
    },
    { value: 'cmliussss-cdn-ali', label: '豆瓣 CDN By CMLiussss（阿里云）' },
    { value: 'custom', label: '自定义代理' },
  ];

  // 豆瓣图片代理选项
  const doubanImageProxyTypeOptions = [
    { value: 'direct', label: '直连（浏览器直接请求豆瓣）' },
    { value: 'server', label: '服务器代理（由服务器代理请求豆瓣）' },
    { value: 'img3', label: '豆瓣官方精品 CDN（阿里云）' },
    {
      value: 'cmliussss-cdn-tencent',
      label: '豆瓣 CDN By CMLiussss（腾讯云）',
    },
    { value: 'cmliussss-cdn-ali', label: '豆瓣 CDN By CMLiussss（阿里云）' },
    { value: 'custom', label: '自定义代理' },
  ];

  // 修改密码相关状态
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // 版本检查相关状态
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // 新增：视频源管理相关状态
  interface VideoSource {
    key: string;
    name: string;
    api: string;
    detail?: string;
    disabled?: boolean;
    from?: 'config' | 'custom'; // 添加 from 属性以区分来源
  }
  const [isVideoSourceOpen, setIsVideoSourceOpen] = useState(false);
  const [videoSources, setVideoSources] = useState<VideoSource[]>([]);
  const [editingSource, setEditingSource] = useState<VideoSource | null>(null);
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [isSpeedTesting, setIsSpeedTesting] = useState(false);
  const [isSourcesLoading, setIsSourcesLoading] = useState(false); // 新增加载状态
  const [sourcesError, setSourcesError] = useState<string | null>(null); // 新增错误状态
  // 新增：弹幕下载相关状态
  const [isDanmakuDownloadOpen, setIsDanmakuDownloadOpen] = useState(false);
  const [danmakuInput, setDanmakuInput] = useState('');
  const [danmakuFormat, setDanmakuFormat] = useState('xml');
  const [danmakuLoading, setDanmakuLoading] = useState(false);
  const [danmakuError, setDanmakuError] = useState('');
  const [danmakuSavePath, setDanmakuSavePath] = useState('');
  const [showNameInput, setShowNameInput] = useState('');
  const [danmakuDuration, setDanmakuDuration] = useState('5'); // SRT/ASS 显示时长

  interface EpisodeItem {
    title: string;
    cid: number;
    section?: string;
    selected?: boolean;
  }
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [baseTitle, setBaseTitle] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragEndIndex, setDragEndIndex] = useState<number | null>(null);
  const [dragInitialState, setDragInitialState] = useState<boolean>(false);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // 初始化弹幕下载的默认保存路径（Electron环境）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[弹幕下载] 检查 Electron API:', !!(window as any).electronAPI);
      if ((window as any).electronAPI) {
        console.log('[弹幕下载] Electron API 可用，获取桌面路径...');
        (window as any).electronAPI.getDesktopPath().then((desktopPath: string) => {
          const defaultPath = `${desktopPath}/弹幕`;
          console.log('[弹幕下载] 默认保存路径:', defaultPath);
          setDanmakuSavePath(defaultPath);
        }).catch((err: any) => {
          console.error('[弹幕下载] 获取桌面路径失败:', err);
          setDanmakuSavePath('弹幕'); // 降级到相对路径
        });
      } else {
        console.warn('[弹幕下载] Electron API 不可用，可能未在 Electron 环境中运行');
        setDanmakuSavePath('弹幕');
      }
    }
  }, []);

  // 确保组件已挂载
  useEffect(() => {
    setMounted(true);
    // 移动端检测逻辑
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // 获取认证信息
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = getAuthInfoFromBrowserCookie();
      setAuthInfo(auth);
      // 从API获取头像
      if (auth?.username) {
        fetchUserAvatar(auth.username);
      }
    }
  }, []);

  // 从 localStorage 读取设置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAggregateSearch = localStorage.getItem(
        'defaultAggregateSearch'
      );
      if (savedAggregateSearch !== null) {
        setDefaultAggregateSearch(JSON.parse(savedAggregateSearch));
      }

      const savedDoubanDataSource = localStorage.getItem('doubanDataSource');
      const defaultDoubanProxyType =
        (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY_TYPE || 'direct';
      if (savedDoubanDataSource !== null) {
        setDoubanDataSource(savedDoubanDataSource);
      } else if (defaultDoubanProxyType) {
        setDoubanDataSource(defaultDoubanProxyType);
      }

      const savedDoubanProxyUrl = localStorage.getItem('doubanProxyUrl');
      const defaultDoubanProxy =
        (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY || '';
      if (savedDoubanProxyUrl !== null) {
        setDoubanProxyUrl(savedDoubanProxyUrl);
      } else if (defaultDoubanProxy) {
        setDoubanProxyUrl(defaultDoubanProxy);
      }

      const savedDoubanImageProxyType = localStorage.getItem(
        'doubanImageProxyType'
      );
      const defaultDoubanImageProxyType =
        (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY_TYPE || 'direct';
      if (savedDoubanImageProxyType !== null) {
        setDoubanImageProxyType(savedDoubanImageProxyType);
      } else if (defaultDoubanImageProxyType) {
        setDoubanImageProxyType(defaultDoubanImageProxyType);
      }

      const savedDoubanImageProxyUrl = localStorage.getItem(
        'doubanImageProxyUrl'
      );
      const defaultDoubanImageProxyUrl =
        (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY || '';
      if (savedDoubanImageProxyUrl !== null) {
        setDoubanImageProxyUrl(savedDoubanImageProxyUrl);
      } else if (defaultDoubanImageProxyUrl) {
        setDoubanImageProxyUrl(defaultDoubanImageProxyUrl);
      }

      const savedEnableOptimization =
        localStorage.getItem('enableOptimization');
      if (savedEnableOptimization !== null) {
        setEnableOptimization(JSON.parse(savedEnableOptimization));
      }

      const savedFluidSearch = localStorage.getItem('fluidSearch');
      const defaultFluidSearch =
        (window as any).RUNTIME_CONFIG?.FLUID_SEARCH !== false;
      if (savedFluidSearch !== null) {
        setFluidSearch(JSON.parse(savedFluidSearch));
      } else if (defaultFluidSearch !== undefined) {
        setFluidSearch(defaultFluidSearch);
      }

      const savedLiveDirectConnect = localStorage.getItem('liveDirectConnect');
      if (savedLiveDirectConnect !== null) {
        setLiveDirectConnect(JSON.parse(savedLiveDirectConnect));
      }

      const savedContinueWatchingMinProgress = localStorage.getItem('continueWatchingMinProgress');
      if (savedContinueWatchingMinProgress !== null) {
        setContinueWatchingMinProgress(parseInt(savedContinueWatchingMinProgress));
      }

      const savedContinueWatchingMaxProgress = localStorage.getItem('continueWatchingMaxProgress');
      if (savedContinueWatchingMaxProgress !== null) {
        setContinueWatchingMaxProgress(parseInt(savedContinueWatchingMaxProgress));
      }

      const savedEnableContinueWatchingFilter = localStorage.getItem('enableContinueWatchingFilter');
      if (savedEnableContinueWatchingFilter !== null) {
        setEnableContinueWatchingFilter(JSON.parse(savedEnableContinueWatchingFilter));
      }

      // 读取跳过片头片尾设置（默认开启）
      const savedEnableAutoSkip = localStorage.getItem('enableAutoSkip');
      if (savedEnableAutoSkip !== null) {
        setEnableAutoSkip(JSON.parse(savedEnableAutoSkip));
      }

      const savedEnableAutoNextEpisode = localStorage.getItem('enableAutoNextEpisode');
      if (savedEnableAutoNextEpisode !== null) {
        setEnableAutoNextEpisode(JSON.parse(savedEnableAutoNextEpisode));
      }
    }
  }, []);

  // 新增：从API获取视频源
  const fetchSources = useCallback(async () => {
    setIsSourcesLoading(true);
    setSourcesError(null);
    try {
      const response = await fetch('/api/sources');
      if (!response.ok) {
        throw new Error('获取视频源失败');
      }
      const data = await response.json();
      setVideoSources(data.sources || []);
    } catch (error: any) {
      setSourcesError(error.message);
      showError('加载视频源列表失败', error.message);
    } finally {
      setIsSourcesLoading(false);
    }
  }, [showError]);

  // 当视频源管理面板打开时获取数据
  useEffect(() => {
    if (isVideoSourceOpen) {
      fetchSources();
    }
  }, [isVideoSourceOpen, fetchSources]);

  // 版本检查
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (error) {
        console.warn('版本检查失败:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

  // 获取观看更新信息
  useEffect(() => {
    console.log('UserMenu watching-updates 检查条件:', {
      'window': typeof window !== 'undefined',
      'authInfo.username': authInfo?.username,
      'storageType': storageType,
      'storageType !== localstorage': storageType !== 'localstorage'
    });

    if (typeof window !== 'undefined' && authInfo?.username && storageType !== 'localstorage') {
      console.log('开始加载 watching-updates 数据...');

      const updateWatchingUpdates = () => {
        const updates = getDetailedWatchingUpdates();
        console.log('getDetailedWatchingUpdates 返回:', updates);
        setWatchingUpdates(updates);

        // 检测是否有新更新（只检查新剧集更新，不包括继续观看）
        if (updates && (updates.updatedCount || 0) > 0) {
          const lastViewed = parseInt(localStorage.getItem('watchingUpdatesLastViewed') || '0');
          const currentTime = Date.now();

          // 如果从未查看过，或者距离上次查看超过1分钟，认为有新更新
          const hasNewUpdates = lastViewed === 0 || (currentTime - lastViewed > 60000);
          setHasUnreadUpdates(hasNewUpdates);
        } else {
          setHasUnreadUpdates(false);
        }
      };

      // 页面初始化时强制检查一次更新（绕过缓存限制）
      const forceInitialCheck = async () => {
        console.log('页面初始化，强制检查更新...');
        try {
          // 🔧 修复：直接使用 forceRefresh=true，不再手动操作 localStorage
          // 因为 kvrocks 模式使用内存缓存，删除 localStorage 无效
          await checkWatchingUpdates(true);

          // 更新UI
          updateWatchingUpdates();
          console.log('页面初始化更新检查完成');
        } catch (error) {
          console.error('页面初始化检查更新失败:', error);
          // 失败时仍然尝试从缓存加载
          updateWatchingUpdates();
        }
      };

      // 先尝试从缓存加载，然后强制检查
      const cachedUpdates = getCachedWatchingUpdates();
      if (cachedUpdates) {
        console.log('发现缓存数据，先加载缓存');
        updateWatchingUpdates();
      }

      // 🔧 修复：延迟1秒后在后台执行更新检查，避免阻塞页面初始加载
      setTimeout(() => {
        forceInitialCheck();
      }, 1000);

      // 订阅更新事件
      const unsubscribe = subscribeToWatchingUpdatesEvent(() => {
        console.log('收到 watching-updates 事件，更新数据...');
        updateWatchingUpdates();
      });

      return unsubscribe;
    } else {
      console.log('watching-updates 条件不满足，跳过加载');
    }
  }, [authInfo, storageType]);

  // 加载播放记录（优化版）
  useEffect(() => {
    if (typeof window !== 'undefined' && authInfo?.username && storageType !== 'localstorage') {
      const loadPlayRecords = async () => {
        try {
          const records = await getAllPlayRecords();
          const recordsArray = Object.entries(records).map(([key, record]) => ({
            ...record,
            key,
          }));

          // 筛选真正需要继续观看的记录
          const validPlayRecords = recordsArray.filter(record => {
            const progress = getProgress(record);

            // 播放时间必须超过2分钟
            if (record.play_time < 120) return false;

            // 如果禁用了进度筛选，则显示所有播放时间超过2分钟的记录
            if (!enableContinueWatchingFilter) return true;

            // 根据用户自定义的进度范围筛选
            return progress >= continueWatchingMinProgress && progress <= continueWatchingMaxProgress;
          });

          // 按最后播放时间降序排列
          const sortedRecords = validPlayRecords.sort((a, b) => b.save_time - a.save_time);
          setPlayRecords(sortedRecords.slice(0, 12)); // 只取最近的12个
        } catch (error) {
          console.error('加载播放记录失败:', error);
        }
      };

      loadPlayRecords();

      // 监听播放记录更新事件（修复删除记录后页面不立即更新的问题）
      const handlePlayRecordsUpdate = () => {
        console.log('UserMenu: 播放记录更新，重新加载继续观看列表');
        loadPlayRecords();
      };

      // 监听播放记录更新事件
      window.addEventListener('playRecordsUpdated', handlePlayRecordsUpdate);

      // 🔥 新增：监听watching-updates事件，与ContinueWatching组件保持一致
      const unsubscribeWatchingUpdates = subscribeToWatchingUpdatesEvent(() => {
        console.log('UserMenu: 收到watching-updates事件');

        // 当检测到新集数更新时，强制刷新播放记录缓存确保数据同步
        const updates = getDetailedWatchingUpdates();
        if (updates && updates.hasUpdates && updates.updatedCount > 0) {
          console.log('UserMenu: 检测到新集数更新，强制刷新播放记录缓存');
          forceRefreshPlayRecordsCache();

          // 短暂延迟后重新获取播放记录，确保缓存已刷新
          setTimeout(async () => {
            const freshRecords = await getAllPlayRecords();
            const recordsArray = Object.entries(freshRecords).map(([key, record]) => ({
              ...record,
              key,
            }));
            const validPlayRecords = recordsArray.filter(record => {
              const progress = getProgress(record);
              if (record.play_time < 120) return false;
              if (!enableContinueWatchingFilter) return true;
              return progress >= continueWatchingMinProgress && progress <= continueWatchingMaxProgress;
            });
            const sortedRecords = validPlayRecords.sort((a, b) => b.save_time - a.save_time);
            setPlayRecords(sortedRecords.slice(0, 12));
          }, 100);
        }
      });

      return () => {
        window.removeEventListener('playRecordsUpdated', handlePlayRecordsUpdate);
        unsubscribeWatchingUpdates(); // 🔥 清理watching-updates订阅
      };
    }
  }, [authInfo, storageType, enableContinueWatchingFilter, continueWatchingMinProgress, continueWatchingMaxProgress]);

  // 加载收藏数据
  useEffect(() => {
    if (typeof window !== 'undefined' && authInfo?.username && storageType !== 'localstorage') {
      const loadFavorites = async () => {
        try {
          const response = await fetch('/api/favorites');
          if (response.ok) {
            const favoritesData = await response.json() as Record<string, Favorite>;
            const favoritesArray = Object.entries(favoritesData).map(([key, favorite]) => ({
              ...(favorite as Favorite),
              key,
            }));
            // 按保存时间降序排列
            const sortedFavorites = favoritesArray.sort((a, b) => b.save_time - a.save_time);
            setFavorites(sortedFavorites);
          }
        } catch (error) {
          console.error('加载收藏失败:', error);
        }
      };

      loadFavorites();

      // 监听收藏更新事件（修复删除收藏后页面不立即更新的问题）
      const handleFavoritesUpdate = () => {
        console.log('UserMenu: 收藏更新，重新加载收藏列表');
        loadFavorites();
      };

      // 监听收藏更新事件
      window.addEventListener('favoritesUpdated', handleFavoritesUpdate);

      return () => {
        window.removeEventListener('favoritesUpdated', handleFavoritesUpdate);
      };
    }
  }, [authInfo, storageType]);

  // 点击外部区域关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDoubanDropdownOpen) {
        const target = event.target as Element;
        if (!target.closest('[data-dropdown="douban-datasource"]')) {
          setIsDoubanDropdownOpen(false);
        }
      }
    };

    if (isDoubanDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDoubanDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDoubanImageProxyDropdownOpen) {
        const target = event.target as Element;
        if (!target.closest('[data-dropdown="douban-image-proxy"]')) {
          setIsDoubanImageProxyDropdownOpen(false);
        }
      }
    };

    if (isDoubanImageProxyDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDoubanImageProxyDropdownOpen]);

  const handleMenuClick = async () => {
    const willOpen = !isOpen;
    setIsOpen(willOpen);

    // 如果是打开菜单，立即检查更新（不受缓存限制）
    if (willOpen && authInfo?.username && storageType !== 'localstorage') {
      console.log('打开菜单时强制检查更新...');
      try {
        // 暂时清除缓存时间，强制检查一次
        const lastCheckTime = localStorage.getItem('moontv_last_update_check');
        localStorage.removeItem('moontv_last_update_check');

        // 执行检查
        await checkWatchingUpdates();

        // 恢复缓存时间（如果之前有的话）
        if (lastCheckTime) {
          localStorage.setItem('moontv_last_update_check', lastCheckTime);
        }

        // 更新UI状态
        const updates = getDetailedWatchingUpdates();
        setWatchingUpdates(updates);

        // 重新计算未读状态
        if (updates && (updates.updatedCount || 0) > 0) {
          const lastViewed = parseInt(localStorage.getItem('watchingUpdatesLastViewed') || '0');
          const currentTime = Date.now();
          const hasNewUpdates = lastViewed === 0 || (currentTime - lastViewed > 60000);
          setHasUnreadUpdates(hasNewUpdates);
        } else {
          setHasUnreadUpdates(false);
        }

        console.log('菜单打开时的更新检查完成');
      } catch (error) {
        console.error('菜单打开时检查更新失败:', error);
      }
    }
  };

  const handleCloseMenu = () => {
    setIsOpen(false);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('注销请求失败:', error);
    }
    window.location.href = '/';
  };

  const handleAdminPanel = () => {
    router.push('/admin');
  };

  const handlePlayStats = () => {
    setIsOpen(false);
    router.push('/play-stats');
  };

  const handleTVBoxConfig = () => {
    setIsOpen(false);
    router.push('/tvbox');
  };

  const handleReleaseCalendar = () => {
    setIsOpen(false);
    router.push('/release-calendar');
  };

  const handleWatchingUpdates = () => {
    setIsOpen(false);
    setIsWatchingUpdatesOpen(true);
    // 标记为已读
    setHasUnreadUpdates(false);
    const currentTime = Date.now();
    localStorage.setItem('watchingUpdatesLastViewed', currentTime.toString());
  };

  const handleCloseWatchingUpdates = () => {
    setIsWatchingUpdatesOpen(false);
  };

  const handleContinueWatching = () => {
    setIsOpen(false);
    setIsContinueWatchingOpen(true);
  };

  const handleCloseContinueWatching = () => {
    setIsContinueWatchingOpen(false);
  };

  const handleFavorites = () => {
    setIsOpen(false);
    setIsFavoritesOpen(true);
  };

  const handleCloseFavorites = () => {
    setIsFavoritesOpen(false);
  };

  // 从 key 中解析 source 和 id
  const parseKey = (key: string) => {
    const [source, id] = key.split('+');
    return { source, id };
  };

  // 计算播放进度百分比
  const getProgress = (record: PlayRecord) => {
    if (record.total_time === 0) return 0;
    return (record.play_time / record.total_time) * 100;
  };

  // 检查播放记录是否有新集数更新
  const getNewEpisodesCount = (record: PlayRecord & { key: string }): number => {
    if (!watchingUpdates || !watchingUpdates.updatedSeries) return 0;

    const { source, id } = parseKey(record.key);

    // 在watchingUpdates中查找匹配的剧集
    const matchedSeries = watchingUpdates.updatedSeries.find(series =>
      series.sourceKey === source &&
      series.videoId === id &&
      series.hasNewEpisode
    );

    return matchedSeries ? (matchedSeries.newEpisodes || 0) : 0;
  };

  // 头像相关处理函数
  const fetchUserAvatar = async (username: string) => {
    try {
      const response = await fetch(`/api/avatar?user=${encodeURIComponent(username)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.avatar) {
          setAvatarUrl(data.avatar);
        }
      }
    } catch (error) {
      console.error('获取头像失败:', error);
    }
  };

  const handleChangeAvatar = () => {
    setIsOpen(false);
    setIsChangeAvatarOpen(true);
    setSelectedImage('');
    setShowCropper(false);
  };

  const handleCloseChangeAvatar = () => {
    setIsChangeAvatarOpen(false);
    setSelectedImage('');
    setShowCropper(false);
  };

  const handleOpenFileSelector = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('请选择图片文件', '仅支持 JPG、PNG、GIF 等图片格式');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showError('图片大小不能超过 2MB', '请选择较小的图片文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setSelectedImage(event.target.result.toString());
        setShowCropper(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const getCroppedImage = async (
    image: HTMLImageElement,
    crop: PixelCrop
  ): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const cropX = crop.x * scaleX;
    const cropY = crop.y * scaleY;
    const cropWidth = crop.width * scaleX;
    const cropHeight = crop.height * scaleY;
    const outputSize = 200;
    canvas.width = outputSize;
    canvas.height = outputSize;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, outputSize, outputSize);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        }
      }, 'image/jpeg', 0.9);
    });
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const minDimension = Math.min(width, height);
    const cropSize = minDimension * 0.8;
    const cropX = (width - cropSize) / 2;
    const cropY = (height - cropSize) / 2;

    setCrop({ unit: 'px', x: cropX, y: cropY, width: cropSize, height: cropSize });
  };

  const handleConfirmCrop = async () => {
    if (!completedCrop || !imageRef.current || !authInfo?.username) return;

    try {
      setIsUploadingAvatar(true);
      const croppedImageBase64 = await getCroppedImage(imageRef.current, completedCrop);
      const response = await fetch('/api/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: croppedImageBase64, targetUser: authInfo.username }),
      });

      if (response.ok) {
        setAvatarUrl(croppedImageBase64);
        showSuccess('头像上传成功', '您的头像已更新');
        handleCloseChangeAvatar();
      } else {
        const errorData = await response.json();
        showError('头像上传失败', errorData.error || '请稍后重试');
      }
    } catch (error) {
      console.error('上传头像失败:', error);
      showError('头像上传失败', '网络错误，请稍后重试');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleChangePassword = () => {
    setIsOpen(false);
    setIsChangePasswordOpen(true);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleCloseChangePassword = () => {
    setIsChangePasswordOpen(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleSubmitChangePassword = async () => {
    setPasswordError('');

    // 验证密码
    if (!newPassword) {
      setPasswordError('新密码不得为空');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPasswordError(data.error || '修改密码失败');
        return;
      }

      // 修改成功，关闭弹窗并登出
      setIsChangePasswordOpen(false);
      await handleLogout();
    } catch (error) {
      setPasswordError('网络错误，请稍后重试');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSettings = () => {
    setIsOpen(false);
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
  };

  // 设置相关的处理函数
  const handleAggregateToggle = (value: boolean) => {
    setDefaultAggregateSearch(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('defaultAggregateSearch', JSON.stringify(value));
    }
  };

  const handleDoubanProxyUrlChange = (value: string) => {
    setDoubanProxyUrl(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doubanProxyUrl', value);
    }
  };

  const handleOptimizationToggle = (value: boolean) => {
    setEnableOptimization(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enableOptimization', JSON.stringify(value));
    }
  };

  const handleFluidSearchToggle = (value: boolean) => {
    setFluidSearch(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('fluidSearch', JSON.stringify(value));
    }
  };

  const handleLiveDirectConnectToggle = (value: boolean) => {
    setLiveDirectConnect(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('liveDirectConnect', JSON.stringify(value));
    }
  };

  const handleContinueWatchingMinProgressChange = (value: number) => {
    setContinueWatchingMinProgress(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('continueWatchingMinProgress', value.toString());
    }
  };

  const handleContinueWatchingMaxProgressChange = (value: number) => {
    setContinueWatchingMaxProgress(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('continueWatchingMaxProgress', value.toString());
    }
  };

  const handleEnableContinueWatchingFilterToggle = (value: boolean) => {
    setEnableContinueWatchingFilter(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enableContinueWatchingFilter', JSON.stringify(value));
    }
  };

  const handleEnableAutoSkipToggle = (value: boolean) => {
    setEnableAutoSkip(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enableAutoSkip', JSON.stringify(value));
      // 🔑 通知 SkipController localStorage 已更新
      window.dispatchEvent(new Event('localStorageChanged'));
    }
  };

  const handleEnableAutoNextEpisodeToggle = (value: boolean) => {
    setEnableAutoNextEpisode(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enableAutoNextEpisode', JSON.stringify(value));
      // 🔑 通知 SkipController localStorage 已更新
      window.dispatchEvent(new Event('localStorageChanged'));
    }
  };

  const handleDoubanDataSourceChange = (value: string) => {
    setDoubanDataSource(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doubanDataSource', value);
    }
  };

  const handleDoubanImageProxyTypeChange = (value: string) => {
    setDoubanImageProxyType(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doubanImageProxyType', value);
    }
  };

  const handleDoubanImageProxyUrlChange = (value: string) => {
    setDoubanImageProxyUrl(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doubanImageProxyUrl', value);
    }
  };

  // 获取感谢信息
  const getThanksInfo = (dataSource: string) => {
    switch (dataSource) {
      case 'cors-proxy-zwei':
        return {
          text: 'Thanks to @Zwei',
          url: 'https://github.com/bestzwei',
        };
      case 'cmliussss-cdn-tencent':
      case 'cmliussss-cdn-ali':
        return {
          text: 'Thanks to @CMLiussss',
          url: 'https://github.com/cmliu',
        };
      default:
        return null;
    }
  };

  const handleResetSettings = () => {
    const defaultDoubanProxyType =
      (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY_TYPE || 'direct';
    const defaultDoubanProxy =
      (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY || '';
    const defaultDoubanImageProxyType =
      (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY_TYPE || 'direct';
    const defaultDoubanImageProxyUrl =
      (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY || '';
    const defaultFluidSearch =
      (window as any).RUNTIME_CONFIG?.FLUID_SEARCH !== false;

    setDefaultAggregateSearch(true);
    setEnableOptimization(false);
    setFluidSearch(defaultFluidSearch);
    setLiveDirectConnect(false);
    setDoubanProxyUrl(defaultDoubanProxy);
    setDoubanDataSource(defaultDoubanProxyType);
    setDoubanImageProxyType(defaultDoubanImageProxyType);
    setDoubanImageProxyUrl(defaultDoubanImageProxyUrl);
    setContinueWatchingMinProgress(5);
    setContinueWatchingMaxProgress(100);
    setEnableContinueWatchingFilter(false);
    setEnableAutoSkip(true);
    setEnableAutoNextEpisode(true);

    if (typeof window !== 'undefined') {
      localStorage.setItem('defaultAggregateSearch', JSON.stringify(true));
      localStorage.setItem('enableOptimization', JSON.stringify(false));
      localStorage.setItem('fluidSearch', JSON.stringify(defaultFluidSearch));
      localStorage.setItem('liveDirectConnect', JSON.stringify(false));
      localStorage.setItem('doubanProxyUrl', defaultDoubanProxy);
      localStorage.setItem('doubanDataSource', defaultDoubanProxyType);
      localStorage.setItem('doubanImageProxyType', defaultDoubanImageProxyType);
      localStorage.setItem('doubanImageProxyUrl', defaultDoubanImageProxyUrl);
      localStorage.setItem('continueWatchingMinProgress', '5');
      localStorage.setItem('continueWatchingMaxProgress', '100');
      localStorage.setItem('enableContinueWatchingFilter', JSON.stringify(false));
      localStorage.setItem('enableAutoSkip', JSON.stringify(true));
      localStorage.setItem('enableAutoNextEpisode', JSON.stringify(true));
    }
  };

  // 新增：视频源管理相关函数
  const handleVideoSource = () => {
    setIsOpen(false);
    setIsVideoSourceOpen(true);
  };

  const handleCloseVideoSource = () => {
    setIsVideoSourceOpen(false);
  };

  const handleAddSource = () => {
    setEditingSource({
      key: '',
      name: '',
      api: '',
      detail: '',
      disabled: false,
    });
    setIsAddingSource(true);
  };

  const handleEditSource = (source: VideoSource) => {
    setEditingSource({ ...source });
    setIsAddingSource(false);
  };

  const handleDeleteSource = async (key: string) => {
    if (!window.confirm(`确定要删除视频源 [${videoSources.find(s => s.key === key)?.name}] 吗？`)) {
      return;
    }

    try {
      const response = await fetch('/api/admin/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', key }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '删除失败');
      }

      showSuccess('视频源删除成功');
      await fetchSources(); // 重新获取列表
    } catch (error: any) {
      showError('删除视频源失败', error.message);
    }
  };

  const handleSaveSource = async () => {
    if (!editingSource) return;

    if (!editingSource.key || !editingSource.name || !editingSource.api) {
      showError('请填写完整的视频源信息(key、名称、API地址为必填项)');
      return;
    }

    const action = isAddingSource ? 'add' : 'edit';
    const payload = {
      action,
      key: editingSource.key,
      name: editingSource.name,
      api: editingSource.api,
      detail: editingSource.detail || '',
    };

    try {
      const response = await fetch('/api/admin/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      showSuccess(`视频源${isAddingSource ? '添加' : '编辑'}成功`);
      setEditingSource(null);
      setIsAddingSource(false);
      await fetchSources(); // 重新获取列表
    } catch (error: any) {
      showError(`保存视频源失败`, error.message);
    }
  };

  const handleCancelEditSource = () => {
    setEditingSource(null);
    setIsAddingSource(false);
  };

  const handleToggleSourceStatus = async (key: string, currentDisabled: boolean) => {
    const action = currentDisabled ? 'enable' : 'disable';
    try {
      const response = await fetch('/api/admin/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, key }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '操作失败');
      }

      // 乐观更新UI
      setVideoSources(prevSources =>
        prevSources.map(s =>
          s.key === key ? { ...s, disabled: !s.disabled } : s
        )
      );
    } catch (error: any) {
      showError('切换状态失败', error.message);
    }
  };

  const handleEnableAllAvailableSources = () => {
    if (confirm('确定要启用所有可用视频源吗?\n\n这将清除测速时的屏蔽列表,所有未手动禁用的视频源都将被启用。建议仅在需要更多视频源时使用。')) {
      localStorage.removeItem('danmutv_blocked_sources');
      showToast({
        title: '已启用所有可用视频源!刷新页面后生效,搜索时将使用所有未被手动禁用的视频源。',
        type: 'success',
        duration: 6000,
      });
    }
  };

  const handleManualSpeedTest = async () => {
    if (isSpeedTesting) {
      showToast({ title: '测速正在进行中，请稍候...', type: 'info', duration: 2000 });
      return;
    }

    if (!confirm('确定要开始视频源测速吗?\n\n这将测试所有未禁用的视频源,并保留速度最快的前20个。测速过程可能需要几秒钟。')) {
      return;
    }

    setIsSpeedTesting(true);
    showToast({ title: '开始视频源测速，请稍候...', type: 'info', duration: 3000 });

    try {
      // 强制测速时，清除时间戳缓存
      localStorage.removeItem('source_speed_test_timestamp');
      await speedTestAllSources();
      // 成功提示已在 speedTestAllSources 内部通过 GlobalToast 显示，此处不再重复提示
    } catch (error) {
      console.error('手动视频源测速失败:', error);
      showToast({ title: '视频源测速失败，请稍后重试', type: 'error', duration: 5000 });
    } finally {
      setIsSpeedTesting(false);
    }
  };

  // 新增：弹幕下载相关函数
  const handleResolveInput = async () => {
    const input = danmakuInput.trim();
    if (!input) {
      setDanmakuError('请输入ID或链接');
      return;
    }

    setIsResolving(true);
    setDanmakuError('');
    setEpisodes([]);

    try {
      const { kind, value } = detectInputKind(input);
      console.log('[弹幕下载] 识别类型:', kind, '值:', value);

      let title = '';
      let items: EpisodeItem[] = [];

      if (kind === 'media_id') {
        const data = await parseMediaId(value);
        title = data.title;
        items = data.episodes;
      } else if (kind === 'season_id') {
        const data = await parseSeasonId(value);
        title = data.title;
        items = data.episodes;
      } else if (kind === 'ep_id') {
        const data = await parseEpId(value);
        title = data.title;
        items = data.episodes;
      } else if (kind === 'bvid') {
        const data = await parseBvid(value);
        title = data.title;
        items = data.episodes;
      } else if (kind === 'cid') {
        title = `cid_${value}`;
        items = [{ title: `CID ${value}`, cid: parseInt(value), section: '单集', selected: true }];
      } else {
        throw new Error('无法识别输入类型，请检查输入');
      }

      setBaseTitle(title);
      setEpisodes(items.map(item => ({ ...item, selected: true })));
      setDanmakuError('');
      showToast({ title: `解析完成，共 ${items.length} 条`, type: 'success' });
    } catch (e: any) {
      console.error('[弹幕下载] 解析失败:', e);
      setDanmakuError(e?.message || '解析失败');
    } finally {
      setIsResolving(false);
    }
  };

  const detectInputKind = (text: string): { kind: string; value: string } => {
    const t = text.trim();
    if (t.startsWith('http')) {
      try {
        const url = new URL(t);
        const path = url.pathname;
        const bvMatch = path.match(/\/video\/(BV[0-9A-Za-z]{10,})/i);
        if (bvMatch) return { kind: 'bvid', value: bvMatch[1] };
        const mdMatch = path.match(/\/bangumi\/(?:media\/)?(md\d+)/i);
        if (mdMatch) return { kind: 'media_id', value: mdMatch[1].substring(2) };
        const ssMatch = path.match(/\/bangumi\/(?:season\/)?(ss\d+)/i);
        if (ssMatch) return { kind: 'season_id', value: ssMatch[1].substring(2) };
        const epMatch = path.match(/\/bangumi\/play\/(ep\d+)/i);
        if (epMatch) return { kind: 'ep_id', value: epMatch[1].substring(2) };
        const bvid = url.searchParams.get('bvid');
        if (bvid) return { kind: 'bvid', value: bvid };
        const cid = url.searchParams.get('cid');
        if (cid && /^\d+$/.test(cid)) return { kind: 'cid', value: cid };
      } catch (e) { /* continue */ }
    }
    if (/^BV[0-9A-Za-z]{10}$/i.test(t)) return { kind: 'bvid', value: t };
    if (/^md\d+$/i.test(t)) return { kind: 'media_id', value: t.substring(2) };
    if (/^ss\d+$/i.test(t)) return { kind: 'season_id', value: t.substring(2) };
    if (/^ep\d+$/i.test(t)) return { kind: 'ep_id', value: t.substring(2) };
    if (/^\d{5,}$/.test(t)) return { kind: 'cid', value: t };
    return { kind: 'unknown', value: t };
  };

  const parseMediaId = async (mediaId: string) => {
    const resp = await fetch(`https://api.bilibili.com/pgc/review/user?media_id=${mediaId}`);
    const data = await resp.json();
    if (data.code !== 0) throw new Error(data.message || '接口返回错误');
    const seasonId = data.result.media.season_id;
    const title = data.result.media.title || `season_${seasonId}`;
    const seasonData = await parseSeasonId(String(seasonId));
    return { title, episodes: seasonData.episodes };
  };

  const parseSeasonId = async (seasonId: string) => {
    const resp = await fetch(`https://api.bilibili.com/pgc/web/season/section?season_id=${seasonId}`);
    const data = await resp.json();
    if (data.code !== 0) throw new Error(data.message || '接口返回错误');
    const result = data.result || {};
    const episodes: EpisodeItem[] = [];
    const main = result.main_section || {};
    const title = main.title || `season_${seasonId}`;
    (main.episodes || []).forEach((ep: any) => {
      episodes.push({
        title: `${ep.title || ''} ${ep.long_title || ''}`.trim() || String(ep.id),
        cid: parseInt(ep.cid),
        section: main.title || '正片',
      });
    });
    (result.section || []).forEach((sec: any) => {
      const secTitle = sec.title || '其他';
      (sec.episodes || []).forEach((ep: any) => {
        episodes.push({
          title: `${ep.title || ''} ${ep.long_title || ''}`.trim() || String(ep.id),
          cid: parseInt(ep.cid),
          section: secTitle,
        });
      });
    });
    return { title, episodes };
  };

  const parseEpId = async (epId: string) => {
    const resp = await fetch(`https://api.bilibili.com/pgc/view/web/season?ep_id=${epId}`);
    const data = await resp.json();
    if (data.code !== 0) throw new Error(data.message || '接口返回错误');
    const result = data.result || {};
    const seasonTitle = result.season_title || `season_${result.season_id}`;
    const episodes: EpisodeItem[] = [];
    (result.episodes || []).forEach((ep: any) => {
      episodes.push({
        title: `${ep.title || ''} ${ep.long_title || ''}`.trim() || String(ep.id),
        cid: parseInt(ep.cid),
        section: '正片',
      });
    });
    return { title: seasonTitle, episodes };
  };

  const parseBvid = async (bvid: string) => {
    const resp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
    const data = await resp.json();
    if (data.code !== 0) throw new Error(data.message || '接口返回错误');
    const videoData = data.data || {};
    const title = videoData.title || bvid;
    const episodes: EpisodeItem[] = [];
    (videoData.pages || []).forEach((p: any) => {
      episodes.push({
        title: p.part || `P${p.page}`,
        cid: parseInt(p.cid),
        section: 'PAGES',
      });
    });
    return { title, episodes };
  };

  const handleEpisodeClick = (index: number, event: React.MouseEvent) => {
    if (event.shiftKey && lastClickedIndex !== null) {
      event.preventDefault();
      event.stopPropagation();
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const newEps = [...episodes];
      for (let i = start; i <= end; i++) {
        newEps[i].selected = true;
      }
      setEpisodes(newEps);
    }
  };

  const handleMouseDown = (index: number, event: React.MouseEvent) => {
    if (event.shiftKey) return;
    event.preventDefault();
    setDragStartIndex(index);
    setDragEndIndex(index);
    setDragInitialState(!episodes[index].selected);
  };

  const handleMouseEnter = (index: number) => {
    if (dragStartIndex === null) return;
    if (index !== dragStartIndex && !isDragging) {
      setIsDragging(true);
    }
    setDragEndIndex(index);
  };

  const handleMouseUp = () => {
    if (dragStartIndex !== null) {
      if (isDragging && dragEndIndex !== null) {
        const start = Math.min(dragStartIndex, dragEndIndex);
        const end = Math.max(dragStartIndex, dragEndIndex);
        const newEps = [...episodes];
        for (let i = start; i <= end; i++) {
          newEps[i].selected = dragInitialState;
        }
        setEpisodes(newEps);
        setLastClickedIndex(dragStartIndex);
      } else {
        const newEps = [...episodes];
        newEps[dragStartIndex].selected = !newEps[dragStartIndex].selected;
        setEpisodes(newEps);
        setLastClickedIndex(dragStartIndex);
      }
    }
    setIsDragging(false);
    setDragStartIndex(null);
    setDragEndIndex(null);
  };

  useEffect(() => {
    if (dragStartIndex !== null) {
      document.addEventListener('mouseup', handleMouseUp);
      return () => document.removeEventListener('mouseup', handleMouseUp);
    }
  }, [dragStartIndex, dragEndIndex, isDragging, episodes, dragInitialState]);

  interface DanmakuEntry { time: number; mode: number; size: number; color: number; text: string; }
  
  const sanitizeFilename = (name: string): string => {
    return name.replace(/[\\/:*?"<>|]/g, '_').trim().substring(0, 120);
  };

  const parseXmlToDanmakuEntries = (xmlText: string): DanmakuEntry[] => {
    const entries: DanmakuEntry[] = [];
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const dElements = xmlDoc.querySelectorAll('d');
      dElements.forEach(d => {
        const p = d.getAttribute('p');
        if (!p) return;
        const parts = p.split(',');
        if (parts.length < 4) return;
        try {
          entries.push({
            time: parseFloat(parts[0]),
            mode: parseInt(parts[1]),
            size: parseInt(parts[2]),
            color: parseInt(parts[3]),
            text: (d.textContent || '').replace(/[\r\n]/g, ' '),
          });
        } catch (e) { /* skip */ }
      });
    } catch (e) {
      console.error('解析XML失败:', e);
    }
    entries.sort((a, b) => a.time - b.time);
    return entries;
  };

  const formatSRTTimestamp = (seconds: number): string => {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  };

  const convertToSRT = (entries: DanmakuEntry[], duration: number): string => {
    let srt = '';
    entries.forEach((entry, index) => {
      const start = formatSRTTimestamp(entry.time);
      const end = formatSRTTimestamp(entry.time + duration);
      srt += `${index + 1}\n${start} --> ${end}\n${entry.text}\n\n`;
    });
    return srt;
  };

  const formatASSTimestamp = (seconds: number): string => {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.round((seconds - Math.floor(seconds)) * 100);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  };

  const convertToASS = (entries: DanmakuEntry[], duration: number): string => {
    let ass = `[Script Info]\n; Script generated by DanmuTV\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Danmaku, Microsoft YaHei, 36, &H00FFFFFF, &H000000FF, &H00222222, &H64000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 2, 0, 8, 10, 10, 10, 1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
    entries.forEach(entry => {
      const start = formatASSTimestamp(entry.time);
      const end = formatASSTimestamp(entry.time + duration);
      let align = '{\\an8}'; // default top
      if (entry.mode === 4) align = '{\\an2}'; // bottom
      else if (entry.mode === 5) align = '{\\an8}'; // top
      const text = entry.text.replace(/[{}]/g, '');
      ass += `Dialogue: 0,${start},${end},Danmaku,,0,0,0,,${align}${text}\n`;
    });
    return ass;
  };

  const handleDanmakuDownload = async () => {
    const selectedEps = episodes.filter(ep => ep.selected);
    if (selectedEps.length === 0) {
      setDanmakuError('请先解析并选择要下载的集数');
      return;
    }
    setDanmakuLoading(true);
    setDanmakuError('');
    try {
      const folderName = sanitizeFilename(showNameInput || baseTitle || 'danmu');
      const format = danmakuFormat;
      const duration = parseFloat(danmakuDuration) || 5.0;
      let successCount = 0;
      let failCount = 0;
      const saveDir = `${danmakuSavePath}/${folderName}`;
      for (let i = 0; i < selectedEps.length; i++) {
        const ep = selectedEps[i];
        try {
          const xmlUrl = `/api/danmaku/bilibili?cid=${ep.cid}`;
          const resp = await fetch(xmlUrl);
          if (!resp.ok) throw new Error('下载失败');
          const xmlData = await resp.text();
          const fileName = sanitizeFilename(
            `${ep.section || ''}_${ep.title}_cid${ep.cid}`.replace(/^_/, '')
          );
          let fileData = '';
          let fileExt = format;
          if (format === 'xml') {
            fileData = xmlData;
          } else if (format === 'srt') {
            const entries = parseXmlToDanmakuEntries(xmlData);
            fileData = convertToSRT(entries, duration);
          } else if (format === 'ass') {
            const entries = parseXmlToDanmakuEntries(xmlData);
            fileData = convertToASS(entries, duration);
          }
          // 集成 Electron 文件保存逻辑
          if (typeof window !== 'undefined' && (window as any).electronAPI) {
            const fullPath = `${saveDir}/${fileName}.${fileExt}`;
            const result = await (window as any).electronAPI.saveFile(fullPath, fileData);
            if (!result.success) throw new Error(result.error);
            console.log(`[${i+1}/${selectedEps.length}] 已保存: ${result.filePath}`);
          } else {
            // 浏览器降级下载
            const blob = new Blob([fileData], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${folderName}/${fileName}.${fileExt}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
          }
          successCount++;
        } catch (e: any) {
          console.error(`[${i+1}/${selectedEps.length}] 失败: cid=${ep.cid}`, e);
          failCount++;
        }
      }
      setIsDanmakuDownloadOpen(false);
      showToast({
        title: `下载完成！成功 ${successCount} 条，失败 ${failCount} 条`,
        type: successCount > 0 ? 'success' : 'error',
        duration: 6000,
      });
    } catch (e: any) {
      setDanmakuError(e?.message || '下载失败');
    } finally {
      setDanmakuLoading(false);
    }
  };
  
  // 检查是否显示管理面板按钮
  const showAdminPanel =
    authInfo?.role === 'owner' || authInfo?.role === 'admin';

  // 检查是否显示修改密码按钮
  const showChangePassword =
    authInfo?.role !== 'owner' && storageType !== 'localstorage';

  // 检查是否显示播放统计按钮（所有登录用户，且非localstorage存储）
  const showPlayStats = authInfo?.username && storageType !== 'localstorage';

  // 检查是否显示更新提醒按钮（登录用户且非localstorage存储就显示）
  const showWatchingUpdates = authInfo?.username && storageType !== 'localstorage';

  // 检查是否有实际更新（用于显示红点）- 只检查新剧集更新
  const hasActualUpdates = watchingUpdates && (watchingUpdates.updatedCount || 0) > 0;

  // 计算更新数量（只统计新剧集更新）
  const totalUpdates = watchingUpdates?.updatedCount || 0;

  // 调试信息
  console.log('UserMenu 更新提醒调试:', {
    username: authInfo?.username,
    storageType,
    watchingUpdates,
    showWatchingUpdates,
    hasActualUpdates,
    totalUpdates
  });

  // 角色中文映射
  const getRoleText = (role?: string) => {
    switch (role) {
      case 'owner':
        return '站长';
      case 'admin':
        return '管理员';
      case 'user':
        return '用户';
      default:
        return '';
    }
  };

  // 菜单面板内容
  const menuPanel = (
    <>
      {/* 背景遮罩 - 普通菜单无需模糊 */}
      <div
        className='fixed inset-0 bg-transparent z-[1000]'
        onClick={handleCloseMenu}
      />

      {/* 菜单面板 */}
      <div className='fixed top-14 right-4 w-56 bg-white dark:bg-gray-900 rounded-lg shadow-xl z-[1001] border border-gray-200/50 dark:border-gray-700/50 overflow-hidden select-none'>
        {/* 用户信息区域 */}
        <div className='px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-800/50'>
          <div className='flex items-center gap-3'>
            {/* 用户头像 */}
            <div className='w-10 h-10 rounded-full overflow-hidden relative flex-shrink-0'>
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="用户头像"
                  fill
                  sizes="40px"
                  className='object-cover'
                />
              ) : (
                <div className='w-full h-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center'>
                  <User className='w-6 h-6 text-blue-500 dark:text-blue-400' />
                </div>
              )}
            </div>
            {/* 用户信息 */}
            <div className='flex-1 min-w-0'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  当前用户
                </span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${(authInfo?.role || 'user') === 'owner'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                    : (authInfo?.role || 'user') === 'admin'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    }`}
                >
                  {getRoleText(authInfo?.role || 'user')}
                </span>
              </div>
              <div className='flex items-center justify-between'>
                <div className='font-semibold text-gray-900 dark:text-gray-100 text-sm truncate'>
                  {authInfo?.username || 'default'}
                </div>
                <div className='text-[10px] text-gray-400 dark:text-gray-500'>
                  数据存储：
                  {storageType === 'localstorage' ? '本地' : storageType}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 菜单项 */}
        <div className='py-1'>
          {/* 设置按钮 */}
          <button
            onClick={handleSettings}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Settings className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>设置</span>
          </button>

          {/* 更新提醒按钮 */}
          {showWatchingUpdates && (
            <button
              onClick={handleWatchingUpdates}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm relative'
            >
              <Bell className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>更新提醒</span>
              {hasUnreadUpdates && totalUpdates > 0 && (
                <div className='ml-auto flex items-center gap-1'>
                  <span className='inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full'>
                    {totalUpdates > 99 ? '99+' : totalUpdates}
                  </span>
                </div>
              )}
            </button>
          )}

          {/* 继续观看按钮 */}
          {showWatchingUpdates && (
            <button
              onClick={handleContinueWatching}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm relative'
            >
              <PlayCircle className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>继续观看</span>
              {playRecords.length > 0 && (
                <span className='ml-auto text-xs text-gray-400'>{playRecords.length}</span>
              )}
            </button>
          )}

          {/* 我的收藏按钮 */}
          {showWatchingUpdates && (
            <button
              onClick={handleFavorites}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm relative'
            >
              <Heart className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>我的收藏</span>
              {favorites.length > 0 && (
                <span className='ml-auto text-xs text-gray-400'>{favorites.length}</span>
              )}
            </button>
          )}

          {/* 管理面板按钮 */}
          {showAdminPanel && (
            <button
              onClick={handleAdminPanel}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
            >
              <Shield className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>管理面板</span>
            </button>
          )}

          {/* 播放统计按钮 */}
          {showPlayStats && (
            <button
              onClick={handlePlayStats}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
            >
              <BarChart3 className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>
                {authInfo?.role === 'owner' || authInfo?.role === 'admin' ? '播放统计' : '个人统计'}
              </span>
            </button>
          )}

          {/* 上映日程按钮 */}
          <button
            onClick={handleReleaseCalendar}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Calendar className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>上映日程</span>
          </button>

          {/* TVBox配置按钮 */}
          <button
            onClick={handleTVBoxConfig}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Tv className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>TVBox 配置</span>
          </button>

          {/* 新增：视频源管理按钮 */}
          <button
            onClick={handleVideoSource}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Database className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>视频源管理</span>
          </button>

          {/* 新增：弹幕下载按钮 */}
          <button
            onClick={() => { setIsOpen(false); setIsDanmakuDownloadOpen(true); }}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Database className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>弹幕下载</span>
          </button>
          
          {/* 修改头像按钮 */}
          <button
            onClick={handleChangeAvatar}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Camera className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>修改头像</span>
          </button>
          
          {/* 修改密码按钮 */}
          {showChangePassword && (
            <button
              onClick={handleChangePassword}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
            >
              <KeyRound className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>修改密码</span>
            </button>
          )}

          {/* 分割线 */}
          <div className='my-1 border-t border-gray-200 dark:border-gray-700'></div>

          {/* 登出按钮 */}
          <button
            onClick={handleLogout}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm'
          >
            <LogOut className='w-4 h-4' />
            <span className='font-medium'>登出</span>
          </button>

          {/* 分割线 */}
          <div className='my-1 border-t border-gray-200 dark:border-gray-700'></div>

          {/* 版本信息 */}
          <button
            onClick={() => {
              setIsVersionPanelOpen(true);
              handleCloseMenu();
            }}
            className='w-full px-3 py-2 text-center flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-xs'
          >
            <div className='flex items-center gap-1'>
              <span className='font-mono'>v{CURRENT_VERSION}</span>
              {!isChecking &&
                updateStatus &&
                updateStatus !== UpdateStatus.FETCH_FAILED && (
                  <div
                    className={`w-2 h-2 rounded-full -translate-y-2 ${updateStatus === UpdateStatus.HAS_UPDATE
                      ? 'bg-yellow-500'
                      : updateStatus === UpdateStatus.NO_UPDATE
                        ? 'bg-green-400'
                        : ''
                      }`}
                  ></div>
                )}
            </div>
          </button>
        </div>
      </div>
    </>
  );

  // 设置面板内容
  const settingsPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
        onClick={handleCloseSettings}
        onTouchMove={(e) => {
          // 只阻止滚动，允许其他触摸事件
          e.preventDefault();
        }}
        onWheel={(e) => {
          // 阻止滚轮滚动
          e.preventDefault();
        }}
        style={{
          touchAction: 'none',
        }}
      />

      {/* 设置面板 */}
      <div
        className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl z-[1001] flex flex-col'
      >
        {/* 内容容器 - 独立的滚动区域 */}
        <div
          className='flex-1 p-6 overflow-y-auto'
          data-panel-content
          style={{
            touchAction: 'pan-y', // 只允许垂直滚动
            overscrollBehavior: 'contain', // 防止滚动冒泡
          }}
        >
          {/* 标题栏 */}
          <div className='flex items-center justify-between mb-6'>
            <div className='flex items-center gap-3'>
              <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                本地设置
              </h3>
              <button
                onClick={handleResetSettings}
                className='px-2 py-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-200 hover:border-red-300 dark:border-red-800 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors'
                title='重置为默认设置'
              >
                恢复默认
              </button>
            </div>
            <button
              onClick={handleCloseSettings}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              aria-label='Close'
            >
              <X className='w-full h-full' />
            </button>
          </div>

          {/* 设置项 */}
          <div className='space-y-6'>
            {/* 豆瓣数据源选择 */}
            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  豆瓣数据代理
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  选择获取豆瓣数据的方式
                </p>
              </div>
              <div className='relative' data-dropdown='douban-datasource'>
                {/* 自定义下拉选择框 */}
                <button
                  type='button'
                  onClick={() => setIsDoubanDropdownOpen(!isDoubanDropdownOpen)}
                  className='w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 text-left'
                >
                  {
                    doubanDataSourceOptions.find(
                      (option) => option.value === doubanDataSource
                    )?.label
                  }
                </button>

                {/* 下拉箭头 */}
                <div className='absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none'>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isDoubanDropdownOpen ? 'rotate-180' : ''
                      }`}
                  />
                </div>

                {/* 下拉选项列表 */}
                {isDoubanDropdownOpen && (
                  <div className='absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto'>
                    {doubanDataSourceOptions.map((option) => (
                      <button
                        key={option.value}
                        type='button'
                        onClick={() => {
                          handleDoubanDataSourceChange(option.value);
                          setIsDoubanDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${doubanDataSource === option.value
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                          : 'text-gray-900 dark:text-gray-100'
                          }`}
                      >
                        <span className='truncate'>{option.label}</span>
                        {doubanDataSource === option.value && (
                          <Check className='w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 ml-2' />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 感谢信息 */}
              {getThanksInfo(doubanDataSource) && (
                <div className='mt-3'>
                  <button
                    type='button'
                    onClick={() =>
                      window.open(getThanksInfo(doubanDataSource)!.url, '_blank')
                    }
                    className='flex items-center justify-center gap-1.5 w-full px-3 text-xs text-gray-500 dark:text-gray-400 cursor-pointer'
                  >
                    <span className='font-medium'>
                      {getThanksInfo(doubanDataSource)!.text}
                    </span>
                    <ExternalLink className='w-3.5 opacity-70' />
                  </button>
                </div>
              )}
            </div>

            {/* 豆瓣代理地址设置 - 仅在选择自定义代理时显示 */}
            {doubanDataSource === 'custom' && (
              <div className='space-y-3'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    豆瓣代理地址
                  </h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    自定义代理服务器地址
                  </p>
                </div>
                <input
                  type='text'
                  className='w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 shadow-sm hover:border-gray-400 dark:hover:border-gray-500'
                  placeholder='例如: https://proxy.example.com/fetch?url='
                  value={doubanProxyUrl}
                  onChange={(e) => handleDoubanProxyUrlChange(e.target.value)}
                />
              </div>
            )}

            {/* 分割线 */}
            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 豆瓣图片代理设置 */}
            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  豆瓣图片代理
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  选择获取豆瓣图片的方式
                </p>
              </div>
              <div className='relative' data-dropdown='douban-image-proxy'>
                {/* 自定义下拉选择框 */}
                <button
                  type='button'
                  onClick={() =>
                    setIsDoubanImageProxyDropdownOpen(
                      !isDoubanImageProxyDropdownOpen
                    )
                  }
                  className='w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 text-left'
                >
                  {
                    doubanImageProxyTypeOptions.find(
                      (option) => option.value === doubanImageProxyType
                    )?.label
                  }
                </button>

                {/* 下拉箭头 */}
                <div className='absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none'>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isDoubanDropdownOpen ? 'rotate-180' : ''
                      }`}
                  />
                </div>

                {/* 下拉选项列表 */}
                {isDoubanImageProxyDropdownOpen && (
                  <div className='absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto'>
                    {doubanImageProxyTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        type='button'
                        onClick={() => {
                          handleDoubanImageProxyTypeChange(option.value);
                          setIsDoubanImageProxyDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${doubanImageProxyType === option.value
                          ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                          : 'text-gray-900 dark:text-gray-100'
                          }`}
                      >
                        <span className='truncate'>{option.label}</span>
                        {doubanImageProxyType === option.value && (
                          <Check className='w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 ml-2' />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 感谢信息 */}
              {getThanksInfo(doubanImageProxyType) && (
                <div className='mt-3'>
                  <button
                    type='button'
                    onClick={() =>
                      window.open(
                        getThanksInfo(doubanImageProxyType)!.url,
                        '_blank'
                      )
                    }
                    className='flex items-center justify-center gap-1.5 w-full px-3 text-xs text-gray-500 dark:text-gray-400 cursor-pointer'
                  >
                    <span className='font-medium'>
                      {getThanksInfo(doubanImageProxyType)!.text}
                    </span>
                    <ExternalLink className='w-3.5 opacity-70' />
                  </button>
                </div>
              )}
            </div>

            {/* 豆瓣图片代理地址设置 - 仅在选择自定义代理时显示 */}
            {doubanImageProxyType === 'custom' && (
              <div className='space-y-3'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    豆瓣图片代理地址
                  </h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    自定义图片代理服务器地址
                  </p>
                </div>
                <input
                  type='text'
                  className='w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 shadow-sm hover:border-gray-400 dark:hover:border-gray-500'
                  placeholder='例如: https://proxy.example.com/fetch?url='
                  value={doubanImageProxyUrl}
                  onChange={(e) =>
                    handleDoubanImageProxyUrlChange(e.target.value)
                  }
                />
              </div>
            )}

            {/* 分割线 */}
            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 默认聚合搜索结果 */}
            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  默认聚合搜索结果
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  搜索时默认按标题和年份聚合显示结果
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={defaultAggregateSearch}
                    onChange={(e) => handleAggregateToggle(e.target.checked)}
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>

            {/* 优选和测速 */}
            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  优选和测速
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  如出现播放器劫持问题可关闭
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={enableOptimization}
                    onChange={(e) => handleOptimizationToggle(e.target.checked)}
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>

            {/* 流式搜索 */}
            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  流式搜索输出
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  启用搜索结果实时流式输出，关闭后使用传统一次性搜索
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={fluidSearch}
                    onChange={(e) => handleFluidSearchToggle(e.target.checked)}
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>

            {/* 直播视频浏览器直连 */}
            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  IPTV 视频浏览器直连
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  开启 IPTV 视频浏览器直连时，需要自备 Allow CORS 插件
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={liveDirectConnect}
                    onChange={(e) => handleLiveDirectConnectToggle(e.target.checked)}
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>

            {/* 分割线 */}
            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 跳过片头片尾设置 */}
            <div className='space-y-4'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  跳过片头片尾设置
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  控制播放器默认的片头片尾跳过行为
                </p>
              </div>

              {/* 自动跳过开关 */}
              <div className='flex items-center justify-between'>
                <div>
                  <h5 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    启用自动跳过
                  </h5>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    开启后将自动跳过片头片尾，关闭则显示手动跳过按钮
                  </p>
                </div>
                <label className='flex items-center cursor-pointer'>
                  <div className='relative'>
                    <input
                      type='checkbox'
                      className='sr-only peer'
                      checked={enableAutoSkip}
                      onChange={(e) => handleEnableAutoSkipToggle(e.target.checked)}
                    />
                    <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                    <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                  </div>
                </label>
              </div>

              {/* 自动播放下一集开关 */}
              <div className='flex items-center justify-between'>
                <div>
                  <h5 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    片尾自动播放下一集
                  </h5>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    开启后片尾结束时自动跳转到下一集
                  </p>
                </div>
                <label className='flex items-center cursor-pointer'>
                  <div className='relative'>
                    <input
                      type='checkbox'
                      className='sr-only peer'
                      checked={enableAutoNextEpisode}
                      onChange={(e) => handleEnableAutoNextEpisodeToggle(e.target.checked)}
                    />
                    <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                    <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                  </div>
                </label>
              </div>

              {/* 提示信息 */}
              <div className='text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800'>
                💡 这些设置会作为新视频的默认配置。对于已配置的视频，请在播放页面的"跳过设置"中单独调整。
              </div>
            </div>

            {/* 分割线 */}
            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 继续观看筛选设置 */}
            <div className='space-y-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    继续观看进度筛选
                  </h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    是否启用"继续观看"的播放进度筛选功能
                  </p>
                </div>
                <label className='flex items-center cursor-pointer'>
                  <div className='relative'>
                    <input
                      type='checkbox'
                      className='sr-only peer'
                      checked={enableContinueWatchingFilter}
                      onChange={(e) => handleEnableContinueWatchingFilterToggle(e.target.checked)}
                    />
                    <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                    <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                  </div>
                </label>
              </div>

              {/* 进度范围设置 - 仅在启用筛选时显示 */}
              {enableContinueWatchingFilter && (
                <>
                  <div>
                    <h5 className='text-sm font-medium text-gray-600 dark:text-gray-400 mb-3'>
                      进度范围设置
                    </h5>
                  </div>

                  <div className='grid grid-cols-2 gap-4'>
                    {/* 最小进度设置 */}
                    <div>
                      <label className='block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2'>
                        最小进度 (%)
                      </label>
                      <input
                        type='number'
                        min='0'
                        max='100'
                        className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        value={continueWatchingMinProgress}
                        onChange={(e) => {
                          const value = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                          handleContinueWatchingMinProgressChange(value);
                        }}
                      />
                    </div>

                    {/* 最大进度设置 */}
                    <div>
                      <label className='block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2'>
                        最大进度 (%)
                      </label>
                      <input
                        type='number'
                        min='0'
                        max='100'
                        className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        value={continueWatchingMaxProgress}
                        onChange={(e) => {
                          const value = Math.max(0, Math.min(100, parseInt(e.target.value) || 100));
                          handleContinueWatchingMaxProgressChange(value);
                        }}
                      />
                    </div>
                  </div>

                  {/* 当前范围提示 */}
                  <div className='text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg'>
                    当前设置：显示播放进度在 {continueWatchingMinProgress}% - {continueWatchingMaxProgress}% 之间的内容
                  </div>
                </>
              )}

              {/* 关闭筛选时的提示 */}
              {!enableContinueWatchingFilter && (
                <div className='text-xs text-gray-500 dark:text-gray-400 bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800'>
                  筛选已关闭：将显示所有播放时间超过2分钟的内容
                </div>
              )}
            </div>
          </div>

          {/* 底部说明 */}
          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              这些设置保存在本地浏览器中
            </p>
          </div>
        </div>
      </div>
    </>
  );

  // 修改密码面板内容
  const changePasswordPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
        onClick={handleCloseChangePassword}
        onTouchMove={(e) => {
          // 只阻止滚动，允许其他触摸事件
          e.preventDefault();
        }}
        onWheel={(e) => {
          // 阻止滚轮滚动
          e.preventDefault();
        }}
        style={{
          touchAction: 'none',
        }}
      />

      {/* 修改密码面板 */}
      <div
        className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl z-[1001] overflow-hidden'
      >
        {/* 内容容器 - 独立的滚动区域 */}
        <div
          className='h-full p-6'
          data-panel-content
          onTouchMove={(e) => {
            // 阻止事件冒泡到遮罩层，但允许内部滚动
            e.stopPropagation();
          }}
          style={{
            touchAction: 'auto', // 允许所有触摸操作
          }}
        >
          {/* 标题栏 */}
          <div className='flex items-center justify-between mb-6'>
            <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
              修改密码
            </h3>
            <button
              onClick={handleCloseChangePassword}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              aria-label='Close'
            >
              <X className='w-full h-full' />
            </button>
          </div>

          {/* 表单 */}
          <div className='space-y-4'>
            {/* 新密码输入 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                新密码
              </label>
              <input
                type='password'
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400'
                placeholder='请输入新密码'
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={passwordLoading}
              />
            </div>

            {/* 确认密码输入 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                确认密码
              </label>
              <input
                type='password'
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400'
                placeholder='请再次输入新密码'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={passwordLoading}
              />
            </div>

            {/* 错误信息 */}
            {passwordError && (
              <div className='text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-md border border-red-200 dark:border-red-800'>
                {passwordError}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className='flex gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <button
              onClick={handleCloseChangePassword}
              className='flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors'
              disabled={passwordLoading}
            >
              取消
            </button>
            <button
              onClick={handleSubmitChangePassword}
              className='flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              disabled={passwordLoading || !newPassword || !confirmPassword}
            >
              {passwordLoading ? '修改中...' : '确认修改'}
            </button>
          </div>

          {/* 底部说明 */}
          <div className='mt-4 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              修改密码后需要重新登录
            </p>
          </div>
        </div>
      </div>
    </>
  );

  // 更新剧集海报弹窗内容
  const watchingUpdatesPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
        onClick={handleCloseWatchingUpdates}
        onTouchMove={(e) => {
          e.preventDefault();
        }}
        onWheel={(e) => {
          e.preventDefault();
        }}
        style={{
          touchAction: 'none',
        }}
      />

      {/* 更新弹窗 */}
      <div
        className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl z-[1001] flex flex-col'
      >
        {/* 内容容器 - 独立的滚动区域 */}
        <div
          className='flex-1 p-6 overflow-y-auto'
          data-panel-content
          style={{
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
          }}
        >
          {/* 标题栏 */}
          <div className='flex items-center justify-between mb-6'>
            <div className='flex items-center gap-3'>
              <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                更新提醒
              </h3>
              <div className='flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400'>
                {watchingUpdates && watchingUpdates.updatedCount > 0 && (
                  <span className='inline-flex items-center gap-1'>
                    <div className='w-2 h-2 bg-red-500 rounded-full animate-pulse'></div>
                    {watchingUpdates.updatedCount}部有新集
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleCloseWatchingUpdates}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              aria-label='Close'
            >
              <X className='w-full h-full' />
            </button>
          </div>

          {/* 更新列表 */}
          <div className='space-y-8'>
            {/* 没有更新时的提示 */}
            {!hasActualUpdates && (
              <div className='text-center py-8'>
                <div className='text-gray-500 dark:text-gray-400 text-sm'>
                  暂无新剧集更新
                </div>
                <div className='text-xs text-gray-400 dark:text-gray-500 mt-2'>
                  系统会定期检查您观看过的剧集是否有新集数更新
                </div>
              </div>
            )}
            {/* 有新集数的剧集 */}
            {watchingUpdates && watchingUpdates.updatedSeries.filter(series => series.hasNewEpisode).length > 0 && (
              <div>
                <div className='flex items-center gap-2 mb-4'>
                  <h4 className='text-lg font-semibold text-gray-900 dark:text-white'>
                    新集更新
                  </h4>
                  <div className='flex items-center gap-1'>
                    <div className='w-2 h-2 bg-red-500 rounded-full animate-pulse'></div>
                    <span className='text-sm text-red-500 font-medium'>
                      {watchingUpdates.updatedSeries.filter(series => series.hasNewEpisode).length}部剧集有更新
                    </span>
                  </div>
                </div>

                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
                  {watchingUpdates.updatedSeries
                    .filter(series => series.hasNewEpisode)
                    .map((series, index) => (
                      <div key={`new-${series.title}_${series.year}_${index}`} className='relative group/card'>
                        <div className='relative group-hover/card:z-[5] transition-all duration-300'>
                          <VideoCard
                            title={series.title}
                            poster={series.cover}
                            year={series.year}
                            source={series.sourceKey}
                            source_name={series.source_name}
                            episodes={series.totalEpisodes}
                            currentEpisode={series.currentEpisode}
                            id={series.videoId}
                            onDelete={undefined}
                            type={series.totalEpisodes > 1 ? 'tv' : ''}
                            from="playrecord"
                          />
                        </div>
                        {/* 新集数徽章 */}
                        <div className='absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg z-10'>
                          +{series.newEpisodes}集
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

          </div>

          {/* 底部说明 */}
          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              点击海报即可观看新更新的剧集
            </p>
          </div>
        </div>
      </div>
    </>
  );

  // 继续观看弹窗内容
  const continueWatchingPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
        onClick={handleCloseContinueWatching}
        onTouchMove={(e) => {
          e.preventDefault();
        }}
        onWheel={(e) => {
          e.preventDefault();
        }}
        style={{
          touchAction: 'none',
        }}
      />

      {/* 继续观看弹窗 */}
      <div
        className='fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-[1001] max-h-[80vh] overflow-y-auto'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='p-6'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2'>
              <PlayCircle className='w-6 h-6 text-blue-500' />
              继续观看
            </h3>
            <button
              onClick={handleCloseContinueWatching}
              className='p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
            >
              <X className='w-5 h-5' />
            </button>
          </div>

          {/* 播放记录网格 */}
          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
            {playRecords.map((record) => {
              const { source, id } = parseKey(record.key);
              const newEpisodesCount = getNewEpisodesCount(record);
              return (
                <div key={record.key} className='relative group/card'>
                  <div className='relative group-hover/card:z-[500] transition-all duration-300'>
                    <VideoCard
                      id={id}
                    title={record.title}
                    poster={record.cover}
                    year={record.year}
                    source={source}
                    source_name={record.source_name}
                    progress={getProgress(record)}
                    episodes={record.total_episodes}
                    currentEpisode={record.index}
                    query={record.search_title}
                    from='playrecord'
                    type={record.total_episodes > 1 ? 'tv' : ''}
                    remarks={record.remarks}
                    />
                  </div>
                  {/* 新集数徽章 */}
                  {newEpisodesCount > 0 && (
                    <div className='absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg z-[502]'>
                      +{newEpisodesCount}集
                    </div>
                  )}
                  {/* 进度指示器 */}
                  {getProgress(record) > 0 && (
                    <div className='absolute bottom-2 left-2 right-2 bg-black/50 rounded px-2 py-1'>
                      <div className='flex items-center gap-1'>
                        <div className='flex-1 bg-gray-600 rounded-full h-1'>
                          <div
                            className='bg-blue-500 h-1 rounded-full transition-all'
                            style={{ width: `${Math.min(getProgress(record), 100)}%` }}
                          />
                        </div>
                        <span className='text-xs text-white font-medium'>
                          {Math.round(getProgress(record))}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 空状态 */}
          {playRecords.length === 0 && (
            <div className='text-center py-12'>
              <PlayCircle className='w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4' />
              <p className='text-gray-500 dark:text-gray-400 mb-2'>暂无需要继续观看的内容</p>
              <p className='text-xs text-gray-400 dark:text-gray-500'>
                {enableContinueWatchingFilter
                  ? `观看进度在${continueWatchingMinProgress}%-${continueWatchingMaxProgress}%之间且播放时间超过2分钟的内容会显示在这里`
                  : '播放时间超过2分钟的所有内容都会显示在这里'
                }
              </p>
            </div>
          )}

          {/* 底部说明 */}
          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              点击海报即可继续观看
            </p>
          </div>
        </div>
      </div>
    </>
  );

  // 我的收藏弹窗内容
  const favoritesPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
        onClick={handleCloseFavorites}
        onTouchMove={(e) => {
          e.preventDefault();
        }}
        onWheel={(e) => {
          e.preventDefault();
        }}
        style={{
          touchAction: 'none',
        }}
      />

      {/* 收藏弹窗 */}
      <div
        className='fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-[1001] max-h-[80vh] overflow-y-auto'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='p-6'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2'>
              <Heart className='w-6 h-6 text-red-500' />
              我的收藏
            </h3>
            <button
              onClick={handleCloseFavorites}
              className='p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
            >
              <X className='w-5 h-5' />
            </button>
          </div>

          {/* 收藏网格 */}
          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
            {favorites.map((favorite) => {
              const { source, id } = parseKey(favorite.key);
              return (
                <div key={favorite.key} className='relative'>
                  <VideoCard
                    id={id}
                    title={favorite.title}
                    poster={favorite.cover}
                    year={favorite.year}
                    source={source}
                    source_name={favorite.source_name}
                    episodes={favorite.total_episodes}
                    query={favorite.search_title}
                    from='favorite'
                    type={favorite.total_episodes > 1 ? 'tv' : ''}
                  />
                  {/* 收藏时间标签 */}
                  <div className='absolute top-2 right-2 bg-black/50 rounded px-2 py-1'>
                    <span className='text-xs text-white font-medium'>
                      {new Date(favorite.save_time).toLocaleDateString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  {/* 收藏心形图标 */}
                  <div className='absolute bottom-2 right-2'>
                    <Heart className='w-4 h-4 text-red-500 fill-red-500' />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 空状态 */}
          {favorites.length === 0 && (
            <div className='text-center py-12'>
              <Heart className='w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4' />
              <p className='text-gray-500 dark:text-gray-400 mb-2'>暂无收藏</p>
              <p className='text-xs text-gray-400 dark:text-gray-500'>
                在详情页点击收藏按钮即可添加收藏
              </p>
            </div>
          )}

          {/* 底部说明 */}
          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              点击海报即可进入详情页面
            </p>
          </div>
        </div>
      </div>
    </>
  );

  // 新增：视频源管理面板内容
  const videoSourcePanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
        onClick={handleCloseVideoSource}
      />

      {/* 面板容器 */}
      <div className='fixed inset-x-4 md:left-1/2 md:-translate-x-1/2 top-[10vh] md:w-[700px] max-h-[80vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl z-[1001] overflow-hidden select-none flex flex-col'>
        <div className='p-6 overflow-y-auto flex-1'>
          {/* 标题栏 */}
          <div className='flex items-center justify-between mb-6'>
            <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
              视频源管理
            </h3>
            <button
              onClick={handleCloseVideoSource}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              aria-label='Close'
            >
              <X className='w-full h-full' />
            </button>
          </div>

          {/* 添加/编辑/管理按钮区域 */}
          {!editingSource && (
            <div className='space-y-2.5 mb-4'>
              {isAdmin && (
                <button
                  onClick={handleAddSource}
                  className='w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-sm hover:shadow-md'
                >
                  <span className='text-lg'>+</span>
                  <span>添加新视频源</span>
                </button>
              )}
              <button
                onClick={handleManualSpeedTest}
                disabled={isSpeedTesting}
                className={`w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-sm ${
                  isSpeedTesting
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white hover:shadow-md'
                }`}
              >
                <span className='text-lg'>{isSpeedTesting ? '⏳' : '⚡'}</span>
                <span>{isSpeedTesting ? '测速中...' : '手动优选视频源'}</span>
              </button>
              <button
                onClick={handleEnableAllAvailableSources}
                className='w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-sm hover:shadow-md'
              >
                <span className='text-lg'>🚀</span>
                <span>启用所有可用视频源</span>
              </button>
              {isAdmin && (
                <button
                  onClick={async () => {
                    if (confirm(`确定要重置为默认视频源吗?\n\n这将清除所有自定义配置,并从服务器导入默认视频源。`)) {
                      try {
                        const response = await fetch('/api/admin/source', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'import_defaults' }),
                        });
                        const result = await response.json();
                        if (!response.ok) {
                          throw new Error(result.error || '重置失败');
                        }
                        showToast({ title: result.message || '已重置为默认视频源', type: 'success', duration: 3000 });
                        await fetchSources(); // 重新获取列表
                      } catch (error: any) {
                        showError('重置失败', error.message);
                      }
                    }
                  }}
                  className='w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 bg-gradient-to-r from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600 dark:from-gray-600 dark:to-gray-700 dark:hover:from-gray-700 dark:hover:to-gray-800 text-white shadow-sm hover:shadow-md'
                >
                  <span className='text-lg'>🔄</span>
                  <span>重置为默认视频源</span>
                </button>
              )}
            </div>
          )}

          {/* 编辑/添加表单 */}
          {isAdmin && editingSource && (
            <div className='p-4 mb-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3 bg-gray-50 dark:bg-gray-800'>
              <h4 className='font-semibold text-gray-700 dark:text-gray-300'>{isAddingSource ? '添加视频源' : '编辑视频源'}</h4>
              <input
                type='text'
                placeholder='Key (英文, 唯一标识)'
                value={editingSource.key}
                onChange={(e) => setEditingSource({ ...editingSource, key: e.target.value })}
                disabled={!isAddingSource}
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 disabled:bg-gray-200 dark:disabled:bg-gray-600'
              />
              <input
                type='text'
                placeholder='名称 (例如: XX资源)'
                value={editingSource.name}
                onChange={(e) => setEditingSource({ ...editingSource, name: e.target.value })}
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700'
              />
              <input
                type='text'
                placeholder='API地址 (例如: https://.../api.php/provide/vod)'
                value={editingSource.api}
                onChange={(e) => setEditingSource({ ...editingSource, api: e.target.value })}
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700'
              />
              <input
                type='text'
                placeholder='详情页地址 (可选)'
                value={editingSource.detail}
                onChange={(e) => setEditingSource({ ...editingSource, detail: e.target.value })}
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700'
              />
              <div className='flex gap-3'>
                <button onClick={handleSaveSource} className='flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors'>保存</button>
                <button onClick={handleCancelEditSource} className='flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-200 rounded-md transition-colors'>取消</button>
              </div>
            </div>
          )}

          {/* 视频源列表 */}
          <div className='space-y-2'>
            {isSourcesLoading ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">加载中...</div>
            ) : sourcesError ? (
              <div className="text-center py-4 text-red-500 dark:text-red-500">{sourcesError}</div>
            ) : (
              videoSources.map(source => (
                <div key={source.key} className='flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:shadow-sm transition-shadow'>
                  <div className='flex-1 min-w-0'>
                    <div className='font-medium text-gray-800 dark:text-gray-200 text-sm'>{source.name}</div>
                    <div className='text-xs text-gray-500 dark:text-gray-400 truncate'>{source.api}</div>
                  </div>
                  <div className='flex items-center gap-2 ml-4'>
                    {isAdmin && source.from === 'custom' && (
                      <>
                        <button onClick={() => handleEditSource(source)} className='p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-full' title='编辑'>
                          <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z' /></svg>
                        </button>
                        <button onClick={() => handleDeleteSource(source.key)} className='p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full' title='删除'>
                          <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' /></svg>
                        </button>
                      </>
                    )}
                    <label className='flex items-center cursor-pointer'>
                      <div className='relative'>
                        <input type='checkbox' className='sr-only peer' checked={!source.disabled} onChange={() => handleToggleSourceStatus(source.key, !!source.disabled)} disabled={!isAdmin} />
                        <div className={`w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600 ${!isAdmin ? 'cursor-not-allowed opacity-50' : ''}`}></div>
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5 ${!isAdmin ? 'cursor-not-allowed' : ''}`}></div>
                      </div>
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );

  // 新增：弹幕下载面板内容
  const danmakuDownloadPanel = (
    <div className='fixed inset-0 z-[1100] flex items-center justify-center'>
      <div className='absolute inset-0 bg-black/40 backdrop-blur-sm' onClick={() => setIsDanmakuDownloadOpen(false)} />
      <div className='relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 w-[95vw] max-w-3xl max-h-[85vh] z-[1101] flex flex-col'>
        <div className='flex items-center justify-between mb-4'>
          <h3 className='text-lg font-bold text-gray-800 dark:text-gray-200'>弹幕下载</h3>
          <button onClick={() => setIsDanmakuDownloadOpen(false)} className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors' aria-label='Close'>
            <X className='w-full h-full' />
          </button>
        </div>
        
        <div className='flex-1 overflow-y-auto'>
          <div className='space-y-4'>
            <div className='flex gap-2'>
              <input
                type='text'
                value={danmakuInput}
                onChange={(e) => setDanmakuInput(e.target.value)}
                placeholder='输入B站链接、BV/AV号、SS/MD/EP号或CID'
                className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800'
              />
              <button onClick={handleResolveInput} disabled={isResolving} className='px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-blue-400'>
                {isResolving ? '解析中...' : '解析'}
              </button>
            </div>
            {danmakuError && <div className='text-sm text-red-500'>{danmakuError}</div>}
            
            {episodes.length > 0 && (
              <>
                <div className='max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800 p-2 space-y-1' onMouseLeave={() => setDragEndIndex(null)}>
                  {episodes.map((ep, index) => (
                    <div
                      key={ep.cid}
                      onClick={(e) => handleEpisodeClick(index, e)}
                      onMouseDown={(e) => handleMouseDown(index, e)}
                      onMouseEnter={() => handleMouseEnter(index)}
                      className={`flex justify-between items-center p-2 rounded cursor-pointer text-sm transition-colors ${
                        ep.selected ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      } ${
                        dragStartIndex !== null && dragEndIndex !== null && Math.min(dragStartIndex, dragEndIndex) <= index && index <= Math.max(dragStartIndex, dragEndIndex)
                          ? dragInitialState ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-transparent'
                          : ''
                      }`}
                    >
                      <span className='truncate flex-1' title={ep.title}>{ep.title}</span>
                      <span className='text-xs text-gray-400 ml-2'>{ep.section}</span>
                    </div>
                  ))}
                </div>

                 {/* 保存目录选择 */}
                <div>
                  <label className='block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300'>保存目录</label>
                  <div className='flex gap-2'>
                    <input
                      type='text'
                      className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors'
                      placeholder='保存路径'
                      value={danmakuSavePath}
                      onChange={e => setDanmakuSavePath(e.target.value)}
                    />
                    {typeof window !== 'undefined' && (window as any).electronAPI && (
                      <button
                        onClick={async () => {
                          const selected = await (window as any).electronAPI.selectDirectory(danmakuSavePath);
                          if (selected) {
                            setDanmakuSavePath(selected);
                          }
                        }}
                        className='px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-md transition-colors whitespace-nowrap'
                      >
                        浏览...
                      </button>
                    )}
                  </div>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>下载格式</label>
                    <select value={danmakuFormat} onChange={(e) => setDanmakuFormat(e.target.value)} className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800'>
                      <option value='xml'>XML (B站原生)</option>
                      <option value='srt'>SRT (字幕格式)</option>
                      <option value='ass'>ASS (高级字幕)</option>
                    </select>
                  </div>
                  {(danmakuFormat === 'srt' || danmakuFormat === 'ass') && (
                    <div>
                      <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>弹幕显示时长 (秒)</label>
                      <input type='number' value={danmakuDuration} onChange={(e) => setDanmakuDuration(e.target.value)} className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800' min='1' max='30' step='0.5' />
                    </div>
                  )}
                  <div className='md:col-span-2'>
                    <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>保存文件夹名称 (可选)</label>
                    <input type='text' value={showNameInput} onChange={(e) => setShowNameInput(e.target.value)} placeholder={baseTitle} className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800' />
                  </div>
                </div>
                
                <button onClick={handleDanmakuDownload} disabled={danmakuLoading} className='w-full px-4 py-3 bg-green-600 text-white rounded-md text-base font-medium hover:bg-green-700 disabled:bg-green-400'>
                  {danmakuLoading ? `下载中... (${episodes.filter(e => e.selected).length}个)` : `下载已选 (${episodes.filter(e => e.selected).length}个)`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className={`relative ${className || ''}`}>
        <button
          onClick={handleMenuClick}
          className={`relative ${isMobile ? 'w-8 h-8 p-0.5' : 'w-10 h-10 p-0.5'} rounded-full flex items-center justify-center text-gray-600 hover:scale-110 group transition-all duration-300 overflow-hidden hover:shadow-lg hover:shadow-blue-500/30 dark:hover:shadow-blue-400/30`}
          aria-label='User Menu'
        >
          {/* 微光背景效果 */}
          <div className='absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/0 to-purple-600/0 group-hover:from-blue-400/20 group-hover:to-purple-600/20 dark:group-hover:from-blue-300/20 dark:group-hover:to-purple-500/20 transition-all duration-300'></div>
          {avatarUrl ? (
            <div className='w-full h-full rounded-full overflow-hidden relative z-10'>
              <Image
                src={avatarUrl}
                alt="用户头像"
                fill
                sizes="40px"
                className='object-cover'
              />
            </div>
          ) : (
            <User className='w-6 h-6 relative z-10 text-gray-600 dark:text-gray-300 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors' />
          )}
        </button>
        {/* 统一更新提醒点：版本更新或剧集更新都显示橙色点 */}
        {((updateStatus === UpdateStatus.HAS_UPDATE) || (hasUnreadUpdates && totalUpdates > 0)) && (
          <div className='absolute top-[2px] right-[2px] w-2 h-2 bg-yellow-500 rounded-full animate-pulse shadow-lg shadow-yellow-500/50'></div>
        )}
      </div>

      {/* 使用 Portal 将菜单面板渲染到 document.body */}
      {isOpen && mounted && createPortal(menuPanel, document.body)}

      {/* 使用 Portal 将设置面板渲染到 document.body */}
      {isSettingsOpen && mounted && createPortal(settingsPanel, document.body)}

      {/* 使用 Portal 将修改密码面板渲染到 document.body */}
      {isChangePasswordOpen &&
        mounted &&
        createPortal(changePasswordPanel, document.body)}

      {/* 使用 Portal 将更新提醒面板渲染到 document.body */}
      {isWatchingUpdatesOpen &&
        mounted &&
        createPortal(watchingUpdatesPanel, document.body)}

      {/* 使用 Portal 将继续观看面板渲染到 document.body */}
      {isContinueWatchingOpen &&
        mounted &&
        createPortal(continueWatchingPanel, document.body)}

      {/* 使用 Portal 将我的收藏面板渲染到 document.body */}
      {isFavoritesOpen &&
        mounted &&
        createPortal(favoritesPanel, document.body)}

      {/* 使用 Portal 将修改头像面板渲染到 document.body */}
      {isChangeAvatarOpen &&
        mounted &&
        createPortal(
          <>
            {/* 背景遮罩 */}
            <div
              className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
              onClick={handleCloseChangeAvatar}
            />
            {/* 修改头像面板 */}
            <div className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl z-[1001] overflow-hidden'>
              <div className='p-6'>
                {/* 标题栏 */}
                <div className='flex items-center justify-between mb-6'>
                  <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>修改头像</h3>
                  <button onClick={handleCloseChangeAvatar} className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors' aria-label='Close'>
                    <X className='w-full h-full' />
                  </button>
                </div>
                {!showCropper ? (
                  <div className='flex flex-col items-center justify-center gap-6 my-6'>
                    <div className='w-24 h-24 rounded-full overflow-hidden relative'>
                      {avatarUrl ? <Image src={avatarUrl} alt="用户头像" fill sizes="96px" className='object-cover' /> : <div className='w-full h-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center'><User className='w-12 h-12 text-blue-500 dark:text-blue-400' /></div>}
                    </div>
                    <div>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelected} disabled={isUploadingAvatar} />
                      <button onClick={handleOpenFileSelector} disabled={isUploadingAvatar} className='flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors'>
                        <Upload className='w-4 h-4' />选择图片
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className='flex flex-col items-center justify-center gap-4 my-6'>
                    <div className='w-full max-w-md'><ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setCompletedCrop(c)} aspect={1} circularCrop><img ref={imageRef} src={selectedImage} alt="Crop me" className="max-w-full max-h-64 object-contain" onLoad={onImageLoad} /></ReactCrop></div>
                    <div className='flex gap-3'>
                      <button onClick={() => { setShowCropper(false); setSelectedImage(''); setCompletedCrop(undefined); setCrop({ unit: '%', width: 80, height: 80, x: 10, y: 10 }); if (fileInputRef.current) { fileInputRef.current.value = ''; } }} className='px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors'>重新选择</button>
                      <button onClick={handleConfirmCrop} disabled={isUploadingAvatar || !completedCrop} className='flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors'>
                        <Check className='w-4 h-4' />{isUploadingAvatar ? '上传中...' : '确认上传'}
                      </button>
                    </div>
                  </div>
                )}
                <p className='text-xs text-gray-500 dark:text-gray-400 text-center mt-4 pt-4 border-t border-gray-200 dark:border-gray-700'>支持 JPG、PNG、GIF 等格式，文件大小不超过 2MB</p>
              </div>
            </div>
          </>,
          document.body
        )}

      {/* 版本面板 */}
      <VersionPanel
        isOpen={isVersionPanelOpen}
        onClose={() => setIsVersionPanelOpen(false)}
      />

      {/* 新增：视频源管理面板 */}
      {isVideoSourceOpen && mounted && createPortal(videoSourcePanel, document.body)}
  
      {/* 新增：弹幕下载面板 */}
      {isDanmakuDownloadOpen && mounted && createPortal(danmakuDownloadPanel, document.body)}
    </>
  );
};

