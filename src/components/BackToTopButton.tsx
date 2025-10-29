// src/components/BackToTopButton.tsx (新建)
'use client';

import { ChevronUp } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useSite } from './SiteProvider';
import { useFloatingHeaderVisibility } from '@/lib/useFloatingHeaderVisibility';

export function BackToTopButton() {
  const { mainContainerRef } = useSite();
  const isScrollingUp = useFloatingHeaderVisibility(mainContainerRef || null);
  const [isVisible, setIsVisible] = useState(false);

  const handleScroll = useCallback(() => {
    if (mainContainerRef && mainContainerRef.current) {
      const { scrollTop } = mainContainerRef.current;
      // When scrolled down more than 400px, show the button
      setIsVisible(scrollTop > 400 && isScrollingUp);
    }
  }, [mainContainerRef, isScrollingUp]);

  useEffect(() => {
    const container = mainContainerRef?.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      // Initial check
      handleScroll();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [mainContainerRef, handleScroll]);

  const scrollToTop = () => {
    if (mainContainerRef && mainContainerRef.current) {
      mainContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  return (
    <button
      onClick={scrollToTop}
      className={`fixed bottom-6 right-6 z-[999] p-3 rounded-full bg-gray-100/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-lg border border-gray-200/30 dark:border-gray-700/30 transition-all duration-300 ease-in-out hover:scale-110 hover:bg-gray-100/95 dark:hover:bg-gray-700/95 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <ChevronUp className="h-6 w-6" />
    </button>
  );
}
