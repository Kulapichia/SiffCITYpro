import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getScrollCache, ScrollCacheData, setScrollCache } from './scrollCache';
import { DoubanItem } from './types';

// [滚动恢复整合] 此接口现在作为一个基础类型，具体页面数据将作为泛型传入
export interface RestorableData {
  // 原始接口保持不变，但它将被用作泛型约束
  items: DoubanItem[];
  hasNextPage: boolean;
  primarySelection: string;
  secondarySelection: string;
  multiLevelValues: Record<string, string>;
  selectedWeekday: string;
}

// [滚动恢复整合] 将 Props 接口改造为泛型 T，以接收任何类型的数据
interface UseScrollRestorationProps<T> {
  dataRef: React.RefObject<T>;
  mainContainerRef?: React.RefObject<HTMLElement | null>;
  restoreState: (data: T) => void;
}

// [滚动恢复整合] 将整个 Hook 改造为泛型 T
export const useScrollRestoration = <T>({
  dataRef,
  mainContainerRef,
  restoreState,
}: UseScrollRestorationProps<T>) => {
  const pathname = usePathname();

  const cachedData = useMemo(() => getScrollCache(pathname), [pathname]);

  // 使用 state 来管理恢复状态，以便能自动解锁
  const [isRestoring, setIsRestoring] = useState(!!cachedData);

  // [滚动恢复整合] 完全保留您原来的 getScrollContainer 逻辑
  const getScrollContainer = useCallback(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return isMobile ? document.body : mainContainerRef?.current;
  }, [mainContainerRef]);

  // [滚动恢复整合] 完全保留您原来的 areTopTextsRendered 逻辑
  const areTopTextsRendered = (container: HTMLElement): boolean => {
    const texts = ['电影', '剧集', '综艺', '动漫', '更多'];
    for (const text of texts) {
      if (container.innerText.includes(text)) {
        return true;
      }
    }
    return false;
  };

  // [滚动恢复整合] 完全保留您原来的 restore effect 逻辑，仅修改一行以适应新的缓存结构
  // 此 Effect 仅负责调用 restoreState 和设置滚动条
  useEffect(() => {
    if (cachedData) {
      const container = getScrollContainer();
      if (!container) return; // Add a guard for null container

      // [滚动恢复整合] 从 cachedData.data 中恢复状态
      restoreState(cachedData.data as T);

      // 应用滚动位置的函数
      const applyScroll = (scrollContainer: HTMLElement) => {
        if (scrollContainer.scrollTop !== cachedData.scrollPosition) {
          scrollContainer.scrollTop = cachedData.scrollPosition;
        }
      };

      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

      if (isMobile && container === document.body) {
        // For mobile and document.body, check for specific text rendering
        const observer = new MutationObserver((mutations, obs) => {
          if (areTopTextsRendered(container)) {
            applyScroll(container);
            obs.disconnect();
          }
        });

        observer.observe(container, { childList: true, subtree: true });

        return () => {
          observer.disconnect();
        };
      } else if (container.scrollHeight > container.clientHeight) {
        applyScroll(container);
      } else {
        // For desktop or mobile with mainContainerRef, use scrollHeight check
        const observer = new MutationObserver((mutations, obs) => {
          if (container.scrollHeight > container.clientHeight) {
            applyScroll(container);
            obs.disconnect();
          }
        });

        observer.observe(container, { childList: true, subtree: true });

        return () => {
          observer.disconnect();
        };
      }
    }
  }, [cachedData, restoreState, getScrollContainer]);

  // [滚动恢复整合] 完全保留您原来的 isRestoring effect 逻辑
  // 此 Effect 负责在恢复完成后，自动将 isRestoring 置为 false，从而“解锁”页面
  useEffect(() => {
    if (isRestoring) {
      // 延迟解锁，确保页面的恢复性渲染已完成
      const timer = setTimeout(() => {
        setIsRestoring(false);
      }, 150); // 延迟应略长于滚动恢复的延迟
      return () => clearTimeout(timer);
    }
  }, [isRestoring]);

  // [滚动恢复整合] 完全保留您原来的 saveScrollState 逻辑，仅修改一行以适应新的缓存结构
  const saveScrollState = useCallback(() => {
    const container = getScrollContainer();
    if (!container || !dataRef.current) return;

    const cache: ScrollCacheData<T> = {
      scrollPosition: container.scrollTop,
      // [滚动恢复整合] 将 dataRef.current 存入 data 属性
      data: dataRef.current,
      timestamp: Date.now(),
    };

    setScrollCache(pathname, cache);
  }, [pathname, getScrollContainer, dataRef]);

  return { saveScrollState, isRestoring };
};
