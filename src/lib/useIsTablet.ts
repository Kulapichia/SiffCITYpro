"use client";

import { useState, useEffect } from 'react';

export function useIsTablet() {
  const [isTablet, setIsTablet] = useState<boolean | null>(null);

  useEffect(() => {
    const checkDevice = () => {
      const userAgent = navigator.userAgent;
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      // This comprehensive regex is sourced from VideoCard.tsx for a unified detection logic.
      // It covers:
      // 1. ipad: Classic iPads.
      // 2. tablet: Generic tablets.
      // 3. android(?!.*mobile): Android tablets.
      // 4. windows(?!.*phone)(.*touch): Windows touch devices that are not phones.
      // 5. (macintosh.*safari): Modern iPads (iPadOS 13+) that identify as Macs.
      const isTabletDevice = (/(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|((macintosh.*(?!mobile).*safari.*(?!iphone|ipod))))/i.test(userAgent)) && hasTouch;
      setIsTablet(isTabletDevice);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);

    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []);

  return isTablet;
}
