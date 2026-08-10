// 神酷每週拜拜提醒：每週一篇，保留近期歷史；不是把全站新增頁面逐筆倒進 feed。
import type { APIRoute } from 'astro';
import { todayInTaipei } from '../lib/daily';
import { escapeXml, weeklyFeedItems } from '../lib/weekly-feed';

export const prerender = true;

export const GET: APIRoute = async () => {
  const { iso: today } = todayInTaipei();
  const items = await weeklyFeedItems(today, 8);
  const lastBuildDate = new Date().toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>神酷每週拜拜提醒</title>
    <link>https://folk.tw/festivals/</link>
    <description>每週整理近期民俗節日、神明聖誕、供品與祭拜注意事項；日期以台灣時間換算，內容逐條沿用神酷站內考據資料。</description>
    <language>zh-TW</language>
    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>
    <ttl>10080</ttl>
    <atom:link href="https://folk.tw/rss.xml" rel="self" type="application/rss+xml" />
${items.map((item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>https://folk.tw/festivals/</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${escapeXml(item.pubDate)}</pubDate>
      <description>${escapeXml(item.description)}</description>
      <content:encoded>${escapeXml(item.description)}</content:encoded>
    </item>`).join('\n')}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
