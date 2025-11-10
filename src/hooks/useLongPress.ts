import { TouchEvent, MouseEvent, useCallback, useRef } from 'react';

interface UseLongPressOptions<T = unknown> {
  onLongPress: (event: TouchEvent | MouseEvent, context: T) => void;
  onClick?: (event: TouchEvent | MouseEvent, context: T) => void;
  longPressDelay?: number;
  moveThreshold?: number;
}

interface TouchPosition {
  x: number;
  y: number;
}

export const useLongPress = <T = unknown>({
  onLongPress,
  onClick,
  longPressDelay = 500,
  moveThreshold = 10,
}: UseLongPressOptions<T>) => {
  const isLongPress = useRef(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const startPosition = useRef<TouchPosition | null>(null);
  const isActive = useRef(false); // 防止重复触发
  const wasButton = useRef(false); // 记录触摸开始时是否是按钮
  const contextRef = useRef<T>();
  const clearTimer = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const handleStart = useCallback(
    (e: TouchEvent | MouseEvent, context: T, isButton = false) => {
      // 如果已经有活跃的手势，忽略新的开始
      if (isActive.current) {
        return;
      }

      contextRef.current = context;
      const { clientX, clientY } = 'touches' in e ? e.touches[0] : e;
      isActive.current = true;
      isLongPress.current = false;
      startPosition.current = { x: clientX, y: clientY };

      // 记录触摸开始时是否是按钮
      wasButton.current = isButton;

      pressTimer.current = setTimeout(() => {
        // 再次检查是否仍然活跃
        if (!isActive.current) return;

        isLongPress.current = true;

        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        // 触发长按事件
        onLongPress(e, contextRef.current as T);
      }, longPressDelay);
    },
    [onLongPress, longPressDelay]
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!startPosition.current || !isActive.current) return;

      const distance = Math.sqrt(
        Math.pow(clientX - startPosition.current.x, 2) +
        Math.pow(clientY - startPosition.current.y, 2)
      );

      // 如果移动距离超过阈值，取消长按
      if (distance > moveThreshold) {
        clearTimer();
        isActive.current = false;
      }
    },
    [clearTimer, moveThreshold]
  );

  const handleEnd = useCallback(
    (e: TouchEvent | MouseEvent) => {
      clearTimer();

      // 根据情况决定是否触发点击事件：
      // 1. 如果是长按，不触发点击
      // 2. 如果不是长按且触摸开始时是按钮，不触发点击
      // 3. 否则触发点击
      const shouldClick =
        !isLongPress.current && !wasButton.current && onClick && isActive.current;

      if (shouldClick) {
        onClick(e, contextRef.current as T);
      }

      // 重置所有状态
      isLongPress.current = false;
      startPosition.current = null;
      isActive.current = false;
      wasButton.current = false;
    },
    [clearTimer, onClick]
  );

  // 触摸事件处理器
  const onTouchStart = useCallback(
    (e: React.TouchEvent, context: T) => {
      // 检查是否触摸的是按钮或其他交互元素
      const target = e.target as HTMLElement;
      const buttonElement = target.closest('[data-button]');

      // 更精确的按钮检测：只有当触摸目标直接是按钮元素或其直接子元素时才认为是按钮
      const isDirectButton = target.hasAttribute('data-button');
      const isButton = !!buttonElement && isDirectButton;

      // 阻止默认的长按行为，但不阻止触摸开始事件
      handleStart(e, context, !!isButton);
    },
    [handleStart]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    },
    [handleMove]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // 始终阻止默认行为，避免任何系统长按菜单
      e.preventDefault();
      e.stopPropagation();
      handleEnd(e);
    },
    [handleEnd]
  );

  // 返回一个可以接收 context 的函数，该函数再返回事件处理器对象
  return useCallback(
    (context: T) => ({
      onTouchStart: (e: React.TouchEvent) => onTouchStart(e, context),
      onTouchMove,
      onTouchEnd,
    }),
    [onTouchStart, onTouchMove, onTouchEnd]
  );
};
