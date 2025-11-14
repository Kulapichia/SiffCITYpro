/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 读取存储类型环境变量，默认 localstorage
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'upstash'
    | 'kvrocks'
    | undefined) || 'localstorage';

// 生成签名
async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  // 导入密钥
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // 生成签名
  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  // 转换为十六进制字符串
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 生成认证Cookie（带签名）
async function generateAuthCookie(
  username?: string,
  password?: string,
  role?: 'owner' | 'admin' | 'user',
  includePassword = false
): Promise<string> {
  const authData: any = { role: role || 'user' };

  // 只在需要时包含 password
  if (includePassword && password) {
    authData.password = password;
  }

  if (username && process.env.PASSWORD) {
    authData.username = username;
    // 使用密码作为密钥对用户名进行签名
    const signature = await generateSignature(username, process.env.PASSWORD);
    authData.signature = signature;
    authData.timestamp = Date.now(); // 添加时间戳防重放攻击
    authData.loginTime = Date.now(); // 添加登入时间记录
  }

  return encodeURIComponent(JSON.stringify(authData));
}

export async function POST(req: NextRequest) {
  try {
    // 本地 / localStorage 模式——仅校验固定密码
    if (STORAGE_TYPE === 'localstorage') {
      const envPassword = process.env.PASSWORD;

      // 未配置 PASSWORD 时直接放行
      if (!envPassword) {
        const response = NextResponse.json({ ok: true });

        // 清除可能存在的认证cookie
        response.cookies.set('auth', '', {
          path: '/',
          expires: new Date(0),
          sameSite: 'lax', // 改为 lax 以支持 PWA
          httpOnly: false, // PWA 需要客户端可访问
          secure: false, // 根据协议自动设置
        });

        return response;
      }

      const { password } = await req.json();
      if (typeof password !== 'string') {
        return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
      }

      if (password !== envPassword) {
        return NextResponse.json(
          { ok: false, error: '密码错误' },
          { status: 401 }
        );
      }

      // 验证成功，设置认证cookie
      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(
        undefined,
        password,
        'user',
        true
      ); // localstorage 模式包含 password
      const expires = new Date();
      expires.setDate(expires.getDate() + 7); // 7天过期

      response.cookies.set('auth', cookieValue, {
        path: '/',
        expires,
        sameSite: 'lax', // 改为 lax 以支持 PWA
        httpOnly: false, // PWA 需要客户端可访问
        secure: false, // 根据协议自动设置
      });

      return response;
    }

    // 数据库 / redis 模式——校验用户名并尝试连接数据库
    const body = await req.json();
    const { username, password, machineCode, bindDevice, deviceInfo } = body;
    
    // [BIND_DEBUG] 1. 打印完整的请求体
    console.log('[BIND_DEBUG] Received login request body:', JSON.stringify(body, null, 2));

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
    }

    // 可能是站长，直接读环境变量
    if (
      username === process.env.USERNAME &&
      password === process.env.PASSWORD
    ) {
      // 验证成功，设置认证cookie
      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(
        username,
        password,
        'owner',
        false
      ); // 数据库模式不包含 password
      const expires = new Date();
      expires.setDate(expires.getDate() + 7); // 7天过期

      response.cookies.set('auth', cookieValue, {
        path: '/',
        expires,
        sameSite: 'lax', // 改为 lax 以支持 PWA
        httpOnly: false, // PWA 需要客户端可访问
        secure: false, // 根据协议自动设置
      });

      return response;
    } else if (username === process.env.USERNAME) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    const config = await getConfig();
    const user = config.UserConfig.Users.find((u) => u.username === username);
    // 如果用户在配置中，先检查状态和封禁情况
    if (user) {
      if (user.banned) {
        return NextResponse.json({ error: '用户被封禁' }, { status: 401 });
      }

      // 检查用户状态 - 优先检查，避免走到密码验证
      if (user.status === 'pending') {
        return NextResponse.json(
          { error: '账号正在审核中，请等待管理员审批' },
          { status: 401 }
        );
      }

      if (user.status === 'rejected') {
        return NextResponse.json(
          { error: '账号申请已被拒绝' },
          { status: 401 }
        );
      }
    } else {
      // 如果不在配置中，检查是否是待审核用户
      const pendingUsers = await db.getPendingUsers();
      const pendingUser = pendingUsers.find((u) => u.username === username);

      if (pendingUser) {
        return NextResponse.json(
          { error: '账号正在审核中，请等待管理员审批' },
          { status: 401 }
        );
      }
    }

    // 校验用户密码
    try {
      const pass = await db.verifyUser(username, password);
      if (!pass) {
        return NextResponse.json(
          { error: '用户名或密码错误' },
          { status: 401 }
        );
      }
      
      // 检查机器码绑定
      const boundMachineCodes = await db.getUserMachineCodes(username);
      // [BIND_DEBUG] 2. 打印当前用户已绑定的设备码
      console.log(`[BIND_DEBUG] User '${username}' has ${boundMachineCodes?.length || 0} bound devices.`);
      if (boundMachineCodes && boundMachineCodes.length > 0) {
        // [BIND_DEBUG] 3a. 用户已绑定设备，进入验证流程
        console.log('[BIND_DEBUG] User has bound devices, starting validation.');
        // 用户已绑定机器码，需要验证
        if (!machineCode || !machineCode.trim()) { // 关键修复：增加对空字符串的判断
          return NextResponse.json({
            error: '该账户已绑定设备，请提供设备码',
            requireMachineCode: true
          }, { status: 403 });
        }

        const isMachineBound = boundMachineCodes.some(
          (code) => (code as any).machineCode.toUpperCase() === machineCode.toUpperCase()
        );

        if (!isMachineBound) {
          // 如果是新设备，且用户选择绑定，检查是否已达上限
          if (bindDevice) {
            if (boundMachineCodes.length >= 5) {
              return NextResponse.json({
                error: '绑定设备数量已达上限（5台），请在其他设备解绑后再试',
                machineCodeMismatch: true
              }, { status: 403 });
            }
          } else {
            return NextResponse.json({
              error: '设备码不匹配，此设备未绑定。如需绑定，请勾选“绑定此设备”',
              machineCodeMismatch: true
            }, { status: 403 });
          }
        }
      } else if (config.SiteConfig.RequireDeviceCode) {
        // [BIND_DEBUG] 3b. 全局需要绑定，但用户未绑定
        console.log('[BIND_DEBUG] Site requires device code, but user has none. Checking bindDevice flag...');
        // 全局开启了设备码验证，但用户未绑定
        if (!bindDevice) {
          // [BIND_DEBUG] 3b-1. 用户未勾选绑定，返回错误
          console.log('[BIND_DEBUG] `bindDevice` is false. Rejecting login.');
          return NextResponse.json({
            error: '管理员已开启设备验证，请勾选“绑定此设备”后登录',
            requireMachineCode: true // 前端可以根据此标记提示用户
          }, { status: 403 });
        }
        // 关键修复：如果勾选了绑定，则必须提供有效的设备码
        if (bindDevice && (!machineCode || !machineCode.trim())) {
          return NextResponse.json({ error: '正在生成设备码，请稍候或刷新重试' }, { status: 400 });
        }
      }
      
      // 检查新设备码是否已被他人绑定
      if (machineCode) {
        const codeOwner = await db.isMachineCodeBound(machineCode);
        if (codeOwner && codeOwner !== username) {
          return NextResponse.json({
            error: `该设备已被用户 ${codeOwner} 绑定`,
            machineCodeTaken: true
          }, { status: 409 });
        }
      }

      // 如果用户选择绑定设备，则执行绑定操作
      if (bindDevice && machineCode && machineCode.trim()) {
        // [BIND_DEBUG] 4. 符合绑定条件，准备执行绑定
        console.log(`[BIND_DEBUG] Conditions met for binding. bindDevice: ${bindDevice}, machineCode: '${machineCode}'`);
        const currentCodes = await db.getUserMachineCodes(username);
        if (currentCodes.length < 5) {
          // [BIND_DEBUG] 4a. 设备未满，执行绑定
          console.log(`[BIND_DEBUG] Binding new device for user '${username}'.`);
          await db.setUserMachineCode(username, machineCode, deviceInfo);
          // [BIND_DEBUG] 4b. 绑定操作完成
          console.log(`[BIND_DEBUG] db.setUserMachineCode called successfully.`);
        } else {
          // [BIND_DEBUG] 4c. 设备已满，无法绑定
          console.log(`[BIND_DEBUG] Device limit reached. Cannot bind new device.`);
          // 再次检查以防万一
          return NextResponse.json({
            error: '绑定设备数量已达上限（5台）',
            machineCodeMismatch: true
          }, { status: 403 });
        }
      } else {
        // [BIND_DEBUG] 5. 不满足绑定条件，跳过绑定逻辑
        console.log(`[BIND_DEBUG] Conditions not met for binding, skipping. bindDevice: ${bindDevice}, machineCode: '${machineCode}'`);
      }
      // 验证成功，设置认证cookie
      const response = NextResponse.json({
        ok: true,
        machineCodeBound: !!(boundMachineCodes && boundMachineCodes.length > 0),
        username: username
      });
      const cookieValue = await generateAuthCookie(
        username,
        password,
        user?.role || 'user',
        false
      ); // 数据库模式不包含 password
      const expires = new Date();
      expires.setDate(expires.getDate() + 7); // 7天过期

      response.cookies.set('auth', cookieValue, {
        path: '/',
        expires,
        sameSite: 'lax', // 改为 lax 以支持 PWA
        httpOnly: false, // PWA 需要客户端可访问
        secure: false, // 根据协议自动设置
      });

      return response;
    } catch (err) {
      console.error('数据库验证失败', err);
      return NextResponse.json({ error: '数据库错误' }, { status: 500 });
    }
  } catch (error) {
    console.error('登录接口异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
