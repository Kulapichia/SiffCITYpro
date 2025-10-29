'use client';

import { createContext, ReactNode, useContext, useRef, MutableRefObject } from 'react';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

// 扩展 AuthInfo 类型以匹配 auth.ts 中的返回值
interface AuthInfo {
  password?: string;
  username?: string;
  signature?: string;
  timestamp?: number;
  loginTime?: number;
  role?: 'owner' | 'admin' | 'user';
}

// [滚动恢复整合] 明确 Context 类型，并为 ref 提供一个符合类型的默认值
const SiteContext = createContext<{
  siteName: string;
  announcement?: string;
  authInfo: AuthInfo | null;
  mainContainerRef: MutableRefObject<HTMLDivElement | null>;
}>({
  // 默认值
  siteName: 'MoonTV',
  announcement:
    '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
  authInfo: null,
  mainContainerRef: { current: null }, // [滚动恢复整合] 提供一个符合类型的默认 ref 对象
});

export const useSite = () => useContext(SiteContext);

export function SiteProvider({
  children,
  siteName,
  announcement,
}: {
  children: ReactNode;
  siteName: string;
  announcement?: string;
}) {
  // 在客户端组件中安全地获取 authInfo
  const authInfo = typeof window !== 'undefined' ? getAuthInfoFromBrowserCookie() : null;
  // [滚动恢复整合] 创建 ref 实例，它将在整个应用生命周期内保持不变
  const mainContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    // [滚动恢复整合] 将 ref 实例通过 context value 提供出去
    <SiteContext.Provider value={{ siteName, announcement, authInfo, mainContainerRef }}>
      {children}
    </SiteContext.Provider>
  );
}
