/** @type {import('next').NextConfig} */
/* eslint-disable @typescript-eslint/no-var-requires */

const nextConfig = {
  output: 'standalone',
  eslint: {
    dirs: ['src'],
    ignoreDuringBuilds: true,
  },

  reactStrictMode: false,
  // 使用 SWC 进行代码压缩，性能优于 Terser
  swcMinify: true,
  // 显式启用 Gzip 压缩
  compress: true,
  // 禁用 x-powered-by 头，提升安全性
  poweredByHeader: false,
  // 禁用 ETag 生成，适用于 CDN 或反向代理环境
  generateEtags: false,

  experimental: {
    // instrumentationHook 配置
    instrumentationHook: process.env.NODE_ENV === 'production',
    // 启用服务端代码压缩，优化 serverless function 性能
    serverMinification: true,
  },

  // Uncoment to add domain whitelist
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },

  webpack(config, { dev, isServer }) {
    // Grab the existing rule that handles SVG imports
    const fileLoaderRule = config.module.rules.find((rule) =>
      rule.test?.test?.('.svg')
    );

    config.module.rules.push(
      // Reapply the existing rule, but only for svg imports ending in ?url
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/, // *.svg?url
      },
      // Convert all other *.svg imports to React components
      {
        test: /\.svg$/i,
        issuer: { not: /\.(css|scss|sass)$/ },
        resourceQuery: { not: /url/ }, // exclude if *.svg?url
        loader: '@svgr/webpack',
        options: {
          dimensions: false,
          titleProp: true,
        },
      }
    );

    // Modify the file loader rule to ignore *.svg, since we have it handled now. 
    fileLoaderRule.exclude = /\.svg$/i;

    // --- Webpack路径别名和模块解析 ---
    const path = require('path');
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
      '~': path.resolve(__dirname, 'public'),
    };
    config.resolve.extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', ...config.resolve.extensions];
    config.resolve.modules = [
      path.resolve(__dirname, 'src'),
      'node_modules',
      ...config.resolve.modules,
    ];

    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false,
      tls: false,
      crypto: false,
    };

    // 生产环境代码保护
    if (!dev) {
      config.optimization.minimizer.forEach((plugin) => {
        if (plugin.constructor.name === 'TerserPlugin') {
          plugin.options.terserOptions = {
            ...plugin.options.terserOptions,
            compress: {
              drop_console: true,
              drop_debugger: true,
            },
            format: {
              comments: false,
            },
          };
        }
      });
    }

    // 针对 Electron 环境的服务端构建优化
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'artplayer': 'commonjs artplayer',
        'hls.js': 'commonjs hls.js',
        'artplayer-plugin-danmuku': 'commonjs artplayer-plugin-danmuku',
      });
    }

    return config;
  },
};

// 使用更现代的 PWA 库 @ducanh2912/next-pwa
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  // 显式声明
  register: true,
  skipWaiting: true,
  // PWA 增强功能
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  workboxOptions: {
    disableDevLogs: true,
  },
});

module.exports = withPWA(nextConfig);

