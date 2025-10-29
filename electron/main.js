const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const next = require('next');
const fs = require('fs');
const os = require('os');

const isDev = !app.isPackaged;
let mainWindow;
let nextApp;
let server;

// 设置应用名称和用户数据路径
const appName = 'SiffCITY'; // 使用项目A的名称
app.setName(appName);
const userDataPath = path.join(app.getPath('appData'), appName);
app.setPath('userData', userDataPath);

console.log(`[${appName}] App name:`, app.getName());
console.log(`[${appName}] User data path:`, app.getPath('userData'));

// 确保用户数据目录存在
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
  console.log(`[${appName}] Created user data directory`);
}

async function startNextServer() {
  nextApp = next({ dev: false, dir: path.join(__dirname, '..') });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();
  server = http.createServer((req, res) => handle(req, res));
  
  // 使用固定端口 39527,确保 localStorage 域名一致
  const FIXED_PORT = 39527;
  
  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[${appName}] Port ${FIXED_PORT} is in use, trying random port...`);
        // 如果固定端口被占用,使用随机端口
        server.listen(0, 'localhost', () => {
          const port = server.address().port;
          console.log(`[${appName}] Server started on random port: ${port}`);
          resolve(port);
        });
      } else {
        reject(err);
      }
    });
    
    server.listen(FIXED_PORT, 'localhost', () => {
      console.log(`[${appName}] Server started on fixed port: ${FIXED_PORT}`);
      resolve(FIXED_PORT);
    });
  });
}

async function createWindow() {
  let url = isDev ? 'http://localhost:3000' : `http://localhost:${await startNextServer()}`;
  
  // 确定 preload 脚本的正确路径
  const preloadPath = path.join(__dirname, 'preload.js');
  
  console.log(`[${appName}] Preload script path:`, preloadPath);
  console.log(`[${appName}] Preload script exists:`, fs.existsSync(preloadPath));
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: appName,
    backgroundColor: '#1a1a1a',
    autoHideMenuBar: true, // 自动隐藏菜单栏（按 Alt 键可显示）
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // 禁用 web 安全检查以允许跨域请求
      preload: preloadPath, // 使用正确的 preload 路径
    },
    icon: path.join(__dirname, '../public/logo.png'), // 指向项目A的logo
  });
  
  // 完全移除菜单栏（生产环境）
  if (!isDev) {
    mainWindow.setMenu(null);
  }
  
  // 获取默认 session
  const session = mainWindow.webContents.session;
  const storagePath = session.getStoragePath();
  
  // 增加会话持久化和存储路径的日志，便于调试
  console.log(`[${appName}] Session persist:`, session.isPersistent());
  console.log(`[${appName}] Storage path:`, storagePath);
  
  // 确保存储路径存在
  if (storagePath && !fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
    console.log(`[${appName}] Created storage directory`);
  }  
  // 禁用 CORS 限制
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const { requestHeaders } = details;
    // 移除 Origin 和 Referer,模拟服务器端请求
    delete requestHeaders['Origin'];
    delete requestHeaders['Referer'];
    requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    callback({ requestHeaders });
  });

  session.webRequest.onHeadersReceived((details, callback) => {
    const { responseHeaders } = details;
    // 添加允许跨域的响应头
    if (responseHeaders) {
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    }
    callback({ responseHeaders });
  });
  
  mainWindow.loadURL(url);
  
  // 监听全屏状态变化
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', true);
  });
  
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', false);
  });
  
  // 仅在开发模式下打开开发者工具
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
  
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// IPC 处理程序 - 选择保存目录
ipcMain.handle('select-directory', async (event, defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultPath || path.join(os.homedir(), 'Desktop', 'danmu'),
  });
  
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

// IPC 处理程序 - 保存文件
ipcMain.handle('save-file', async (event, { filePath, data }) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, data);
    return { success: true, filePath };
  } catch (error) {
    console.error('Save file error:', error);
    return { success: false, error: error.message };
  }
});

// IPC 处理程序 - 获取桌面路径（兼容 OneDrive）
ipcMain.handle('get-desktop-path', async () => {
  const oneDriveDesktop = path.join(os.homedir(), 'OneDrive', '桌面');
  if (fs.existsSync(oneDriveDesktop)) return oneDriveDesktop;
  
  const oneDriveDesktopEn = path.join(os.homedir(), 'OneDrive', 'Desktop');
  if (fs.existsSync(oneDriveDesktopEn)) return oneDriveDesktopEn;
  
  const desktopCn = path.join(os.homedir(), '桌面');
  if (fs.existsSync(desktopCn)) return desktopCn;

  return path.join(os.homedir(), 'Desktop');
});

// IPC 处理程序 - 全屏控制
ipcMain.handle('set-fullscreen', async (event, flag) => {
  if (mainWindow) {
    mainWindow.setFullScreen(flag);
    return mainWindow.isFullScreen();
  }
  return false;
});

ipcMain.handle('is-fullscreen', async () => {
  if (mainWindow) {
    return mainWindow.isFullScreen();
  }
  return false;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (server) server.close(); });

