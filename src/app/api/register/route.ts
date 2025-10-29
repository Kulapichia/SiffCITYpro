/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { RegisterResponse } from '@/lib/admin.types';
import { clearConfigCache, getConfig, saveAndCacheConfig } from '@/lib/config';
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

// --- 保留的签名和Cookie生成函数，用于实现自动登录 ---
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
  }

  return encodeURIComponent(JSON.stringify(authData));
}

// 验证用户名格式
function validateUsername(username: string): {
  valid: boolean;
  message?: string;
} {
  if (!username || username.trim().length === 0) {
    return { valid: false, message: '用户名不能为空' };
  }
  // 与项目A对齐，使用 /^[a-zA-Z0-9_]{3,20}$/
  // 检查用户名格式（只允许字母数字和下划线）
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return {
      valid: false,
      message: '用户名只能包含字母、数字和下划线，长度3-20位',
    };
  }

  return { valid: true };
}

// 验证密码强度
function validatePassword(password: string): {
  valid: boolean;
  message?: string;
} {
  if (!password || password.length < 6) {
    return { valid: false, message: '密码长度至少6个字符' };
  }

  if (password.length > 50) {
    return { valid: false, message: '密码长度不能超过50个字符' };
  }

  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {
    // localStorage 模式不支持注册
    if (STORAGE_TYPE === 'localstorage') {
      return NextResponse.json(
        {
          success: false,
          message: 'localStorage 模式不支持用户注册',
        } as RegisterResponse,
        { status: 400 }
      );
    }

    const { username, password, confirmPassword } = await req.json();

    // 先检查配置中是否允许注册（在验证输入之前）
    let config;
    try {
      config = await getConfig();


      // 优先检查 SiteConfig.EnableRegistration，如果不存在则检查 UserConfig.AllowRegister
      let allowRegister = true; // 默认允许注册

      if (config.SiteConfig?.EnableRegistration !== undefined) {

        allowRegister = config.SiteConfig.EnableRegistration;
      } else if (config.UserConfig?.AllowRegister !== undefined) {

        allowRegister = config.UserConfig.AllowRegister;
      }

      if (!allowRegister) {
        return NextResponse.json(
          {
            success: false,
            message: '管理员已关闭用户注册功能',
          } as RegisterResponse,
          { status: 403 }
        );
      }
    } catch (err) {
      console.error('检查注册配置失败', err);
      return NextResponse.json(
        {
          success: false,
          message: '注册失败，请稍后重试',
        } as RegisterResponse,
        { status: 500 }
      );
    }

    // 验证输入
    if (!username || typeof username !== 'string' || username.trim() === '') {
      return NextResponse.json(
        {
          success: false,
          message: '用户名不能为空',
        } as RegisterResponse,
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        {
          success: false,
          message: '密码不能为空',
        } as RegisterResponse,
        { status: 400 }
      );
    }

    // 确认密码匹配
    if (password !== confirmPassword) {
      return NextResponse.json(
        {
          success: false,
          message: '两次输入的密码不一致',
        } as RegisterResponse,
        { status: 400 }
      );
    }

    // 验证用户名格式
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          message: usernameValidation.message || '用户名验证失败',
        } as RegisterResponse,
        { status: 400 }
      );
    }

    // 验证密码格式
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          message: passwordValidation.message || '密码验证失败',
        } as RegisterResponse,
        { status: 400 }
      );
    }

    // 检查是否与管理员用户名冲突
    if (username === process.env.USERNAME) {
      return NextResponse.json(
        {
          success: false,
          message: '该用户名已被使用',
        } as RegisterResponse,
        { status: 400 }
      );
    }

    try {
      // 检查用户是否已存在
      const userExists = await db.checkUserExist(username);
      if (userExists) {
        return NextResponse.json(
          {
            success: false,
            message: '该用户名已被注册',
          } as RegisterResponse,
          { status: 400 }
        );
      }

      // 检查是否有待审核的同名用户（如果支持待审核功能）
      if (typeof db.getPendingUsers === 'function') {
        try {
          const pendingUsers = await db.getPendingUsers();
          const pendingUserExists = pendingUsers.some(
            (u) => u.username === username
          );
          if (pendingUserExists) {
            return NextResponse.json(
              {
                success: false,
                message: '该用户名正在审核中，请勿重复提交',
              } as RegisterResponse,
              { status: 400 }
            );
          }
        } catch (pendingErr) {
          // 如果获取待审核用户失败，记录日志但不阻断注册流程
          console.warn('获取待审核用户列表失败:', pendingErr);
        }
      }

      // 检查用户数量限制（如果配置了）
      if (
        config.SiteConfig?.MaxUsers &&
        typeof db.getRegistrationStats === 'function'
      ) {
        try {
          const stats = await db.getRegistrationStats();
          if (stats.totalUsers >= config.SiteConfig.MaxUsers) {
            return NextResponse.json(
              {
                success: false,
                message: '用户注册已达到上限',
              } as RegisterResponse,
              { status: 400 }
            );
          }
        } catch (statsErr) {
          // 如果获取统计失败，记录日志但不阻断注册流程
          console.warn('获取注册统计失败:', statsErr);
        }
      }

      // 根据配置决定是直接注册还是待审核
      if (
        config.SiteConfig?.RegistrationApproval &&
        typeof db.createPendingUser === 'function'
      ) {
        // 需要审核
        await db.createPendingUser(username, password);

        return NextResponse.json({
          success: true,
          message: '注册申请已提交，请等待管理员审核',
          needsApproval: true,
        } as RegisterResponse);
      } else {
        // 直接注册用户
        await db.registerUser(username, password);

        // 重新获取配置来添加用户
        const currentConfig = await getConfig();
        const newUser = {
          username: username,
          role: 'user' as const,
          createdAt: Date.now(), // 设置注册时间戳
        };

        // 检查用户是否已存在于配置中（避免重复添加）
        const existingUser = currentConfig.UserConfig.Users.find(
          (u) => u.username === username
        );

        if (!existingUser) {
          currentConfig.UserConfig.Users.push(newUser);

          // 保存更新后的配置
          // 优先使用 saveAndCacheConfig，如果不存在则使用原方法
          if (typeof saveAndCacheConfig === 'function') {
            await saveAndCacheConfig(currentConfig);
            console.log(`新用户 ${username} 已同步到管理员配置`);
          } else {
            await db.saveAdminConfig(currentConfig);
            // 清除缓存，确保下次获取配置时是最新的
            clearConfigCache();
          }
        }

        // 注册成功后自动登录
        const response = NextResponse.json({
          success: true,
          message: '注册成功，已自动登录',
        } as RegisterResponse);

        const cookieValue = await generateAuthCookie(
          username,
          password,
          'user',
          false
        );
        const expires = new Date();
        expires.setDate(expires.getDate() + 7); // 7天过期

        response.cookies.set('auth', cookieValue, {
          path: '/',
          expires,
          sameSite: 'lax',
          httpOnly: false,
          secure: false,
        });

        return response;
      }
    } catch (err) {
      console.error('注册用户失败', err);
      return NextResponse.json(
        {
          success: false,
          message: '注册失败，请稍后重试',
        } as RegisterResponse,
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('注册接口异常', error);
    return NextResponse.json(
      {
        success: false,
        message: '服务器错误',
      } as RegisterResponse,
      { status: 500 }
    );
  }
}
