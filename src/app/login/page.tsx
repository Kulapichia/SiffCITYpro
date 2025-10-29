/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  Shield,
  Sparkles,
  User,
  UserPlus,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import MachineCode from '@/lib/machine-code';
import { CURRENT_VERSION } from '@/lib/version';
import { checkForUpdates, UpdateStatus } from '@/lib/version_check';

// 版本显示组件
function VersionDisplay() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (_) {
        // do nothing
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

  return (
    <div className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400'>
      <span className='font-mono'>v{CURRENT_VERSION}</span>
      {!isChecking && updateStatus !== UpdateStatus.FETCH_FAILED && (
        <div
          className={`flex items-center gap-1.5 ${
            updateStatus === UpdateStatus.HAS_UPDATE
              ? 'text-yellow-600 dark:text-yellow-400'
              : updateStatus === UpdateStatus.NO_UPDATE
              ? 'text-green-600 dark:text-green-400'
              : ''
          }`}
        >
          {updateStatus === UpdateStatus.HAS_UPDATE && (
            <>
              <AlertCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>有新版本</span>
            </>
          )}
          {updateStatus === UpdateStatus.NO_UPDATE && (
            <>
              <CheckCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>已是最新</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldAskUsername, setShouldAskUsername] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [bingWallpaper, setBingWallpaper] = useState<string>('');
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  // 新增 Telegram 状态
  const [telegramAuthEnabled, setTelegramAuthEnabled] = useState(false);
  const [telegramBotName, setTelegramBotName] = useState('');
  // 机器码相关状态
  const [machineCode, setMachineCode] = useState<string>('');
  const [deviceInfo, setDeviceInfo] = useState<string>('');
  const [requireMachineCode, setRequireMachineCode] = useState(false);
  const [machineCodeGenerated, setMachineCodeGenerated] = useState(false);
  const [bindMachineCode, setBindMachineCode] = useState(false);
  const [deviceCodeEnabled, setDeviceCodeEnabled] = useState(true); // 站点是否启用设备码功能

  const { siteName } = useSite();

  // 获取 Bing 每日壁纸（通过代理 API）
  useEffect(() => {
    const fetchBingWallpaper = async () => {
      try {
        const response = await fetch('/api/bing-wallpaper');
        const data = await response.json();
        if (data.url) {
          setBingWallpaper(data.url);
        }
      } catch (error) {
        console.log('Failed to fetch Bing wallpaper:', error);
      }
    };

    fetchBingWallpaper();
  }, []);

  // 在客户端挂载后设置配置
  useEffect(() => {
    // Load remembered username
    if (typeof window !== 'undefined') {
      const rememberedUsername = localStorage.getItem('rememberedUsername');
      const rememberedPassword = localStorage.getItem('rememberedPassword');
      if (rememberedUsername) {
        setUsername(rememberedUsername);
        if (rememberedPassword) {
          setPassword(rememberedPassword);
        }
        setRememberMe(true); // Check remember me if username is found
      }
    }
    // 获取服务器配置
    fetch('/api/server-config')
      .then((res) => res.json())
      .then((data) => {
        setRegistrationEnabled(data.EnableRegistration || false);
        const isDbMode = data.StorageType && data.StorageType !== 'localstorage';
        setShouldAskUsername(isDbMode);

        const runtimeConfig = (window as any).RUNTIME_CONFIG;
        const requireDeviceCode = runtimeConfig?.REQUIRE_DEVICE_CODE;
        const effectiveDeviceCodeEnabled = requireDeviceCode !== false;
        setDeviceCodeEnabled(effectiveDeviceCodeEnabled);

        if (isDbMode && effectiveDeviceCodeEnabled && MachineCode.isSupported()) {
          MachineCode.generateMachineCode().then(setMachineCode).catch(console.error);
          MachineCode.getDeviceInfo().then(setDeviceInfo).catch(console.error);
          setMachineCodeGenerated(true);
        }

        setOauthEnabled(data.LinuxDoOAuth?.enabled || false);
        setTelegramAuthEnabled(data.TelegramAuth?.enabled || false);
        setTelegramBotName(data.TelegramAuth?.botName || '');
      })
      .catch(() => {
        setRegistrationEnabled(false);
        setShouldAskUsername(false);
        setOauthEnabled(false);
        setTelegramAuthEnabled(false);
        setTelegramBotName('');
      });

    // 检查 URL 参数中的成功消息和 OAuth 错误
    const message = searchParams.get('message');
    const oauthErrorParam = searchParams.get('oauth_error');

    if (message === 'registration-success') {
      setSuccessMessage('注册成功！请使用您的用户名和密码登录。');
    }

    if (oauthErrorParam) {
      setOauthError(decodeURIComponent(oauthErrorParam));
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setOauthError(null);

    if (!password || (shouldAskUsername && !username)) return;

    try {
      setLoading(true);
      const requestData: any = {
        password,
        ...(shouldAskUsername ? { username } : {}),
      };

      if (deviceCodeEnabled && (requireMachineCode || bindMachineCode) && machineCode) {
        requestData.machineCode = machineCode;
      }

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        // Save/clear remembered username and password
        if (rememberMe && username) {
          localStorage.setItem('rememberedUsername', username);
          localStorage.setItem('rememberedPassword', password);
        } else {
          localStorage.removeItem('rememberedUsername');
          localStorage.removeItem('rememberedPassword');
        }
        if (deviceCodeEnabled && bindMachineCode && machineCode && shouldAskUsername) {
          try {
            await fetch('/api/machine-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ machineCode, deviceInfo }),
            });
          } catch (bindError) {
            console.error('绑定机器码失败:', bindError);
          }
        }

        try {
          await fetch('/api/user/my-stats', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginTime: Date.now() }),
          });
        } catch (error) {
          console.log('记录登入时间失败:', error);
        }

        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } else {
        if (res.status === 403 && data.requireMachineCode) {
          setRequireMachineCode(true);
          setError('该账户已绑定设备，请验证设备码');
        } else {
          setError(data.error ?? '登录失败，请重试');
        }
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = () => {
    // 跳转到 OAuth 授权页面
    window.location.href = '/api/oauth/authorize';
  };

  // 新增：Telegram 登录按钮组件
  const TelegramLoginButton = ({ botName }: { botName: string }) => {
    useEffect(() => {
      // 创建并注入 Telegram 的官方 widget 脚本
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.async = true;
      script.setAttribute('data-telegram-login', botName);
      script.setAttribute('data-size', 'large'); // 按钮大小: small, medium, large

      // 这会告诉 Telegram 登录成功后，将浏览器重定向到我们的后端 API
      const callbackUrl = new URL(
        '/api/oauth/telegram/callback',
        window.location.origin,
      ).toString();
      script.setAttribute('data-auth-url', callbackUrl);
      script.setAttribute('data-request-access', 'write'); // 请求写入权限

      // 将脚本添加到容器中
      const container = document.getElementById('telegram-login-container');
      if (container) {
        // 清理旧脚本，防止重复渲染
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
        container.appendChild(script);
      }
    }, [botName]);

    // 这是 Telegram widget 脚本将要挂载的 DOM 节点
    return <div id='telegram-login-container'></div>;
  };

  return (
    <>
      <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
        {/* Bing 每日壁纸背景 */}
        {bingWallpaper && (
          <div
            className='absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 animate-ken-burns'
            style={{ backgroundImage: `url(${bingWallpaper})` }}
          />
        )}

        {/* 渐变叠加层 */}
        <div className='absolute inset-0 bg-gradient-to-br from-purple-600/40 via-blue-600/30 to-pink-500/40 dark:from-purple-900/50 dark:via-blue-900/40 dark:to-pink-900/50' />
        <div className='absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30' />

        <div className='absolute top-4 right-4 z-20'>
          <ThemeToggle />
        </div>

        {/* 主要登录卡片 */}
        <div
          className='
            relative z-10 w-full max-w-md rounded-3xl 
            bg-gradient-to-br from-white/95 via-white/85 to-white/75 
            dark:from-zinc-900/95 dark:via-zinc-900/85 dark:to-zinc-900/75 
            backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.3)] 
            dark:shadow-[0_20px_80px_rgba(0,0,0,0.6)] 
            p-10 border border-white/50 dark:border-zinc-700/50 
            animate-fade-in hover:shadow-[0_25px_100px_rgba(0,0,0,0.4)] 
            transition-shadow duration-500'
        >
          {/* 装饰性光效 */}
          <div className='absolute -top-20 -left-20 w-40 h-40 bg-gradient-to-br from-purple-400/30 to-pink-400/30 rounded-full blur-3xl animate-pulse' />
          <div
            className='absolute -bottom-20 -right-20 w-40 h-40 bg-gradient-to-br from-blue-400/30 to-cyan-400/30 rounded-full blur-3xl animate-pulse'
            style={{ animationDelay: '1s' }}
          />

          {/* 标题区域 */}
          <div className='text-center mb-8'>
            <div className='inline-flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/50 dark:shadow-green-500/30'>
              <Sparkles className='w-8 h-8 text-white' />
            </div>
            <h1 className='text-transparent bg-clip-text bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 dark:from-green-400 dark:via-emerald-400 dark:to-teal-400 tracking-tight text-4xl font-extrabold mb-2 drop-shadow-sm'>
              {siteName}
            </h1>
            <p className='text-gray-600 dark:text-gray-400 text-sm font-medium'>
              欢迎回来，请登录您的账户
            </p>
          </div>

          <form onSubmit={handleSubmit} className='space-y-6'>
            {shouldAskUsername && (
              <div className='group'>
                <label
                  htmlFor='username'
                  className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'
                >
                  用户名
                </label>
                <div className='relative'>
                  <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                    <User className='h-5 w-5 text-gray-400 dark:text-gray-500 group-focus-within:text-green-500 transition-colors' />
                  </div>
                  <input
                    id='username'
                    type='text'
                    autoComplete='username'
                    className='block w-full pl-12 pr-4 py-3.5 rounded-xl border-0 text-gray-900 dark:text-gray-100 shadow-sm ring-2 ring-white/60 dark:ring-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:outline-none sm:text-base bg-white/80 dark:bg-zinc-800/80 backdrop-blur transition-all duration-300 hover:shadow-md'
                    placeholder='请输入用户名'
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className='group'>
              <label
                htmlFor='password'
                className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'
              >
                密码
              </label>
              <div className='relative'>
                <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                  <Lock className='h-5 w-5 text-gray-400 dark:text-gray-500 group-focus-within:text-green-500 transition-colors' />
                </div>
                <input
                  id='password'
                  type={showPassword ? 'text' : 'password'}
                  autoComplete='current-password'
                  className='block w-full pl-12 pr-12 py-3.5 rounded-xl border-0 text-gray-900 dark:text-gray-100 shadow-sm ring-2 ring-white/60 dark:ring-white/10 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:outline-none sm:text-base bg-white/80 dark:bg-zinc-800/80 backdrop-blur transition-all duration-300 hover:shadow-md'
                  placeholder='请输入访问密码'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className='absolute inset-y-0 right-0 pr-4 flex items-center text-sm leading-5'>
                  <button
                    type='button'
                    onClick={() => setShowPassword(!showPassword)}
                    className='text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 focus:outline-none'
                  >
                    {showPassword ? (
                      <EyeOff className='h-5 w-5' />
                    ) : (
                      <Eye className='h-5 w-5' />
                    )}
                  </button>
                </div>
              </div>
            </div>
            {/* Remember Me Checkbox */}
            <div className='flex items-center justify-between'>
              <div className='flex items-center'>
                <input
                  id='remember-me'
                  name='remember-me'
                  type='checkbox'
                  className='hidden peer'
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label
                  htmlFor='remember-me'
                  className='flex items-center cursor-pointer'
                >
                  <div className='w-4 h-4 border-2 border-gray-300 dark:border-gray-600 rounded flex items-center justify-center peer-checked:bg-green-500 peer-checked:border-green-500 transition-all duration-200'>
                    {rememberMe && <span className='text-white text-xs'>✓</span>}
                  </div>
                  <span className='ml-2 text-sm text-gray-600 dark:text-gray-400'>
                    记住我
                  </span>
                </label>
              </div>
            </div>

            {/* 机器码信息显示与绑定选项 */}
            {deviceCodeEnabled && machineCodeGenerated && shouldAskUsername && (
              <div className='space-y-4 pt-2'>
                <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4 transition-all animate-fade-in'>
                  <div className='flex items-center space-x-2 mb-2'>
                    <Shield className='w-4 h-4 text-blue-600 dark:text-blue-400' />
                    <span className='text-sm font-medium text-blue-800 dark:text-blue-300'>
                      设备识别码
                    </span>
                  </div>
                  <div className='space-y-2'>
                    <div className='text-xs font-mono text-gray-700 dark:text-gray-300 break-all p-2 bg-white/50 dark:bg-black/20 rounded-md'>
                      {MachineCode.formatMachineCode(machineCode)}
                    </div>
                    <div className='text-xs text-gray-600 dark:text-gray-400'>
                      {deviceInfo}
                    </div>
                  </div>
                </div>

                {!requireMachineCode && (
                  <div className='flex items-center space-x-3 pl-2'>
                    <input
                      id='bindMachineCode'
                      type='checkbox'
                      checked={bindMachineCode}
                      onChange={(e) => setBindMachineCode(e.target.checked)}
                      className='w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 dark:focus:ring-green-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer'
                    />
                    <label
                      htmlFor='bindMachineCode'
                      className='text-sm text-gray-700 dark:text-gray-300 cursor-pointer'
                    >
                      登录并绑定此设备
                    </label>
                  </div>
                )}
              </div>
            )}

            {successMessage && (
              <div className='flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 animate-slide-down'>
                <CheckCircle className='h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0' />
                <p className='text-sm text-green-600 dark:text-green-400'>
                  {successMessage}
                </p>
              </div>
            )}

            {oauthError && (
              <div className='flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 animate-slide-down'>
                <AlertCircle className='h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0' />
                <p className='text-sm text-red-600 dark:text-red-400'>{oauthError}</p>
              </div>
            )}

            {error && (
              <div
                className={`flex items-start gap-3 p-3 rounded-lg border animate-slide-down ${
                  error.includes('审核中')
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800/50'
                    : error.includes('被拒绝')
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50'
                    : error.includes('被封禁')
                    ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-300 dark:border-gray-700/50'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50'
                }`}
              >
                <AlertCircle
                  className={`h-5 w-5 flex-shrink-0 ${
                    error.includes('审核中')
                      ? 'text-amber-500 dark:text-amber-400'
                      : error.includes('被拒绝')
                      ? 'text-red-600 dark:text-red-400'
                      : error.includes('被封禁')
                      ? 'text-gray-500 dark:text-gray-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                />
                <div>
                  <p
                    className={`text-sm font-medium ${
                      error.includes('审核中')
                        ? 'text-amber-800 dark:text-amber-300'
                        : error.includes('被拒绝')
                        ? 'text-red-700 dark:text-red-300'
                        : error.includes('被封禁')
                        ? 'text-gray-700 dark:text-gray-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}
                  >
                    {error}
                  </p>
                  {error.includes('审核中') && (
                    <p className='text-xs text-amber-600 dark:text-amber-400 mt-1'>
                      您的注册申请已提交，管理员将会尽快处理。
                    </p>
                  )}
                  {error.includes('被拒绝') && (
                    <p className='text-xs text-red-600 dark:text-red-400 mt-1'>
                      您的注册申请已被拒绝，如有疑问请联系管理员。
                    </p>
                  )}
                  {error.includes('被封禁') && (
                    <p className='text-xs text-gray-600 dark:text-gray-400 mt-1'>
                      您的账户已被封禁，如有疑问请联系管理员。
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 登录按钮 */}
            <button
              type='submit'
              disabled={!password || loading || (shouldAskUsername && !username)}
              className='group relative inline-flex w-full justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 py-3.5 text-base font-semibold text-white shadow-lg shadow-green-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-lg overflow-hidden'
            >
              <span className='absolute inset-0 w-full h-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000' />
              <Lock className='h-5 w-5' />
              {loading ? '登录中...' : '立即登录'}
            </button>

            {/* 其他登录方式 */}
            {(oauthEnabled || telegramAuthEnabled) && (
              <>
                <div className='flex items-center'>
                  <div className='flex-1 border-t border-gray-200 dark:border-gray-700'></div>
                  <div className='px-3 text-sm text-gray-500 dark:text-gray-400'>
                    或者
                  </div>
                  <div className='flex-1 border-t border-gray-200 dark:border-gray-700'></div>
                </div>

                {/* LinuxDo OAuth 登录按钮 */}
                {oauthEnabled && (
                  <button
                    type='button'
                    onClick={handleOAuthLogin}
                    className='group relative inline-flex w-full justify-center items-center gap-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 py-3.5 text-base font-semibold text-white shadow-lg shadow-green-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-0.5'
                  >
                    <svg
                      className='w-5 h-5'
                      viewBox='0 0 24 24'
                      fill='currentColor'
                    >
                      <path
                        d='M12 2L2 7L12 12L22 7L12 2ZM2 17L12 22L22 17M2 12L12 17L22 12'
                        stroke='currentColor'
                        strokeWidth='2'
                        fill='none'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                      />
                    </svg>
                    使用 LinuxDo 登录
                  </button>
                )}

                {/* Telegram 登录按钮 */}
                {telegramAuthEnabled && telegramBotName && (
                  <div className='flex justify-center'>
                    <TelegramLoginButton
                      botName={telegramBotName.replace(/^@/, '')}
                    />
                  </div>
                )}
              </>
            )}

            {/* 注册链接 - 仅在非 localStorage 模式下显示 */}
            {registrationEnabled && shouldAskUsername && (
              <div className='mt-6 pt-6 border-t border-gray-200 dark:border-gray-700'>
                <p className='text-center text-gray-600 dark:text-gray-400 text-sm mb-3'>
                  还没有账户？
                </p>
                <button
                  type='button'
                  onClick={() => router.push('/register')}
                  className='group flex items-center justify-center gap-2 w-full px-6 py-2.5 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400 text-sm font-semibold hover:from-green-100 hover:to-emerald-100 dark:hover:from-green-900/30 dark:hover:to-emerald-900/30 hover:border-green-300 dark:hover:border-green-700 transition-all duration-300 hover:shadow-md hover:scale-[1.02] active:scale-100'
                >
                  <UserPlus className='w-4 h-4' />
                  <span>立即注册</span>
                  <span className='inline-block transition-transform group-hover:translate-x-1'>
                    →
                  </span>
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* 版本信息显示 */}
      <VersionDisplay />
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageClient />
    </Suspense>
  );
}
