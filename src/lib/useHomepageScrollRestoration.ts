import { useEffect, RefObject, useCallback, useRef } from 'react';

const STORAGE_KEY = 'homepageScrollPosition';
const CLEAR_EVENT = 'clearHomepageScroll';

export function useHomepageScrollRestoration(scrollContainerRef: RefObject<HTMLElement>) {
  const getActualScrollContainer = useCallback(() => {
    // Check if it's a mobile device (same logic as in the old useScrollRestoration)
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return isMobile ? document.body : scrollContainerRef.current;
  }, [scrollContainerRef]);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null); // Added timeoutRef

  useEffect(() => {
    

    const scrollContainer = getActualScrollContainer(); // Use the actual scroll container
    if (!scrollContainer) {
      
      return;
    }

    


    const savedPosition = sessionStorage.getItem(STORAGE_KEY);
    if (savedPosition) {
      
      scrollContainer.scrollTo(0, parseInt(savedPosition, 10));
    }

    const handleScroll = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        const currentScrollY = scrollContainer.scrollTop;
        sessionStorage.setItem(STORAGE_KEY, currentScrollY.toString());
        
      }, 150); // Debounce for 150ms
    };

    const handleClearScroll = () => {
      
      sessionStorage.removeItem(STORAGE_KEY);
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    window.addEventListener(CLEAR_EVENT, handleClearScroll);

    return () => {
      
      scrollContainer.removeEventListener('scroll', handleScroll);
      window.removeEventListener(CLEAR_EVENT, handleClearScroll);

      if (timeoutRef.current) { // Clear any pending debounce on unmount
        clearTimeout(timeoutRef.current);
      }

      // Save the current scroll position on unmount, but only if it's not 0
      const currentScrollYOnUnmount = scrollContainer.scrollTop;
      if (currentScrollYOnUnmount > 0) {
        sessionStorage.setItem(STORAGE_KEY, currentScrollYOnUnmount.toString());
        
      } else {
        
      }
    };
  }, [scrollContainerRef, getActualScrollContainer]); // Add getActualScrollContainer to dependencies
}
