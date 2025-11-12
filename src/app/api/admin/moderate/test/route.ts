import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { checkImageWithSightengine } from '@/lib/sightengine-client';
import { checkImageWithBaidu } from '@/lib/baidu-client';

export const runtime = 'nodejs';

// 智能审核API的统一测试接口
export async function POST(request: NextRequest) {
  // 1. 身份验证
  const authInfo = getAuthInfoFromCookie(request) as { role?: string };
  if (authInfo?.role !== 'owner' && authInfo?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. 解析请求体, 获取 provider 和 config
  let provider: 'sightengine' | 'custom' | 'baidu' | 'aliyun' | 'tencent';
  let config: any;
  try {
    const body = await request.json();
    provider = body.provider;
    config = body.config;
    if (!provider || !config) {
      throw new Error('缺少 provider 或 config 参数');
    }
  } catch (error) {
    return NextResponse.json({ error: '无效的请求参数' }, { status: 400 });
  }

  // 3. 根据 provider 调用不同的测试逻辑
  try {
    if (provider === 'sightengine') {
      // --- Sightengine 测试逻辑 (使用客户端) ---
      if (!config.apiUser || !config.apiSecret) {
        return NextResponse.json({ error: 'Sightengine 配置不完整' }, { status: 400 });
      }
      
      const result = await checkImageWithSightengine('https://placehold.co/100x100.png', {
        apiUrl: config.apiUrl,
        apiUser: config.apiUser,
        apiSecret: config.apiSecret,
        confidence: 0.99, // 使用高置信度进行测试，确保能通过
      });

      if (result.decision !== 'error') {
        return NextResponse.json({ success: true, message: 'Sightengine 凭证有效，连接成功！' });
      } else {
        throw new Error(`Sightengine 测试失败: ${result.reason}`);
      }
    } else if (provider === 'baidu') {
      // --- 百度智能云测试逻辑 (使用客户端) ---
      if (!config.apiKey || !config.secretKey) {
        return NextResponse.json({ error: '百度智能云配置不完整' }, { status: 400 });
      }

      const result = await checkImageWithBaidu('https://placehold.co/100x100.png', {
        apiKey: config.apiKey,
        secretKey: config.secretKey,
        timeoutMs: config.timeoutMs,
        tokenTimeoutMs: config.tokenTimeoutMs,
      });

      if (result.decision !== 'error') {
        return NextResponse.json({ success: true, message: '百度智能云凭证有效，连接成功！' });
      } else {
        throw new Error(`百度智能云测试失败: ${result.reason}`);
      }
    
    } else if (provider === 'aliyun') {
      // --- 阿里云 (占位) ---
      return NextResponse.json({ error: '阿里云暂不支持测试连接' }, { status: 400 });
    
    } else if (provider === 'tencent') {
      // --- 腾讯云 (占位) ---
      return NextResponse.json({ error: '腾讯云暂不支持测试连接' }, { status: 400 });
      
    } else if (provider === 'custom') {
      // --- 自定义 API 测试逻辑 ---
      if (!config.apiUrl || !config.apiKeyValue || !config.apiKeyHeader || !config.jsonBodyTemplate) {
        return NextResponse.json({ error: '自定义 API 配置不完整' }, { status: 400 });
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      headers[config.apiKeyHeader] = config.apiKeyValue;
      // 使用一个安全的占位符图片进行测试
      const imageUrl = 'https://placehold.co/100x100.png';
      const body = JSON.parse(config.jsonBodyTemplate.replace('{{URL}}', imageUrl));
      
      const response = await fetch(config.apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });

      if (response.ok) {
        // 尝试解析JSON，但不强制要求，因为有些API可能返回200 OK但无内容
        try {
            await response.json();
        } catch {
            // 忽略JSON解析错误，因为响应体可能为空，这是预期行为。
        }
        return NextResponse.json({ success: true, message: `自定义 API 连接成功 (状态码: ${response.status})` });
      } else {
        const errorText = await response.text();
        throw new Error(`自定义 API 测试失败 (状态码: ${response.status}): ${errorText.slice(0, 150)}`);
      }

    } else {
      return NextResponse.json({ error: '不支持的 provider' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知网络错误';
    return NextResponse.json({ error: `测试失败: ${message}` }, { status: 500 });
  }
}
