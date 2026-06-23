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

const CORE = ['/', '/almanac', '/almanac/archive', '/poems', '/deities', '/events', '/practices', '/temples', '/about'];

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
  if (args.includes('--all')) urls = await sitemapUrls();
  else if (args.length) urls = args.map((u) => (u.startsWith('http') ? u : SITE + (u.startsWith('/') ? u : '/' + u)));
  else urls = await defaultUrls();

  urls = [...new Set(urls)].filter((u) => u.startsWith(SITE)); // IndexNow 要求同網域
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
