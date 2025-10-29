'use client';

import { useFloatingHeaderVisibility } from '@/lib/useFloatingHeaderVisibility';

import { TabletHeaderActions } from './TabletHeaderActions';
import React from 'react';

interface FloatingHeaderProps {
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  scrollContainerRef: React.RefObject<HTMLElement> | null;
  isOpen: boolean;
  title?: string;
}

export function FloatingHeader({ setIsOpen, scrollContainerRef, isOpen, title }: FloatingHeaderProps) {
  const isVisible = useFloatingHeaderVisibility(scrollContainerRef);
  

  return (
    <header
      className={`safe-padding-top hidden md:flex fixed top-0 left-0 right-0 z-[999] h-14 items-center justify-between px-4 transition-all duration-300 ease-in-out 
        ${isVisible ? 'translate-y-0' : '-translate-y-full'}
      `}
    >
      {/* Background with blur */}
      <div className="absolute inset-0 w-full h-full bg-[#C5D8E2] dark:bg-black border-b border-gray-200/20" />

      {/* Actions */}
      <div className="relative z-10 flex w-full items-center justify-between">
        <TabletHeaderActions setIsOpen={setIsOpen} isOpen={isOpen} title={title} />
      </div>
    </header>
  );
}

export default FloatingHeader;
