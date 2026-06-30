#!/usr/bin/env node
// 資料層「報數據」純腳本（無 AI）：讀 data/seo-daily/<台灣日期>.json → 組人話摘要 → 發 Slack。
// 設計目的：把「報數據到 Slack」這件事從 claude.ai 雲端 routine 解耦，改由本機 cron 跑；
//   即使大腦層（優化 routine）失敗或被停用，每天仍收得到數據心跳。
// 用法：
//   node scripts/seo-report-slack.mjs            # 讀今天的 JSON、發 Slack
//   node scripts/seo-report-slack.mjs --dry      # 只印訊息、不發送（驗證格式用）
//   node scripts/seo-report-slack.mjs 2026-06-30 # 指定日期
// 憑證：env SLACK_BOT_TOKEN，否則讀 /root/.config/folk-tw/slack-bot-token（folk.tw 專屬 bot）。
// 頻道：env SLACK_CHANNEL，否則預設 C0BCPHBF1ML（#神酷-folk-tw）。
// 資料來源：優先用 git origin/main 上資料層 Action 已 commit 的 JSON（最新），退而求其次讀本機檔。

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

const DRY = process.argv.includes('--dry');
const dateArg = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

const TOKEN_FILE = '/root/.config/folk-tw/slack-bot-token';
const CHANNEL = process.env.SLACK_CHANNEL || 'C0BCPHBF1ML';

