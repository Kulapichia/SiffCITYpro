// src/lib/config.shared.ts
/* eslint-disable @typescript-eslint/no-explicit-any, no-console, @typescript-eslint/no-non-null-assertion */

/**
 * 这个文件只包含客户端和服务器端都可以安全共享的配置。
 * 它绝对不能导入任何只在服务器端运行的模块（例如 'db.ts'）。
 */

export const API_CONFIG = {
  search: {
    path: '?ac=videolist&wd=',
    pagePath: '?ac=videolist&wd={query}&pg={page}',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
  detail: {
    path: '?ac=videolist&ids=',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
  shortdrama: {
    baseUrl: 'https://api.r2afosne.dpdns.org',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'MoonTV/1.0',
    },
  },
};
