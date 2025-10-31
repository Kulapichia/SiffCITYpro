# Telegram Magic Link Authentication

## 概述

LunaTV 支持通过 Telegram Bot 实现无密码登录（Magic Link），用户只需输入 Telegram 用户名，即可通过 Bot 发送的链接完成登录。

## 功能特性

- 🔐 **无密码登录** - 通过 Telegram Bot 发送一次性登录链接
- 🤖 **自动注册** - 首次登录的用户可自动创建账号
- ⏰ **安全过期** - 登录链接 5 分钟后自动过期
- 🌐 **多存储支持** - 支持 Kvrocks、Redis、Upstash 存储 token
- 🔄 **自动 Webhook 更新** - 自动将 webhook 设置到当前访问的域名

## 配置步骤

### 1. 创建 Telegram Bot

1. 在 Telegram 中与 [@BotFather](https://t.me/botfather) 对话
2. 发送 `/newbot` 命令创建新 Bot
3. 按提示设置 Bot 名称和用户名
4. 记录 BotFather 返回的 **Bot Token** 和 **Bot Username**

### 2. 配置环境变量

在 `.env.local` 或部署环境中设置存储类型：

```bash
# 存储类型：kvrocks、redis 或 upstash
NEXT_PUBLIC_STORAGE_TYPE=kvrocks

# Kvrocks 连接 URL（如果使用 Kvrocks）
KVROCKS_URL=redis://moontv-kvrocks:6666

# Redis 连接 URL（如果使用 Redis）
# REDIS_URL=redis://localhost:6379

# Upstash 配置（如果使用 Upstash）
# UPSTASH_URL=https://xxx.upstash.io
# UPSTASH_TOKEN=your_token_here
