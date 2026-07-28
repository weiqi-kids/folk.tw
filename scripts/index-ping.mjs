#!/usr/bin/env node
// 主動通知 Google 重新爬取網址（Google Web Search Indexing API · urlNotifications:publish）。
//
// 前置（一次性，已完成）：
//   1. GCP 專案啟用「Web Search Indexing API」。
//   2. 服務帳號（見 scripts/lib/google-data.mjs）在 Search Console 該資源為「擁有者(Owner)」
//      —— 注意「完整(Full)」不夠，Indexing API 只認擁有者。
//
// 用法：
//   node scripts/index-ping.mjs                 # 預設高槓桿集：封存索引＋/almanac＋全部月份樞紐＋各模組首頁
//   node scripts/index-ping.mjs <url> [url...]  # 只送指定網址
//   node scripts/index-ping.mjs --all           # 送 sitemap 全部網址（受每日配額上限截斷）
//   node scripts/index-ping.mjs --deleted <url> # 通知網址已移除（type=URL_DELETED）
//
// 配額：Indexing API 預設每日 200 筆。本腳本上限 MAX_PER_RUN 保護，超過會截斷並提示。
// 提示：月份樞紐是關鍵——Google 爬每個樞紐即可發現該月所有日期頁連結（少量配額觸發大量發現）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getAccessToken, loadConfig } from './lib/google-data.mjs';

const PUBLISH = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const MAX_PER_RUN = 190; // 留餘裕，避免觸頂每日 200 配額

// 由 GSC 設定推導站台根網址（sc-domain:folk.tw → https://folk.tw）；非 sc-domain 則直接用。
const { gscSiteUrl } = loadConfig();
const SITE = gscSiteUrl.startsWith('sc-domain:')
  ? `https://${gscSiteUrl.slice('sc-domain:'.length)}`
  : gscSiteUrl.replace(/\/$/, '');

// ⚠️ 一律帶尾斜線：本站是 GitHub Pages，`/poems` 會 301 到 `/poems/`。少一個斜線＝主動請 Google
// 收錄一個會重新導向的網址（2026-07-28 查 GSC「頁面會重新導向 2,304」時發現這 9 個裡有 8 個是 301）。
const CORE = ['/', '/almanac/', '/almanac/archive/', '/poems/', '/deities/', '/events/', '/practices/', '/temples/', '/about/'];

/**
 * 送出前的機械保底：補上遺漏的尾斜線（帶副檔名的檔案路徑不動）。
 * 靠人記得加斜線是不夠的——CORE 就這樣錯了很久，改用機械強制。
 */
export function normalizeUrl(u) {
  try {
    const x = new URL(u);
    if (!x.pathname.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(x.pathname)) x.pathname += '/';
    return x.toString();
  } catch { return u; }
}

