/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Cat, Clover, ExternalLink, FileSearch, Film, Home, Menu, PlaySquare, Radio, Search, Send, Star, Tv } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

import { useSite } from './SiteProvider';

interface SidebarContextType {
  isCollapsed: boolean;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
});

export const useSidebar = () => useContext(SidebarContext);

// 可替换为你自己的 logo 图片
const Logo = () => {
  const { siteName } = useSite();
  return (
    <Link
      href='/'
      className='flex items-center justify-center h-16 select-none group'
    >
      <div className='relative'>
        {/* 发光背景效果 */}
        <div className='absolute inset-0 bg-gradient-to-r from-green-400 via-emerald-500 to-teal-500 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300 rounded-lg scale-110'></div>

        <span className='relative text-2xl font-bold bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 dark:from-green-400 dark:via-emerald-400 dark:to-teal-400 bg-clip-text text-transparent tracking-tight transition-all duration-300 group-hover:scale-105 inline-block group-hover:drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]'>
          {siteName}
        </span>
      </div>
    </Link>
  );
};

interface SidebarProps {
  onToggle?: (collapsed: boolean) => void;
  activePath?: string;
  isTabletMode?: boolean; // 新增属性
  onCategorySelect?: () => void; // 新增属性
}

// 在浏览器环境下通过全局变量缓存折叠状态，避免组件重新挂载时出现初始值闪烁
declare global {
  interface Window {
    __sidebarCollapsed?: boolean;
  }
}

