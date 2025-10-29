/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { ensureAdmin } from '@/lib/admin-auth';
import { getConfig } from '@/lib/config';
import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';

async function getAdminRoleFromRequest(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return null;
  }
  const username = authInfo.username;
  if (username === process.env.USERNAME) {
    return 'owner';
  }
  const config = await getConfig();
  const user = config.UserConfig.Users.find(
    (u) => u.username === username && !u.banned
  );
  return user?.role === 'admin' ? 'admin' : null;
}
// 返回所有源（包含禁用状态），仅暴露必要字段
export async function GET(request: NextRequest) {
  const role = await getAdminRoleFromRequest(request);
  if (!role) {
    return NextResponse.json({ error: '你没有权限访问源检测功能' }, { status: 401 });
  }
  try {
    const config = await getConfig();
    const sources = (config.SourceConfig || []).map((s: any) => ({
      key: s.key,
      name: s.name,
      api: s.api,
      disabled: !!s.disabled,
    }));

    return NextResponse.json(
      { sources },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: '获取源列表失败' }, { status: 500 });
  }
}
