// 文件路径: /websocket.js
const { WebSocketServer, WebSocket } = require('ws');
const { parse } = require('url');

// 使用 Map 存储已连接的用户，键为 userId (username)，值为 WebSocket 实例
const connectedUsers = new Map();

/**
 * 辅助函数：从 URL 查询参数中的 cookie 字符串解析认证信息。
 * 这是在建立 WebSocket 连接时进行身份验证的标准做法，
 * 因为浏览器 WebSocket API 无法直接发送自定义 Header，所以将认证信息放在 URL query 中。
 * @param {string} cookie - 从 URL query 中获取的、经过编码的 cookie 字符串
 * @returns {object | null} 解析后的认证信息对象或 null
 */
function getAuthInfoFromCookieString(cookie) {
  try {
    const decoded = decodeURIComponent(cookie);
    return JSON.parse(decoded);
  } catch (e) {
    console.error('解析认证 cookie 失败:', e);
    return null;
  }
}

/**
 * 广播用户状态 (上线/下线)
 * @param {string} userId - 状态发生变化的用户ID
 * @param {'online' | 'offline'} status - 新的状态
 */
function broadcastUserStatus(userId, status) {
  const statusMessage = {
    type: 'user_status',
    data: { userId, status },
    timestamp: Date.now()
  };
  const serializedMessage = JSON.stringify(statusMessage);

  connectedUsers.forEach((ws, connectedUserId) => {
    // 广播给除该用户自己以外的所有在线用户
    if (connectedUserId !== userId && ws.readyState === WebSocket.OPEN) {
      ws.send(serializedMessage);
    }
  });
}

/**
 * 设置 WebSocket 服务器，将其附加到现有的 HTTP 服务器上
 * @param {import('http').Server} server - Node.js 的 http.Server 实例
 */
