import { NextResponse, NextRequest } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { AdminConfig } from '@/lib/admin.types';
import { getConfig, setCachedConfig, clearConfigCache } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    // 允许所有登录用户获取主题配置
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }
    const config = await getConfig();
    const themeConfig = config.ThemeConfig;

    return NextResponse.json({
      success: true,
      data: themeConfig,
    });
  } catch (error) {
    console.error('获取主题配置失败:', error);
    return NextResponse.json(
      { error: '获取主题配置失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    // 检查是否为管理员或站长
    const config = await getConfig();
    const user = config.UserConfig.Users.find(u => u.username === authInfo.username);
    const isOwner = authInfo.username === process.env.USERNAME;
    const isAdmin = user?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: '权限不足，仅管理员可设置全局主题' }, { status: 403 });
    }

    const body = await request.json();
    const { defaultTheme, customCSS, allowUserCustomization } = body;

    // 验证主题名称
    const validThemes = ['default', 'minimal', 'warm', 'fresh'];
    if (!validThemes.includes(defaultTheme)) {
      return NextResponse.json({ error: '无效的主题名称' }, { status: 400 });
    }

    // 更新主题配置
    const updatedConfig: AdminConfig = {
      ...config,
      ThemeConfig: {
        defaultTheme: defaultTheme as 'default' | 'minimal' | 'warm' | 'fresh',
        customCSS: customCSS || '',
        allowUserCustomization: allowUserCustomization !== false,
      },
    };

    await db.saveAdminConfig(updatedConfig);
    
    // 清除缓存以确保立即生效
    clearConfigCache();

    return NextResponse.json({
      success: true,
      message: '主题配置已更新',
      data: updatedConfig.ThemeConfig,
    });
  } catch (error) {
    console.error('更新主题配置失败:', error);
    return NextResponse.json(
      { error: '更新主题配置失败', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
