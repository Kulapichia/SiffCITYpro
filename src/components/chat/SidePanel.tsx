// src/components/chat/SidePanel.tsx
'use client';
import { useEffect, useState } from 'react';
import { MessageCircle, Search, Users, X, UserPlus } from 'lucide-react';
import { Conversation, Friend, FriendRequest } from '../../lib/types';
import { User } from '@/lib/admin.types';

// 新增：用于客户端时间格式化的辅助组件，避免水合错误
// 修复：将 ClientTime 组件定义移到 SidePanel 组件外部的顶层作用域
const ClientTime = ({ timestamp }: { timestamp: number }) => {
  const [formattedTime, setFormattedTime] = useState('');

  useEffect(() => {
    setFormattedTime(
      new Date(timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  }, [timestamp]);

  return <>{formattedTime}</>;
};

// 定义 Props 类型
interface SidePanelProps {
  isMobile: boolean;
  isOpen: boolean;
  activeTab: 'chat' | 'friends';
  onTabChange: (tab: 'chat' | 'friends') => void;
  isConnected: boolean;
  onClose: () => void;
  unreadChatCount: number;
  unreadFriendRequestCount: number;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  friendSearchQuery: string;
  onFriendSearchQueryChange: (query: string) => void;
  searchResults: Friend[];
  getAvatarUrl: (username: string) => string;
  isFriend: (username: string) => boolean;
  onSendFriendRequest: (username: string) => void;
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  onConversationSelect: (conv: Conversation) => void;
  currentUser: User | null;
  getDisplayName: (username: string) => string;
  isUserOnline: (username: string) => boolean;
  conversationUnreadCounts: { [key: string]: number };
  friendRequests: FriendRequest[];
  onFriendRequestAction: (requestId: string, status: 'accepted' | 'rejected') => void;
  friends: Friend[];
  onStartConversation: (username: string) => void;
}

export function SidePanel({
  isMobile,
  isOpen,
  activeTab,
  onTabChange,
  isConnected,
  onClose,
  unreadChatCount,
  unreadFriendRequestCount,
  searchQuery,
  onSearchQueryChange,
  friendSearchQuery,
  onFriendSearchQueryChange,
  searchResults,
  getAvatarUrl,
  isFriend,
  onSendFriendRequest,
  conversations,
  selectedConversation,
  onConversationSelect,
  currentUser,
  getDisplayName,
  isUserOnline,
  conversationUnreadCounts,
  friendRequests,
  onFriendRequestAction,
  friends,
  onStartConversation
}: SidePanelProps) {
  // [LOG]
  console.log('[SidePanel] Rendering. Active Tab:', activeTab);

  if (!isOpen) return null;

  return (
    <div className={`
      ${isMobile ? 'w-full flex' : 'w-1/3 flex'}
      border-r border-gray-200 dark:border-gray-700 flex-col h-full
    `}>
      {/* 头部 */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-semibold">聊天</h2>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} title={isConnected ? '已连接' : '未连接'} />
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 标签页 */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => onTabChange('chat')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors relative ${activeTab === 'chat'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
          >
            <MessageCircle className="w-4 h-4 inline-block mr-1" />
            对话
            {unreadChatCount > 0 && activeTab !== 'chat' && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadChatCount > 99 ? '99+' : unreadChatCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onTabChange('friends')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors relative ${activeTab === 'friends'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
          >
            <Users className="w-4 h-4 inline-block mr-1" />
            好友
            {unreadFriendRequestCount > 0 && activeTab !== 'friends' && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadFriendRequestCount > 99 ? '99+' : unreadFriendRequestCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        {activeTab === 'chat' ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索对话..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索用户..."
                value={friendSearchQuery}
                onChange={(e) => onFriendSearchQueryChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {/* 搜索结果 */}
            {searchResults.length > 0 && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                <div className="p-2">
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">搜索结果</h4>
                  {searchResults.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <img src={getAvatarUrl(user.username)} alt={user.nickname || user.username} className="w-8 h-8 rounded-full" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-white text-sm truncate">{user.nickname || user.username}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{isFriend(user.username) ? '已是好友' : '陌生人'}</div>
                        </div>
                      </div>
                      {!isFriend(user.username) && (
                        <button onClick={() => onSendFriendRequest(user.username)} className="ml-2 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors" title="发送好友申请">
                          <UserPlus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'chat' ? (
          conversations.length > 0 ? (
            <div className="space-y-1 p-2">
              {conversations.map((conv) => {
                // 获取对话头像 - 私人对话显示对方头像，群聊显示群组图标
                const getConversationAvatar = () => {
                  if (conv.participants.length === 2) {
                    // 私人对话：显示对方用户的头像
                    const otherUser = conv.participants.find(p => p !== currentUser?.username);
                    return otherUser ? (
                      <div className="relative">
                        <img
                          src={getAvatarUrl(otherUser)}
                          alt={getDisplayName(otherUser)}
                          className="w-12 h-12 rounded-full ring-2 ring-white dark:ring-gray-700 shadow-sm"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const nextEl = target.nextElementSibling;
                            if (nextEl) nextEl.classList.remove('hidden');
                          }}
                        />
                        <div className="hidden w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold ring-2 ring-white dark:ring-gray-700 shadow-sm">
                          {getDisplayName(otherUser).charAt(0).toUpperCase()}
                        </div>
                        {/* 在线状态指示器 */}
                        <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white dark:border-gray-700 ${isUserOnline(otherUser) ? 'bg-green-400' : 'bg-gray-400'}`} />
                      </div>
                    ) : null;
                  } else {
                    // 群聊：显示群组图标和参与者头像叠加
                    return (
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white font-bold shadow-sm ring-2 ring-white dark:ring-gray-700">
                          <Users className="w-6 h-6" />
                        </div>
                        {/* 群聊成员数量指示 */}
                        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold border-2 border-white dark:border-gray-700">
                          {conv.participants.length}
                        </div>
                      </div>
                    );
                  }
                };

                return (
                  <button
                    key={conv.id}
                    onClick={() => onConversationSelect(conv)}
                    className={`w-full p-3 rounded-lg text-left transition-all duration-200 relative ${selectedConversation?.id === conv.id
                      ? 'bg-blue-100 dark:bg-blue-900/50 shadow-md'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-sm'
                      }`}
                  >
                    <div className="flex items-center space-x-3">
                      {/* 对话头像 */}
                      <div className="flex-shrink-0">
                        {getConversationAvatar()}
                      </div>
                      {/* 对话信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-medium text-gray-900 dark:text-white truncate">
                            {conv.name}
                          </div>
                          {/* 最后消息时间 */}
                          {conv.last_message?.timestamp && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0">
                              <ClientTime timestamp={conv.last_message.timestamp} />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-gray-500 dark:text-gray-400 truncate flex-1 mr-2">
                            {conv.last_message?.message_type === 'image'
                              ? '[图片]'
                              : (conv.last_message?.content || '暂无消息')
                            }
                          </div>
                          {/* 未读消息数量 */}
                          {conversationUnreadCounts[conv.id] > 0 && (
                            <div className="flex-shrink-0">
                              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                                {conversationUnreadCounts[conv.id] > 99 ? '99+' : conversationUnreadCounts[conv.id]}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-4 text-gray-500 dark:text-gray-400">
              <MessageCircle className="w-12 h-12 mb-4 text-gray-300 dark:text-gray-600" />
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">没有对话</h3>
              <p className="text-sm">点击“好友”标签页，添加好友并开始聊天吧！</p>
            </div>
          )
        ) : (
          <div className="space-y-2 p-2">
            {/* 好友申请 */}
            {friendRequests.filter(req => req.to_user === currentUser?.username && req.status === 'pending').length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">好友申请</h3>
                {friendRequests
                  .filter(req => req.to_user === currentUser?.username && req.status === 'pending')
                  .map((request) => (
                    <div key={request.id} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:shadow-sm transition-shadow">
                      <div className="flex items-center space-x-3 mb-3">
                        {/* 申请者头像 */}
                        <div className="flex-shrink-0">
                          <img
                            src={getAvatarUrl(request.from_user)}
                            alt={request.from_user}
                            className="w-10 h-10 rounded-full ring-2 ring-white dark:ring-gray-700 shadow-sm"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const nextEl = target.nextElementSibling;
                              if (nextEl) nextEl.classList.remove('hidden');
                            }}
                          />
                          <div className="hidden w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold ring-2 ring-white dark:ring-gray-700 shadow-sm">
                            {request.from_user.charAt(0).toUpperCase()}
                          </div>
                        </div>
                        {/* 申请者信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {request.from_user}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(request.created_at).toLocaleString('zh-CN', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-300 mb-3 pl-13">
                        {request.message}
                      </div>
                      <div className="flex space-x-2 pl-13">
                        <button
                          onClick={() => onFriendRequestAction(request.id, 'accepted')}
                          className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors font-medium"
                        >
                          接受
                        </button>
                        <button
                          onClick={() => onFriendRequestAction(request.id, 'rejected')}
                          className="px-3 py-1.5 bg-gray-500 text-white text-xs rounded-lg hover:bg-gray-600 transition-colors font-medium"
                        >
                          拒绝
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            {/* 好友列表 */}
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">我的好友</h3>
            {friends.map((friend) => (
              <button
                key={friend.id}
                onClick={() => onStartConversation(friend.username)}
                className="w-full p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  {/* 好友头像 */}
                  <div className="relative">
                    <img
                      src={getAvatarUrl(friend.username)}
                      alt={friend.nickname || friend.username}
                      className="w-10 h-10 rounded-full"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const nextEl = target.nextElementSibling;
                        if (nextEl) nextEl.classList.remove('hidden');
                      }}
                    />
                    <div className="hidden w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                      {(friend.nickname || friend.username).charAt(0).toUpperCase()}
                    </div>
                    {/* 在线状态指示器 */}
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 ${isUserOnline(friend.username) ? 'bg-green-400' : 'bg-gray-400'}`} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {friend.nickname || friend.username}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {isUserOnline(friend.username) ? '在线' : '离线'}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

