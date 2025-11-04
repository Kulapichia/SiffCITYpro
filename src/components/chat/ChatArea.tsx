// src/components/chat/ChatArea.tsx
'use client';

import { useEffect, useRef } from 'react';
import { ChevronLeft, Paperclip, Send, Smile, Users, Image as ImageIcon, X } from 'lucide-react';
import { ChatMessage, Conversation } from '../../lib/types';
import { User } from '@/lib/admin.types';
import { MessageBubble } from './MessageBubble';

// 定义 Props 类型
interface ChatAreaProps {
  isMobile: boolean;
  isOpen: boolean;
  selectedConversation: Conversation | null;
  onBack: () => void;
  getAvatarUrl: (username: string) => string;
  getDisplayName: (username: string) => string;
  isUserOnline: (username: string) => boolean;
  currentUser: User | null;
  messages: ChatMessage[];
  newMessage: string;
  onNewMessageChange: (message: string) => void;
  onSendMessage: () => void;
  onImageUpload: (file: File) => void;
  uploadingImage: boolean;
  isConnected: boolean;
  showEmojiPicker: boolean;
  onShowEmojiPickerChange: (show: boolean) => void;
}

export function ChatArea({
  isMobile,
  isOpen,
  selectedConversation,
  onBack,
  getAvatarUrl,
  getDisplayName,
  isUserOnline,
  currentUser,
  messages,
  newMessage,
  onNewMessageChange,
  onSendMessage,
  onImageUpload,
  uploadingImage,
  isConnected,
  showEmojiPicker,
  onShowEmojiPickerChange,
}: ChatAreaProps) {

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 常用表情列表
  const emojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
    '🙂', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝',
    '🤗', '🤔', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮',
    '🤐', '😯', '😴', '😫', '😪', '😵', '🤯', '🤠', '🥳', '😎',
    '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '👐',
    '❤️', '💙', '💚', '💛', '💜', '🧡', '🖤', '🤍', '🤎', '💕',
    '💖', '💗', '💘', '💝', '💞', '💟', '❣️', '💔', '❤️‍🔥', '💯'
  ];
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // 自动调整高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + 'px';
    }
  }, [newMessage]);


  const handleEmojiSelect = (emoji: string) => {
    onNewMessageChange(newMessage + emoji);
    onShowEmojiPickerChange(false);
  };
  
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
    // 清除文件选择，以便可以再次选择相同的文件
    if (event.target) {
      event.target.value = '';
    }
  };

  // 格式化消息时间显示
  const formatMessageTime = (timestamp: number) => {
    const messageDate = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());

    const timeStr = messageDate.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    if (messageDay.getTime() === today.getTime()) {
      // 今天的消息：只显示时分秒
      return timeStr;
    } else if (messageDay.getTime() === yesterday.getTime()) {
      // 昨天的消息：昨天-时分秒
      return `昨天-${timeStr}`;
    } else {
      // 更早的消息：年月日-时分秒
      const dateStr = messageDate.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return `${dateStr}-${timeStr}`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`
      ${isMobile ? 'w-full flex' : 'flex-1'}
      flex-col h-full
    `}>
      {selectedConversation ? (
        <>
          {/* 聊天头部 */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center space-x-2">
            {isMobile && (
              <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="flex-shrink-0">
              {selectedConversation.participants.length === 2 ? (
                (() => {
                  const otherUser = selectedConversation.participants.find(p => p !== currentUser?.username);
                  return otherUser ? (
                    <div className="relative">
                      <img
                        src={getAvatarUrl(otherUser)}
                        alt={getDisplayName(otherUser)}
                        className="w-12 h-12 rounded-full"
                      />
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 ${isUserOnline(otherUser) ? 'bg-green-400' : 'bg-gray-400'
                        }`} />
                    </div>
                  ) : null;
                })()
              ) : (
                <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center text-white font-medium">
                  <Users className="w-6 h-6" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 dark:text-white truncate text-sm">
                {selectedConversation.name}
              </h3>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {selectedConversation.participants.length === 2 ? (
                  (() => {
                    const otherUser = selectedConversation.participants.find(p => p !== currentUser?.username);
                    return otherUser ? (
                      <span className="flex items-center space-x-1">
                        <span>{isUserOnline(otherUser) ? '在线' : '离线'}</span>
                        <span>•</span>
                        <span>{selectedConversation.participants.length} 人</span>
                      </span>
                    ) : `${selectedConversation.participants.length} 人`;
                  })()
                ) : (
                  `${selectedConversation.participants.length} 人`
                )}
              </div>
            </div>
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-1 bg-gradient-to-b from-gray-50/30 to-white/50 dark:from-gray-800/30 dark:to-gray-900/50">
              {messages.map((message, index) => (
                  <MessageBubble
                      key={message.id}
                      message={message}
                      isOwnMessage={message.sender_id === currentUser?.username}
                      showName={index === 0 || messages[index - 1].sender_id !== message.sender_id}
                      getAvatarUrl={getAvatarUrl}
                      getDisplayName={getDisplayName}
                      formatMessageTime={formatMessageTime}
                  />
              ))}
              <div ref={messagesEndRef} />
          </div>

          {/* 消息输入区域 */}
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 relative">
            {/* 表情选择器 */}
            {showEmojiPicker && (
              <div className="emoji-picker-container absolute left-4 right-4 bottom-full mb-2 p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl shadow-xl z-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">选择表情</h3>
                  <button
                    onClick={() => onShowEmojiPickerChange(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-9 gap-1 max-h-40 overflow-y-auto custom-scrollbar">
                  {emojis.map((emoji, index) => (
                    <button
                      key={index}
                      onClick={() => handleEmojiSelect(emoji)}
                      className="p-2 text-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* 主输入区域 */}
            <div className={`p-2 sm:p-3 pb-safe`}>
              <div className="bg-white dark:bg-gray-700 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-600/80">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 dark:border-gray-600">
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => onShowEmojiPickerChange(!showEmojiPicker)}
                      className={`emoji-picker-container p-2 rounded-xl transition-all duration-200 transform hover:scale-105 ${showEmojiPicker
                        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                        }`}
                      title="表情"
                    >
                      <Smile className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-xl transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                      title="上传图片"
                    >
                      {uploadingImage ? (
                        <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <ImageIcon className="w-5 h-5" />
                      )}
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                    <button className="p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl transition-all duration-200 transform hover:scale-105" disabled title="附件（即将开放）">
                      <Paperclip className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400">
                      {newMessage.length > 0 && (<span className={newMessage.length > 500 ? 'text-red-500' : ''}>{newMessage.length}/1000</span>)}
                    </span>
                    <div className="flex items-center space-x-1">
                      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-xs text-gray-400">{isConnected ? '在线' : '离线'}</span>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      value={newMessage}
                      onChange={(e) => onNewMessageChange(e.target.value)}
                      placeholder="输入消息内容... 按Enter发送，Shift+Enter换行"
                      className="w-full px-3 py-2 pr-14 bg-gray-50 dark:bg-gray-600 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-gray-500 placeholder-gray-400 dark:placeholder-gray-400 resize-none min-h-[40px] max-h-28 transition-all duration-200"
                      rows={1}
                      maxLength={1000}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSendMessage(); }
                      }}
                    />
                    <button onClick={onSendMessage} disabled={!newMessage.trim() || uploadingImage} className="absolute right-2 bottom-2 p-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg hover:shadow-xl" title={!newMessage.trim() ? '请输入消息内容' : '发送消息 (Enter)'}>
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-600/50 rounded-b-2xl border-t border-gray-100 dark:border-gray-600">
                  <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center space-x-1"><span>📝</span><span>支持文字</span></span>
                    <span className="flex items-center space-x-1"><span>😊</span><span>表情</span></span>
                    <span className="flex items-center space-x-1"><span>🖼️</span><span>图片 (5MB内)</span></span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {uploadingImage ? (<span className="flex items-center space-x-1 text-blue-500"><div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" /><span>上传中...</span></span>) : (<span>Enter发送</span>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        !isMobile && (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            选择一个对话开始聊天
          </div>
        )
      )}
    </div>
  );
}
