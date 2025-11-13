import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';

// export const runtime = 'nodejs';

// 从全局对象获取WebSocket实例相关方法
function getOnlineUsers(): string[] {
  try {
    // 修正: 直接从 global 对象获取函数，这与 production-final.js 中的设置保持一致
    if (typeof (global as any).getOnlineUsers === 'function') {
      return (global as any).getOnlineUsers();
    }
    console.warn('getOnlineUsers function not found on global object.');
    return [];
  } catch (error) {
    console.error('获取在线用户失败:', error);
    return [];
  }
}

// 获取在线用户列表
export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const onlineUsers = getOnlineUsers();
    return NextResponse.json({ onlineUsers });
  } catch (error) {
    console.error('获取在线用户失败:', error);
    return NextResponse.json({ error: '获取在线用户失败' }, { status: 500 });
  }
}
