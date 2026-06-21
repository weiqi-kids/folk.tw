#!/usr/bin/env node
// 週報：唯讀拉 GA4 流量 + GSC 搜尋數據，輸出 Markdown。
// 用法：node scripts/weekly-data.mjs   （或 pnpm data:weekly）
// 需求：服務帳號金鑰（見 scripts/lib/google-data.mjs 註解）、GA4_PROPERTY_ID、GSC 已加服務帳號為使用者。

import { ga4RunReport, gscQuery, loadConfig } from './lib/google-data.mjs';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

const { ga4PropertyId, gscSiteUrl } = loadConfig();

async function ga4Section() {
  const dateRanges = [{ startDate: '7daysAgo', endDate: 'yesterday' }];
  // 概況
  const overview = await ga4RunReport(ga4PropertyId, {
    dateRanges,
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
  });
  const o = overview.rows?.[0]?.metricValues?.map((v) => v.value) ?? [];
  const topPages = await ga4RunReport(ga4PropertyId, {
    dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 10,
  });
  const channels = await ga4RunReport(ga4PropertyId, {
    dateRanges, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8,
  });

  let s = `## GA4 流量（近 7 日，至昨日）\n\n`;
  s += `- 工作階段 sessions：**${o[0] ?? '—'}**　使用者 users：**${o[1] ?? '—'}**　瀏覽 views：**${o[2] ?? '—'}**　平均停留：${o[3] ? Math.round(o[3]) + 's' : '—'}\n\n`;
  s += `**熱門頁面（瀏覽）**\n\n`;
  for (const r of topPages.rows ?? []) s += `- ${r.dimensionValues[0].value} — ${r.metricValues[0].value}\n`;
  s += `\n**流量來源管道**\n\n`;
  for (const r of channels.rows ?? []) s += `- ${r.dimensionValues[0].value} — ${r.metricValues[0].value}\n`;
  return s;
}

async function gscSection() {
  const startDate = ymd(daysAgo(10));
  const endDate = ymd(daysAgo(3)); // GSC 資料約有 2–3 日延遲
  const base = { startDate, endDate, rowLimit: 10 };
  const totals = await gscQuery(gscSiteUrl, { ...base, dimensions: [] });
  const t = totals.rows?.[0] ?? {};
  const queries = await gscQuery(gscSiteUrl, { ...base, dimensions: ['query'] });
  const pages = await gscQuery(gscSiteUrl, { ...base, dimensions: ['page'] });

  let s = `## GSC 搜尋（${startDate} ～ ${endDate}）\n\n`;
  s += `- 點擊 clicks：**${t.clicks ?? 0}**　曝光 impressions：**${t.impressions ?? 0}**　CTR：${t.ctr != null ? (t.ctr * 100).toFixed(1) + '%' : '—'}　平均排名：${t.position != null ? t.position.toFixed(1) : '—'}\n\n`;
  s += `**熱門查詢**\n\n`;
  for (const r of queries.rows ?? []) s += `- 「${r.keys[0]}」 — 點 ${r.clicks} / 曝 ${r.impressions} / 排名 ${r.position.toFixed(1)}\n`;
  s += `\n**熱門到達頁**\n\n`;
  for (const r of pages.rows ?? []) s += `- ${r.keys[0]} — 點 ${r.clicks} / 曝 ${r.impressions}\n`;
  return s;
}

async function main() {
  const today = ymd(new Date());
  let out = `# folk.tw 週報 · ${today}\n\n`;
  try { out += (await ga4Section()) + '\n'; }
  catch (e) { out += `## GA4 流量\n\n⚠️ 讀取失敗：${e.message}\n（確認 GA4_PROPERTY_ID 與服務帳號已加為 GA4 資源檢視者）\n\n`; }
  try { out += (await gscSection()) + '\n'; }
  catch (e) { out += `## GSC 搜尋\n\n⚠️ 讀取失敗：${e.message}\n（確認服務帳號已加為 GSC 使用者、API 已啟用）\n\n`; }
  console.log(out);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
