/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { AdminConfig, AdminConfigResult } from '@/lib/admin.types';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const authInfo = getAuthInfoFromCookie(request);
    // 修正：只声明一次 username，并处理 authInfo 可能不存在的情况
    const username = authInfo?.username;

    const config = await getConfig();
    // 检查用户权限
    let userRole: 'owner' | 'admin' | 'user' | 'guest' | 'banned' | 'unknown' = 'guest';
    let isAdmin = false;

    if (username === process.env.USERNAME) {
      userRole = 'owner';
      isAdmin = true;
    } else if (username) {
      const user = config.UserConfig.Users.find((u) => u.username === username);
      if (user && user.role === 'admin' && !user.banned) {
        userRole = 'admin';
        isAdmin = true;
      } else if (user && !user.banned) {
        userRole = 'user';
      } else if (user && user.banned) {
        userRole = 'banned';
      } else {
        userRole = 'unknown';
      }
    }

    if (isAdmin) {
      // 管理员返回完整配置，但屏蔽敏感信息
      const configForFrontend = JSON.parse(JSON.stringify(config));

      // 在返回给前端前，用占位符屏蔽敏感信息
      if (configForFrontend.SiteConfig.IntelligentFilter?.options?.sightengine?.apiSecret) {
        configForFrontend.SiteConfig.IntelligentFilter.options.sightengine.apiSecret = "********";
      }
      if (configForFrontend.SiteConfig.IntelligentFilter?.options?.custom?.apiKeyValue) {
        configForFrontend.SiteConfig.IntelligentFilter.options.custom.apiKeyValue = "********";
      }
      if (configForFrontend.SiteConfig.IntelligentFilter?.options?.baidu?.secretKey) {
        configForFrontend.SiteConfig.IntelligentFilter.options.baidu.secretKey = "********";
      }
      // 可以继续添加其他需要屏蔽的密钥
      // 获取所有用户的机器码信息
      const machineCodeUsers = await db.getMachineCodeUsers();
      
      // 将机器码信息合并到用户信息中
      if (configForFrontend.UserConfig && configForFrontend.UserConfig.Users) {
        configForFrontend.UserConfig.Users.forEach((user: any) => {
          if (machineCodeUsers[user.username]) {
            user.machineCode = machineCodeUsers[user.username].machineCode;
          } else {
            user.machineCode = null; // 使用 null 表示未绑定
          }
        });
      }
      const result: AdminConfigResult = {
        Role: userRole as 'admin' | 'owner',
        Config: configForFrontend,
      };

      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'no-store', // 管理员配置不缓存
        },
      });
    } else {
      // 普通用户或未登录用户只返回公开配置
      const publicConfig = {
        ThemeConfig: config.ThemeConfig,
        SiteConfig: {
          SiteName: config.SiteConfig.SiteName,
          Announcement: config.SiteConfig.Announcement,
        }
      };

      const result = {
        Role: userRole,
        Config: publicConfig,
      };

      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'public, max-age=60', // 公开配置可以缓存1分钟
        },
      });
    }
  } catch (error) {
    console.error('获取管理员配置失败:', error);
    return NextResponse.json(
      {
        error: '获取管理员配置失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username;

    // 只有站长可以修改配置
    if (username !== process.env.USERNAME) {
      return NextResponse.json(
        { error: '只有站长可以修改配置' },
        { status: 403 }
      );
    }

    const newConfig: AdminConfig = await request.json();
    
    // 保存新配置
    await db.saveAdminConfig(newConfig);
    
    // 清除缓存，强制下次重新从数据库读取
    clearConfigCache();
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存管理员配置失败:', error);
    return NextResponse.json(
      {
        error: '保存配置失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