// ── 台灣日期（cron 可能跑在 UTC）─────────────────────────────
function twDate(offsetDays = 0) {
  const tw = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  tw.setDate(tw.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${tw.getFullYear()}-${p(tw.getMonth() + 1)}-${p(tw.getDate())}`;
}

// ── 取 JSON：先抓 origin（資料層 Action commit 的最新），再退本機檔 ──
function loadJSON(date) {
  try {
    const txt = execSync(`git show origin/main:data/seo-daily/${date}.json`, {
      cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
    });
    return JSON.parse(txt);
  } catch { /* fall through */ }
  const f = join(repo, 'data', 'seo-daily', `${date}.json`);
  if (existsSync(f)) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { /* noop */ } }
  return null;
}

// ── 旗艦頁友善名稱 ─────────────────────────────────────────
const PAGE_NAME = {
  'https://folk.tw/': '首頁',
  'https://folk.tw/deities/mazu/': '媽祖',
  'https://folk.tw/deities/guangong/': '關聖帝君',
  'https://folk.tw/poems': '籤詩首頁',
  'https://folk.tw/poems/liushi_jiazi-1/': '六十甲子籤1',
  'https://folk.tw/allusions/suitang_qinshubao/': '典故·秦叔寶',
};
// 心跳要報的核心 KPI 頁（CLAUDE.md 定的獨特頁 + 對照樞紐）
const FLAGSHIP = [
  'https://folk.tw/deities/mazu/',
  'https://folk.tw/deities/guangong/',
  'https://folk.tw/poems',
  'https://folk.tw/poems/liushi_jiazi-1/',
  'https://folk.tw/allusions/suitang_qinshubao/',
];

// 索引狀態 → emoji + 人話
function coverageLabel(state) {
  if (!state) return '❔ 未知';
  // 先攔「not indexed」各種未收錄，避免被字串中的 "indexed" 貪婪誤判
  if (/not indexed/i.test(state)) {
    if (/Discovered/i.test(state)) return '🟡 已發現未收錄';
    if (/Crawled/i.test(state)) return '🟡 已爬取未收錄';
    return '🟡 未收錄';
  }
  if (/redirect/i.test(state)) return '↪️ 轉址';
  if (/unknown to Google/i.test(state)) return '⚪ Google 尚不認識';
  if (/indexed/i.test(state)) return '✅ 已收錄';
  return `· ${state}`;
}

const arrow = (now, prev) => {
  if (prev == null || now == null) return '';
  if (now > prev) return `↑ +${now - prev}`;
  if (now < prev) return `↓ ${now - prev}`;
  return '持平';
};
const mdShort = (iso) => { const [, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}`; };
const pageShort = (url) => { try { return decodeURIComponent(new URL(url).pathname); } catch { return url; } };

// ── 組訊息 ────────────────────────────────────────────────
function buildMessage(date, today, yday) {
  if (!today) {
    return `📡 *folk.tw 數據心跳 · ${mdShort(date)}*\n\n` +
      `🟡 今天的數據還沒就緒（資料層尚未產出 ${date}.json）。\n` +
      `稍後資料層 Action 完成後會有完整數據，或檢查 SEO Daily Data workflow 是否正常。`;
  }
  const g = today.ga4 || {}, s = today.gsc || {}, idx = today.index || {};
  const gPrev = (yday && yday.ga4) || {};
  const lines = [];

  lines.push(`📡 *folk.tw 數據心跳 · ${mdShort(date)}*（本機自動產出，純數據不含分析）`);

  // 北極星：台灣自然搜尋
  lines.push('', '*【北極星｜台灣 Google 自然搜尋訪客（近 7 天）】*');
  if (g.error) lines.push('・⚠️ 流量數據抓取失敗');
  else lines.push(`・${g.taiwanOrganicSessions} 人　${arrow(g.taiwanOrganicSessions, gPrev.taiwanOrganicSessions)}${yday ? `（昨 ${gPrev.taiwanOrganicSessions ?? '—'}）` : ''}`);

  // GSC 總覽
  lines.push('', '*【Google 搜尋數據】*');
  if (s.error) lines.push('・⚠️ Google 搜尋數據抓取失敗');
  else {
    const t = s.totals || {};
    lines.push(`・被看到 ${t.impressions} 次・有人點 ${t.clicks} 次・點擊率 ${(t.ctr * 100).toFixed(1)}%・平均排名 ${t.position ? t.position.toFixed(1) : '—'}`);
    lines.push(`　（資料 ${s.range}，有 2–3 天延遲；數字大跳動多為統計區間移動，看趨勢別看絕對值）`);
  }

  // striking distance
  if (!s.error && (s.strikingDistance || []).length) {
    lines.push('', '*【最該推一把：排 5–15 名、快進第一頁的字】*');
    for (const r of s.strikingDistance.slice(0, 3)) {
      lines.push(`・「${r.query}」${pageShort(r.page)}　排 ${r.position.toFixed(1)}・被看到 ${r.impressions} 次・${r.clicks ? `${r.clicks} 點擊` : '0 點擊'}`);
    }
  }

  // 旗艦頁索引狀態
  if (!idx.error && (idx.coverage || []).length) {
    const byUrl = Object.fromEntries(idx.coverage.map((c) => [c.url, c.coverageState]));
    const prevByUrl = (yday && yday.index && !yday.index.error)
      ? Object.fromEntries((yday.index.coverage || []).map((c) => [c.url, c.coverageState])) : {};
    lines.push('', '*【旗艦頁 Google 收錄狀態】*');
    for (const url of FLAGSHIP) {
      if (!(url in byUrl)) continue;
      const name = PAGE_NAME[url] || pageShort(url);
      const changed = prevByUrl[url] && coverageLabel(prevByUrl[url]) !== coverageLabel(byUrl[url])
        ? '（昨 ' + coverageLabel(prevByUrl[url]) + '，翻牌！）' : '';
      lines.push(`・${name} ${coverageLabel(byUrl[url])}${changed}`);
    }
  }

  lines.push('', `📄 完整數據：data/seo-daily/${date}.json`);
  return lines.join('\n');
}

// ── 發 Slack ─────────────────────────────────────────────
async function postSlack(text) {
  const token = process.env.SLACK_BOT_TOKEN
    || (existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : '');
  if (!token) throw new Error(`缺 Slack token（env SLACK_BOT_TOKEN 或 ${TOKEN_FILE}）`);
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: CHANNEL, text, unfurl_links: false }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`Slack 發送失敗：${j.error}`);
  return j.ts;
}

async function main() {
  try { execSync('git fetch -q origin main', { cwd: repo, stdio: 'ignore' }); } catch { /* 離線也讓它讀本機 */ }
  const date = dateArg || twDate(0);
  const today = loadJSON(date);
  const yday = loadJSON(prevDate(date));
  const text = buildMessage(date, today, yday);

  if (DRY) { console.log('─── 預覽（未發送）───\n' + text); return; }
  const ts = await postSlack(text);
  console.log(`✓ 已發 Slack（${date}，ts=${ts}）`);
}

function prevDate(iso) {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