async function sitemapUrls() {
  const xml = await (await fetch(`${SITE}/sitemap-0.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

/** 預設高槓桿集：各模組首頁 + 封存索引 + 全部月份樞紐（爬取入口）。 */
async function defaultUrls() {
  const months = (await sitemapUrls()).filter((u) => /\/almanac\/month\/\d{4}-\d{2}\/?$/.test(u));
  return [...new Set([...CORE.map((p) => SITE + p), ...months])];
}

async function resolveUrls(args) {
  if (args.includes('--all')) return [...new Set(await sitemapUrls())];
  const fromIdx = args.indexOf('--from');
  if (fromIdx >= 0 && args[fromIdx + 1]) {
    const lines = readFileSync(args[fromIdx + 1], 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    return [...new Set(lines)];
  }
  const explicit = args.filter((a) => !a.startsWith('--') && a !== args[fromIdx + 1]);
  if (explicit.length) return [...new Set(explicit)];
  return defaultUrls();
}

// ── 待送佇列（2026-07-28 建）────────────────────────────────────────────────
// Google Indexing API 每日配額 200，一次要送 351 個鄉鎮頁時必然撞 429。原本撞到就 break，
// 沒送出去的網址直接消失——等於「配額不足＝默默丟掉」，人不看 log 根本不知道漏了什麼。
// 改成：撞 429 就把剩下的存進佇列，下次執行**優先送佇列**，送成功的移除。這樣跨天自動續完。
// 佇列刻意放 repo 外（純執行狀態，不是站台資料）：進 repo 會被每日 cron 一起 commit 並觸發部署。
const QUEUE = '/root/.config/folk-tw/index-ping-queue.json';
const readQueue = () => { try { return JSON.parse(readFileSync(QUEUE, 'utf8')); } catch { return []; } };
function writeQueue(list) {
  try {
    mkdirSync(dirname(QUEUE), { recursive: true });
    writeFileSync(QUEUE, JSON.stringify([...new Set(list)], null, 2) + '\n');
  } catch (e) { console.log(`⚠️ 佇列寫入失敗（${e.message}），未送出的網址這次不會保留。`); }
}

async function main() {
  const args = process.argv.slice(2);
  const type = args.includes('--deleted') ? 'URL_DELETED' : 'URL_UPDATED';
  let urls = await resolveUrls(args);
  // 機械保底：任何來源（CORE／命令列參數／sitemap）的網址都先正規化，絕不送出會 301 的網址。
  const fixed = urls.filter((u) => normalizeUrl(u) !== u);
  if (fixed.length) console.log(`⚠️ ${fixed.length} 筆缺尾斜線已自動補上（送 301 網址等於浪費配額）：${fixed.slice(0, 5).join(', ')}${fixed.length > 5 ? ' …' : ''}`);
  urls = [...new Set(urls.map(normalizeUrl))];

  // 佇列優先：上次撞配額沒送完的，這次排在最前面（跨天自動續完，不必人記得補送）。
  const queued = readQueue().map(normalizeUrl);
  if (queued.length) {
    console.log(`↻ 待送佇列有 ${queued.length} 筆，優先送出。`);
    urls = [...new Set([...queued, ...urls])];
  }

  const overflow = urls.length > MAX_PER_RUN ? urls.slice(MAX_PER_RUN) : [];
  if (urls.length > MAX_PER_RUN) {
    console.log(`⚠️ ${urls.length} 筆超過單次上限 ${MAX_PER_RUN}（每日配額 200），只送前 ${MAX_PER_RUN} 筆；其餘 ${overflow.length} 筆進佇列，下次優先送。`);
    urls = urls.slice(0, MAX_PER_RUN);
  }
  console.log(`送 ${urls.length} 筆（type=${type}）→ ${SITE}`);

  const token = await getAccessToken('https://www.googleapis.com/auth/indexing');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  let ok = 0;
  let fail = 0;
  const errs = [];
  const sent = new Set();
  let quotaHit = false;
  for (const url of urls) {
    const r = await fetch(PUBLISH, { method: 'POST', headers, body: JSON.stringify({ url, type }) });
    if (r.status === 200) {
      ok++; sent.add(url);
    } else {
      fail++;
      const body = await r.text().catch(() => '');
      if (errs.length < 5) errs.push(`${url} → ${r.status} ${body.slice(0, 100)}`);
      if (r.status === 429) {
        console.log('配額用盡（429），停止；未送出的網址存進佇列，下次執行自動續送。');
        quotaHit = true;
        break;
      }
    }
  }
  // 佇列結算：這次沒送成功的（含撞 429 後略過的）＋ 超出單次上限的，全部留給下次。
  const pending = [...urls.filter((u) => !sent.has(u)), ...overflow];
  const stillQueued = queued.filter((u) => !sent.has(u));
  const nextQueue = [...new Set([...stillQueued, ...pending])];
  if (nextQueue.length || queued.length) writeQueue(nextQueue);

  console.log(`\n=== 完成：成功 ${ok}、失敗 ${fail} ===`);
  if (nextQueue.length) console.log(`↻ 佇列剩 ${nextQueue.length} 筆待送（${QUEUE}），下次執行自動續送。`);
  else if (queued.length) console.log('↻ 佇列已清空。');
  for (const e of errs) console.log('  ✗', e);
  void quotaHit;
  if (fail && !ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error('錯誤：', e.message);
  process.exit(1);
});
