/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { CURRENT_VERSION } from '@/lib/version'

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  console.log('server-config called: ', request.url);

  const config = await getConfig();
  const result = {
    SiteName: config.SiteConfig.SiteName,
    StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    Version: CURRENT_VERSION,
    EnableRegistration: config.SiteConfig.EnableRegistration || false,
    LinuxDoOAuth: {
      enabled: config.SiteConfig.LinuxDoOAuth?.enabled || false,
    },
    TelegramAuth: {
      enabled: config.SiteConfig.TelegramAuth?.enabled || false,
      botName: config.SiteConfig.TelegramAuth?.botName || '',
      botUsername: (config.SiteConfig.TelegramAuth as any)?.botUsername || '',
      buttonSize: (config.SiteConfig.TelegramAuth as any)?.buttonSize || 'large',
      showAvatar: (config.SiteConfig.TelegramAuth as any)?.showAvatar ?? true,
      requestWriteAccess: (config.SiteConfig.TelegramAuth as any)?.requestWriteAccess ?? false,
    },
  };
  return NextResponse.json(result);
}
