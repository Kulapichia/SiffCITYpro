import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { fetchDoubanHtml } from '@/lib/douban'; // 关键修改：引入共享的、更健壮的 fetch 函数

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: 'Douban ID is required' }, { status: 400 });
  }

  const movieUrl = `https://movie.douban.com/subject/${id}/`;
  const celebritiesUrl = `https://movie.douban.com/subject/${id}/celebrities`;

  try {
    // 1. 关键修改：使用共享的 fetchDoubanHtml 函数并行发起请求，增强稳定性
    const [movieResponse, celebritiesResponse] = await Promise.all([
      fetchDoubanHtml(movieUrl),
      fetchDoubanHtml(celebritiesUrl),
    ]);

    // 2. 检查响应是否成功（fetchDoubanHtml 内部已有ok检查，这里为双重保障）
    // 注意：fetchDoubanHtml 返回的是 text() 的结果，所以直接使用
    const movieHtml = movieResponse;
    const celebritiesHtml = celebritiesResponse;
    
    // 3. 并行解析两个 HTML 响应 (此步骤已在上面完成)

    // 4. 使用 Cheerio 解析 HTML
    const $movie = cheerio.load(movieHtml);
    const $celebs = cheerio.load(celebritiesHtml);

    // --- 从电影详情页提取信息 ---
    const description = $movie('span[property="v:summary"]').text().replace(/\s+/g, ' ').trim() ?? '';
    const genres = $movie('span[property="v:genre"]').map((i, el) => $movie(el).text()).get().join(',');
    const year = $movie('span.year').text().replace('(', '').replace(')', '') ?? '';

    let country = '';
    $movie('#info span.pl').each((i, el) => {
      if ($movie(el).text().includes('制片国家/地区')) {
        const nextSibling = el.nextSibling;
        if (nextSibling && nextSibling.nodeType === 3) { // 3 代表文本节点
          country = nextSibling.nodeValue.trim().replace(/ \/ /g, ',');
        }
        return false;
      }
    });

    const recommendations = $movie('#recommendations .recommendations-bd dl').map((i, el) => {
      const link = $movie('dd a', el);
      const title = link.text();
      const href = link.attr('href');
      const doubanIDMatch = href ? href.match(/subject\/(\d+)/) : null;
      const doubanID = doubanIDMatch ? doubanIDMatch[1] : '';
      const likeposter = $movie('img', el).attr('src');
      const subjectRate = $movie('.subject-rate', el).text();

      return {
        title,
        likeposter,
        doubanID,
        subjectRate,
      };
    }).get();
    
    let trailerUrl = '';
    const trailerElement = $movie('.label-trailer .related-pic-video');
    if (trailerElement.length > 0) {
      trailerUrl = trailerElement.attr('href') || '';
    }

    // --- 从演职员页提取信息 ---
    const celebrityItems = $celebs('h2:contains("演员 Cast")').nextAll('ul.celebrities-list').first().find('li.celebrity');
    const celebrities = celebrityItems.map((i, el) => {
      const element = $celebs(el);
      
      const actorurl = element.find('a').attr('href') || '';

      // --- actorname: 只获取中文名 ---
      const rawActorName = element.find('a').attr('title') || '';
      // 提取 actorname 中的中文字符部分
      const chineseNameMatch = rawActorName.match(/[\u4e00-\u9fa5]+/);
      const actorname = chineseNameMatch ? chineseNameMatch[0] : '';

      // --- role: 只获取 "(饰...)" ---
      const rawRole = element.find('.role').text().trim();
      const roleMatch = rawRole.match(/\((饰.*?)\)/);
      const role = roleMatch ? roleMatch[1] : '';
      
      let actorposter = element.find('.avatar').css('background-image') || '';
      if (actorposter) {
        actorposter = actorposter.replace(/url\((['"]?)(.*?)\1\)/, '$2');
      }

      return {
        actorname,
        actorposter,
        role,
        actorurl,
      };
    }).get();

    // 5. 合并所有数据并返回
    return NextResponse.json({
      description,
      genre: genres,
      country,
      year,
      recommendations,
      trailerUrl,
      celebrities, // 新增的演职员信息
    });

  } catch (error) {
    if (error instanceof Error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'An unknown error occurred' }, { status: 500 });
  }
}
