/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getEdgeCacheTime } from '@/lib/edge-config';
import { fetchDoubanData } from '@/lib/douban';
import { RawDoubanItemSchema } from '@/lib/schemas';
import { DoubanResult } from '@/lib/types';

interface DoubanRecommendApiResponse {
  total: number;
  items: Array<{
    id: string;
    title: string;
    year: string;
    type: string;
    pic: {
      large: string;
      normal: string;
    };
    rating: {
      value: number;
    };
  }>;
}

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // 获取参数
  const kind = searchParams.get('kind');
  const pageLimit = parseInt(searchParams.get('limit') || '20');
  const pageStart = parseInt(searchParams.get('start') || '0');
  const category =
    searchParams.get('category') === 'all' ? '' : searchParams.get('category');
  const format =
    searchParams.get('format') === 'all' ? '' : searchParams.get('format');
  const region =
    searchParams.get('region') === 'all' ? '' : searchParams.get('region');
  const year =
    searchParams.get('year') === 'all' ? '' : searchParams.get('year');
  const platform =
    searchParams.get('platform') === 'all' ? '' : searchParams.get('platform');
  const sort = searchParams.get('sort') === 'T' ? '' : searchParams.get('sort');
  const label =
    searchParams.get('label') === 'all' ? '' : searchParams.get('label');

  if (!kind) {
    return NextResponse.json({ error: '缺少必要参数: kind' }, { status: 400 });
  }

  const selectedCategories = { 类型: category } as any;
  if (format) {
    selectedCategories['形式'] = format;
  }
  if (region) {
    selectedCategories['地区'] = region;
  }

  const tags = [] as Array<string>;
  if (category) {
    tags.push(category);
  }
  if (!category && format) {
    tags.push(format);
  }
  if (label) {
    tags.push(label);
  }
  if (region) {
    tags.push(region);
  }
  if (year) {
    tags.push(year);
  }
  if (platform) {
    tags.push(platform);
  }

  const baseUrl = `https://m.douban.com/rexxar/api/v2/${kind}/recommend`;
  const params = new URLSearchParams();
  params.append('refresh', '0');
  params.append('start', pageStart.toString());
  params.append('count', pageLimit.toString());
  params.append('selected_categories', JSON.stringify(selectedCategories));
  params.append('uncollect', 'false');
  params.append('score_range', '0,10');
  params.append('tags', tags.join(','));
  if (sort) {
    params.append('sort', sort);
  }

  const target = `${baseUrl}?${params.toString()}`;
  console.log(target);
  try {
    const doubanData = await fetchDoubanData<DoubanRecommendApiResponse>(
      target
    );
    
    const list = (doubanData.items || [])
      .filter((item: any) => item.type === 'movie' || item.type === 'tv')
      .flatMap((item: any) => {
        try {
          // 1. 使用 Zod 验证原始数据
          const parsedItem = RawDoubanItemSchema.parse(item);

          // 2. 如果验证通过，安全地进行转换
          return [{
            id: parsedItem.id,
            title: parsedItem.title,
            poster: parsedItem.pic?.normal || parsedItem.pic?.large || '',
            rate: parsedItem.rating?.value ? parsedItem.rating.value.toFixed(1) : '',
            year: parsedItem.year || '',
          }];
        } catch (error) {
          // 3. 如果验证失败，打印详细的Zod错误并跳过此项
          console.error('[Zod Validation Error] Skipping invalid Douban recommend item. Details:', JSON.stringify(error, null, 2));
          console.error('[Zod Validation Error] Original item data:', JSON.stringify(item, null, 2));
          return []; // flatMap 会将空数组自动移除
        }
      });
    
    const response: DoubanResult = {
      code: 200,
      message: '获取成功',
      list: list,
    };

    const cacheTime = getEdgeCacheTime();
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Netlify-Vary': 'query',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: '获取豆瓣数据失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}
