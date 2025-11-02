/**
 * 最终的生产环境启动文件
 * 将 Next.js 和 WebSocket 服务器集成在同一个 Node.js 实例和端口上。
 * 这是解决服务不稳定和 WebSocket 连接错误的最佳实践。
 */
process.env.NODE_ENV = 'production';

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const path = require('path');
const http = require('http');
// 修正1: 引入功能更完整的 `websocket.js` 中的 `setupWebSocketServer`
const { setupWebSocketServer } = require('./websocket');

// 生成 manifest.json 的逻辑保持不变
function generateManifest() {
  console.log('Generating manifest.json for Docker deployment...');
  try {
    const generateManifestScript = path.join(__dirname, 'scripts', 'generate-manifest.js');
    require(generateManifestScript);
    // 添加成功日志，便于调试
    console.log('✅ Generated manifest.json with site name: ShihYuTV');
  } catch (error) {
    console.error('❌ Error calling generate-manifest.js:', error);
    throw error;
  }
}

generateManifest();

const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = process.env.PORT || 3000;

// 初始化 Next.js 应用
const app = next({
  dev: false,
  hostname,
  port,
});
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // 修正2: 创建一个统一的 HTTP 服务器来处理所有请求
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // 修正3: 将 WebSocket 服务附加到这个统一的 HTTP 服务器上
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url, true);
    // 只处理 /ws 路径的 WebSocket 请求
    if (pathname === '/ws') {
      setupWebSocketServer(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  // 启动统一的服务器，只监听一个端口
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`====================================`);
    console.log(`✅ Next.js & WebSocket 服务统一运行在: http://${hostname}:${port}`);
    console.log(`====================================`);
    // 设置服务器启动后的任务
    setupServerTasks();
  });
}).catch(err => {
  console.error('❌ Next.js app preparation failed:', err);
  process.exit(1);
});

// 设置服务器启动后的任务
function setupServerTasks() {
  const httpPort = process.env.PORT || 3000;
  const hostname = process.env.HOSTNAME || 'localhost';

  const TARGET_URL = `http://${hostname}:${httpPort}/login`;

  const intervalId = setInterval(() => {
    console.log(`Fetching ${TARGET_URL} ...`);

    const req = http.get(TARGET_URL, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        console.log('Server is up, stop polling.');
        clearInterval(intervalId);

        setTimeout(() => {
          executeCronJob();
        }, 3000);
      }
    });

    req.setTimeout(2000, () => {
      req.destroy();
    });

    req.on('error', () => {
      // 忽略连接错误，继续轮询
    });
  }, 1000);
}

// 执行 cron 任务的函数 (增加超时时间)
function executeCronJob() {
  const httpPort = process.env.PORT || 3000;
  const hostname = process.env.HOSTNAME || 'localhost';
  const cronUrl = `http://${hostname}:${httpPort}/api/cron`;

  console.log(`Executing cron job: ${cronUrl}`);

  const req = http.get(cronUrl, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        console.log('Cron job executed successfully:', data);
      } else {
        console.error('Cron job failed:', res.statusCode, data);
      }
    });
  });

  req.on('error', (err) => {
    console.error('Error executing cron job:', err);
  });

  // 增加超时时间到5分钟，以应对可能的长时间任务
  req.setTimeout(300000, () => { 
    console.error('Cron job timeout');
    req.destroy();
  });
}
