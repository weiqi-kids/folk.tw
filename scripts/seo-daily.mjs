#!/usr/bin/env node
// 每日 SEO 資料收集器（資料層）：唯讀拉 GA4 + GSC，輸出「機器可讀 JSON」供大腦層 cloud routine 判讀。
// 相對 weekly-data.mjs（只產人看的 Markdown），本支多三個優化核心訊號：
//   1. page×query 交叉（哪個頁吃到哪些字）
//   2. striking-distance（排名 5–15 且有曝光的字＝最值得推一把）
//   3. 高曝光零點擊（meta/標題優化目標）
// 用法：node scripts/seo-daily.mjs   （或 pnpm data:seo-daily）
// 需求：GOOGLE_SA_KEY（或 scripts/.google-sa-key.json）、GA4_PROPERTY_ID、GSC 已加服務帳號。
// 輸出：data/seo-daily/<台灣日期>.json

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ga4RunReport, gscQuery, inspectUrl, sitemapsList, loadConfig } from './lib/google-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const OUT_DIR = join(repoRoot, 'data', 'seo-daily');

// 稀釋監控 + 索引覆蓋追蹤清單（與 weekly-data.mjs 一致：分子＝獨特頁、分母＝廟宇頁）。
const TRACK_URLS = [
  'https://folk.tw/',
  'https://folk.tw/almanac',
  'https://folk.tw/almanac/archive',
  'https://folk.tw/deities/mazu/',
  'https://folk.tw/deities/guangong/',
  'https://folk.tw/poems',
  'https://folk.tw/poems/liushi_jiazi-1/',
  'https://folk.tw/allusions/suitang_qinshubao/',
  'https://folk.tw/temples',
  'https://folk.tw/temples/dajia_zhenlan/',
  'https://folk.tw/temples/moi_0_竹圍仔福德祠/',
];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
// 台灣日期（Action 跑在 UTC，須以 Asia/Taipei 命名 JSON，與大腦層同日對齊）。
const twDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

const { ga4PropertyId, gscSiteUrl } = loadConfig();

// 任一段失敗只記 error、不中斷其他段（沿用 weekly-data.mjs 容錯風格）。
async function section(fn) {
  try { return await fn(); }
  catch (e) { return { error: e.message }; }
}

async function ga4Block() {
  const dateRanges = [{ startDate: '7daysAgo', endDate: 'yesterday' }];
  const overview = await ga4RunReport(ga4PropertyId, {
    dateRanges,
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
  });
  const o = overview.rows?.[0]?.metricValues?.map((v) => Number(v.value)) ?? [];

  const channels = await ga4RunReport(ga4PropertyId, {
    dateRanges, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10,
  });

  // 台灣自然搜尋 sessions：country=Taiwan 過濾，逐管道，挑 Organic Search。
  const twChannels = await ga4RunReport(ga4PropertyId, {
    dateRanges, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }],
    dimensionFilter: { filter: { fieldName: 'country', stringFilter: { value: 'Taiwan' } } },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10,
  });
  const twOrganic = Number(
    twChannels.rows?.find((r) => r.dimensionValues[0].value === 'Organic Search')?.metricValues[0].value ?? 0,
  );

  const topPages = await ga4RunReport(ga4PropertyId, {
    dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 15,
  });

  return {
    range: '7daysAgo..yesterday',
    sessions: o[0] ?? 0, users: o[1] ?? 0, views: o[2] ?? 0,
    avgDurationSec: o[3] ? Math.round(o[3]) : 0,
    taiwanOrganicSessions: twOrganic,
    channels: (channels.rows ?? []).map((r) => ({ channel: r.dimensionValues[0].value, sessions: Number(r.metricValues[0].value) })),
    topPages: (topPages.rows ?? []).map((r) => ({ path: r.dimensionValues[0].value, views: Number(r.metricValues[0].value) })),
  };
}

async function gscBlock() {
  const startDate = ymd(daysAgo(10));
  const endDate = ymd(daysAgo(3)); // GSC 資料約 2–3 日延遲
  const base = { startDate, endDate };

  const totals = (await gscQuery(gscSiteUrl, { ...base, dimensions: [] })).rows?.[0] ?? {};
  const queries = (await gscQuery(gscSiteUrl, { ...base, dimensions: ['query'], rowLimit: 25 })).rows ?? [];
  const pages = (await gscQuery(gscSiteUrl, { ...base, dimensions: ['page'], rowLimit: 25 })).rows ?? [];
  // page×query 交叉：哪個頁吃到哪些字。
  const cross = (await gscQuery(gscSiteUrl, { ...base, dimensions: ['page', 'query'], rowLimit: 200 })).rows ?? [];

  const crossRows = cross.map((r) => ({
    page: r.keys[0], query: r.keys[1],
    clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
  }));

  // striking-distance：排名 5–15 且有曝光，最值得推一把（依曝光排序）。
  const strikingDistance = crossRows
    .filter((r) => r.position >= 5 && r.position <= 15 && r.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);

  // 高曝光零點擊：有曝光但 0 點擊（meta/標題優化目標），依曝光排序。
  const highImpZeroClick = crossRows
    .filter((r) => r.impressions >= 3 && r.clicks === 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30);

  return {
    range: `${startDate}..${endDate}`,
    totals: {
      clicks: totals.clicks ?? 0, impressions: totals.impressions ?? 0,
      ctr: totals.ctr ?? 0, position: totals.position ?? null,
    },
    topQueries: queries.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
    topPages: pages.map((r) => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
    pageQueryCross: crossRows,
    strikingDistance,
    highImpZeroClick,
  };
}

async function indexBlock() {
  const sms = await sitemapsList(gscSiteUrl);
  const sitemaps = sms.map((x) => ({
    path: x.path,
    submitted: (x.contents ?? []).map((c) => Number(c.submitted)).reduce((a, b) => a + b, 0),
    errors: x.errors ?? 0, warnings: x.warnings ?? 0,
  }));
  const coverage = [];
  for (const u of TRACK_URLS) {
    try {
      const r = await inspectUrl(gscSiteUrl, u);
      coverage.push({ url: u, coverageState: r.coverageState ?? null, lastCrawlTime: r.lastCrawlTime ?? null });
    } catch (e) {
      coverage.push({ url: u, error: e.message });
    }
  }
  return { sitemaps, coverage };
}

async function main() {
  const date = twDate();
  const out = {
    date,
    generatedAt: new Date().toISOString(),
    ga4: await section(ga4Block),
    gsc: await section(gscBlock),
    index: await section(indexBlock),
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${date}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`✓ 已寫 ${file}`);
  // 摘要到 stderr 方便 CI log 一眼看出有無訊號。
  const gsc = out.gsc;
  if (gsc.error) console.error(`  GSC 失敗：${gsc.error}`);
  else console.error(`  GSC：曝光 ${gsc.totals.impressions}／點擊 ${gsc.totals.clicks}／臨門一腳 ${gsc.strikingDistance.length} 筆／高曝零點 ${gsc.highImpZeroClick.length} 筆`);
  const ga4 = out.ga4;
  if (ga4.error) console.error(`  GA4 失敗：${ga4.error}`);
  else console.error(`  GA4：sessions ${ga4.sessions}／台灣自然搜尋 ${ga4.taiwanOrganicSessions}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
