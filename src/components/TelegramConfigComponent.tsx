// src/components/TelegramConfigComponent.tsx (新建)

'use client';

import { useEffect, useState } from 'react';
import { AdminConfig } from '@/lib/admin.types';
import { buttonStyles, AlertModal, useAlertModal, useLoadingState, showError, showSuccess } from '@/hooks/useAdminComponents';

// 假设 buttonStyles 和 useAlertModal, useLoadingState 已被定义或导入
// ...

interface TelegramConfigComponentProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const TelegramConfigComponent = ({ config, refreshConfig }: TelegramConfigComponentProps) => {
  const { alertModal, showAlert, hideAlert } = useAlertModal();
  const { isLoading, withLoading } = useLoadingState();
  const [telegramSettings, setTelegramSettings] = useState({
    enabled: false,
    autoRegister: false,
    botName: '',
    botToken: '',
    defaultRole: 'user' as 'user' | 'admin',
  });

  useEffect(() => {
    if (config?.SiteConfig.TelegramAuth) {
      const auth = config.SiteConfig.TelegramAuth;
      setTelegramSettings({
        enabled: auth.enabled,
        autoRegister: auth.autoRegister,
        botName: auth.botName,
        botToken: auth.botToken || '',
        defaultRole: auth.defaultRole,
      });
    }
  }, [config]);

  const handleSave = async () => {
    await withLoading('saveTelegramConfig', async () => {
      try {
        const response = await fetch('/api/admin/telegram', { // 假设这是新的API端点
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(telegramSettings),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || '保存失败');
        }
        showAlert({ type: 'success', title: '成功', message: 'Telegram 配置已保存', timer: 2000 });
        await refreshConfig();
      } catch (error) {
        showAlert({ type: 'error', title: '错误', message: '保存配置失败: ' + (error as Error).message, showConfirm: true });
        throw error;
      }
    });
  };

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
          Telegram 登录配置
        </h3>
        <button
          onClick={handleSave}
          disabled={isLoading('saveTelegramConfig')}
          className={isLoading('saveTelegramConfig') ? buttonStyles.disabled : buttonStyles.success}
        >
          {isLoading('saveTelegramConfig') ? '保存中...' : '保存配置'}
        </button>
      </div>

      <div className='space-y-4'>
        <div className='flex items-center space-x-3'>
          <input type="checkbox" id="telegram-enabled" checked={telegramSettings.enabled} onChange={(e) => setTelegramSettings(p => ({ ...p, enabled: e.target.checked }))} />
          <label htmlFor="telegram-enabled">启用 Telegram 登录</label>
        </div>
        <div className='flex items-center space-x-3'>
          <input type="checkbox" id="telegram-auto-register" checked={telegramSettings.autoRegister} onChange={(e) => setTelegramSettings(p => ({ ...p, autoRegister: e.target.checked }))} />
          <label htmlFor="telegram-auto-register">自动注册新用户</label>
        </div>
      </div>

      <div className='space-y-4'>
        <div>
          <label className='block text-sm font-medium'>Bot 用户名 *</label>
          <input type='text' value={telegramSettings.botName} onChange={(e) => setTelegramSettings(p => ({...p, botName: e.target.value.replace(/^@/, '')}))} placeholder='your_bot_name (不含@)' className='w-full input-class' />
        </div>
        <div>
          <label className='block text-sm font-medium'>Bot Token *</label>
          <input type='password' value={telegramSettings.botToken} onChange={(e) => setTelegramSettings(p => ({...p, botToken: e.target.value}))} placeholder='你的 Bot Token' className='w-full input-class' />
        </div>
        <div>
          <label className='block text-sm font-medium'>默认用户角色</label>
          <select value={telegramSettings.defaultRole} onChange={(e) => setTelegramSettings(p => ({...p, defaultRole: e.target.value as any}))} className='w-full input-class'>
            <option value='user'>普通用户</option>
            <option value='admin'>管理员</option>
          </select>
        </div>
      </div>
      
      <AlertModal onClose={hideAlert} {...alertModal} />
    </div>
  );
};

export default TelegramConfigComponent;
