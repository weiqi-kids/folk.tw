#!/usr/bin/env node
// 48 小時成效對帳（唯讀）：GA4 Data API → campaign 入口／來源／LINE 導流／互動事件／淘汰判定。
// 預設觀察「現在往前 48 小時」（GA4 property 時區＝Asia/Taipei），不寫檔、不發 Slack。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ga4RunReport, loadConfig } from './lib/google-data.mjs';
import { seasonalCampaigns } from '../src/lib/seasonal-campaigns.ts';

const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (x) => args.includes(x);
const valueOf = (x) => { const i = args.indexOf(x); return i >= 0 ? args[i + 1] : null; };

if (has('--help')) {
  console.log(`用法：pnpm growth:48h [選項]

  --landing <paths>   逗號分隔入口路徑（預設農曆七月五個 campaign 頁）
  --campaign <text>   只保留 session campaign 名稱含此文字者
  --hours <N>         回看時數（預設 48）
  --json              輸出 JSON；預設 Markdown

資料唯讀；GA4 設定沿用 scripts/.google-config.json / GA4_PROPERTY_ID，憑證沿用
GOOGLE_SA_KEY / GOOGLE_APPLICATION_CREDENTIALS / /root/.config/folk-tw/ga4-sa.json。`);
  process.exit(0);
}

// 唯一資料源＝首頁自己使用的 seasonal-campaigns；不可在報表另抄一份 slug 清單。
const DEFAULT_LANDINGS = [...new Set(seasonalCampaigns.map((x) => x.href))];
const landings = (valueOf('--landing') || DEFAULT_LANDINGS.join(','))
  .split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.startsWith('/') ? x : `/${x}`);
const campaignNeedle = (valueOf('--campaign') || '').toLowerCase();
const hours = Math.max(1, Number(valueOf('--hours') || 48));
if (!Number.isInteger(hours / 24)) throw new Error('--hours 必須是 24 的倍數，才能保持 GA4 活躍使用者不重複計算');
const jsonMode = has('--json');
const { ga4PropertyId } = loadConfig();

const now = new Date();
const taipeiParts = (d) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
}).formatToParts(d).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
const pNow = taipeiParts(now);
const ymd = (p) => `${p.year}-${p.month}-${p.day}`;
const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};
// 最近 N 個「完整曆日」：48h＝昨天與前天。這讓 activeUsers 由 GA4 對整窗去重；
// 若以 dateHour 拉回後自行相加，同一位跨小時訪客會被重複算，數字會虛胖。
const endDate = shiftDate(ymd(pNow), -1);
const startDate = shiftDate(endDate, -(hours / 24 - 1));
const dateRanges = [{ startDate, endDate }];
const landingRegex = `^(${landings.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/$/, '/?')).join('|')})([?].*)?$`;

const dim = (name) => ({ name });
const metric = (name) => ({ name });
const number = (x) => Number(x || 0);

async function report(dimensions, metrics, extra = {}) {
  const r = await ga4RunReport(ga4PropertyId, {
    dateRanges, dimensions: dimensions.map(dim), metrics: metrics.map(metric),
    limit: 100000, ...extra,
  });
  return (r.rows || []).map((row) => ({
    dimensions: Object.fromEntries(dimensions.map((d, i) => [d, row.dimensionValues[i]?.value || '(not set)'])),
    metrics: Object.fromEntries(metrics.map((m, i) => [m, number(row.metricValues[i]?.value)])),
  }));
}

function aggregate(rows, keys, metricNames) {
  const map = new Map();
  for (const row of rows) {
    const id = keys.map((k) => row.dimensions[k]).join('\u0000');
    const out = map.get(id) || Object.fromEntries(keys.map((k) => [k, row.dimensions[k]]));
    for (const m of metricNames) out[m] = number(out[m]) + number(row.metrics[m]);
    map.set(id, out);
  }
  return [...map.values()];
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name), st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(astro|ts|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function instrumentation() {
  const share = readFileSync(join(repo, 'src/components/ShareRow.astro'), 'utf8');
  const base = readFileSync(join(repo, 'src/layouts/Base.astro'), 'utf8');
  const uiFiles = walk(join(repo, 'src')).filter((p) => !p.endsWith('Base.astro'));
  const calendarUi = uiFiles.some((p) => readFileSync(p, 'utf8').includes('data-calendar-add'));
  return {
    share: share.includes("gtag('event', 'share'") ? 'active' : 'not_instrumented',
    campaign_click: base.includes("gtag('event', 'campaign_click'") ? 'active' : 'not_instrumented',
    intent_click: base.includes("gtag('event', 'intent_click'") ? 'active' : 'not_instrumented',
    line_add_click: base.includes("gtag('event', 'line_add_click'")
      && base.includes('line_placement:') ? 'active' : 'not_instrumented',
    calendar_add: !base.includes("gtag('event', 'calendar_add'") ? 'not_instrumented'
      : calendarUi ? 'active' : 'prepared_no_ui',
  };
}

async function linePlacementReport() {
  try {
    const rows = await report(['customEvent:line_placement'], ['eventCount', 'totalUsers'], {
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'line_add_click' } } },
    });
    return { status: 'available', rows };
  } catch (error) {
    // 新註冊的 GA4 自訂維度可能需要一段時間才會出現在 Data API metadata。
    return { status: 'registration_pending', rows: [], note: error instanceof Error ? error.message : String(error) };
  }
}

