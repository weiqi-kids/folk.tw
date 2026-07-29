#!/usr/bin/env node
// build 後產生「站上全部頁面」清單 `dist/indexnow-urls.txt`，供 IndexNow 提交用。
//
// 為什麼不能直接用 sitemap（2026-07-28 Bing Webmaster 報「Some important pages weren't
// submitted via IndexNow，30 頁」才發現）：
//   sitemap 只有 9,882 個 URL，站上實際有 12,004 頁——差的 2,122 頁是**刻意排除 sitemap** 的
//   土地公廟頁（1,384）與未來農民曆日期頁（730）。它們照樣公開、照樣被爬得到，只是我們從沒
//   主動通知過搜尋引擎，於是 Bing 判定「重要頁未經 IndexNow 提交」。
//
// 為什麼可以送給 IndexNow，卻仍然不放進 sitemap（這不矛盾）：
//   排除 sitemap 是為了**節省 Google 的爬取預算**（避免 3,000 篇樣板化未來日期頁淹沒約 370 篇
//   真正獨特的頁），而 **Google 不參與 IndexNow**——IndexNow 只分發給 Bing／Yandex／Seznam／Naver。
//   兩件事作用在不同搜尋引擎、不同管道上，故可以並存。
//
// 這個清單檔在 robots.txt 被 Disallow：它是給我們自己的 CI 讀的（fetch 不受 robots 限制），
// 不是給爬蟲當發現來源——否則 Googlebot 爬到它就等於繞過上面那個降稀釋設計。
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ORIGIN = process.env.SITE_URL?.replace(/\/$/, '') || 'https://folk.tw';
const OUT = join(DIST, 'indexnow-urls.txt');

const urls = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name === 'index.html') urls.push(ORIGIN + encodeURI(p.slice(DIST.length, -'index.html'.length)));
  }
})(DIST);

const sorted = [...new Set(urls)].sort();
writeFileSync(OUT, sorted.join('\n') + '\n');
console.log(`✓ ${OUT}：${sorted.length} 個 URL（sitemap 之外另含刻意排除的土地公廟頁與未來農民曆頁）`);
