
import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
// GET: 获取缓存
export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    console.log(`🔍 API缓存请求: ${key}`);

    // 现在可以安全地调用 db.getCache，Upstash 的 getCache 已经修复
    const data = await db.getCache(key);
    console.log(`✅ API缓存结果: ${data ? '命中' : '未命中'}`);
    return NextResponse.json({ data });
  } catch (error) {
    console.error(`❌ API缓存错误 (key: ${request.nextUrl.searchParams.get('key')}):`, error);
    console.error('错误详情:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    return NextResponse.json({ data: null }, { status: 200 }); // 确保返回 200 而不是 500
  }
}

// POST: 设置缓存
export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { key, data, expireSeconds } = body;

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    await db.setCache(key, data, expireSeconds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Set cache error:', error);
    return NextResponse.json({ error: 'Failed to set cache' }, { status: 500 });
  }
}

// DELETE: 删除缓存或清理过期缓存
export async function DELETE(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const prefix = searchParams.get('prefix');

    if (key) {
      await db.deleteCache(key);
      return NextResponse.json({ success: true, message: `Cache with key "${key}" deleted.` });
    }
    
    if (prefix) {
      await db.clearExpiredCache(prefix);
      return NextResponse.json({ success: true, message: `Expired cache with prefix "${prefix}" cleared.` });
    }

    // 如果没有key或prefix，则清理所有过期缓存
    await db.clearExpiredCache();
    return NextResponse.json({ success: true, message: 'All expired cache cleared.' });

  } catch (error: any) {
    console.error('删除缓存失败:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
