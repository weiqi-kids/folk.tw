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
import { corePaths } from './lib/core-urls.mjs';

const PUBLISH = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const MAX_PER_RUN = 190; // 留餘裕，避免觸頂每日 200 配額

// 由 GSC 設定推導站台根網址（sc-domain:folk.tw → https://folk.tw）；非 sc-domain 則直接用。
const { gscSiteUrl } = loadConfig();
const SITE = gscSiteUrl.startsWith('sc-domain:')
  ? `https://${gscSiteUrl.slice('sc-domain:'.length)}`
  : gscSiteUrl.replace(/\/$/, '');

// ⚠️ 一律帶尾斜線：本站是 GitHub Pages，`/poems` 會 301 到 `/poems/`。少一個斜線＝主動請 Google
// 收錄一個會重新導向的網址（2026-07-28 查 GSC「頁面會重新導向 2,304」時發現這 9 個裡有 8 個是 301）。
// 🔴 CORE 從檔案系統推導，唯一來源在 scripts/lib/core-urls.mjs——
//    以前這裡是寫死陣列，兩支腳本各一份，且新增模組後沒人記得回來加。
//    2026-08-07 實查：16 個模組樞紐只有 6 個在清單裡。別再改回寫死。
const CORE = corePaths();

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
  // ⚠️ fromIdx 為 -1（沒帶 --from）時，args[fromIdx + 1] 就是 args[0]＝第一個網址。
  // 舊寫法直接拿它比對，於是「pnpm notify <url...>」每次都**靜默吞掉第一個網址**，
  // 而畫面只顯示「送 N 筆」看起來像成功（2026-08-03 送節日頁時實測抓到：qianggu 沒送出）。
  // 同 5ea5dcc 的 indexnow --from 事故是同一類：參數解析出錯，輸出看起來仍正常。
  const fromValue = fromIdx >= 0 ? args[fromIdx + 1] : undefined;
  const explicit = args.filter((a) => !a.startsWith('--') && a !== fromValue);
  if (explicit.length) return [...new Set(explicit)];
  return defaultUrls();
}

// ── 待送佇列（2026-07-28 建）────────────────────────────────────────────────
// Google Indexing API 每日配額 200，一次要送 351 個鄉鎮頁時必然撞 429。原本撞到就 break，
// 沒送出去的網址直接消失——等於「配額不足＝默默丟掉」，人不看 log 根本不知道漏了什麼。
// 改成：撞 429 就把剩下的存進佇列，下次執行**優先送佇列**，送成功的移除。這樣跨天自動續完。
// 佇列刻意放 repo 外（純執行狀態，不是站台資料）：進 repo 會被每日 cron 一起 commit 並觸發部署。
const QUEUE = '/root/.config/folk-tw/index-ping-queue.json';

/**
 * ⚠️ 佇列毒化防線（2026-07-31 加，實遇）：佇列裡曾出現 `"3"`、`"1"` 這種**非網址**項目
 * （某次執行把數字參數當成網址收了進去）。它們**永遠不可能送成功**（API 回 400
 * `'url' is not in standard URL form`），而佇列只在成功時移除項目 →
 * 於是每天每次執行都白送一次請求、印一次 400，且**永遠不會自己消失**。
 * 故進出佇列一律只留「本站的 http(s) 絕對網址」，其餘直接丟棄並說明丟了什麼。
 */
const isSiteUrl = (u) => {
  if (typeof u !== 'string') return false;
  try {
    const p = new URL(u);
    return (p.protocol === 'https:' || p.protocol === 'http:') && `${p.protocol}//${p.host}` === SITE;
  } catch { return false; }
};

function readQueue() {
  let raw;
  try { raw = JSON.parse(readFileSync(QUEUE, 'utf8')); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const good = raw.filter(isSiteUrl);
  const bad = raw.filter((u) => !isSiteUrl(u));
  if (bad.length) console.log(`⚠️ 佇列有 ${bad.length} 筆非本站網址，已丟棄（永遠送不成功、會每次白撞 400）：${bad.slice(0, 5).map((x) => JSON.stringify(x)).join(', ')}`);
  return good;
}

function writeQueue(list) {
  try {
    mkdirSync(dirname(QUEUE), { recursive: true });
    writeFileSync(QUEUE, JSON.stringify([...new Set(list.filter(isSiteUrl))], null, 2) + '\n');
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
  // 配額用盡**不算失敗**：未送出的都進了佇列、下次執行自動續送，是設計中的正常路徑。
  // 若在此回非零，seo-collect 每天都會把「今天配額滿了」誤報成 index-ping 失敗
  // （2026-07-29 實際發生：前一天人工送了 227 筆吃掉當日配額，隔天那輪就被標成失敗）。
  // ⚠️ Google Indexing API 的每日配額以**太平洋時間**換日（UTC-7/8），不是 UTC 也不是台灣時間。
  // 只有「非配額原因且一筆都沒送成」才是真的失敗。
  if (fail && !ok && !quotaHit) process.exitCode = 1;
}

main().catch((e) => {
  console.error('錯誤：', e.message);
  process.exit(1);
});
