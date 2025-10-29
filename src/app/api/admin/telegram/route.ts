/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, setCachedConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * 更新 Telegram 配置
 * POST /api/admin/telegram
 */
export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json({ error: '不支持本地存储进行管理员配置' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const username = authInfo.username;
    const adminConfig = await getConfig();

    // 权限校验：只有 owner 和 admin 可以修改
    if (username !== process.env.USERNAME) {
      const user = adminConfig.UserConfig.Users.find((u) => u.username === username);
      if (!user || user.role === 'user' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 403 });
      }
    }

    const { enabled, autoRegister, botName, botToken, defaultRole } = body;

    // 参数校验
    if (enabled && (!botName?.trim() || !botToken?.trim())) {
      return NextResponse.json({ error: '启用 Telegram 登录时，Bot 用户名和 Bot Token 不能为空' }, { status: 400 });
    }

    // 更新配置
    adminConfig.SiteConfig.TelegramAuth = {
      enabled,
      autoRegister,
      botName: botName.trim(),
      botToken: botToken === '********' ? adminConfig.SiteConfig.TelegramAuth.botToken : botToken.trim(),
      defaultRole,
    };

    // 保存配置
    await setCachedConfig(adminConfig);
    await db.saveAdminConfig(adminConfig);

    console.log(`Telegram Auth 配置已更新 by ${username}`);

    return NextResponse.json({ ok: true, message: 'Telegram 配置更新成功' });

  } catch (error) {
    console.error('更新 Telegram 配置失败:', error);
    return NextResponse.json({ error: '更新配置失败' }, { status: 500 });
  }
}
