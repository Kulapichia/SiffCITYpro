import { NextResponse } from 'next/server';

import { getEdgeCacheTime } from '@/lib/edge-config';
import { fetchDoubanData } from '@/lib/douban';
import { RawDoubanItemSchema } from '@/lib/schemas';
import { DoubanItem, DoubanResult } from '@/lib/types';

interface DoubanCategoryApiResponse {
  total: number;
  items: Array<any>;
}

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // 获取参数
  const kind = searchParams.get('kind') || 'movie';
  const category = searchParams.get('category');
  const type = searchParams.get('type');
  const pageLimit = parseInt(searchParams.get('limit') || '20');
  const pageStart = parseInt(searchParams.get('start') || '0');

  // 验证参数
  if (!kind || !category || !type) {
    return NextResponse.json(
      { error: '缺少必要参数: kind 或 category 或 type' },
      { status: 400 }
    );
  }

  if (!['tv', 'movie'].includes(kind)) {
    return NextResponse.json(
      { error: 'kind 参数必须是 tv 或 movie' },
      { status: 400 }
    );
  }

  if (pageLimit < 1 || pageLimit > 100) {
    return NextResponse.json(
      { error: 'pageSize 必须在 1-100 之间' },
      { status: 400 }
    );
  }

  if (pageStart < 0) {
    return NextResponse.json(
      { error: 'pageStart 不能小于 0' },
      { status: 400 }
    );
  }

  const target = `https://m.douban.com/rexxar/api/v2/subject/recent_hot/${kind}?start=${pageStart}&limit=${pageLimit}&category=${category}&type=${type}`;

  try {
    console.log(`[豆瓣分类] 请求URL: ${target}`);
    
    // 调用公共库中更健壮的豆瓣 API 请求函数
    const doubanData = await fetchDoubanData<DoubanCategoryApiResponse>(target);
    
    console.log(`[豆瓣分类] 成功获取数据，项目数: ${doubanData.items?.length || 0}`);

    // 使用 flatMap 进行安全转换和过滤
    const list: DoubanItem[] = (doubanData.items || []).flatMap((item: any) => {
      try {
        // 1. 使用 Zod 验证原始数据
        const parsedItem = RawDoubanItemSchema.parse(item);
        
        // 2. 如果验证通过，安全地进行转换
        return [{
          id: parsedItem.id,
          title: parsedItem.title,
          poster: parsedItem.pic?.normal || parsedItem.pic?.large || '',
          rate: parsedItem.rating?.value ? parsedItem.rating.value.toFixed(1) : '',
          year: parsedItem.card_subtitle?.match(/(\d{4})/)?.[1] || '',
        }];
      } catch (error) {
        // 3. 如果验证失败，打印错误并跳过此项
        console.error('Skipping invalid Douban category item:', item, error);
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
    console.error(`[豆瓣分类] 请求失败: ${target}`, (error as Error).message);
    return NextResponse.json(
      { 
        error: '获取豆瓣数据失败', 
        details: (error as Error).message,
        url: target,
        params: { kind, category, type, pageLimit, pageStart }
      },
      { status: 500 }
    );
  }
}
