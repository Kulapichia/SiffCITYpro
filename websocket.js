// 文件路径: /websocket.js

// 修正：此文件现在作为一个适配器（Adapter），将旧的API路由调用桥接到新的独立WebSocket服务器实例上。
// 它不再创建或管理WebSocket服务器，而是代理对全局实例的调用。

/**
 * 获取在线用户列表。
 * 数据源是运行在独立进程中的 `standalone-websocket.js` 服务器实例，
 * 该实例通过 `production-final.js` 或 `simple-dev.js` 等启动脚本将其函数挂载到 `global` 对象。
 * @returns {string[]} 在线用户ID列表
 */
function getOnlineUsers() {
  if (typeof global.getOnlineUsers === 'function') {
    return global.getOnlineUsers();
  }
  console.warn('[websocket.js] global.getOnlineUsers is not available. The WebSocket server might not be properly initialized or linked.');
  return [];
}

/**
 * 发送消息给指定用户。
 * @param {string} userId - 目标用户的ID
 * @param {object} message - 要发送的消息对象
 * @returns {boolean} 如果成功发送则返回 true，否则返回 false
 */
function sendMessageToUser(userId, message) {
  if (typeof global.sendMessageToUser === 'function') {
    return global.sendMessageToUser(userId, message);
  }
  console.warn('[websocket.js] global.sendMessageToUser is not available.');
  return false;
}

/**
 * 发送消息给多个用户。
 * @param {string[]} userIds - 目标用户ID的数组
 * @param {object} message - 要发送的消息对象
 * @returns {boolean} 如果至少成功发送给一个用户则返回 true，否则返回 false
 */
function sendMessageToUsers(userIds, message) {
  if (typeof global.sendMessageToUsers === 'function') {
    return global.sendMessageToUsers(userIds, message);
  }
  console.warn('[websocket.js] global.sendMessageToUsers is not available.');
  return false;
}

/**
 * 广播用户状态（上线/下线）。
 * @param {string} userId - 状态发生变化的用户ID
 * @param {'online' | 'offline'} status - 新的状态
 */
function broadcastUserStatus(userId, status) {
  if (typeof global.broadcastUserStatus === 'function') {
    global.broadcastUserStatus(userId, status);
    return;
  }
  console.warn('[websocket.js] global.broadcastUserStatus is not available.');
}

// 修正：移除了 setupWebSocketServer, getAuthInfoFromCookieString, connectedUsers, 和 handleMessage 等所有与服务器实现相关的内部逻辑。
// 这些逻辑现在统一由 `standalone-websocket.js` 文件管理。

module.exports = {
  // 保留了与原始文件相同的导出接口，以确保依赖此文件的API路由无需修改其 `require` 后的调用方式。
  getOnlineUsers,
  sendMessageToUser,
  sendMessageToUsers,
  broadcastUserStatus
};
