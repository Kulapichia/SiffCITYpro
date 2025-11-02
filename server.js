// 使用 `simple-dev.js` 作为新的开发环境启动脚本
// 此文件中的集成模式将被废弃

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
// 不再引入 createWebSocketServer
// const { createWebSocketServer } = require('./websocket');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;
const wsPort = 3001; // 定义独立的WebSocket端口

// 启动独立的 WebSocket 服务器
const { createStandaloneWebSocketServer } = require('./standalone-websocket');
createStandaloneWebSocketServer(wsPort);

// 当使用Next.js时，需要预准备应用程序
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      // 使用Next.js处理所有请求
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // 不再集成 WebSocket 服务器

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    // 提示独立的 WebSocket 服务器地址
    console.log(`> WebSocket server ready on ws://${hostname}:${wsPort}`);
  });
});
