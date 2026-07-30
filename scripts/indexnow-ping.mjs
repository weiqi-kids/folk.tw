#!/usr/bin/env node
// 主動通知 IndexNow 參與引擎重新爬取網址（一次提交、多家同時收到：Bing / Yandex / Seznam / Naver…）。
// ⚠️ Google 不參與 IndexNow；Google 走 scripts/index-ping.mjs（Web Search Indexing API）。
//
// 前置（一次性）：public/<key>.txt 存在且內容＝<key>，並已部署上線
//   （IndexNow 會抓 https://folk.tw/<key>.txt 驗證網域所有權）。
//
// 用法：
//   node scripts/indexnow-ping.mjs                 # 預設高槓桿集：各模組首頁＋封存＋全部月份樞紐
//   node scripts/indexnow-ping.mjs <url> [url...]  # 只送指定網址
//   node scripts/indexnow-ping.mjs --all           # 送 sitemap 全部網址（自動分批）
//
// 金鑰讀取序：env INDEXNOW_KEY → 掃描 public/ 內 32 碼 hex 且「檔名 stem＝內容」之金鑰檔。
// IndexNow 單次最多 10000 筆；本腳本自動分批。回應 200/202 皆為已受理。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from './lib/google-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH = 10000;

const { gscSiteUrl } = loadConfig();
const SITE = gscSiteUrl.startsWith('sc-domain:')
  ? `https://${gscSiteUrl.slice('sc-domain:'.length)}`
  : gscSiteUrl.replace(/\/$/, '');
const HOST = new URL(SITE).host;

// ⚠️ 一律帶尾斜線（同 index-ping.mjs）：本站是 GitHub Pages，`/poems` 會 301 到 `/poems/`。
const CORE = ['/', '/almanac/', '/almanac/archive/', '/poems/', '/deities/', '/events/', '/practices/', '/temples/', '/about/'];

/** 送出前的機械保底：補上遺漏的尾斜線（帶副檔名的檔案路徑不動）。 */
function normalizeUrl(u) {
  try {
    const x = new URL(u);
    if (!x.pathname.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(x.pathname)) x.pathname += '/';
    return x.toString();
  } catch { return u; }
}

function resolveKey() {
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY.trim();
  if (!existsSync(publicDir)) throw new Error('找不到 public/，且未設 INDEXNOW_KEY。');
  for (const f of readdirSync(publicDir)) {
    const m = f.match(/^([a-zA-Z0-9-]{8,128})\.txt$/);
    if (!m) continue;
    const content = readFileSync(join(publicDir, f), 'utf8').trim();
    if (content === m[1]) return content; // 金鑰檔：檔名 stem＝內容
  }
  throw new Error('public/ 內找不到有效 IndexNow 金鑰檔（檔名 stem 須等於內容），且未設 INDEXNOW_KEY。');
}

async function sitemapUrls() {
  const xml = await (await fetch(`${SITE}/sitemap-0.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function defaultUrls() {
  const months = (await sitemapUrls()).filter((u) => /\/almanac\/month\/\d{4}-\d{2}\/?$/.test(u));
  return [...new Set([...CORE.map((p) => SITE + p), ...months])];
}

async function submit(key, keyLocation, urlList) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation, urlList }),
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, ok: res.ok, text };
}

async function main() {
  const key = resolveKey();
  const keyLocation = `${SITE}/${key}.txt`;
  const args = process.argv.slice(2);

  let urls;
  if (args.includes('--all')) {
    // 優先用 build 產出的全站清單（含刻意排除 sitemap 的 2,122 頁）；線上還沒有就退回 sitemap。
    // 見 scripts/gen-indexnow-urls.mjs：Google 不參與 IndexNow，故送這些頁不影響降稀釋設計。
    urls = null;
    try {
      const r = await fetch(`${SITE}/indexnow-urls.txt`);
      if (r.ok) {
        const list = (await r.text()).split('\n').map((x) => x.trim()).filter(Boolean);
        if (list.length) { urls = list; console.log(`使用全站清單 indexnow-urls.txt（${list.length} 筆）`); }
      }
    } catch { /* 退回 sitemap */ }
    if (!urls) { urls = await sitemapUrls(); console.log(`退回 sitemap（${urls.length} 筆）`); }
  }
  // `--from <檔>`：從檔案逐行讀網址（大批量用）。notify.mjs 會把同一組參數轉給兩支子腳本，
  // 而本檔原本沒實作 --from → 會把「--from」本身當網址送出（實測送出 https://folk.tw/--from），
  // 且真正的清單完全沒送。2026-07-30 補齊，與 index-ping.mjs 的參數介面對齊。
  else if (args.includes('--from') && args[args.indexOf('--from') + 1]) {
    const file = args[args.indexOf('--from') + 1];
    urls = readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    console.log(`自 ${file} 讀入 ${urls.length} 筆`);
  }
  // 其餘位置參數＝明確指定的網址；跳過旗標與旗標的值。
  else if (args.some((a) => !a.startsWith('--'))) {
    const flagValues = new Set();
    args.forEach((a, i) => { if (a === '--from') flagValues.add(args[i + 1]); });
    urls = args
      .filter((a) => !a.startsWith('--') && !flagValues.has(a))
      .map((u) => (u.startsWith('http') ? u : SITE + (u.startsWith('/') ? u : '/' + u)));
  }
  else urls = await defaultUrls();

  // 機械保底：絕不送出會 301 的網址（2026-07-28 GSC「頁面會重新導向」查因時補上）。
  const fixed = urls.filter((u) => normalizeUrl(u) !== u);
  if (fixed.length) console.log(`⚠️ ${fixed.length} 筆缺尾斜線已自動補上：${fixed.slice(0, 5).join(', ')}${fixed.length > 5 ? ' …' : ''}`);
  urls = [...new Set(urls.map(normalizeUrl))].filter((u) => u.startsWith(SITE)); // IndexNow 要求同網域
  if (!urls.length) { console.log('無可提交網址。'); return; }

  console.log(`IndexNow → ${HOST}（金鑰 ${keyLocation}）`);
  console.log(`提交 ${urls.length} 筆，分 ${Math.ceil(urls.length / BATCH)} 批…\n`);
  let okCount = 0;
  for (let i = 0; i < urls.length; i += BATCH) {
    const chunk = urls.slice(i, i + BATCH);
    const r = await submit(key, keyLocation, chunk);
    const note = r.status === 200 ? '已接受' : r.status === 202 ? '已受理（金鑰待驗證）' : r.text || '失敗';
    console.log(`  批 ${i / BATCH + 1}：${chunk.length} 筆 → HTTP ${r.status} ${note}`);
    if (r.ok || r.status === 202) okCount += chunk.length;
  }
  console.log(`\n完成：${okCount}/${urls.length} 已送達 IndexNow（分發至 Bing / Yandex / Seznam / Naver…）。`);
  console.log('提示：Google 不參與 IndexNow，請另跑 `pnpm index:ping`。');
}

main().catch((e) => { console.error('IndexNow 失敗：' + e.message); process.exit(1); });
