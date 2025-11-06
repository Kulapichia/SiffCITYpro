/**
 * 生产模式下的服务器入口 - 仅处理Next.js服务
 * 使用 NODE_ENV=production node production.js 来启动
 */
process.env.NODE_ENV = 'production';

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const http = require('http');

// manifest 已在 production-final.js 中生成

const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = process.env.PORT || 3000;
const wsPort = process.env.WS_PORT || 3001; // 获取WS端口用于日志

// 在生产模式下初始化 Next.js
const app = next({
  dev: false,
  hostname,
  port
});

const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      // 使用Next.js处理所有请求
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('处理请求时出错:', req.url, err);
      res.statusCode = 500;
      res.end('内部服务器错误');
    }
  });

  // 不再初始化或附加 WebSocket 服务器

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`====================================`);
    console.log(`✅ Next.js 服务已启动: http://${hostname}:${port}`);
    console.log(`✅ WebSocket 服务应在独立端口运行: ws://${hostname}:${wsPort}`);
    console.log(`====================================`);

    // 设置服务器启动后的任务
    setupServerTasks();
  });
});


// 设置服务器启动后的任务
function setupServerTasks() {
  // 每 1 秒轮询一次，直到请求成功
  const TARGET_URL = `http://${process.env.HOSTNAME || 'localhost'}:${process.env.PORT || 3000}/login`;

  const intervalId = setInterval(() => {
    console.log(`Fetching ${TARGET_URL} ...`);

    const req = http.get(TARGET_URL, (res) => {
      // 当返回 2xx 状态码时认为成功，然后停止轮询
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        console.log('Server is up, stop polling.');
        clearInterval(intervalId);

        setTimeout(() => {
          // 服务器启动后，立即执行一次 cron 任务
          executeCronJob();
        }, 3000);

        // 然后设置每小时执行一次 cron 任务
        setInterval(() => {
          executeCronJob();
        }, 60 * 60 * 1000); // 每小时执行一次
      }
    });

    req.setTimeout(2000, () => {
      req.destroy();
    });
  }, 1000);
}

// 执行 cron 任务的函数
function executeCronJob() {
  const cronUrl = `http://${process.env.HOSTNAME || 'localhost'}:${process.env.PORT || 3000}/api/cron`;

  console.log(`Executing cron job: ${cronUrl}`);

  const req = http.get(cronUrl, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

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

  req.setTimeout(30000, () => {
    console.error('Cron job timeout');
    req.destroy();
  });
}
