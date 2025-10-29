/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';

import { getConfig } from '@/lib/config';

import { GlobalErrorIndicator } from '../components/GlobalErrorIndicator';
import { SessionTracker } from '../components/SessionTracker';
import { SiteProvider } from '../components/SiteProvider';
import SourceAvailabilityChecker from '../components/SourceAvailabilityChecker';
import { ThemeProvider } from '../components/ThemeProvider';
import { ToastProvider } from '../components/Toast';
import { VirtualScrollProvider } from '../components/VirtualScrollProvider';
import GlobalThemeLoader from '../components/GlobalThemeLoader';
import { ThemeToggle } from '../components/ThemeToggle'; // 新增导入
const inter = Inter({ subsets: ['latin'] });
// export const dynamic = 'force-dynamic';
// 动态生成 metadata，支持配置更新后的标题变化
export async function generateMetadata(): Promise<Metadata> {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  let siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'MoonTV';

  if (storageType !== 'localstorage') {
    try {
      const config = await getConfig();
      // BEST PRACTICE: 使用 '??' 避免当远程配置为空字符串时被错误覆盖
      siteName = config.SiteConfig?.SiteName ?? siteName;
    } catch (error) {
      console.error(
        'Failed to load remote config for metadata, using default site name:',
        error
      );
    }
  }

  return {
    title: siteName,
    description: '影视聚合',
    manifest: '/manifest.json',
    icons: {
      apple: '/icons/icon-192x192.png',
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: siteName,
    },
  };
}

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

    // REFACTOR: 将默认配置定义为一个对象，使代码更清晰
    let configData = {
      siteName: process.env.NEXT_PUBLIC_SITE_NAME || 'MoonTV',
      announcement:
        process.env.ANNOUNCEMENT ||
        '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
      doubanProxyType: process.env.NEXT_PUBLIC_DOUBAN_PROXY_TYPE || 'direct',
      doubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
      doubanImageProxyType:
        process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE || 'direct',
      doubanImageProxy: process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY || '',
      disableYellowFilter:
        process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true',
      fluidSearch: process.env.NEXT_PUBLIC_FLUID_SEARCH !== 'false',
      showContentFilter: false,
      customCategories: [] as {
        name: string;
        type: 'movie' | 'tv';
        query: string;
      }[],
      enableVirtualScroll: true,
      netdiskSearch: false,
      homeCustomize: {},
      requireDeviceCode: process.env.NEXT_PUBLIC_REQUIRE_DEVICE_CODE !== 'false',
    };

    if (storageType !== 'localstorage') {
      try {
        const remoteConfig = await getConfig();
        const siteConfig = remoteConfig.SiteConfig || {};

        // REFACTOR: 使用 ?? 安全地覆盖默认值
        configData.siteName = siteConfig.SiteName ?? configData.siteName;
        configData.announcement =
          siteConfig.Announcement ?? configData.announcement;
        configData.doubanProxyType =
          siteConfig.DoubanProxyType ?? configData.doubanProxyType;
        configData.doubanProxy = siteConfig.DoubanProxy ?? configData.doubanProxy;
        configData.doubanImageProxyType =
          siteConfig.DoubanImageProxyType ?? configData.doubanImageProxyType;
        configData.doubanImageProxy =
          siteConfig.DoubanImageProxy ?? configData.doubanImageProxy;
        configData.disableYellowFilter =
          siteConfig.DisableYellowFilter ?? configData.disableYellowFilter;
        configData.showContentFilter = siteConfig.ShowContentFilter !== false;
        configData.fluidSearch = siteConfig.FluidSearch ?? configData.fluidSearch;
        configData.enableVirtualScroll =
          siteConfig.EnableVirtualScroll ?? configData.enableVirtualScroll;
        configData.netdiskSearch =
          siteConfig.NetdiskSearch ?? configData.netdiskSearch;
        configData.homeCustomize =
          remoteConfig.HomeCustomize ?? configData.homeCustomize;
        configData.requireDeviceCode =
          siteConfig.RequireDeviceCode ?? configData.requireDeviceCode;

        if (remoteConfig.CustomCategories) {
          configData.customCategories = remoteConfig.CustomCategories.filter(
            (category: any) =>
              !category.disabled && category.name && category.query
          ).map((category: any) => ({
            name: category.name,
            type: category.type,
            query: category.query,
          }));
        }
        // FIX: 已移除重复的代码块
      } catch (error) {
        console.error(
          'Failed to load remote config, using default values:',
          error
        );
      }
    }

    // 将运行时配置注入到全局 window 对象
    const runtimeConfig = {
      STORAGE_TYPE: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
      DOUBAN_PROXY_TYPE: configData.doubanProxyType,
      DOUBAN_PROXY: configData.doubanProxy,
      DOUBAN_IMAGE_PROXY_TYPE: configData.doubanImageProxyType,
      DOUBAN_IMAGE_PROXY: configData.doubanImageProxy,
      DISABLE_YELLOW_FILTER: configData.disableYellowFilter,
      SHOW_CONTENT_FILTER: configData.showContentFilter,
      CUSTOM_CATEGORIES: configData.customCategories,
      FLUID_SEARCH: configData.fluidSearch,
      ENABLE_VIRTUAL_SCROLL: configData.enableVirtualScroll,
      NETDISK_SEARCH: configData.netdiskSearch,
      HOME_CUSTOMIZE: configData.homeCustomize,
      REQUIRE_DEVICE_CODE: configData.requireDeviceCode,
    };

    return (
      <html lang='zh-CN' suppressHydrationWarning>
        <head>
          <meta
            name='viewport'
            content='width=device-width, initial-scale=1.0, viewport-fit=cover'
          />
          <link rel='apple-touch-icon' href='/icons/icon-192x192.png' />
          {/* 
            为移动端浏览器状态栏设置主题颜色。
            浅色模式下，iOS 状态栏为白色背景、深色文字，Android 为浅灰色背景、深色文字。
            深色模式下，状态栏统一为黑色背景、浅色文字。
            这确保了应用在不同设备和主题下都有一致的视觉体验。
          */}
          <meta name="theme-color" content="#C5D8E2" media="(prefers-color-scheme: light)" />
          <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
          {/* eslint-disable-next-line @next/next/no-sync-scripts */}
          <script
            dangerouslySetInnerHTML={{
              __html: `window.RUNTIME_CONFIG = ${JSON.stringify(
                runtimeConfig
              )};`,
            }}
          />
          {/* 立即从缓存应用主题，避免闪烁 */}
          {/* eslint-disable-next-line @next/next/no-sync-scripts */}
          <script
            dangerouslySetInnerHTML={{
              __html: `
              (function() {
                try {
                  const cachedTheme = localStorage.getItem('theme-cache');
                  if (cachedTheme) {
                    const themeConfig = JSON.parse(cachedTheme);
                    const html = document.documentElement;
                    html.removeAttribute('data-theme');
                    if (themeConfig.defaultTheme && themeConfig.defaultTheme !== 'default') {
                      html.setAttribute('data-theme', themeConfig.defaultTheme);
                    }
                    if (themeConfig.customCSS) {
                      let styleEl = document.getElementById('custom-theme-css');
                      if (!styleEl) {
                        styleEl = document.createElement('style');
                        styleEl.id = 'custom-theme-css';
                        document.head.appendChild(styleEl);
                      }
                      styleEl.textContent = themeConfig.customCSS;
                    }
                  }
                } catch (e) {
                  console.error('Failed to apply cached theme:', e);
                }
              })();
            `,
            }}
          />
        </head>
        <body
          className={`${inter.className} min-h-screen bg-white text-gray-900 dark:bg-black dark:text-gray-200`}
        >
          <ThemeProvider
            attribute='class'
            defaultTheme='system'
            enableSystem
            disableTransitionOnChange
          >
            <ToastProvider>
              <SiteProvider
                siteName={configData.siteName}
                announcement={configData.announcement}
              >
                <VirtualScrollProvider
                  initialValue={configData.enableVirtualScroll}
                >
                  <GlobalThemeLoader />
                  <SessionTracker />
                  <SourceAvailabilityChecker />
                  {children}
                  <GlobalErrorIndicator />
                </VirtualScrollProvider>
              </SiteProvider>
            </ToastProvider>
          </ThemeProvider>
        </body>
      </html>
    );
  } catch (error) {
    console.error('CRITICAL: RootLayout 渲染失败，应用可能崩溃:', error);
    // 返回一个安全的、无依赖的静态页面作为降级方案
    return (
      <html lang='zh-CN'>
        <head>
          <meta
            name='viewport'
            content='width=device-width, initial-scale=1.0, viewport-fit=cover'
          />
          <title>应用错误</title>
        </head>
        <body>
          <div
            style={{
              textAlign: 'center',
              padding: '50px',
              fontFamily: 'sans-serif',
              color: '#333',
            }}
          >
            <h1>应用加载失败</h1>
            <p>
              服务器在渲染页面时遇到严重错误，请联系管理员查看后台日志。
            </p>
          </div>
        </body>
      </html>
    );
  }
}
