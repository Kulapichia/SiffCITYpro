/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getConfig, saveAndCacheConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 生成随机密码
 */
function generateRandomPassword(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 生成签名
 */
async function generateSignature(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(data);
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成认证 Cookie
 */
async function generateAuthCookie(
    username: string,
    role: 'owner' | 'admin' | 'user'
): Promise<string> {
    const authData: any = { role, username };
    if (process.env.PASSWORD) {
        const signature = await generateSignature(username, process.env.PASSWORD);
        authData.signature = signature;
        authData.timestamp = Date.now();
    }
    return encodeURIComponent(JSON.stringify(authData));
}


/**
 * Telegram Auth 回调处理
 * GET /api/oauth/telegram/callback
 * (已从 POST 修改为 GET 以支持更可靠的重定向模式)
 */
export async function GET(req: NextRequest) {
  // 稳定地获取请求的 origin，优先读取反向代理设置的 header
  // 优先从反向代理设置的 'x-forwarded-host' header 获取主机名
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  // 优先从 'x-forwarded-proto' 获取协议 (http/https)
  const protocol = req.headers.get('x-forwarded-proto') ?? 'http';

  // 如果无法从 headers 中确定主机名, 则记录警告并回退到 req.nextUrl.origin
  // 这种情况通常意味着反向代理配置不正确，但我们提供一个降级方案
  if (!host) {
    console.warn(`[Telegram Auth] Warning: Could not determine hostname from 'x-forwarded-host' or 'host' headers. Falling back to 'req.nextUrl.origin'. Ensure your reverse proxy is configured to pass the 'Host' header correctly.`);
  }
  const origin = host ? `${protocol}://${host}` : req.nextUrl.origin;

  console.log('\n--- [Telegram Auth] ---');
  try {
    // 从 URL 查询参数中获取 Telegram 返回的数据
    const { searchParams } = new URL(req.url);
    const telegramUser: { [key: string]: any } = {};
    searchParams.forEach((value, key) => {
      telegramUser[key] = value;
    });

    if (!telegramUser.hash) {
      console.error('❌ 错误: Telegram 回调缺少 hash 参数。');
      const errorUrl = new URL('/login?oauth_error=Telegram回调参数错误', origin);
      return NextResponse.redirect(errorUrl);
    }

    console.log('✅ 1. 收到 Telegram 回调数据 (from URL):', JSON.stringify(telegramUser, null, 2));

    const config = await getConfig();
    const tgConfig = config.SiteConfig.TelegramAuth;

    if (!tgConfig || !tgConfig.enabled) {
      console.error('❌ 错误: Telegram 登录功能未在后台启用。');
      const errorUrl = new URL('/login?oauth_error=Telegram登录未启用', origin);
      return NextResponse.redirect(errorUrl);
    }
    if (!tgConfig.botToken) {
      console.error('❌ 错误: Telegram Bot Token 未在后台配置。');
      const errorUrl = new URL('/login?oauth_error=Telegram Bot Token 未配置', origin);
      return NextResponse.redirect(errorUrl);
    }
    // 关键安全日志：检查Bot Token是否已配置，但不打印完整Token
    console.log(`✅ 2. 配置检查: Bot Token 已配置 (长度: ${tgConfig.botToken.length})`);


    // 1. 验证数据来源的真实性
    const { hash, ...dataToCheck } = telegramUser;
    const checkString = Object.keys(dataToCheck)
      .sort()
      .map(key => `${key}=${dataToCheck[key]}`)
      .join('\n');

    console.log('✅ 3. 构建用于签名的 data-check-string:\n' + checkString);

    // 根据 Telegram 文档，secret_key 是 Bot Token 的 SHA256 哈希值
    const secretKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tgConfig.botToken));

    // 使用 secret_key 对数据字符串进行 HMAC-SHA256 签名
    const key = await crypto.subtle.importKey('raw', secretKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(checkString));
    const hmac = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');

    console.log('✅ 4. 签名比对:');
    console.log('   - Telegram 返回的 Hash: ' + hash);
    console.log('   - 服务器计算的 HMAC  : ' + hmac);

    if (hmac !== hash) {
      console.error('❌ 验证失败: 签名不匹配! 请立即检查您的 Bot Token 是否正确且完整。');
      const errorUrl = new URL('/login?oauth_error=数据验证失败，签名不匹配', origin);
      return NextResponse.redirect(errorUrl);
    }
    console.log('✅ 签名验证通过!');

    // 2. 验证数据时效性 (auth_date)
    const auth_date = parseInt(telegramUser.auth_date, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    const timeDiff = currentTime - auth_date;
    console.log(`✅ 5. 时间戳验证: (服务器时间: ${currentTime}, Telegram时间: ${auth_date}, 时间差: ${timeDiff}秒)`);

    if (timeDiff > 300) { // 5分钟有效期
      console.error('❌ 验证失败: 登录请求已过期。');
      const errorUrl = new URL('/login?oauth_error=登录请求已过期，请重试', origin);
      return NextResponse.redirect(errorUrl);
    }
    console.log('✅ 时间戳验证通过!');

    // 3. 查找或创建用户
    console.log('✅ 6. 开始查找或创建用户...');
    const { id: telegramId, username: telegramUsername, first_name, last_name } = telegramUser;

    let user = config.UserConfig.Users.find(u => u.telegramId === Number(telegramId));

    if (user) {
      console.log(`   - 找到已存在的用户: ${user.username}`);
      // 用户已存在，更新信息并登录
      if (user.telegramUsername !== telegramUsername) {
        console.log(`   - 更新用户 Telegram 用户名: ${user.telegramUsername} -> ${telegramUsername}`);
        user.telegramUsername = telegramUsername;
        await saveAndCacheConfig(config);
      }
    } else {
      console.log('   - 用户不存在，尝试自动注册...');
      // 用户不存在，检查是否允许自动注册
      if (!tgConfig.autoRegister) {
        console.error('❌ 注册失败: 自动注册功能已关闭。');
        const errorUrl = new URL('/login?oauth_error=此 Telegram 账户尚未关联系统用户，且自动注册已关闭', origin);
        return NextResponse.redirect(errorUrl);
      }

      // 自动注册新用户
      const baseUsername = `tg_${telegramUsername || first_name || telegramId}`;
      let newUsername = baseUsername;
      let counter = 1;
      while (await db.checkUserExist(newUsername)) {
        newUsername = `${baseUsername}_${counter++}`;
      }
      console.log(`   - 为新用户生成的用户名为: ${newUsername}`);

      const newPassword = generateRandomPassword();
      await db.registerUser(newUsername, newPassword);

      const newUserEntry = {
        username: newUsername,
        role: tgConfig.defaultRole,
        banned: false,
        createdAt: Date.now(),
        telegramId: Number(telegramId),
        telegramUsername: telegramUsername,
      };

      config.UserConfig.Users.push(newUserEntry as any);
      await saveAndCacheConfig(config);
      user = newUserEntry as any;
      console.log(`   - ✅ 新用户 ${newUsername} 创建成功!`);
    }

    // 此处添加一个检查以确保 'user' 变量在此刻必然有值，从而解决 TypeScript 的类型错误。
    // 在正常逻辑下，如果 user 未能被找到或创建，函数应该在上面的 if/else 块中就已经 return 了。
    if (!user) {
      console.error('❌ 严重错误: 用户对象在查找或创建流程后仍然未定义。这是一个不应发生的逻辑错误。');
      const errorUrl = new URL('/login?oauth_error=处理用户信息时发生意外的内部错误', origin);
      return NextResponse.redirect(errorUrl);
    }

    // 检查用户是否被封禁
    if (user.banned) {
      console.error(`❌ 登录失败: 用户 ${user.username} 已被封禁。`);
      const errorUrl = new URL('/login?oauth_error=您的账户已被封禁', origin);
      return NextResponse.redirect(errorUrl);
    }

    // 4. 生成 Cookie 并重定向
    console.log(`✅ 7. 为用户 ${user.username} 生成认证Cookie...`);
    const authCookie = await generateAuthCookie(user.username, user.role);

    const redirectUrl = new URL('/', origin);
    const response = NextResponse.redirect(redirectUrl);

    const expires = new Date();
    expires.setDate(expires.getDate() + 7); // 7天有效期

    response.cookies.set('auth', authCookie, {
      path: '/',
      expires,
      sameSite: 'lax',
      httpOnly: false, // 保持与项目其他部分一致
      secure: origin.startsWith('https:'), // 根据实际的 origin 判断 secure
    });

    console.log('✅ 登录流程全部成功! 重定向到首页。');
    console.log('--- [Telegram Auth End] ---\n');
    return response;

  } catch (error) {
    // 确保即使在顶层 catch 块中，也能使用正确的 origin
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') ?? 'http';
    const originForError = host ? `${protocol}://${host}` : req.nextUrl.origin;

    console.error('❌ Telegram 回调处理中发生严重错误:', error);
    console.log('--- [Telegram Auth End with Error] ---\n');
    const errorUrl = new URL('/login?oauth_error=处理 Telegram 登录时发生内部错误', originForError);
    return NextResponse.redirect(errorUrl);
  }
}

