'use client';

import { useRef, useEffect } from 'react';
import Sidebar from './Sidebar';
import { usePathname } from 'next/navigation';

interface TabletSidebarProps {
  activePath?: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  isFloatingHeaderVisible: boolean;
  floatingHeaderHeight: number;
}

export function TabletSidebar({ activePath, isOpen, setIsOpen, isFloatingHeaderVisible, floatingHeaderHeight }: TabletSidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const handleClickOutside = (event: MouseEvent) => {
    if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.body.style.overflow = 'auto';
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.body.style.overflow = 'auto';
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close sidebar on page navigation
  useEffect(() => {
    setIsOpen(false);
  }, [pathname, setIsOpen]);

  const topStyle = '0px';

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" />
      )}

      <div
        ref={sidebarRef}
        className={`fixed left-0 h-full z-[1000] transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ top: topStyle }}
      >
        {/* 我们渲染现有的 Sidebar 组件并强制其处于展开状态 */}
        <div className="h-full bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-r border-gray-200/20">
            <Sidebar isTabletMode={true} activePath={activePath} onCategorySelect={() => setIsOpen(false)} />
        </div>
      </div>
    </>
  );
}
