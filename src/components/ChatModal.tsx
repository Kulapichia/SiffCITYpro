'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ChatMessage, Conversation, Friend, FriendRequest, WebSocketMessage } from '../lib/types';
import { getAuthInfoFromBrowserCookie } from '../lib/auth';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from './Toast';
import { SidePanel } from './chat/SidePanel';
import { ChatArea } from './chat/ChatArea';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMessageCountChange?: (count: number) => void;
  onChatCountReset?: (resetCount: number) => void;
  onFriendRequestCountReset?: (resetCount: number) => void;
  // 新增：从父组件接收WebSocket状态和函数
  isConnected: boolean;
  sendMessage: (message: WebSocketMessage) => boolean;
}

// 使用 React.memo 包装，避免在 props 未改变时因父组件重渲染而重渲染
export const ChatModal = React.memo(function ChatModal({
  isOpen,
  onClose,
  onMessageCountChange,
  onChatCountReset,
  onFriendRequestCountReset,
  // 新增：解构传入的props
  isConnected,
  sendMessage: sendWebSocketMessage,
}: ChatModalProps) {
  // [根本性修复] 添加客户端渲染门，解决水合错误
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  const [activeTab, setActiveTab] = useState<'chat' | 'friends'>('chat');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [unreadFriendRequestCount, setUnreadFriendRequestCount] = useState(0);
  const [conversationUnreadCounts, setConversationUnreadCounts] = useState<{ [key: string]: number }>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [userAvatars, setUserAvatars] = useState<{ [username: string]: string | null }>({});
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [dragStartPosition, setDragStartPosition] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null); // Ref for the modal itself to get its dimensions
  const authInfo = getAuthInfoFromBrowserCookie();
  const currentUser = authInfo && authInfo.username ? authInfo : null;
  const { showError, showSuccess } = useToast();

  // 拖动相关事件处理
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键
    setIsDragging(true);
    setDragStartPosition({
      x: e.clientX - dragPosition.x,
      y: e.clientY - dragPosition.y
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    setIsDragging(true);
    setDragStartPosition({
      x: touch.clientX - dragPosition.x,
      y: touch.clientY - dragPosition.y
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !modalRef.current) return;

    const newX = e.clientX - dragStartPosition.x;
    const newY = e.clientY - dragStartPosition.y;
    
    // 【修复】拖动范围计算优化
    const modalRect = modalRef.current.getBoundingClientRect();
    const edgePadding = 40; // 保留边距避免完全移出

    const minX = -(modalRect.left - edgePadding);
    const maxX = window.innerWidth - modalRect.right - edgePadding;
    const minY = -(modalRect.top - edgePadding);
    const maxY = window.innerHeight - modalRect.bottom - edgePadding;
    
    setDragPosition({
      x: Math.max(minX, Math.min(maxX, newX)),
      y: Math.max(minY, Math.min(maxY, newY))
    });
  }, [isDragging, dragStartPosition]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || !modalRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;

    const newX = touch.clientX - dragStartPosition.x;
    const newY = touch.clientY - dragStartPosition.y;

    // 【修复】拖动范围计算优化
    const modalRect = modalRef.current.getBoundingClientRect();
    const edgePadding = 40;

    const minX = -(modalRect.left - edgePadding);
    const maxX = window.innerWidth - modalRect.right - edgePadding;
    const minY = -(modalRect.top - edgePadding);
    const maxY = window.innerHeight - modalRect.bottom - edgePadding;
    
    // 阻止页面滚动
    e.preventDefault();

    setDragPosition({
      x: Math.max(minX, Math.min(maxX, newX)),
      y: Math.max(minY, Math.min(maxY, newY))
    });
  }, [isDragging, dragStartPosition]);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 检测屏幕大小
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // 添加全局鼠标/触摸事件监听
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove as any);
      document.removeEventListener('touchend', handleTouchEnd as any);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // 实时搜索功能
  useEffect(() => {
    const timer = setTimeout(() => {
      if (friendSearchQuery.trim()) {
        searchUsers();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [friendSearchQuery]);

  // 【性能优化】获取用户真实头像，但不再直接调用 setState
  const fetchUserAvatar = useCallback(async (username: string): Promise<{ username: string; avatar: string | null }> => {
    if (username in userAvatars) {
      return { username, avatar: userAvatars[username] };
    }
    try {
      const response = await fetch(`/api/avatar?user=${encodeURIComponent(username)}`);
      if (response.ok) {
        const data = await response.json();
        return { username, avatar: data.avatar || null };
      }
    } catch (error) {
      console.error('获取用户头像失败:', error);
    }
    return { username, avatar: null };
  }, [userAvatars]);

  // 【性能优化】预加载用户头像，并进行批量状态更新
  const preloadUserAvatars = useCallback(async (usernames: string[]) => {
    const usernamesToFetch = Array.from(new Set(usernames.filter(name => name && !(name in userAvatars))));
    if (usernamesToFetch.length === 0) return;

    const promises = usernamesToFetch.map(username => fetchUserAvatar(username));
    const results = await Promise.allSettled(promises);

    const newAvatars: { [username: string]: string | null } = {};
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        newAvatars[result.value.username] = result.value.avatar;
      }
    });

    if (Object.keys(newAvatars).length > 0) {
      setUserAvatars(prev => ({ ...prev, ...newAvatars }));
    }
  }, [userAvatars, fetchUserAvatar]);

  // 使用 useCallback 稳定 onMessage 函数引用
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'message':
        const conversationId = message.data.conversation_id;

        // 预加载消息发送者的头像
        if (message.data.sender_id) {
          preloadUserAvatars([message.data.sender_id]);
        }

        // 收到新消息的处理逻辑
        if (selectedConversation && conversationId === selectedConversation.id && isOpen) {
          loadMessages(selectedConversation.id);
        } else if (conversationId) {
          setConversationUnreadCounts(prev => ({
            ...prev,
            [conversationId]: (prev[conversationId] || 0) + 1
          }));
          if (selectedConversation && conversationId === selectedConversation.id && isOpen) {
            loadMessages(selectedConversation.id);
          }
        }
        loadConversations();
        break;
      case 'friend_request':
        // 收到好友申请
        if (message.data.from_user) {
          preloadUserAvatars([message.data.from_user]);
        }
        setUnreadFriendRequestCount(prev => prev + 1);
        loadFriendRequests();
        break;
      case 'friend_accepted':
        loadFriends();
        break;
      case 'user_status':
        setFriends(prevFriends =>
          prevFriends.map(friend =>
            friend.username === message.data.userId
              ? { ...friend, status: message.data.status }
              : friend
          )
        );
        break;
      case 'online_users':
        setOnlineUsers(message.data.users || []);
        break;
      case 'connection_confirmed':
        break;
      default:
        break;
    }
  }, [selectedConversation, preloadUserAvatars, isOpen]);

  // WebSocket 连接 - 从props接收，不再在此处创建
  useWebSocket({
    onMessage: handleWebSocketMessage,
    enabled: isOpen, // 仅在模态框打开时监听消息
  });

  const loadConversations = useCallback(async () => {
    const data = await fetchWithHandling('/api/chat/conversations');
    if (data) {
      setConversations(data);
      const allParticipants = data.reduce((acc: string[], conv: Conversation) => [...acc, ...conv.participants], []);
      preloadUserAvatars(allParticipants);
    }
  }, [preloadUserAvatars]);

  useEffect(() => {
    if (isOpen) {
      loadConversations();
      loadFriends();
      loadFriendRequests();

      if (currentUser?.username) {
        preloadUserAvatars([currentUser.username]);
      }

      if (process.env.NODE_ENV === 'development') {
        createTestDataIfNeeded();
      }
    }
  }, [isOpen, currentUser?.username, preloadUserAvatars, loadConversations]);

  // 创建测试数据（仅开发模式）
  const createTestDataIfNeeded = async () => {
    if (!currentUser) return;

    try {
      // 检查是否已有对话
      const response = await fetch('/api/chat/conversations');
      if (response.ok) {
        const existingConversations = await response.json();
        if (existingConversations.length === 0) {
          // 创建一个测试对话
          const testConversation = {
            name: '测试对话',
            participants: [currentUser.username, 'test-user'],
            type: 'private',
            created_at: Date.now(),
            updated_at: Date.now(),
          };

          const createResponse = await fetch('/api/chat/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testConversation),
          });

          if (createResponse.ok) {
            loadConversations(); // 重新加载对话列表
          }
        }
      }
    } catch (error) {
      console.error('创建测试数据失败:', error);
    }
  };

  // 点击外部关闭表情选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showEmojiPicker && !target.closest('.emoji-picker-container')) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  // 计算总的未读聊天消息数量
  useEffect(() => {
    const totalChatCount = Object.values(conversationUnreadCounts).reduce((sum, count) => sum + count, 0);
    setUnreadChatCount(totalChatCount);
  }, [conversationUnreadCounts]);

  // 通知父组件消息数量变化
  useEffect(() => {
    const totalCount = unreadChatCount + unreadFriendRequestCount;
    onMessageCountChange?.(totalCount);
  }, [unreadChatCount, unreadFriendRequestCount, onMessageCountChange]);

  // 生成头像URL（优先使用真实头像，回退到默认头像）
  const getAvatarUrl = useCallback((username: string) => {
    const realAvatar = userAvatars[username];
    if (realAvatar) return realAvatar;
    return `https://api.dicebear.com/7.x/initials/svg?seed=${username}&backgroundColor=3B82F6,8B5CF6,EC4899,10B981,F59E0B&textColor=ffffff`;
  }, [userAvatars]);

  // 获取用户显示名称
  const getDisplayName = useCallback((username: string) => {
    if (username === currentUser?.username) return '我';
    const friend = friends.find(f => f.username === username);
    return friend?.nickname || username;
  }, [currentUser, friends]);

  // 【健壮性】统一的API请求包装函数
  const fetchWithHandling = async (url: string, options?: RequestInit) => {
    try {
      const response = await fetch(url, options);
      if (response.ok) return await response.json();

      const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
      console.error(`API Error - Status: ${response.status}`, errorData);

      if (response.status === 401) showError('未授权', '请重新登录');
      else if (response.status === 403) showError('无权限', '您没有执行此操作的权限');
      else if (response.status === 404) showError('未找到', '请求的资源不存在');
      else showError('请求失败', errorData.error || '服务器发生错误');

      return null;
    } catch (error) {
      console.error('Network Error:', error);
      showError('网络错误', '无法连接到服务器，请检查您的网络连接');
      return null;
    }
  };

  const loadFriends = useCallback(async () => {
    const data = await fetchWithHandling('/api/chat/friends');
    if (data) {
      setFriends(data);
      preloadUserAvatars(data.map((friend: Friend) => friend.username));
    }
  }, [preloadUserAvatars]);

  const loadFriendRequests = useCallback(async () => {
    const data = await fetchWithHandling('/api/chat/friend-requests');
    if (data) {
      setFriendRequests(data);
      preloadUserAvatars(data.map((req: FriendRequest) => req.from_user));
    }
  }, [preloadUserAvatars]);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const response = await fetch(`/api/chat/messages?conversationId=${conversationId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
        preloadUserAvatars(data.map((msg: ChatMessage) => msg.sender_id));
      } else {
        // 处理非200状态码
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to load messages - Status:', response.status, 'Error:', errorData);

        if (response.status === 401) {
          showError('未授权', '请重新登录');
        } else if (response.status === 403) {
          showError('无权限', '您没有权限访问此对话');
        } else if (response.status === 404) {
          showError('对话不存在', '该对话可能已被删除');
        } else {
          showError('加载消息失败', errorData.error || '服务器错误');
        }
        
        setMessages([]); // Clear messages on error
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      showError('加载消息失败', '网络错误，请稍后重试');
      setMessages([]);
    }
  }, [preloadUserAvatars, showError]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || !selectedConversation || !currentUser) return;

    const message: Omit<ChatMessage, 'id'> = {
      conversation_id: selectedConversation.id,
      sender_id: currentUser.username || '',
      sender_name: currentUser.username || '',
      content: newMessage.trim(),
      message_type: 'text',
      timestamp: Date.now(),
      is_read: false,
    };
    
    const sentMessage = await fetchWithHandling('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (sentMessage) {
      setNewMessage('');
      await loadMessages(selectedConversation.id);
      await loadConversations();
      if (isConnected) {
        sendWebSocketMessage({
          type: 'message',
          data: { ...sentMessage, conversation_id: selectedConversation.id, participants: selectedConversation.participants },
          timestamp: Date.now(),
        });
      }
    }
  }, [newMessage, selectedConversation, currentUser, isConnected, sendWebSocketMessage, loadMessages, loadConversations]);
  
  const handleImageUpload = useCallback(async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return showError('文件类型错误', '请选择图片文件');
    if (file.size > 5 * 1024 * 1024) return showError('文件过大', '图片大小不能超过5MB');

    setUploadingImage(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });

      if (selectedConversation && currentUser) {
        const message: Omit<ChatMessage, 'id'> = {
          conversation_id: selectedConversation.id,
          sender_id: currentUser.username || '',
          sender_name: currentUser.username || '',
          content: base64,
          message_type: 'image',
          timestamp: Date.now(),
          is_read: false,
        };
        const sentMessage = await fetchWithHandling('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });

        if (sentMessage) {
          await loadMessages(selectedConversation.id);
          await loadConversations();
          if (isConnected) {
            sendWebSocketMessage({
              type: 'message',
              data: { ...sentMessage, conversation_id: selectedConversation.id, participants: selectedConversation.participants },
              timestamp: Date.now(),
            });
          }
        } else {
            showError('发送失败', '图片发送失败，请重试');
        }
      }
    } catch (error) {
      console.error('Image upload failed:', error);
      showError('发送失败', '图片处理失败，请重试');
    } finally {
      setUploadingImage(false);
    }
  }, [selectedConversation, currentUser, isConnected, sendWebSocketMessage, loadMessages, loadConversations, showError]);

  const searchUsers = useCallback(async () => {
    if (!friendSearchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const data = await fetchWithHandling(`/api/chat/search-users?q=${encodeURIComponent(friendSearchQuery)}`);
    if (data) {
      setSearchResults(data);
      preloadUserAvatars(data.map((user: Friend) => user.username));
    }
  }, [friendSearchQuery, preloadUserAvatars]);

  const sendFriendRequest = useCallback(async (toUser: string) => {
    if (!currentUser) return;
    const request: Omit<FriendRequest, 'id'> = {
      from_user: currentUser.username || '',
      to_user: toUser,
      message: '请求添加您为好友',
      status: 'pending',
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    const sentRequest = await fetchWithHandling('/api/chat/friend-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (sentRequest) {
      showSuccess('好友申请已发送', '等待对方确认');
      setFriendSearchQuery('');
      setSearchResults([]);
      if (isConnected) {
        sendWebSocketMessage({ type: 'friend_request', data: sentRequest, timestamp: Date.now() });
      }
    }
  }, [currentUser, isConnected, sendWebSocketMessage, showSuccess]);

  const handleFriendRequest = useCallback(async (requestId: string, status: 'accepted' | 'rejected') => {
    const result = await fetchWithHandling('/api/chat/friend-requests', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, status }),
    });

    if (result) {
      await loadFriendRequests();
      if (status === 'accepted') await loadFriends();
      onFriendRequestCountReset?.(1);
    }
  }, [loadFriendRequests, loadFriends, onFriendRequestCountReset]);

  const startConversationWithFriend = useCallback(async (friendUsername: string) => {
    try {
      const existingConv = conversations.find(conv =>
        conv.participants.length === 2 &&
        conv.participants.includes(friendUsername) &&
        conv.participants.includes(currentUser?.username || '')
      );

      if (existingConv) {
        setSelectedConversation(existingConv);
        setActiveTab('chat');
        loadMessages(existingConv.id);
        return;
      }

      const newConv = {
        name: friendUsername,
        participants: [currentUser?.username || '', friendUsername],
        type: 'private' as const,
      };

      const createdConv = await fetchWithHandling('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConv),
      });

      if (createdConv) {
        await loadConversations();
        setSelectedConversation(createdConv);
        setActiveTab('chat');
        loadMessages(createdConv.id);
      }
    } catch (error) {
      console.error('Failed to start conversation:', error);
      showError('创建对话失败', '请稍后重试');
    }
  }, [conversations, currentUser, loadConversations, loadMessages, showError]);

  const handleTabChange = (tab: 'chat' | 'friends') => {
    setActiveTab(tab);
    if (tab === 'friends') {
      const currentCount = unreadFriendRequestCount;
      setUnreadFriendRequestCount(0);
      onFriendRequestCountReset?.(currentCount);
    }
  };

  const handleConversationSelect = (conv: Conversation) => {
    setSelectedConversation(conv);
    loadMessages(conv.id);

    const resetCount = conversationUnreadCounts[conv.id] || 0;
    if (resetCount > 0) {
      setConversationUnreadCounts(prev => ({ ...prev, [conv.id]: 0 }));
      onChatCountReset?.(resetCount);
    }
  };

  if (!isOpen) return null;
  // [根本性修复] 在客户端挂载前，不渲染任何内容，避免服务端与客户端的HTML不匹配
  if (!isClient) {
    return null;
  }
  return (
    <div
      className={`z-[2147483647] ${isMobile
        ? 'fixed top-0 left-0 right-0 bottom-0 bg-white dark:bg-gray-900'
        : 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-50'
        }`}
      style={{
        zIndex: '2147483647',
        ...(isMobile && {
          paddingTop: '56px', // 减少顶部padding
          paddingBottom: '72px' // 减少底部padding
        })
      }}
    >
      <div
        ref={modalRef}
        className={`${isMobile
          ? 'w-full bg-white dark:bg-gray-900 flex flex-col'
          : 'w-full max-w-6xl h-[80vh] bg-white dark:bg-gray-900 rounded-lg shadow-xl flex flex-row relative'
          }`}
        style={{
          transform: !isMobile ? `translate(${dragPosition.x}px, ${dragPosition.y}px)` : 'none',
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          ...(isMobile && {
            height: 'calc(100vh - 128px)', // 调整为新的padding总和
            minHeight: 'calc(100vh - 128px)'
          })
        }}
      >
        {/* 拖动头部 - 仅桌面端显示 */}
        {!isMobile && (
            <div
                className="absolute top-0 left-0 right-0 h-8 bg-gray-100 dark:bg-gray-800 rounded-t-lg cursor-grab active:cursor-grabbing flex items-center justify-center"
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
            >
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              </div>
            </div>
        )}
        
        <SidePanel
          isMobile={isMobile}
          isOpen={!isMobile || !selectedConversation}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          isConnected={isConnected}
          onClose={onClose}
          unreadChatCount={unreadChatCount}
          unreadFriendRequestCount={unreadFriendRequestCount}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          friendSearchQuery={friendSearchQuery}
          onFriendSearchQueryChange={setFriendSearchQuery}
          searchResults={searchResults}
          getAvatarUrl={getAvatarUrl}
          isFriend={(username) => friends.some(f => f.username === username)}
          onSendFriendRequest={sendFriendRequest}
          conversations={conversations.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))}
          selectedConversation={selectedConversation}
          onConversationSelect={handleConversationSelect}
          currentUser={currentUser as any}
          getDisplayName={getDisplayName}
          isUserOnline={(username) => onlineUsers.includes(username)}
          conversationUnreadCounts={conversationUnreadCounts}
          friendRequests={friendRequests}
          onFriendRequestAction={handleFriendRequest}
          friends={friends}
          onStartConversation={startConversationWithFriend}
        />

        <ChatArea
          isMobile={isMobile}
          isOpen={!isMobile || !!selectedConversation}
          selectedConversation={selectedConversation}
          onBack={() => setSelectedConversation(null)}
          getAvatarUrl={getAvatarUrl}
          getDisplayName={getDisplayName}
          isUserOnline={(username) => onlineUsers.includes(username)}
          currentUser={currentUser as any}
          messages={messages}
          newMessage={newMessage}
          onNewMessageChange={setNewMessage}
          onSendMessage={handleSendMessage}
          onImageUpload={handleImageUpload}
          uploadingImage={uploadingImage}
          isConnected={isConnected}
          showEmojiPicker={showEmojiPicker}
          onShowEmojiPickerChange={setShowEmojiPicker}
        />

      </div>
    </div>
  );
});