const Sidebar = ({ onToggle, activePath = '/', isTabletMode = false, onCategorySelect }: SidebarProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { authInfo } = useSite();
  // 若同一次 SPA 会话中已经读取过折叠状态，则直接复用，避免闪烁
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // 首次挂载时读取 localStorage，以便刷新后仍保持上次的折叠状态
  useLayoutEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved !== null) {
      const val = JSON.parse(saved);
      setIsCollapsed(val);
      window.__sidebarCollapsed = val;
    }
  }, []);

  // 当折叠状态变化时，同步到 <html> data 属性，供首屏 CSS 使用
  useLayoutEffect(() => {
    if (typeof document !== 'undefined') {
      if (isCollapsed) {
        document.documentElement.dataset.sidebarCollapsed = 'true';
      } else {
        delete document.documentElement.dataset.sidebarCollapsed;
      }
    }
  }, [isCollapsed]);

  const [active, setActive] = useState(activePath);

  useEffect(() => {
    // 优先使用传入的 activePath
    if (activePath) {
      setActive(activePath);
    } else {
      // 否则使用当前路径
      const getCurrentFullPath = () => {
        const queryString = searchParams.toString();
        return queryString ? `${pathname}?${queryString}` : pathname;
      };
      const fullPath = getCurrentFullPath();
      setActive(fullPath);
    }
  }, [activePath, pathname, searchParams]);

  const handleToggle = useCallback(() => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
    if (typeof window !== 'undefined') {
      window.__sidebarCollapsed = newState;
    }
    onToggle?.(newState);
  }, [isCollapsed, onToggle]);

  const handleSearchClick = useCallback(() => {
    router.push('/search');
  }, [router]);

  const contextValue = {
    isCollapsed,
  };

  const [menuItems, setMenuItems] = useState([
    {
      icon: Film,
      label: '电影',
      href: '/douban?type=movie',
    },
    {
      icon: Tv,
      label: '剧集',
      href: '/douban?type=tv',
    },
    {
      icon: PlaySquare,
      label: '短剧',
      href: '/shortdrama',
    },
    {
      icon: Cat,
      label: '动漫',
      href: '/douban?type=anime',
    },
    {
      icon: Clover,
      label: '综艺',
      href: '/douban?type=show',
    },
    {
      icon: Radio,
      label: '直播',
      href: '/live',
    },
  ]);

  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setMenuItems((prevItems) => [
        ...prevItems,
        {
          icon: Star,
          label: '自定义',
          href: '/douban?type=custom',
        },
      ]);
    }
  }, []);

  // ==================== 添加 state 和 useEffect 来解码字符串 ====================
  const [decodedStrings, setDecodedStrings] = useState({
    tgUrl: '',
    brandName: '',
  });

  useEffect(() => {
    // 在 useEffect 中执行解码，确保只在客户端运行
    // 使用 try...catch 避免在非浏览器环境（如SSR构建时）或解码失败时报错
    try {
      const decodedBrandName = atob('U2hpaFl1VFY=');
      setDecodedStrings({
        tgUrl: atob('aHR0cHM6Ly90Lm1lL3NoaWh5dXR2'),
        brandName: decodedBrandName,
      });
    } catch (error) {
      console.error('Failed to decode strings:', error);
    }
  }, []);
  // =================================================================================

  return (
    <SidebarContext.Provider value={contextValue}>
      {/* 在移动端隐藏侧边栏 */}
      <div className='hidden md:flex'>
        <aside
          data-sidebar
          className={`fixed top-0 left-0 h-screen bg-white/40 backdrop-blur-xl transition-all duration-300 border-r border-gray-200/50 z-10 shadow-lg dark:bg-gray-900/70 dark:border-gray-700/50 ${isCollapsed ? 'w-16' : 'w-64'
            }`}
          style={{
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {/* 装饰性背景光晕 */}
          <div className='absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-green-400/5 via-blue-400/5 to-transparent pointer-events-none'></div>
          <div className='absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-purple-400/5 via-pink-400/5 to-transparent pointer-events-none'></div>

          <div className='flex h-full flex-col relative z-10'>
            {/* 顶部 Logo 区域 */}
            <div className='relative h-16'>
              <div
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${isCollapsed ? 'opacity-0' : 'opacity-100'
                  }`}
              >
                <div className='w-[calc(100%-4rem)] flex justify-center'>
                  {!isCollapsed && <Logo />}
                </div>
              </div>
              <button
                onClick={handleToggle}
                className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full text-gray-500 hover:text-gray-700 transition-all duration-300 z-10 dark:text-gray-400 dark:hover:text-gray-200 group/toggle ${isCollapsed ? 'left-1/2 -translate-x-1/2' : 'right-2'
                  }`}
              >
                {/* 渐变边框效果 */}
                <div className='absolute inset-0 rounded-full bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 opacity-0 group-hover/toggle:opacity-100 transition-opacity duration-300 animate-pulse'></div>
                <div className='absolute inset-[2px] rounded-full bg-white dark:bg-gray-900 group-hover/toggle:bg-gray-50 dark:group-hover/toggle:bg-gray-800 transition-colors duration-300'></div>

                <Menu className='h-4 w-4 relative z-10 transition-transform duration-300 group-hover/toggle:rotate-180' />
              </button>
            </div>

            {/* 首页和搜索导航 */}
            <nav className='px-2 mt-4 space-y-1'>
              <Link
                href='/'
                onClick={() => {
                  setActive('/');
                  if (isTabletMode) onCategorySelect?.();
                }}
                data-active={active === '/'}
                className={`group relative flex items-center rounded-lg px-2 py-2 pl-4 text-gray-700 hover:bg-gradient-to-r hover:from-green-50 hover:to-emerald-50 hover:text-green-600 data-[active=true]:bg-gradient-to-r data-[active=true]:from-green-500/20 data-[active=true]:to-emerald-500/20 data-[active=true]:text-green-700 font-medium transition-all duration-200 min-h-[40px] dark:text-gray-300 dark:hover:from-green-500/10 dark:hover:to-emerald-500/10 dark:hover:text-green-400 dark:data-[active=true]:from-green-500/15 dark:data-[active=true]:to-emerald-500/15 dark:data-[active=true]:text-green-400 ${isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                  } gap-3 justify-start hover:shadow-md hover:shadow-green-500/10 data-[active=true]:shadow-lg data-[active=true]:shadow-green-500/20`}
              >
                <div className='w-4 h-4 flex items-center justify-center relative z-10'>
                  <Home className='h-4 w-4 text-gray-500 group-hover:text-green-600 data-[active=true]:text-green-700 dark:text-gray-400 dark:group-hover:text-green-400 dark:data-[active=true]:text-green-400 transition-all duration-200 group-hover:scale-110' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100 relative z-10'>
                    首页
                  </span>
                )}
                {/* 激活状态的左侧边框指示器 */}
                <div className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-gradient-to-b from-green-500 to-emerald-500 rounded-r-full transition-all duration-200 data-[active=true]:h-8 opacity-0 data-[active=true]:opacity-100' data-active={active === '/'}></div>
              </Link>
              <Link
                href='/search'
                onClick={(e) => {
                  e.preventDefault();
                  handleSearchClick();
                  setActive('/search');
                }}
                data-active={active === '/search'}
                className={`group relative flex items-center rounded-lg px-2 py-2 pl-4 text-gray-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-cyan-50 hover:text-blue-600 data-[active=true]:bg-gradient-to-r data-[active=true]:from-blue-500/20 data-[active=true]:to-cyan-500/20 data-[active=true]:text-blue-700 font-medium transition-all duration-200 min-h-[40px] dark:text-gray-300 dark:hover:from-blue-500/10 dark:hover:to-cyan-500/10 dark:hover:text-blue-400 dark:data-[active=true]:from-blue-500/15 dark:data-[active=true]:to-cyan-500/15 dark:data-[active=true]:text-blue-400 ${isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                  } gap-3 justify-start hover:shadow-md hover:shadow-blue-500/10 data-[active=true]:shadow-lg data-[active=true]:shadow-blue-500/20`}
              >
                <div className='w-4 h-4 flex items-center justify-center relative z-10'>
                  <Search className='h-4 w-4 text-gray-500 group-hover:text-blue-600 data-[active=true]:text-blue-700 dark:text-gray-400 dark:group-hover:text-blue-400 dark:data-[active=true]:text-blue-400 transition-all duration-200 group-hover:scale-110' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100 relative z-10'>
                    搜索
                  </span>
                )}
                {/* 激活状态的左侧边框指示器 */}
                <div className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-r-full transition-all duration-200 data-[active=true]:h-8 opacity-0 data-[active=true]:opacity-100' data-active={active === '/search'}></div>
              </Link>
              {/* 源浏览 - 仅管理员和站长可见 */}
              {(authInfo?.role === 'owner' || authInfo?.role === 'admin') && (
                <Link
                  href='/source-browser'
                  onClick={() => setActive('/source-browser')}
                  data-active={active === '/source-browser'}
                  className={`group relative flex items-center rounded-lg px-2 py-2 pl-4 text-gray-700 hover:bg-gradient-to-r hover:from-yellow-50 hover:to-amber-50 hover:text-yellow-600 data-[active=true]:bg-gradient-to-r data-[active=true]:from-yellow-500/20 data-[active=true]:to-amber-500/20 data-[active=true]:text-yellow-700 font-medium transition-all duration-200 min-h-[40px] dark:text-gray-300 dark:hover:from-yellow-500/10 dark:hover:to-amber-500/10 dark:hover:text-yellow-400 dark:data-[active=true]:from-yellow-500/15 dark:data-[active=true]:to-amber-500/15 dark:data-[active=true]:text-yellow-400 ${isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                    } gap-3 justify-start hover:shadow-md hover:shadow-yellow-500/10 data-[active=true]:shadow-lg data-[active=true]:shadow-yellow-500/20`}
                >
                  <div className='w-4 h-4 flex items-center justify-center relative z-10'>
                    <FileSearch className='h-4 w-4 text-gray-500 group-hover:text-yellow-600 data-[active=true]:text-yellow-700 dark:text-gray-400 dark:group-hover:text-yellow-400 dark:data-[active=true]:text-yellow-400 transition-all duration-200 group-hover:scale-110' />
                  </div>
                  {!isCollapsed && (
                    <span className='whitespace-nowrap transition-opacity duration-200 opacity-100 relative z-10'>
                      源浏览
                    </span>
                  )}
                  {/* 激活状态的左侧边框指示器 */}
                  <div className='absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-gradient-to-b from-yellow-500 to-amber-500 rounded-r-full transition-all duration-200 data-[active=true]:h-8 opacity-0 data-[active=true]:opacity-100' data-active={active === '/source-browser'}></div>
                </Link>
              )}
            </nav>

            {/* 菜单项 */}
            <div className='flex-1 overflow-y-auto px-2 pt-4'>
              <div className='space-y-1'>
                {menuItems.map((item, index) => {
                  // 检查当前路径是否匹配这个菜单项
                  const typeMatch = item.href.match(/type=([^&]+)/)?.[1];

                  // 解码URL以进行正确的比较
                  const decodedActive = decodeURIComponent(active);
                  const decodedItemHref = decodeURIComponent(item.href);

                  const isActive =
                    decodedActive === decodedItemHref ||
                    (decodedActive.startsWith('/douban') &&
                      decodedActive.includes(`type=${typeMatch}`)) ||
                    (item.href === '/shortdrama' && decodedActive.startsWith('/shortdrama'));
                  const Icon = item.icon;

                  // 为每个菜单项定义独特的渐变色主题
                  const colorThemes = [
                    { hover: 'hover:from-red-50 hover:to-pink-50 dark:hover:from-red-500/10 dark:hover:to-pink-500/10', active: 'data-[active=true]:from-red-500/20 data-[active=true]:to-pink-500/20 dark:data-[active=true]:from-red-500/15 dark:data-[active=true]:to-pink-500/15', text: 'hover:text-red-600 data-[active=true]:text-red-700 dark:hover:text-red-400 dark:data-[active=true]:text-red-400', icon: 'group-hover:text-red-600 data-[active=true]:text-red-700 dark:group-hover:text-red-400 dark:data-[active=true]:text-red-400', shadow: 'hover:shadow-red-500/10 data-[active=true]:shadow-red-500/20', border: 'from-red-500 to-pink-500' }, // 电影
                    { hover: 'hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-500/10 dark:hover:to-indigo-500/10', active: 'data-[active=true]:from-blue-500/20 data-[active=true]:to-indigo-500/20 dark:data-[active=true]:from-blue-500/15 dark:data-[active=true]:to-indigo-500/15', text: 'hover:text-blue-600 data-[active=true]:text-blue-700 dark:hover:text-blue-400 dark:data-[active=true]:text-blue-400', icon: 'group-hover:text-blue-600 data-[active=true]:text-blue-700 dark:group-hover:text-blue-400 dark:data-[active=true]:text-blue-400', shadow: 'hover:shadow-blue-500/10 data-[active=true]:shadow-blue-500/20', border: 'from-blue-500 to-indigo-500' }, // 剧集
                    { hover: 'hover:from-purple-50 hover:to-violet-50 dark:hover:from-purple-500/10 dark:hover:to-violet-500/10', active: 'data-[active=true]:from-purple-500/20 data-[active=true]:to-violet-500/20 dark:data-[active=true]:from-purple-500/15 dark:data-[active=true]:to-violet-500/15', text: 'hover:text-purple-600 data-[active=true]:text-purple-700 dark:hover:text-purple-400 dark:data-[active=true]:text-purple-400', icon: 'group-hover:text-purple-600 data-[active=true]:text-purple-700 dark:group-hover:text-purple-400 dark:data-[active=true]:text-purple-400', shadow: 'hover:shadow-purple-500/10 data-[active=true]:shadow-purple-500/20', border: 'from-purple-500 to-violet-500' }, // 短剧
                    { hover: 'hover:from-pink-50 hover:to-rose-50 dark:hover:from-pink-500/10 dark:hover:to-rose-500/10', active: 'data-[active=true]:from-pink-500/20 data-[active=true]:to-rose-500/20 dark:data-[active=true]:from-pink-500/15 dark:data-[active=true]:to-rose-500/15', text: 'hover:text-pink-600 data-[active=true]:text-pink-700 dark:hover:text-pink-400 dark:data-[active=true]:text-pink-400', icon: 'group-hover:text-pink-600 data-[active=true]:text-pink-700 dark:group-hover:text-pink-400 dark:data-[active=true]:text-pink-400', shadow: 'hover:shadow-pink-500/10 data-[active=true]:shadow-pink-500/20', border: 'from-pink-500 to-rose-500' }, // 动漫
                    { hover: 'hover:from-orange-50 hover:to-amber-50 dark:hover:from-orange-500/10 dark:hover:to-amber-500/10', active: 'data-[active=true]:from-orange-500/20 data-[active=true]:to-amber-500/20 dark:data-[active=true]:from-orange-500/15 dark:data-[active=true]:to-amber-500/15', text: 'hover:text-orange-600 data-[active=true]:text-orange-700 dark:hover:text-orange-400 dark:data-[active=true]:text-orange-400', icon: 'group-hover:text-orange-600 data-[active=true]:text-orange-700 dark:group-hover:text-orange-400 dark:data-[active=true]:text-orange-400', shadow: 'hover:shadow-orange-500/10 data-[active=true]:shadow-orange-500/20', border: 'from-orange-500 to-amber-500' }, // 综艺
                    { hover: 'hover:from-teal-50 hover:to-cyan-50 dark:hover:from-teal-500/10 dark:hover:to-cyan-500/10', active: 'data-[active=true]:from-teal-500/20 data-[active=true]:to-cyan-500/20 dark:data-[active=true]:from-teal-500/15 dark:data-[active=true]:to-cyan-500/15', text: 'hover:text-teal-600 data-[active=true]:text-teal-700 dark:hover:text-teal-400 dark:data-[active=true]:text-teal-400', icon: 'group-hover:text-teal-600 data-[active=true]:text-teal-700 dark:group-hover:text-teal-400 dark:data-[active=true]:text-teal-400', shadow: 'hover:shadow-teal-500/10 data-[active=true]:shadow-teal-500/20', border: 'from-teal-500 to-cyan-500' }, // 直播
                    { hover: 'hover:from-yellow-50 hover:to-amber-50 dark:hover:from-yellow-500/10 dark:hover:to-amber-500/10', active: 'data-[active=true]:from-yellow-500/20 data-[active=true]:to-amber-500/20 dark:data-[active=true]:from-yellow-500/15 dark:data-[active=true]:to-amber-500/15', text: 'hover:text-yellow-600 data-[active=true]:text-yellow-700 dark:hover:text-yellow-400 dark:data-[active=true]:text-yellow-400', icon: 'group-hover:text-yellow-600 data-[active=true]:text-yellow-700 dark:group-hover:text-yellow-400 dark:data-[active=true]:text-yellow-400', shadow: 'hover:shadow-yellow-500/10 data-[active=true]:shadow-yellow-500/20', border: 'from-yellow-500 to-amber-500' }, // 自定义
                  ];

                  const theme = colorThemes[index] || colorThemes[0];

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setActive(item.href)}
                      data-active={isActive}
                      className={`group relative flex items-center rounded-lg px-2 py-2 pl-4 text-sm text-gray-700 hover:bg-gradient-to-r ${theme.hover} ${theme.active} ${theme.text} transition-all duration-200 min-h-[40px] dark:text-gray-300 ${isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                        } gap-3 justify-start hover:shadow-md ${theme.shadow} animate-[slideInFromLeft_0.3s_ease-out] opacity-0`}
                      style={{
                        animation: `slideInFromLeft 0.3s ease-out ${index * 0.05}s forwards`,
                      }}
                    >
                      <div className='w-4 h-4 flex items-center justify-center relative z-10'>
                        <Icon className={`h-4 w-4 text-gray-500 ${theme.icon} dark:text-gray-400 transition-all duration-200 group-hover:scale-110 group-hover:rotate-12`} />
                      </div>
                      {!isCollapsed && (
                        <span className='whitespace-nowrap transition-opacity duration-200 opacity-100 relative z-10'>
                          {item.label}
                        </span>
                      )}
                      {/* 激活状态的左侧边框指示器 */}
                      <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-gradient-to-b ${theme.border} rounded-r-full transition-all duration-200 data-[active=true]:h-8 opacity-0 data-[active=true]:opacity-100`} data-active={isActive}></div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ================ 在 JSX 中使用解码后的字符串 ================= */}
            {/* 致谢信息 */}
            <div className='px-4 pb-4 mt-auto'>
              {/* TG 群链接 */}
              <div className='pb-4'>
                {!isCollapsed ? (
                  <a
                    href={decodedStrings.tgUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='group flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-sky-500 dark:hover:text-sky-400 transition-colors duration-200 py-2 rounded-lg hover:bg-gray-500/5 dark:hover:bg-gray-800/50'
                  >
                    <Send size={14} className='transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12' />
                    <span>{decodedStrings.brandName}官方TG群</span>
                    <ExternalLink size={12} className='opacity-50 group-hover:opacity-100' />
                  </a>
                ) : (
                  <a
                    href={decodedStrings.tgUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-sky-500 dark:hover:text-sky-400 transition-colors duration-200 py-2 rounded-lg'
                    title={`${decodedStrings.brandName}官方TG群`}
                  >
                    <Send size={16} />
                  </a>
                )}
              </div>
              <div className='border-t border-gray-200/50 dark:border-gray-700/50 pt-4'>
                {!isCollapsed ? (
                  <div className='text-xs text-gray-500 dark:text-gray-400 text-center leading-relaxed animate-[fadeIn_0.5s_ease-out]'>
                    <span>本项目基于 </span>
                    <span className='text-green-600 dark:text-green-400 font-medium'>
                      {decodedStrings.brandName}
                    </span>
                    <span> 二次开发</span>
                  </div>
                ) : (
                  <div className='flex justify-center animate-[fadeIn_0.5s_ease-out]'>
                    <span
                      className='text-green-600 dark:text-green-400 transition-colors p-1'
                      title={`基于 ${decodedStrings.brandName} 二次开发`}
                    >
                      <Star className='h-4 w-4' />
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* ========================================================================= */}
          </div>
        </aside>
        <div
          className={`transition-all duration-300 sidebar-offset ${isCollapsed ? 'w-16' : 'w-64'
            }`}
        ></div>
      </div>
    </SidebarContext.Provider>
  );
};

export default Sidebar;
