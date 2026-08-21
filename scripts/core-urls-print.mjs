#!/usr/bin/env node
// 印出站上的「高槓桿路徑」，一行一個——給 gsc-index 的 `coreUrlsCommand` 吃。
//
// 為什麼是一支獨立的印表機：收錄推送那一整套 2026-08-20 抽成了獨立專案 gsc-index
// （對 14 個納管站台通用），而「哪些是高槓桿網址」本來就是各站自己的事。
// gsc-index 因此把它做成可插拔：站台設定的 coreUrlsCommand 指到這裡。
//
// 內容＝各模組樞紐（由 scripts/lib/core-urls.mjs 從檔案系統推導，唯一來源）
//     ＋ 全部月份樞紐（Google 爬一個樞紐就能發現該月所有日期頁，少量配額觸發大量發現）。
import { corePaths } from './lib/core-urls.mjs';

const out = [...corePaths()];
try {
  const xml = await (await fetch('https://folk.tw/sitemap-0.xml')).text();
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const p = new URL(m[1]).pathname;
    if (/^\/almanac\/month\/\d{4}-\d{2}\/$/.test(p)) out.push(p);
  }
} catch (e) {
  console.error(`⚠️ 取 sitemap 失敗，只輸出模組樞紐：${e.message}`);
}
for (const p of [...new Set(out)]) console.log(p);
