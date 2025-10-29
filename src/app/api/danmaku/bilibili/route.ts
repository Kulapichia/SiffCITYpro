import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchApi(url: string, options: RequestInit = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'User-Agent': UA,
      Referer: 'https://www.bilibili.com/',
    },
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(`请求B站接口失败 ${resp.status}: ${msg.slice(0, 100)}`);
  }
  const data = await resp.json();
  if (data.code !== 0) {
    throw new Error(data.message || 'B站接口返回错误');
  }
  return data.data || data.result;
}

const QuerySchema = z.object({
  link: z.string().optional(),
  bv: z.string().optional(),
  cid: z.string().optional(),
  season_id: z.string().optional(),
  media_id: z.string().optional(),
  ep: z.string().optional().default('1'),
  p: z.string().optional().default('1'),
});

export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = QuerySchema.safeParse(params);
    if (!query.success) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 });
    }

    let { link, bv, cid, season_id, media_id, ep, p } = query.data;

    let targetCid = cid;

    // 优先从 link 中解析参数
    if (link) {
      try {
        const url = new URL(link);
        const path = url.pathname;

        const bvid = url.searchParams.get('bvid');
        const cidParam = url.searchParams.get('cid');
        const mdMatch = path.match(/\/bangumi\/(?:media\/)?(md\d+)/i);
        const ssMatch = path.match(/\/bangumi\/(?:season\/)?(ss\d+)/i);
        const epMatch = path.match(/\/bangumi\/play\/(ep\d+)/i);
        const bvMatch = path.match(/\/video\/(BV[0-9A-Za-z]{10,})/i);

        if (bvid || bvMatch) bv = bvid || bvMatch?.[1];
        if (cidParam) cid = cidParam;
        if (mdMatch) media_id = mdMatch[1].substring(2);
        if (ssMatch) season_id = ssMatch[1].substring(2);
        if (epMatch) {
          const epData = await fetchApi(`https://api.bilibili.com/pgc/view/web/season?ep_id=${epMatch[1].substring(2)}`);
          targetCid = epData.episodes?.[0]?.cid;
        }
      } catch (e) {
        console.error("解析链接失败:", e);
      }
    }

    if (!targetCid) {
      // 优先处理番剧逻辑 (media_id 或 season_id)
      if (media_id && !season_id) {
        const data = await fetchApi(`https://api.bilibili.com/pgc/review/user?media_id=${media_id}`);
        if (data.media?.season_id) {
          season_id = data.media.season_id;
        }
      }

      if (season_id) {
        const epData = await fetchApi(`https://api.bilibili.com/pgc/web/season/section?season_id=${season_id}`);
        const episodes = epData.main_section?.episodes || [];
        const epIndex = Math.max(0, Math.min(episodes.length - 1, Number(ep) - 1));
        const epItem = episodes[epIndex];
        if (!epItem?.cid) throw new Error('未找到指定集数的CID');
        targetCid = epItem.cid;
      } else if (bv) {
        // 处理普通视频 (BV号)
        const videoData = await fetchApi(`https://api.bilibili.com/x/web-interface/view?bvid=${bv}`);
        const pages = videoData.pages || [];
        const pageIndex = Math.max(0, Math.min(pages.length - 1, Number(p) - 1));
        const pageItem = pages[pageIndex];
        if (!pageItem?.cid) throw new Error('未找到指定分P的CID');
        targetCid = pageItem.cid;
      }
    }
    
    if (!targetCid) {
      throw new Error('无法解析CID，请提供有效的cid, bv, season_id, media_id或link参数');
    }

    const danmakuUrl = `https://comment.bilibili.com/${targetCid}.xml`;
    const danmakuResp = await fetch(danmakuUrl, {
      headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/' },
    });
    if (!danmakuResp.ok) {
      throw new Error(`获取弹幕失败 ${danmakuResp.status}`);
    }
    const danmakuXml = await danmakuResp.text();

    return new Response(danmakuXml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // 保留项目A的缓存策略
      },
    });
  } catch (e: any) {
    console.error('弹幕API错误:', e);
    return NextResponse.json({ error: e?.message || '未知错误' }, { status: 500 });
  }
}
