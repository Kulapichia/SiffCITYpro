import { NextRequest, NextResponse } from 'next/server';

import { ensureAdmin } from '@/lib/admin-auth';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // 增加管理员权限验证
    await ensureAdmin(request);
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const availableSites = await getAvailableApiSites(authInfo.username);
    const sources = availableSites
      .filter((s) => Boolean(s.api?.trim()))
      .map((s) => ({ key: s.key, name: s.name, api: s.api }));

    return NextResponse.json({ sources });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: '获取源列表失败' }, { status: 500 });
  }
}

