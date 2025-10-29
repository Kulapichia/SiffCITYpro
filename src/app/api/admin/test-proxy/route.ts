import { NextResponse, NextRequest } from 'next/server';

export const runtime = 'nodejs'; // 更改为 nodejs 以获得更好的兼容性

export async function POST(request: NextRequest) {
  try {
    const { targetUrl } = await request.json();

    if (!targetUrl) {
      return NextResponse.json({ error: 'Target URL is required' }, { status: 400 });
    }

    // 为服务器端请求设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      clearTimeout(timeoutId);

      const status = response.status;
      const statusText = response.statusText;
      let success = response.ok;
      let responseBody: any = null;
      let errorMessage: string | undefined;

      const rawResponseBody = await response.text(); // Read body once as text
      try {
        responseBody = JSON.parse(rawResponseBody); // Try to parse as JSON
        // 如果响应是 JSON，检查响应体中常见的错误指示
        if (responseBody && (responseBody.error || responseBody.code !== 1 && responseBody.code !== 200)) { // 假设 code 为 1 或 200 表示成功
          success = false;
          errorMessage = responseBody.error || responseBody.msg || '响应内容指示错误';
        }
      } catch (jsonError) {
        // 如果不是 JSON，或者解析失败，它可能仍然是一个有效响应（例如纯文本、HTML）
        if (!rawResponseBody.trim()) { // If response is empty, it's a failure
          success = false;
          errorMessage = '响应内容为空';
        }
      }

      return NextResponse.json({
        success: success,
        status: status,
        statusText: statusText,
        error: errorMessage,
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        return NextResponse.json({ success: false, error: '请求超时' }, { status: 504 });
      } else {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
