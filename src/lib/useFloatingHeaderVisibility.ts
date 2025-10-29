'use client';

import { useState, useEffect, useRef } from 'react';

const SCROLL_THRESHOLD = 200; // The distance to scroll before the logic starts
const SCROLL_DELTA_THRESHOLD = 5; // The distance to scroll up to show the header

export function useFloatingHeaderVisibility(targetRef: React.RefObject<HTMLElement> | null) {
  const [isVisible, setIsVisible] = useState(false);
  const lastScrollTop = useRef(0);

  useEffect(() => {
    const scrollableElement = targetRef?.current;
    // If the element doesn't exist on desktop/tablet, we listen to window scroll
    const target = scrollableElement ?? window;

    const handleScroll = () => {
      let currentScrollTop = 0;
      let isAtBottom = false;

      if (scrollableElement) {
        currentScrollTop = scrollableElement.scrollTop;
        isAtBottom = scrollableElement.scrollHeight - currentScrollTop - scrollableElement.clientHeight < 20;
      } else {
        currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
        isAtBottom = window.innerHeight + currentScrollTop >= document.documentElement.offsetHeight - 20;
      }

      // 1. Hide at the top of the page or at the bottom
      if (currentScrollTop < SCROLL_THRESHOLD || isAtBottom) {
        setIsVisible(false);
        lastScrollTop.current = Math.max(0, currentScrollTop);
        return;
      }

      // 2. Determine scroll direction
      // Scrolling up, and past the threshold
      if (currentScrollTop < lastScrollTop.current - SCROLL_DELTA_THRESHOLD) {
        setIsVisible(true);
      }
      // Scrolling down
      else if (currentScrollTop > lastScrollTop.current) {
        setIsVisible(false);
      }

      lastScrollTop.current = Math.max(0, currentScrollTop);
    };

    target.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      target.removeEventListener('scroll', handleScroll);
    };
  }, [targetRef]); // Rerun effect if targetRef changes

  return isVisible;
}
