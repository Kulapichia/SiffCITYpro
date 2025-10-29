/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_CMS_VIDEO_SOURCES } from '@/lib/default-video-sources';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 支持的操作类型
type Action =
  | 'add'
  | 'disable'
  | 'enable'
  | 'delete'
  | 'sort'
  | 'batch_disable'
  | 'batch_enable'
  | 'batch_delete'
  | 'update_check_results'
  | 'batch_delete_invalid'
  | 'batch_import'
  | 'edit'
  | 'import_defaults';

interface BaseBody {
  action?: Action;
}

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const body = (await request.json()) as BaseBody & Record<string, any>;
    const { action } = body;

    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username;

    // 基础校验
    const ACTIONS: Action[] = [
      'add',
      'disable',
      'enable',
      'delete',
      'sort',
      'batch_disable',
      'batch_enable',
      'batch_delete',
      'update_check_results',
      'batch_delete_invalid',
      'batch_import',
      'edit',
    ];
    if (!username || !action || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    // 获取配置与存储
    const adminConfig = await getConfig();

    // 权限与身份校验
    if (username !== process.env.USERNAME) {
      const userEntry = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!userEntry || userEntry.role !== 'admin' || userEntry.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    switch (action) {
      case 'add': {
        const { key, name, api, detail } = body as {
          key?: string;
          name?: string;
          api?: string;
          detail?: string;
        };
        if (!key || !name || !api) {
          return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
        }
        if (adminConfig.SourceConfig.some((s) => s.key === key)) {
          return NextResponse.json({ error: '该源已存在' }, { status: 400 });
        }
        adminConfig.SourceConfig.push({
          key,
          name,
          api,
          detail,
          from: 'custom',
          disabled: false,
        });
        break;
      }
      case 'disable': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const entry = adminConfig.SourceConfig.find((s) => s.key === key);
        if (!entry)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        entry.disabled = true;
        break;
      }
      case 'enable': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const entry = adminConfig.SourceConfig.find((s) => s.key === key);
        if (!entry)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        entry.disabled = false;
        break;
      }
      case 'edit': {
        const { key, name, api, detail } = body as {
          key?: string;
          name?: string;
          api?: string;
          detail?: string;
        };
        if (!key || !name || !api) {
          return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
        }
        const entry = adminConfig.SourceConfig.find((s) => s.key === key);
        if (!entry) {
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        }
        // 更新字段（除了 key 和 from）
        entry.name = name;
        entry.api = api;
        entry.detail = detail || '';
        break;
      }
      case 'delete': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const idx = adminConfig.SourceConfig.findIndex((s) => s.key === key);
        if (idx === -1)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        const entry = adminConfig.SourceConfig[idx];
        if (entry.from === 'config') {
          return NextResponse.json({ error: '该源不可删除' }, { status: 400 });
        }
        adminConfig.SourceConfig.splice(idx, 1);

        // 检查并清理用户组和用户的权限数组
        // 清理用户组权限
        if (adminConfig.UserConfig.Tags) {
          adminConfig.UserConfig.Tags.forEach((tag) => {
            if (tag.enabledApis) {
              tag.enabledApis = tag.enabledApis.filter((api) => api !== key);
            }
          });
        }

        // 清理用户权限
        adminConfig.UserConfig.Users.forEach((user) => {
          if (user.enabledApis) {
            user.enabledApis = user.enabledApis.filter((api) => api !== key);
          }
        });
        break;
      }
      case 'batch_disable': {
        const { keys } = body as { keys?: string[] };
        if (!Array.isArray(keys) || keys.length === 0) {
          return NextResponse.json(
            { error: '缺少 keys 参数或为空' },
            { status: 400 }
          );
        }
        keys.forEach((key) => {
          const entry = adminConfig.SourceConfig.find((s) => s.key === key);
          if (entry) {
            entry.disabled = true;
          }
        });
        break;
      }
      case 'batch_enable': {
        const { keys } = body as { keys?: string[] };
        if (!Array.isArray(keys) || keys.length === 0) {
          return NextResponse.json(
            { error: '缺少 keys 参数或为空' },
            { status: 400 }
          );
        }
        keys.forEach((key) => {
          const entry = adminConfig.SourceConfig.find((s) => s.key === key);
          if (entry) {
            entry.disabled = false;
          }
        });
        break;
      }
      case 'batch_delete': {
        const { keys } = body as { keys?: string[] };
        if (!Array.isArray(keys) || keys.length === 0) {
          return NextResponse.json(
            { error: '缺少 keys 参数或为空' },
            { status: 400 }
          );
        }
        // 过滤掉 from=config 的源，但不报错
        const keysToDelete = keys.filter((key) => {
          const entry = adminConfig.SourceConfig.find((s) => s.key === key);
          return entry && entry.from !== 'config';
        });

        // 批量删除
        keysToDelete.forEach((key) => {
          const idx = adminConfig.SourceConfig.findIndex((s) => s.key === key);
          if (idx !== -1) {
            adminConfig.SourceConfig.splice(idx, 1);
          }
        });

        // 检查并清理用户组和用户的权限数组
        if (keysToDelete.length > 0) {
          // 清理用户组权限
          if (adminConfig.UserConfig.Tags) {
            adminConfig.UserConfig.Tags.forEach((tag) => {
              if (tag.enabledApis) {
                tag.enabledApis = tag.enabledApis.filter(
                  (api) => !keysToDelete.includes(api)
                );
              }
            });
          }

          // 清理用户权限
          adminConfig.UserConfig.Users.forEach((user) => {
            if (user.enabledApis) {
              user.enabledApis = user.enabledApis.filter(
                (api) => !keysToDelete.includes(api)
              );
            }
          });
        }
        break;
      }
      case 'sort': {
        const { order } = body as { order?: string[] };
        if (!Array.isArray(order)) {
          return NextResponse.json(
            { error: '排序列表格式错误' },
            { status: 400 }
          );
        }
        const map = new Map(adminConfig.SourceConfig.map((s) => [s.key, s]));
        const newList: typeof adminConfig.SourceConfig = [];
        order.forEach((k) => {
          const item = map.get(k);
          if (item) {
            newList.push(item);
            map.delete(k);
          }
        });
        // 未在 order 中的保持原顺序
        adminConfig.SourceConfig.forEach((item) => {
          if (map.has(item.key)) newList.push(item);
        });
        adminConfig.SourceConfig = newList;
        break;
      }
      case 'update_check_results': {
        const { results } = body as {
          results?: {
            key: string;
            status: any;
            latency: number;
          }[];
        };
        if (!Array.isArray(results)) {
          return NextResponse.json(
            { error: '缺少 results 参数' },
            { status: 400 }
          );
        }
        const timestamp = Date.now();
        results.forEach((result) => {
          const entry = adminConfig.SourceConfig.find(
            (s) => s.key === result.key
          );
          if (entry) {
            entry.lastCheck = {
              status: result.status,
              latency: result.latency,
              timestamp,
            };
          }
        });
        break;
      }
      case 'batch_delete_invalid': {
        adminConfig.SourceConfig = adminConfig.SourceConfig.filter((entry) => {
          const isCustom = entry.from === 'custom';
          const isInvalid =
            entry.lastCheck &&
            (entry.lastCheck.status === 'invalid' ||
              entry.lastCheck.status === 'timeout' ||
              entry.lastCheck.status === 'unreachable');
          
          // 仅当是自定义源且无效时才删除
          return !(isCustom && isInvalid);
        });
        break;
      }
      case 'import_defaults': {
        const existingKeys = new Set(adminConfig.SourceConfig.map(s => s.key));
        let addedCount = 0;
        let skippedCount = 0;

        DEFAULT_CMS_VIDEO_SOURCES.forEach(source => {
          if (!existingKeys.has(source.key)) {
            adminConfig.SourceConfig.push({ ...source });
            existingKeys.add(source.key);
            addedCount++;
          } else {
            skippedCount++;
          }
        });
        
        // 此处直接保存并返回
        await db.saveAdminConfig(adminConfig);
        return NextResponse.json({ 
          message: `默认源导入完成！成功添加 ${addedCount} 个源，跳过 ${skippedCount} 个重复源。`
        });
      }
      case 'batch_import': {
        const { sources: sourcesToImport } = body;
        if (!Array.isArray(sourcesToImport) || sourcesToImport.length === 0) {
          return NextResponse.json({ error: '导入的数据无效' }, { status: 400 });
        }

        const existingKeys = new Set(adminConfig.SourceConfig.map(s => s.key));
        let addedCount = 0;
        let skippedCount = 0;

        for (const source of sourcesToImport) {
          if (
            !source.key ||
            !source.name ||
            !source.api ||
            typeof source.key !== 'string' ||
            typeof source.name !== 'string' ||
            typeof source.api !== 'string'
          ) {
            skippedCount++;
            continue; // 跳过格式不正确的数据
          }

          if (existingKeys.has(source.key)) {
            skippedCount++;
            continue; // 跳过重复的 Key
          }

          adminConfig.SourceConfig.push({
            name: source.name,
            key: source.key,
            api: source.api,
            detail: source.detail || '',
            from: 'custom',
            disabled: source.disabled || false,
          });
          existingKeys.add(source.key);
          addedCount++;
        }
        
        // 此处直接保存并返回，不走 switch 后的统一保存
        await db.saveAdminConfig(adminConfig);
        return NextResponse.json({ 
          message: `导入完成！成功添加 ${addedCount} 个源，跳过 ${skippedCount} 个（重复或格式错误）。`
        });
      }
      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }

    // 持久化到存储
    await db.saveAdminConfig(adminConfig);
    
    // 清除配置缓存，强制下次重新从数据库读取
    clearConfigCache();

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('视频源管理操作失败:', error);
    return NextResponse.json(
      {
        error: '视频源管理操作失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
