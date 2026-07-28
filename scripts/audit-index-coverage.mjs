#!/usr/bin/env node
// 全站索引涵蓋率稽核：對**站上每一個頁面**逐一跑 GSC URL Inspection，把 Google 的收錄狀態
// 全量記錄下來。不是抽樣。
//
// 為什麼要自己做（2026-07-28 建）：
//   GSC 後台的「網頁未編入索引的原因」報告（頁面會重新導向／已找到未索引／已檢索未索引…）
//   **沒有公開 API**——Search Console API 只有 searchAnalytics／sitemaps／urlInspection 三支。
//   所以「那 310 頁到底是哪些」在後台之外拿不到現成清單。
//   但 urlInspection 可以逐頁查，只要肯全掃，就能自己把那份清單建出來。
//
// 配額：URL Inspection 每站每日 2,000 次、每分鐘 600 次。全站約 12,000 頁 → 約 6 天掃完一輪。
//   故本檔設計成**跨天續跑**：進度存檔，每次跑到配額用盡（429）為止，下次接著跑沒查過的；
//   全部查完後改為滾動重查「最久沒查」的，讓資料持續新鮮。
//   （與 index-ping 的待送佇列同一個慣例：配額不足不是「這次做不完就算了」，是存進度下次續。）
//
// 用法：
//   node scripts/audit-index-coverage.mjs                # 續跑；跑到配額用盡為止
//   node scripts/audit-index-coverage.mjs --max 500      # 這次最多查 500 個
//   node scripts/audit-index-coverage.mjs --report       # 只讀進度檔出報告，不呼叫 API
//   node scripts/audit-index-coverage.mjs --list "Crawled - currently not indexed"  # 列出該狀態全部網址
//
// 進度檔放 repo 外（純執行狀態，且會長到數 MB）：/root/.config/folk-tw/index-audit.json
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { inspectUrl, loadConfig } from './lib/google-data.mjs';

const DIST = 'dist';
const ORIGIN = 'https://folk.tw';
const STATE = '/root/.config/folk-tw/index-audit.json';
const QPM_DELAY = 130; // 每分鐘上限 600 → 130ms 約 460/min，留餘裕

const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const MAX = Number(argVal('--max') ?? Infinity);

/** 站上實際存在的每一個頁面（含刻意排除 sitemap 者：土地公廟頁、未來農民曆頁）。 */
function allPageUrls() {
  const out = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === 'index.html') {
        const path = p.slice(DIST.length, -'index.html'.length);
        out.push(ORIGIN + encodeURI(path));
      }
    }
  })(DIST);
  return [...new Set(out)].sort();
}

const loadState = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return { results: {} }; } };
function saveState(s) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(s));
}

function report(state, urls) {
  const tally = new Map();
  let checked = 0;
  for (const u of urls) {
    const r = state.results[u];
    if (!r) continue;
    checked++;
    tally.set(r.state, (tally.get(r.state) ?? 0) + 1);
  }
  console.log(`\n=== 全站索引涵蓋率（已查 ${checked} / ${urls.length} 頁，${(checked / urls.length * 100).toFixed(1)}%）===`);
  for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(6)}  ${(v / checked * 100).toFixed(1).padStart(5)}%  ${k}`);
  }
  const left = urls.length - checked;
  if (left) console.log(`\n尚未查 ${left} 頁；每日配額 2,000，約再 ${Math.ceil(left / 2000)} 天掃完（每天跑一次即可）。`);
}

const state = loadState();
const urls = allPageUrls();

if (args.includes('--list')) {
  const want = argVal('--list');
  const hits = urls.filter((u) => state.results[u]?.state === want);
  console.log(`# ${want}：${hits.length} 頁`);
  for (const u of hits) console.log(decodeURI(u));
  process.exit(0);
}
if (args.includes('--report')) { report(state, urls); process.exit(0); }

const { gscSiteUrl } = await loadConfig();
// 先查沒查過的；全查完後改滾動重查最舊的，讓資料保持新鮮。
const pending = urls.filter((u) => !state.results[u]);
const queue = pending.length
  ? pending
  : [...urls].sort((a, b) => (state.results[a]?.checkedAt ?? '').localeCompare(state.results[b]?.checkedAt ?? ''));

console.log(`站上共 ${urls.length} 頁；已查 ${urls.length - pending.length}，本輪待查 ${Math.min(queue.length, MAX)}。`);

let done = 0, quota = false;
for (const u of queue) {
  if (done >= MAX) break;
  try {
    const r = await inspectUrl(gscSiteUrl, u);
    state.results[u] = {
      state: r?.coverageState ?? '(無回應)',
      lastCrawl: r?.lastCrawlTime ?? null,
      checkedAt: new Date().toISOString(),
    };
    done++;
    if (done % 200 === 0) { saveState(state); console.log(`  … 已查 ${done}`); }
  } catch (e) {
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(e.message)) {
      console.log(`配額用盡（查了 ${done} 個），存檔停止；明天再跑一次就會接著查。`);
      quota = true;
      break;
    }
    state.results[u] = { state: `ERR: ${e.message.slice(0, 60)}`, checkedAt: new Date().toISOString() };
    done++;
  }
  await new Promise((r) => setTimeout(r, QPM_DELAY));
}
saveState(state);
console.log(`本輪查了 ${done} 頁${quota ? '（配額用盡）' : ''}。`);
report(state, urls);
