'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface VirtualScrollContextType {
  virtualScrollEnabled: boolean;
  setVirtualScrollEnabled: (enabled: boolean) => void;
  isInitialized: boolean;
}

const VirtualScrollContext = createContext<VirtualScrollContextType | undefined>(undefined);

export const useVirtualScroll = () => {
  const context = useContext(VirtualScrollContext);
  if (!context) {
    throw new Error('useVirtualScroll must be used within a VirtualScrollProvider');
  }
  return context;
};

interface VirtualScrollProviderProps {
  children: ReactNode;
  initialValue?: boolean;
}

export const VirtualScrollProvider = ({ children, initialValue = true }: VirtualScrollProviderProps) => {
  const [virtualScrollEnabled, setVirtualScrollEnabledState] = useState(initialValue);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // 从 localStorage 读取用户偏好，覆盖初始值
    try {
      const savedPreference = localStorage.getItem('virtualScrollEnabled');
      if (savedPreference !== null) {
        setVirtualScrollEnabledState(JSON.parse(savedPreference));
      }
    } catch (error) {
      console.error('Failed to parse virtual scroll preference from localStorage', error);
    }
    setIsInitialized(true);
  }, []);

  const setVirtualScrollEnabled = (enabled: boolean) => {
    setVirtualScrollEnabledState(enabled);
    try {
      localStorage.setItem('virtualScrollEnabled', JSON.stringify(enabled));
    } catch (error) {
      console.error('Failed to save virtual scroll preference to localStorage', error);
    }
  };

  const value = {
    virtualScrollEnabled,
    setVirtualScrollEnabled,
    isInitialized,
  };

  return (
    <VirtualScrollContext.Provider value={value}>
      {children}
    </VirtualScrollContext.Provider>
  );
};