function setupWebSocketServer(server) {
  // 防止重复初始化
  if (global.wss) {
    console.log('WebSocket 服务器已在运行.');
    return;
  }

  // 创建 WebSocket 服务器实例，使用 noServer 模式手动处理 upgrade 请求
  const wss = new WebSocketServer({ noServer: true });
  global.wss = wss;

  // 监听 HTTP server 的 'upgrade' 事件，这是 WebSocket 连接的握手阶段
  server.on('upgrade', (request, socket, head) => {
    try {
      const { pathname, query } = parse(request.url, true);
      console.log(`[WebSocket] 收到 upgrade 请求: ${request.url}`); // 增加日志

      // 修正：处理 Nginx 转发过来的 /ws 路径
      if (pathname === '/ws') {
        const { auth } = query;
        if (!auth) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        const authInfo = getAuthInfoFromCookieString(auth);

        // --- 核心安全检查：连接前认证 ---
        // 如果认证信息无效，直接拒绝连接，不创建 WebSocket 实例
        if (!authInfo || !authInfo.username) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        
        const userId = authInfo.username; // 使用 username 作为 userId

        // 认证通过，完成协议升级
        wss.handleUpgrade(request, socket, head, (ws) => {
          // --- 连接成功后的处理逻辑 ---
          
          // 1. 存储连接并标记用户ID
          ws.userId = userId; // 将 userId 直接附加到 ws 实例，方便后续使用
          connectedUsers.set(userId, ws);
          console.log(`[WebSocket] 用户 ${userId} 已连接`);

          // 2. 设置心跳检测
          ws.isAlive = true;
          ws.on('pong', () => {
            ws.isAlive = true;
          });

          // 3. 设置结构化的消息处理器
          ws.on('message', (data) => {
            try {
              const message = JSON.parse(data.toString());
              handleMessage(ws, message);
            } catch (error) {
              console.error(`[WebSocket] 解析来自 ${ws.userId} 的消息错误:`, error);
              ws.send(JSON.stringify({
                type: 'error',
                data: { message: '消息格式无效' },
                timestamp: Date.now()
              }));
            }
          });

          // 4. 设置精确的关闭处理器
          ws.on('close', () => {
            connectedUsers.delete(ws.userId);
            broadcastUserStatus(ws.userId, 'offline');
            console.log(`[WebSocket] 用户 ${ws.userId} 已断开连接`);
          });

          // 5. 设置错误处理器
          ws.on('error', (error) => {
            console.error(`[WebSocket] 用户 ${ws.userId} 发生错误:`, error);
          });

          // --- 连接成功后的初始化操作 ---
          // 这部分逻辑取代了旧代码中的 'user_connect' case

          // 6. 向客户端确认连接成功
          ws.send(JSON.stringify({
            type: 'connection_confirmed',
            data: { userId: ws.userId },
            timestamp: Date.now()
          }));

          // 7. 向新用户发送当前在线用户列表
          ws.send(JSON.stringify({
            type: 'online_users',
            data: { users: Array.from(connectedUsers.keys()) },
            timestamp: Date.now()
          }));
          
          // 8. 向其他所有用户广播该用户上线状态
          broadcastUserStatus(ws.userId, 'online');
        });
      } else {
        // 如果请求路径不匹配，优雅地忽略，不销毁 socket
        // socket.destroy();
      }
    } catch (err) {
      console.error('[WebSocket] Upgrade 请求处理错误:', err);
      socket.destroy();
    }
  });
  
  // 消息处理器
  function handleMessage(ws, message) {
    if (!ws.userId) return; // 再次确认消息源是已认证的用户

    // 为需要转发的消息自动附加发送者ID，确保接收方知道消息来源
    if (!message.data) message.data = {};
    message.data.senderId = ws.userId;
    
    // const serializedMessage = JSON.stringify(message);

    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now()
        }));
        break;

      // user_connect 逻辑已在 handleUpgrade 中处理，此处无需重复

      case 'message':
        const serializedMessage = JSON.stringify(message);
        // 转发消息给对话参与者
        if (message.data.participants && Array.isArray(message.data.participants)) {
          message.data.participants.forEach(participantId => {
            // 不发送给自己
            if (participantId !== ws.userId && connectedUsers.has(participantId)) {
              const participantWs = connectedUsers.get(participantId);
              if (participantWs && participantWs.readyState === WebSocket.OPEN) {
                participantWs.send(serializedMessage);
              }
            }
          });
        }
        // 兼容旧版本的receiverId方式
        else if (message.data.receiverId && connectedUsers.has(message.data.receiverId)) {
          const receiverWs = connectedUsers.get(message.data.receiverId);
          if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
            receiverWs.send(serializedMessage);
          }
        }
        break;

      case 'typing':
        // 转发打字状态给目标用户
        if (message.data.receiverId && connectedUsers.has(message.data.receiverId)) {
          const receiverWs = connectedUsers.get(message.data.receiverId);
          if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
            receiverWs.send(JSON.stringify(message));
          }
        }
        break;

      case 'friend_request':
        // 转发好友申请给目标用户
        const targetUser = message.data.to_user;
        if (targetUser && connectedUsers.has(targetUser)) {
          const targetWs = connectedUsers.get(targetUser);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify(message));
          }
        }
        break;

      case 'friend_accepted':
        // 转发好友接受消息给申请发起人
        const fromUser = message.data.from_user;
        if (fromUser && connectedUsers.has(fromUser)) {
          const fromUserWs = connectedUsers.get(fromUser);
          if (fromUserWs && fromUserWs.readyState === WebSocket.OPEN) {
            fromUserWs.send(JSON.stringify(message));
          }
        }
        break;
    }
  }

  // 心跳检测定时器
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log(`[WebSocket] 检测到用户 ${ws.userId || '未知'} 无响应，正在终止连接...`);
        return ws.terminate(); // 强制关闭无响应的连接
      }
      ws.isAlive = false;
      ws.ping(() => {}); // 发送 ping 帧
    });
  }, 30000);

  // 关闭服务器时清理定时器
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  console.log('WebSocket 服务器已准备就绪并已集成心跳和消息处理功能。');
}

// --- 导出的公共方法，供项目的其他部分（如 API 路由）调用 ---

function getOnlineUsers() {
  return Array.from(connectedUsers.keys());
}

function sendMessageToUser(userId, message) {
  const ws = connectedUsers.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

function sendMessageToUsers(userIds, message) {
  let success = false;
  userIds.forEach(userId => {
    if (sendMessageToUser(userId, message)) {
      success = true;
    }
  });
  return success;
}

module.exports = {
  setupWebSocketServer,
  getOnlineUsers,
  sendMessageToUser,
  sendMessageToUsers,
  broadcastUserStatus
};
