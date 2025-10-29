// src/app/api/shortdrama/latest/route.ts

import { NextRequest, NextResponse } from 'next/server';

// --- Configuration (Inspired by Project B's API_CONFIG) ---
const API_CONFIG = {
  shortdrama: {
    // Using the more specific base URL from Project B
    baseUrl:
      process.env.SHORT_DRAMA_API_URL || 'https://api.tianlong.shop/api.php',
    headers: {
      'Content-Type': 'application/json',
      // Add any other required headers here
    },
  },
};

// --- Type Definitions (Combining richness from B with safety from A) ---

// Raw data from the upstream API
interface RawShortDramaItem {
  id?: string | number; // Project B's API might have 'id'
  vod_id: number;
  vod_name: string;
  vod_pic: string;
  vod_time: string;
  vod_score?: string | number;
  vod_douban_score?: string | number;
  vod_total?: string | number;
  vod_class?: string;
  vod_tag?: string;
}

// Our clean, normalized data structure for the frontend
interface NormalizedShortDramaItem {
  id: string;
  vod_id: number;
  title: string;
  poster: string;
  update_time: string;
  score: number;
  total_episodes: string;
  category: string;
  tags: string;
}

// --- Data Transformation (Adopting B's richer mapping) ---
function transformData(item: RawShortDramaItem): NormalizedShortDramaItem {
  return {
    id: item.id?.toString() || item.vod_id.toString(),
    vod_id: item.vod_id,
    title: item.vod_name || '未知短剧',
    poster: item.vod_pic || 'https://via.placeholder.com/300x400',
    update_time: item.vod_time || new Date().toISOString(),
    score:
      parseFloat(
        (item.vod_score || item.vod_douban_score || 0).toString(),
      ) || 0,
    total_episodes: (item.vod_total || '未知').toString(),
    category: item.vod_class || '其他',
    tags: item.vod_tag || '',
  };
}

// --- Graceful Fallback (Key feature from Project B) ---
function generateMockData(): NormalizedShortDramaItem[] {
  return Array.from({ length: 20 }, (_, index) => {
    const classOptions = ['都市情感', '古装宫廷', '现代言情', '豪门世家', '职场励志'];
    const tagOptions = [ '甜宠,霸总', '穿越,宫斗', '复仇,虐渣', '重生,逆袭', '家庭,伦理'];
    const id = 100 + index;
    return {
      id: `mock_${id}`,
      vod_id: id,
      title: `最新推荐短剧 ${index + 1}`,
      poster: `https://picsum.photos/seed/${id}/300/400`, // More visually appealing mock images
      update_time: new Date(Date.now() - index * 3600 * 1000).toISOString(),
      score: parseFloat((Math.random() * 3 + 7).toFixed(1)), // 7.0-10.0
      total_episodes: `${Math.floor(Math.random() * 40) + 60}`, // 60-100 episodes
      category: classOptions[index % classOptions.length],
      tags: tagOptions[index % tagOptions.length],
    };
  });
}

/**
 * @description 获取最新的短剧列表，支持分页和数量限制
 * @param request NextRequest 对象
 * @returns 返回一个包含最新短剧列表的JSON响应。如果上游API失败，则返回高质量的模拟数据。
 * @example
 * // 获取第一页，每页20条 (默认)
 * fetch('/api/shortdrama/latest')
 * // 获取第二页，每页10条
 * fetch('/api/shortdrama/latest?page=2&limit=10')
 */
export async function GET(request: NextRequest) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second timeout

  try {
    const { searchParams } = new URL(request.url);

    // 1. **参数校验与处理 (Robust handling from A, flexible params from B)**
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '20';

    // Construct the API URL using the endpoint from Project B
    const apiUrl = new URL(`${API_CONFIG.shortdrama.baseUrl}/vod/latest`);
    apiUrl.searchParams.append('page', page);
    apiUrl.searchParams.append('limit', limit);

    // 2. **数据获取 (with Timeout from B and Caching from A)**
    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: API_CONFIG.shortdrama.headers,
      signal: controller.signal,
      next: {
        // Retains high-performance server-side caching
        revalidate: 3600, // Cache for 1 hour
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Upstream API request failed: ${response.status} ${response.statusText}`);
    }

    const externalData = await response.json();

    // 3. **数据校验 (Safe handling from A)**
    if (!externalData || !Array.isArray(externalData.list)) {
      throw new Error('Invalid response format from external API');
    }

    // 4. **数据转换和规范化 (Using B's rich model)**
    const transformedData = externalData.list.map(transformData);

    // 5. **返回成功的响应 (Consistent structure from A)**
    return NextResponse.json({
      success: true,
      message: 'Successfully fetched latest short dramas.',
      data: transformedData,
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('[API CATCH] /api/shortdrama/latest:', error.message);

    // 6. **优雅降级：返回模拟数据 (Brilliant fallback from B)**
    const mockData = generateMockData();
    return NextResponse.json({
      success: true, // We return success=true because we are providing valid fallback data
      message: 'Upstream API failed. Serving fallback data.',
      data: mockData,
    });
  }
}
