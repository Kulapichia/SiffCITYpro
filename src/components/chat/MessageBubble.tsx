// src/components/chat/MessageBubble.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { ChatMessage } from '../../lib/types';

interface MessageBubbleProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  showName: boolean;
  getAvatarUrl: (username: string) => string;
  getDisplayName: (username: string) => string;
  formatMessageTime: (timestamp: number) => string;
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  isOwnMessage,
  showName,
  getAvatarUrl,
  getDisplayName,
  formatMessageTime,
}: MessageBubbleProps) {
  // [LOG]
  console.log('[MessageBubble] Rendering. Message ID:', message.id);

  // 修复: 增加 state 来处理客户端时间格式化, 避免 hydration error
  const [clientFormattedTime, setClientFormattedTime] = useState('');

  useEffect(() => {
    // 仅在客户端挂载后设置时间, 确保服务端和客户端初始渲染一致
    setClientFormattedTime(formatMessageTime(message.timestamp));
  }, [message.timestamp, formatMessageTime]);
  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} ${showName ? 'mt-4' : 'mt-1'}`}>
      <div className={`flex items-end space-x-3 max-w-xs lg:max-w-md xl:max-w-lg ${isOwnMessage ? 'flex-row-reverse space-x-reverse' : ''}`}>
        {/* 头像 */}
        <div className="flex-shrink-0">
          {/* 使用 opacity-0 占位，避免连续消息抖动 */}
          <img
            src={getAvatarUrl(message.sender_id)}
            alt={getDisplayName(message.sender_id)}
            className={`w-10 h-10 rounded-full ring-2 ring-white dark:ring-gray-600 shadow-md ${!showName ? 'opacity-0' : ''}`}
          />
        </div>

        {/* 消息内容 */}
        <div className="flex flex-col min-w-0">
          {/* 发送者名称 */}
          {!isOwnMessage && showName && (
            <div className="mb-1 px-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {getDisplayName(message.sender_id)}
              </span>
            </div>
          )}

          {/* 消息气泡 */}
          <div
            className={`relative px-5 py-3 rounded-2xl shadow-lg backdrop-blur-sm transition-all duration-200 hover:shadow-xl ${isOwnMessage
              ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/25 rounded-br-md'
              : 'bg-white/90 dark:bg-gray-700/90 text-gray-900 dark:text-white shadow-gray-900/10 dark:shadow-black/20 ring-1 ring-gray-200/50 dark:ring-gray-600/50 rounded-bl-md'
              }`}
          >
            {message.message_type === 'image' ? (
              <div className="group">
                <img
                  src={message.content}
                  alt="图片消息"
                  className="max-w-full h-auto rounded-xl cursor-pointer transition-transform group-hover:scale-[1.02] shadow-md"
                  style={{ maxHeight: '300px' }}
                  onClick={() => {
                    const img = new Image();
                    img.src = message.content;
                    const newWindow = window.open('');
                    if (newWindow) {
                      newWindow.document.write(`
                        <html>
                          <head>
                            <title>图片查看</title>
                            <style>body { margin:0; padding:20px; background:#000; display:flex; align-items:center; justify-content:center; } img { max-width:100%; max-height:100vh; object-fit:contain; border-radius:8px; box-shadow:0 20px 25px -5px rgb(0 0 0 / 0.4); }</style>
                          </head>
                          <body><img src="${message.content}" /></body>
                        </html>
                      `);
                    }
                  }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 rounded-xl transition-colors pointer-events-none"></div>
              </div>
            ) : (
              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                {message.content}
              </div>
            )}

            {/* 消息气泡装饰尾巴 */}
            <div
              className={`absolute bottom-2 w-3 h-3 ${isOwnMessage
                ? 'right-0 -mr-1.5 bg-gradient-to-br from-blue-500 to-blue-600'
                : 'left-0 -ml-1.5 bg-white/90 dark:bg-gray-700/90 ring-1 ring-gray-200/50 dark:ring-gray-600/50'
                } transform rotate-45`}
            ></div>
          </div>

          {/* 时间戳 */}
          <div className={`mt-1 px-1 ${isOwnMessage ? 'text-right' : 'text-left'}`}>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {/* 修复: 使用在客户端格式化的时间 */}
              {clientFormattedTime}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
