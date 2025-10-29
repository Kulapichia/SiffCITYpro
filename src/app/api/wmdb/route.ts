// src/app/api/wmdb/route.ts (新建)
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const doubanId = searchParams.get('id');

  if (!doubanId) {
    return NextResponse.json({ error: 'Missing doubanId parameter' }, { status: 400 });
  }

  const wmdbApiUrl = `https://api.wmdb.tv/movie/api?id=${doubanId}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 秒超时

    const response = await fetch(wmdbApiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      // 如果响应不是 200 OK，则传播状态和消息
      return NextResponse.json({ error: `WMDB API error: ${response.statusText}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'WMDB API request timed out after 6 seconds' }, { status: 504 });
    }
    console.error('Error fetching from WMDB API:', error);
    return NextResponse.json({ error: 'Failed to fetch data from WMDB API' }, { status: 500 });
  }
}
