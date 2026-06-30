#!/usr/bin/env node
// 週報（統一版，跑一次）：抓一次資料 → 產詳細報告開成 GitHub Issue → Slack 發「重點＋Issue 連結」。
// 取代：舊 weekly-report.yml(Action 開 Issue) + seo-weekly-slack.mjs(只發 Slack) → 合成這一支。
// 用法：
//   node scripts/seo-weekly.mjs           # 抓資料→開 Issue→發 Slack
//   node scripts/seo-weekly.mjs --dry      # 只抓資料+印報告與 Slack 預覽，不開 Issue、不發 Slack
// 需求：scripts/.google-sa-key.json、GA4_PROPERTY_ID/GSC_SITE_URL、gh 已登入、folk Slack token。

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ga4RunReport, gscQuery, inspectUrl, sitemapsList, loadConfig } from './lib/google-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const DRY = process.argv.includes('--dry');
const TOKEN_FILE = '/root/.config/folk-tw/slack-bot-token';
const CHANNEL = process.env.SLACK_CHANNEL || 'C0BCPHBF1ML';
const { ga4PropertyId, gscSiteUrl } = loadConfig();

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const twToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
const mdShort = (iso) => { const [, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}`; };
const isIndexed = (s) => !!s && /indexed/i.test(s) && !/not indexed/i.test(s);
const arrow = (now, prev) => (prev == null ? '' : now > prev ? `↑ +${(now - prev).toFixed(0)}` : now < prev ? `↓ ${(now - prev).toFixed(0)}` : '持平');

// 稀釋追蹤：分子＝獨特頁、分母＝廟宇頁
const UNIQUE = [
  ['https://folk.tw/deities/mazu/', '媽祖'],
  ['https://folk.tw/deities/guangong/', '關聖帝君'],
  ['https://folk.tw/poems', '籤詩首頁'],
  ['https://folk.tw/poems/liushi_jiazi-1/', '六十甲子籤1'],
  ['https://folk.tw/allusions/suitang_qinshubao/', '典故·秦叔寶'],
];
const TEMPLE = [
  ['https://folk.tw/temples/dajia_zhenlan/', '大甲鎮瀾宮(名廟)'],
  ['https://folk.tw/temples/moi_0_竹圍仔福德祠/', '土地公廟(同質量產)'],
];
const friendlyCov = (s) => !s ? '❔未知'
  : /not indexed/i.test(s) ? (/(Discovered)/i.test(s) ? '🟡已發現未收錄' : /Crawled/i.test(s) ? '🟡已爬取未收錄' : '🟡未收錄')
  : /redirect/i.test(s) ? '↪️轉址' : /unknown to Google/i.test(s) ? '⚪Google尚不認識' : /indexed/i.test(s) ? '✅已收錄' : s;

async function fetchAll() {
  // ── GA4：近 7 天 vs 前 7 天（台灣自然搜尋 + 總 sessions）
  const ga = async (start, end) => {
    const r = await ga4RunReport(ga4PropertyId, {
      dateRanges: [{ startDate: start, endDate: end }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'country' }],
      metrics: [{ name: 'sessions' }], limit: 200,
    });
    let total = 0, twOrganic = 0;
    for (const row of r.rows ?? []) {
      const ch = row.dimensionValues[0].value, co = row.dimensionValues[1].value, v = Number(row.metricValues[0].value);
      total += v; if (ch === 'Organic Search' && co === 'Taiwan') twOrganic += v;
    }
    return { total, twOrganic };
  };
  const ga4Now = await ga('7daysAgo', 'yesterday');
  const ga4Prev = await ga('14daysAgo', '8daysAgo');

  // ── GSC：近 7 天 vs 前 7 天 totals（GSC 約 2-3 日延遲，往前推 3 天起算）
  const gscTotals = async (s, e) => (await gscQuery(gscSiteUrl, { startDate: ymd(s), endDate: ymd(e), dimensions: [] })).rows?.[0] ?? {};
  const gNow = await gscTotals(daysAgo(10), daysAgo(3));
  const gPrev = await gscTotals(daysAgo(17), daysAgo(11));
  // 頁面層：判斷搜尋曝光集中在獨特頁還是廟宇頁
  const pages = (await gscQuery(gscSiteUrl, { startDate: ymd(daysAgo(10)), endDate: ymd(daysAgo(3)), dimensions: ['page'], rowLimit: 500 })).rows ?? [];
  let impUnique = 0, impTemple = 0, impOther = 0;
  for (const r of pages) {
    const u = r.keys[0];
    if (/\/temples\//.test(u)) impTemple += r.impressions;
    else if (/\/(deities|poems|allusions|practices|almanac)\b/.test(u)) impUnique += r.impressions;
    else impOther += r.impressions;
  }

  // ── 索引覆蓋：逐一檢查追蹤頁
  const cov = {};
  for (const [u] of [...UNIQUE, ...TEMPLE]) {
    try { cov[u] = (await inspectUrl(gscSiteUrl, u)).coverageState ?? null; } catch { cov[u] = null; }
  }
  // ── sitemap 提交數
  let submitted = 0, smErr = 0;
  try { for (const x of await sitemapsList(gscSiteUrl)) { submitted += (x.contents ?? []).reduce((a, c) => a + Number(c.submitted), 0); smErr += Number(x.errors ?? 0); } } catch { /* noop */ }

  return { ga4Now, ga4Prev, gNow, gPrev, impUnique, impTemple, impOther, cov, submitted, smErr };
}

// 稀釋判讀（細版）：收錄比率 + 搜尋曝光來源 + 趨勢 → 結論先行
function dilution(d) {
  const uIdx = UNIQUE.filter(([u]) => isIndexed(d.cov[u])).length;
  const tIdx = TEMPLE.filter(([u]) => isIndexed(d.cov[u])).length;
  const totalImp = d.impUnique + d.impTemple + d.impOther || 1;
  const uniqueShare = Math.round((d.impUnique / totalImp) * 100);
  const templeShare = Math.round((d.impTemple / totalImp) * 100);

  let flag, verdict;
  // 核心邏輯：獨特頁是否吃到收錄＋搜尋曝光；廟宇頁是否反而佔走資源。
  if (uIdx >= 3 && uniqueShare >= templeShare) {
    flag = '🟢 無需動作';
    verdict = `無稀釋跡象：獨特頁 ${uIdx}/5 已收錄，且搜尋曝光 ${uniqueShare}% 來自獨特頁（廟宇頁僅 ${templeShare}%）——資源用在對的頁,方向正確。`;
  } else if (uIdx <= 1 && tIdx >= 1 && templeShare > uniqueShare) {
    flag = '🔴 建議你決定';
    verdict = `有稀釋疑慮：獨特頁僅 ${uIdx}/5 收錄,廟宇頁卻已收錄且吃走 ${templeShare}% 曝光——建議更積極降稀釋（如連過去農民曆日期頁也只留月份樞紐）。`;
  } else {
    flag = '🟡 看一下';
    verdict = `尚在爬升：獨特頁 ${uIdx}/5 收錄、搜尋曝光獨特頁 ${uniqueShare}% vs 廟宇 ${templeShare}%,持續觀察是否續升。`;
  }
  return { uIdx, tIdx, uniqueShare, templeShare, flag, verdict };
}

function buildMarkdown(d, dil, date) {
  const L = [];
  L.push(`# folk.tw 週報 · ${date}`, '');
  L.push('## 本週成效（近 7 天 vs 前 7 天）');
  L.push(`- 台灣 Google 自然搜尋訪客：**${d.ga4Now.twOrganic}**（前週 ${d.ga4Prev.twOrganic}，${arrow(d.ga4Now.twOrganic, d.ga4Prev.twOrganic) || '持平'}）`);
  L.push(`- 全站 sessions：${d.ga4Now.total}（前週 ${d.ga4Prev.total}）`);
  L.push(`- GSC 曝光：**${d.gNow.impressions ?? 0}**（前週 ${d.gPrev.impressions ?? 0}）；點擊：**${d.gNow.clicks ?? 0}**（前週 ${d.gPrev.clicks ?? 0}）`);
  L.push(`- 點擊率：${((d.gNow.ctr ?? 0) * 100).toFixed(1)}%；平均排名：${d.gNow.position ? d.gNow.position.toFixed(1) : '—'}`, '');
  L.push('## 索引稀釋判讀（核心）');
  L.push(`**結論：${dil.flag} — ${dil.verdict}**`, '');
  L.push('### 搜尋曝光來源（稀釋與否的關鍵）');
  L.push(`- 獨特頁（神明/籤詩/典故/農民曆）：${d.impUnique} 次曝光（占 ${dil.uniqueShare}%）`);
  L.push(`- 廟宇頁：${d.impTemple} 次曝光（占 ${dil.templeShare}%）`);
  L.push(`- 其他：${d.impOther} 次`, '');
  L.push('### 旗艦獨特頁收錄狀態（分子）');
  for (const [u, n] of UNIQUE) L.push(`- ${n}：${friendlyCov(d.cov[u])}`);
  L.push('', '### 對照廟宇頁（分母）');
  for (const [u, n] of TEMPLE) L.push(`- ${n}：${friendlyCov(d.cov[u])}`);
  L.push('', '## Sitemap');
  L.push(`- 已提交 URL：${d.submitted}（錯誤 ${d.smErr}）`, '');
  L.push(`_（本機 cron 自動產出 · ${date}）_`);
  return L.join('\n');
}