const [targetTotalRaw, entryRaw, sourceRaw, eventRaw, homeRaw, returnRaw, lineRaw] = await Promise.all([
  report([], ['activeUsers', 'sessions', 'screenPageViews', 'engagedSessions'], {
    dimensionFilter: { filter: { fieldName: 'landingPagePlusQueryString', stringFilter: { matchType: 'FULL_REGEXP', value: landingRegex } } },
  }),
  report(['landingPagePlusQueryString'], ['activeUsers', 'sessions', 'screenPageViews', 'engagedSessions']),
  report(['landingPagePlusQueryString', 'sessionSource', 'sessionCampaignName'], ['activeUsers', 'sessions', 'engagedSessions']),
  report(['eventName', 'pagePath', 'linkUrl'], ['eventCount', 'totalUsers'], {
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['share', 'campaign_click', 'intent_click', 'calendar_add', 'line_add_click'] } } },
  }),
  report(['pagePath'], ['activeUsers', 'screenPageViews']),
  report(['newVsReturning'], ['activeUsers', 'sessions']),
  linePlacementReport(),
]);

const target = (s) => landings.some((p) => s === p || s === p.slice(0, -1) || s.startsWith(`${p}?`));
const entries = aggregate(entryRaw.filter((r) => target(r.dimensions.landingPagePlusQueryString)),
  ['landingPagePlusQueryString'], ['activeUsers', 'sessions', 'screenPageViews', 'engagedSessions'])
  .sort((a, b) => b.activeUsers - a.activeUsers);
const sources = aggregate(sourceRaw.filter((r) => target(r.dimensions.landingPagePlusQueryString)
    && (!campaignNeedle || r.dimensions.sessionCampaignName.toLowerCase().includes(campaignNeedle))),
  ['landingPagePlusQueryString', 'sessionSource', 'sessionCampaignName'], ['activeUsers', 'sessions', 'engagedSessions'])
  .sort((a, b) => b.activeUsers - a.activeUsers);
const events = aggregate(eventRaw, ['eventName', 'pagePath', 'linkUrl'], ['eventCount', 'totalUsers'])
  .sort((a, b) => b.eventCount - a.eventCount);
const home = aggregate(homeRaw.filter((r) => ['/', '(not set)'].includes(r.dimensions.pagePath)),
  ['pagePath'], ['activeUsers', 'screenPageViews']).find((r) => r.pagePath === '/') || { activeUsers: 0, screenPageViews: 0 };
const returning = aggregate(returnRaw, ['newVsReturning'], ['activeUsers', 'sessions']);
const linePlacements = aggregate(lineRaw.rows, ['customEvent:line_placement'], ['eventCount', 'totalUsers'])
  .map((x) => ({ placement: x['customEvent:line_placement'], eventCount: x.eventCount, totalUsers: x.totalUsers }))
  .sort((a, b) => b.eventCount - a.eventCount || a.placement.localeCompare(b.placement));
const inst = instrumentation();
const eventTotals = Object.fromEntries(['share', 'campaign_click', 'intent_click', 'calendar_add', 'line_add_click'].map((name) => [
  name, events.filter((x) => x.eventName === name).reduce((n, x) => n + x.eventCount, 0),
]));
const intentEntries = events.filter((x) => x.eventName === 'intent_click').map((x) => ({
  destination: (() => { try { return new URL(x.linkUrl).pathname; } catch { return x.linkUrl || '(not set)'; } })(),
  eventCount: x.eventCount,
  totalUsers: x.totalUsers,
}));
const campaignCtr = home.screenPageViews ? eventTotals.campaign_click / home.screenPageViews : null;
const targetTotal = aggregate(targetTotalRaw, [], ['activeUsers', 'sessions', 'screenPageViews', 'engagedSessions'])[0] || {};
const targetUsers = number(targetTotal.activeUsers);
const targetViews = number(targetTotal.screenPageViews);

// 淘汰只針對首頁 campaign 版位，不自動刪內容頁。樣本不足／事件尚未成熟時一律 HOLD。
let verdict = 'HOLD';
let reason = '首頁 48 小時瀏覽未滿 200，樣本不足，不淘汰。';
if (inst.campaign_click !== 'active') reason = 'campaign_click 尚未埋點，無法判定，不淘汰。';
else if (home.screenPageViews >= 500 && campaignCtr < 0.005) {
  verdict = 'RETIRE_PLACEMENT'; reason = '首頁瀏覽至少 500，但 campaign 點擊率低於 0.5%；撤下版位，內容頁保留。';
} else if (home.screenPageViews >= 200 && campaignCtr < 0.015) {
  verdict = 'REVISE'; reason = '首頁瀏覽至少 200，但 campaign 點擊率低於 1.5%；先改標題／CTA，再觀察下一個 48 小時。';
} else if (home.screenPageViews >= 200 && campaignCtr >= 0.015) {
  verdict = 'KEEP'; reason = '首頁樣本至少 200，campaign 點擊率達 1.5%，保留版位。';
}

