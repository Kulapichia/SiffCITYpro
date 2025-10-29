#!/usr/bin/env node
/* eslint-disable */
// 自动生成脚本：将 config.json 转换为 TypeScript 定义。
// 用法：node scripts/convert-config.js

const fs = require('fs');
const path = require('path');

// 解析项目根目录（脚本文件夹上一级）
const projectRoot = path.resolve(__dirname, '..');

// 路径
const configPath = path.join(projectRoot, 'config.json');
const libDir = path.join(projectRoot, 'src', 'lib');
const oldRuntimePath = path.join(libDir, 'runtime.ts');
const newRuntimePath = path.join(libDir, 'runtime.ts');

// 如果存在，删除旧的 runtime.ts 文件
if (fs.existsSync(oldRuntimePath)) {
  fs.unlinkSync(oldRuntimePath);
  console.log('旧的 runtime.ts 已删除');
}

// 读取并解析 config.json
let rawConfig;
try {
  rawConfig = fs.readFileSync(configPath, 'utf8');
} catch (err) {
  console.error(`无法读取 ${configPath}:`, err);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(rawConfig);
} catch (err) {
  console.error('config.json 不是有效的 JSON:', err);
  process.exit(1);
}

// 准备 TypeScript 文件内容
const tsContent =
  `// 该文件由 scripts/convert-config.js 自动生成，请勿手动修改\n` +
  `/* eslint-disable */\n\n` +
  `export const config = ${JSON.stringify(config, null, 2)} as const;\n\n` +
  `export type RuntimeConfig = typeof config;\n\n` +
  `export default config;\n`;

// 确保 lib 目录存在
if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir, { recursive: true });
}

// 写入 runtime.ts
try {
  fs.writeFileSync(newRuntimePath, tsContent, 'utf8');
  console.log('已生成 src/lib/runtime.ts');
} catch (err) {
  console.error('写入 runtime.ts 失败:', err);
  process.exit(1);
}