function buildSlack(d, dil, date, issueUrl) {
  const L = [];
  L.push(`🚦 ${dil.flag}`);
  L.push('', `📈 *folk.tw 週報 · ${mdShort(date)}*`);
  L.push('', `・台灣搜尋訪客 *${d.ga4Now.twOrganic}* 人（前週 ${d.ga4Prev.twOrganic}，${arrow(d.ga4Now.twOrganic, d.ga4Prev.twOrganic) || '持平'}）`);
  L.push(`・Google 曝光 ${d.gNow.impressions ?? 0}、點擊 ${d.gNow.clicks ?? 0}（前週曝光 ${d.gPrev.impressions ?? 0}）`);
  L.push('', `*稀釋判讀：* ${dil.verdict}`);
  L.push(`・獨特頁收錄 ${dil.uIdx}/5；搜尋曝光 獨特頁 ${dil.uniqueShare}% vs 廟宇頁 ${dil.templeShare}%`);
  if (issueUrl) L.push('', `📄 完整週報：${issueUrl}`);
  return L.join('\n');
}

async function postSlack(text) {
  const token = process.env.SLACK_BOT_TOKEN || (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : '');
  if (!token) throw new Error(`缺 Slack token（env 或 ${TOKEN_FILE}）`);
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: CHANNEL, text, unfurl_links: false }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`Slack 發送失敗：${j.error}`);
}

async function main() {
  const date = twToday();
  const d = await fetchAll();          // ← 只在這裡抓一次資料
  const dil = dilution(d);
  const md = buildMarkdown(d, dil, date);

  if (DRY) {
    console.log('===== Issue Markdown 預覽 =====\n' + md);
    console.log('\n===== Slack 預覽 =====\n' + buildSlack(d, dil, date, 'https://github.com/weiqi-kids/folk.tw/issues/XXX'));
    return;
  }

  // 開 Issue（詳細存檔）→ 取 URL
  let issueUrl = '';
  try {
    const tmp = join(repo, 'logs', `weekly-${date}.md`);
    writeFileSync(tmp, md, 'utf8');
    issueUrl = execSync(`gh issue create --title "folk.tw 週報 · ${date}" --body-file "${tmp}" --label weekly-report`, { cwd: repo, encoding: 'utf8' }).trim().split('\n').pop().trim();
    console.log(`✓ 已開 Issue：${issueUrl}`);
  } catch (e) { console.error(`✗ 開 Issue 失敗：${e.message}（仍續發 Slack）`); }

  // Slack：重點 + Issue 連結
  await postSlack(buildSlack(d, dil, date, issueUrl));
  console.log('✓ 已發 Slack 週報重點');
}
main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