const output = {
  generatedAt: now.toISOString(), timezone: 'Asia/Taipei', hours,
  window: { start: `${startDate} 00:00`, end: `${endDate} 23:59` },
  landings, campaignFilter: campaignNeedle || null, instrumentation: inst,
  totals: { targetUsers, targetViews, homeViews: home.screenPageViews, campaignClicks: eventTotals.campaign_click,
    campaignCtr, intentClicks: eventTotals.intent_click, shareClicks: eventTotals.share,
    calendarAdds: eventTotals.calendar_add, lineAdds: eventTotals.line_add_click },
  entries, sources, intentEntries, line: { dimensionStatus: lineRaw.status, placements: linePlacements, note: lineRaw.note || null },
  events, returningClassification: returning,
  sevenDayReturn: { status: 'unavailable', note: 'GA4 aggregate runReport 無法把本次匿名 campaign 訪客串成 7 日回訪 cohort；需等滿 7 日並以 Explore/cohort 或另設 user-level 匯出驗證。' },
  decision: { verdict, reason, scope: '只淘汰首頁 campaign 版位，不刪內容頁。' },
  caveats: ['使用最近兩個完整台北曆日，避免逐小時相加造成 activeUsers 重複計數；GA4 仍可能延遲回填最近一天。',
    inst.calendar_add === 'prepared_no_ui' ? 'calendar_add 追蹤已預留，但站上目前沒有加入行事曆 UI；0 代表尚無入口，不代表使用者拒絕。' : null,
    lineRaw.status === 'registration_pending' ? 'line_placement 剛註冊，GA4 Data API 尚未提供此維度；總點擊仍會計入，待 metadata 生效後自動分版位。' : null,
  ].filter(Boolean),
};

if (jsonMode) console.log(JSON.stringify(output, null, 2));
else {
  const n = (x) => number(x).toLocaleString('en-US');
  const pct = (x) => x == null ? '—' : `${(x * 100).toFixed(1)}%`;
  const status = (x) => ({ active: '已埋點', not_instrumented: '尚未埋點', prepared_no_ui: '已預留、站上尚無入口' }[x] || x);
  const lines = [`# folk.tw ${hours} 小時成效報表`, '', `期間：${output.window.start} ～ ${output.window.end}（台北）`,
    '', '## 決策', `**${verdict}** — ${reason}`, output.decision.scope,
    '', '## Campaign 入口', `目標頁合計：${n(targetUsers)} 位使用者／${n(targetViews)} PV`,
    ...entries.map((x) => `- ${x.landingPagePlusQueryString}：${n(x.activeUsers)} users／${n(x.screenPageViews)} views／${n(x.engagedSessions)} engaged sessions`),
    '', '## 入口來源', ...(sources.length ? sources.slice(0, 30).map((x) =>
      `- ${x.landingPagePlusQueryString} ← ${x.sessionSource} / ${x.sessionCampaignName || '(not set)'}：${n(x.activeUsers)} users`) : ['- 無資料']),
    '', '## 站內行動',
    `- 首頁 campaign click：${n(eventTotals.campaign_click)}（首頁 ${n(home.screenPageViews)} views，CTR ${pct(campaignCtr)}；${status(inst.campaign_click)}）`,
    `- 首頁常青入口：${n(eventTotals.intent_click)}（${status(inst.intent_click)}）`,
    ...intentEntries.map((x) => `  - ${x.destination}：${n(x.eventCount)} clicks／${n(x.totalUsers)} users`),
    `- 分享 click：${n(eventTotals.share)}（${status(inst.share)}）`,
    `- 加入行事曆：${n(eventTotals.calendar_add)}（${status(inst.calendar_add)}）`,
    `- LINE 加好友：${n(eventTotals.line_add_click)}（${status(inst.line_add_click)}；版位維度 ${lineRaw.status === 'available' ? '可用' : '等待 GA4 生效'}）`,
    ...(linePlacements.length ? linePlacements.map((x) => `  - ${x.placement}：${n(x.eventCount)} clicks／${n(x.totalUsers)} users`) : ['  - 目前沒有可分版位的點擊資料']),
    '', '## 回訪', `- 48 小時 GA4 new/returning 分類：${returning.map((x) => `${x.newVsReturning} ${n(x.activeUsers)}`).join('、') || '無資料'}`,
    `- 真正 7 日 campaign cohort：尚不可得。${output.sevenDayReturn.note}`,
    '', '## 注意', ...output.caveats.map((x) => `- ${x}`)];
  console.log(lines.join('\n'));
}
