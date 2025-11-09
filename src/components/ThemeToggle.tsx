/* eslint-disable @typescript-eslint/no-explicit-any,react-hooks/exhaustive-deps */

'use client';

import { Moon, Sun, MessageCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState, useCallback } from 'react';
// import { ChatModal } from './ChatModal';
import dynamic from 'next/dynamic';
import { useWebSocket } from '../hooks/useWebSocket';
import { WebSocketMessage } from '../lib/types';

// 使用 dynamic import 并禁用 SSR 来加载 ChatModal
const ChatModal = dynamic(
  () => {
    // [LOG] 动态加载 ChatModal 组件
    console.log('[ThemeToggle] Dynamically importing ChatModal...');
    return import('./ChatModal').then((mod) => mod.ChatModal);
  },
  {
    ssr: false, // 关键：禁用服务端渲染
    loading: () => {
      // [LOG] 显示 ChatModal 加载动画
      console.log('[ThemeToggle] Showing ChatModal loading state.');
      return (
        // 添加一个加载状态，提升用户体验
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
      );
    },
  }
);

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();
  const pathname = usePathname();
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  // 在这里统一管理WebSocket连接
  const { isConnected, sendMessage } = useWebSocket({ enabled: isChatModalOpen });
  // 直接使用ChatModal传来的消息计数
  const handleMessageCountFromModal = useCallback((totalCount: number) => {
    setMessageCount(totalCount);
  }, []);

  // 处理聊天消息计数重置（当用户查看对话时）
  const handleChatCountReset = useCallback((resetCount: number) => {
    // 仅用于同步状态，实际计数由ChatModal管理
  }, []);

  // 处理好友请求计数重置（当用户查看好友请求时）
  const handleFriendRequestCountReset = useCallback((resetCount: number) => {
    // 仅用于同步状态，实际计数由ChatModal管理
  }, []);

  // [LOG] 增加一个函数来处理点击，方便添加日志
  const openChatModal = () => {
    console.log('[ThemeToggle] Chat icon clicked. Setting isChatModalOpen to true.');
    setIsChatModalOpen(true);
  };

  const closeChatModal = () => {
    console.log('[ThemeToggle] Closing ChatModal. Setting isChatModalOpen to false.');
    setIsChatModalOpen(false);
  };

  const setThemeColor = (theme?: string) => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = theme === 'dark' ? '#0c111c' : '#f9fbfe';
      document.head.appendChild(meta);
    } else {
      meta.setAttribute('content', theme === 'dark' ? '#0c111c' : '#f9fbfe');
    }
  };

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // 监听主题变化和路由变化，确保主题色始终同步
  useEffect(() => {
    if (mounted) {
      setThemeColor(resolvedTheme);
    }
  }, [mounted, resolvedTheme, pathname]);

  if (!mounted) {
    // 渲染一个占位符以避免布局偏移
    return <div className='w-10 h-10' />;
  }

  const toggleTheme = () => {
    // 检查浏览器是否支持 View Transitions API
    const targetTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setThemeColor(targetTheme);
    if (!(document as any).startViewTransition) {
      setTheme(targetTheme);
      return;
    }

    (document as any).startViewTransition(() => {
      setTheme(targetTheme);
    });
  };

  // 检查是否在登录页面
  const isLoginPage = pathname === '/login';
  return (
    <>
      <div className={`flex items-center ${isMobile ? 'space-x-1' : 'space-x-2'}`}>
        {/* 聊天按钮 - 在登录页面不显示 */}
        {!isLoginPage && (
          <button
            onClick={openChatModal}
            className={`relative group ${isMobile ? 'w-8 h-8 p-1.5' : 'w-10 h-10 p-2'} rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-blue-500/30 dark:hover:shadow-blue-400/30`}
            aria-label='打开聊天'
          >
            {/* 微光背景效果 */}
            <div className='absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/0 to-blue-600/0 group-hover:from-blue-400/20 group-hover:to-blue-600/20 dark:group-hover:from-blue-300/20 dark:group-hover:to-blue-500/20 transition-all duration-300'></div>
            <MessageCircle className='w-full h-full relative z-10' />
            {messageCount > 0 && (
              <span className={`absolute z-20 ${isMobile ? '-top-0.5 -right-0.5 w-4 h-4 text-xs' : '-top-1 -right-1 w-5 h-5 text-xs'} bg-red-500 text-white rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-800`}>
                {messageCount > 99 ? '99+' : messageCount}
              </span>
            )}
          </button>
        )}
        <button
          onClick={toggleTheme}
          className='relative w-10 h-10 p-2 rounded-full flex items-center justify-center text-gray-600 hover:text-amber-500 dark:text-gray-300 dark:hover:text-amber-400 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-amber-500/30 dark:hover:shadow-amber-400/30 group'
          aria-label='Toggle theme'
        >
          {/* 微光背景效果 */}
          <div className='absolute inset-0 rounded-full bg-gradient-to-br from-amber-400/0 to-amber-600/0 group-hover:from-amber-400/20 group-hover:to-amber-600/20 dark:group-hover:from-amber-300/20 dark:group-hover:to-amber-500/20 transition-all duration-300'></div>

          {resolvedTheme === 'dark' ? (
            <Sun className='w-full h-full relative z-10 group-hover:rotate-180 transition-transform duration-500' />
          ) : (
            <Moon className='w-full h-full relative z-10 group-hover:rotate-180 transition-transform duration-500' />
          )}
        </button>
      </div>

      {/* 聊天模态框 - 在登录页面不渲染 */}
      {!isLoginPage && isChatModalOpen && (
        <ChatModal
          isOpen={isChatModalOpen}
          onClose={closeChatModal}
          onMessageCountChange={handleMessageCountFromModal}
          onChatCountReset={handleChatCountReset}
          onFriendRequestCountReset={handleFriendRequestCountReset}
          // 将WebSocket状态和函数通过props传递给ChatModal
          isConnected={isConnected}
          sendMessage={sendMessage}
        />
      )}
    </>
  );
}
