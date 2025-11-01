// src/components/PageLayout.tsx
'use client';

import { useState, useEffect, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useSite } from './SiteProvider';
import { useIsTablet } from '@/lib/useIsTablet';
import { useFloatingHeaderVisibility } from '@/lib/useFloatingHeaderVisibility';
import { BackButton } from './BackButton';
import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
import Sidebar from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { TabletSidebar } from './TabletSidebar';
import { BackToTopButton } from './BackToTopButton';
import { FloatingHeader } from './FloatingHeader';
import { TabletHeaderActions } from './TabletHeaderActions';
import ModernNav from './ModernNav';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  title?: string;
  headerContent?: React.ReactNode;
  useModernNav?: boolean; // 新增：是否使用2025现代化导航
}

const PageLayout = ({ children, activePath = '/', title, headerContent, useModernNav = true }: PageLayoutProps) => {
  const { mainContainerRef, siteName } = useSite();
  const [heightClass, setHeightClass] = useState('h-screen');
  const [isTabletSidebarOpen, setIsTabletSidebarOpen] = useState(false);
  const isTablet = useIsTablet();
  const pathname = usePathname();
  const router = useRouter();

  // --- 客户端状态 ---
  const [isClient, setIsClient] = useState(false);


  const showAdminBackButton = pathname === '/admin';
  const showAdminSubPageBackButton = pathname.startsWith('/admin/') && pathname !== '/admin';
  const showTabletSidebar = pathname === '/' || pathname === '/douban' || pathname === '/search';
  
  const showFloatingHeader = pathname === '/' || pathname === '/douban' || pathname === '/search';
  const floatingHeaderHeight = 56; // h-14 in tailwind css
  const isFloatingHeaderVisible = useFloatingHeaderVisibility(mainContainerRef || null);

  useEffect(() => {
    // --- 标记为客户端渲染 ---
    setIsClient(true);

    
    const ua = navigator.userAgent;
    const isMobile = /Mobi/i.test(ua) || window.innerWidth < 768;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

    if (isMobile && isSafari) {
      setHeightClass('min-h-screen');
    }
  }, []);

  if (useModernNav) {
    // 2025 Modern Navigation Layout
    return (
      <div className='w-full min-h-screen'>
        {/* Modern Navigation - Top (Desktop) & Bottom (Mobile) */}
        <ModernNav />

        {/* 移动端头部 - Logo和用户菜单 */}
        <div className='md:hidden fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-sm'>
          <div className='flex items-center justify-between h-11 px-4'>
            {/* Logo */}
            <div className='text-base font-bold bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 dark:from-green-400 dark:via-emerald-400 dark:to-teal-400 bg-clip-text text-transparent'>
              {siteName}
            </div>

            {/* User Menu & Theme Toggle */}
            <div className='flex items-center gap-2'>
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </div>

        {/* Main Content - 移动端44px，桌面端64px */}
        <main className='w-full min-h-screen pt-[44px] md:pt-16 pb-32 md:pb-8'>
          <div className='w-full max-w-[1920px] mx-auto px-4 sm:px-6 md:px-8'>
            {children}
          </div>
        </main>
      </div>
    );
  }

  // Legacy Sidebar Layout (原来的设计)
  return (
    <div className={`w-full ${heightClass}`}>
      {/* 浮动头部 */}
      {showFloatingHeader && <FloatingHeader title={title} setIsOpen={setIsTabletSidebarOpen} scrollContainerRef={mainContainerRef || null} isOpen={isTabletSidebarOpen} />}

      {/* 移动端头部 */}
      <MobileHeader showBackButton={((isTablet ?? false) && (activePath || '').startsWith('/detail'))} />

      {/* 主要布局容器 */}
      <div
        className={`flex w-full h-full md:min-h-auto md:grid md:grid-cols-[auto_1fr]`}
      >
        {/* 侧边栏 - 桌面端始终显示，平板端由按钮控制 */}
        <div className='hidden md:block'>
          <TabletSidebar
            isOpen={isTabletSidebarOpen}
            setIsOpen={setIsTabletSidebarOpen}
            activePath={activePath}
            isFloatingHeaderVisible={isFloatingHeaderVisible}
            floatingHeaderHeight={floatingHeaderHeight}
          />
        </div>
        
        {/* 主内容区域 */}
        <div
          ref={mainContainerRef} // 将 ref 附加到这个容器
          className='relative min-w-0 flex-1 transition-all duration-300 md:overflow-y-auto' // 添加 overflow-y-auto
        >
          {/* --- 核心修复区域: 统一的、全局的顶部按钮栏 --- */}
          {/* 
            这个容器在所有桌面页面都存在，负责顶部左右两侧的按钮布局。
            pointer-events-none 避免容器的空白区域阻挡下方内容的点击，
            而 pointer-events-auto 则让按钮自身可以被点击。
          */}
          <div className="absolute top-2 left-4 right-4 z-20 hidden md:flex items-center justify-between pointer-events-none">
            {/* 左侧按钮组: 根据不同页面的条件，显示不同的按钮 */}
            <div className="flex items-center gap-2 pointer-events-auto">
              {/* 条件1: 在主页/豆瓣/搜索页，显示汉堡菜单和标题 */}
              {showTabletSidebar && (
                <TabletHeaderActions setIsOpen={setIsTabletSidebarOpen} isOpen={isTabletSidebarOpen} title={title} />
              )}
              {/* 条件2: 在管理员主页，显示返回首页的按钮 */}
              {showAdminBackButton && (
                <div
                  onClick={() => router.push('/')}
                  className="w-10 h-10 p-2 rounded-full hover:bg-gray-500/20 transition-colors"
                  aria-label="Back to home"
                >
                  <button>
                    <BackButton />
                  </button>
                </div>
              )}
              {/* 条件3: 在管理员子页面，显示返回按钮 */}
              {showAdminSubPageBackButton && (
                <BackButton />
              )}
              {/* 条件4: 在播放页/直播页，显示返回按钮 */}
              {['/play', '/live'].includes(activePath) && (
                <BackButton />
              )}
              {/* 条件5: 在详情页，显示返回按钮和自定义头部内容 */}
              {((activePath || '').startsWith('/detail')) && (
                <div className='flex items-center gap-2'>
                  <BackButton />
                  {headerContent}
                </div>
              )}
            </div>
            
            {/* 右侧按钮组: 仅在非主页/豆瓣/搜索等页面显示，避免与 TabletHeaderActions 重复 */}
            {!showTabletSidebar && (
              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  onClick={() => router.push('/search')}
                  className="w-10 h-10 p-2 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/50 dark:text-gray-300 md:text-gray-800 md:dark:text-gray-200 dark:hover:bg-gray-700/50 transition-colors"
                  aria-label="Search"
                >
                  <Search className="w-full h-full" />
                </button>
                <ThemeToggle />
                <UserMenu />
              </div>
            )}
          </div>
          
          {/* 主内容 */}
          <main
            className='flex-1 md:min-h-0 md:mb-0 md:mt-12'
            style={{
              paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
              paddingTop: 'env(safe-area-inset-top)',
            }}
          >
            {children}
          </main>
        </div>
      </div>

      {/* 移动端底部导航 */}
      <div className='md:hidden'>
        <MobileBottomNav activePath={activePath} />
      </div>

      {/* 返回顶部按钮 - 仅在特定平板页面显示 */}
      {showTabletSidebar && <BackToTopButton />}
      
      {/* --- 已移除所有分散的、独立的按钮逻辑 (如右下角悬浮按钮和旧的顶部按钮)，全部统一到上面的全局顶部栏中 --- */}

    </div>
  );
};

export default PageLayout;
