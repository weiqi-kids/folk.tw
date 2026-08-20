#!/usr/bin/env node
// 把「這次 build 用的台北日期」釘成一個檔案，讓整條 build 鏈共用同一天。
//
// 🔴 為什麼要有這支（2026-08-19）：`check:rendered` 的 render-context 用
//    `Intl.DateTimeFormat('Asia/Taipei')` 在**gate 執行當下**重算日期，而完整 build 要 20 分鐘——
//    只要 build 跨過台北午夜，頁面是用昨天算的、gate 用今天重算，
//    所有「下一次國曆日期」的比對就會整批對不上。
//    實際發生：2026-08-19 15:45Z 開始（台北 23:45）、16:11Z 跑 gate（台北 00:11），
//    兩間廟的 meta description 被判「未含代表祭典句」——資料沒錯，是 gate 自己換了基準日。
//
// 🔴 2026-08-21 改了**時機**：原本這支跑在 postbuild 開頭，記的是「20 分鐘 build 跑完之後」
//    的日期，而頁面各自在自己 render 的那一刻取日期——戳記與頁面本來就可能差一天，
//    只是把假紅燈的窗口縮小，沒有消掉。現在：
//      · `pnpm build` 的**第一步**寫 `.build-date`（repo 根）
//      · 頁面、OG 卡、來源層 gate 全部改讀它（src/lib/build-date.ts）
//      · postbuild 的**最後一步** `--publish` 把它複製進 `dist/.build-date` 並刪掉根戳記
//    ⚠️ 根戳記不能直接寫進 dist：`astro build` 開場會清空 outDir，寫在那裡活不過 build。
//    ⚠️ `--publish` 排在最後而不是最前：postbuild 中途的 gate 若失敗，根戳記會留著，
//       接手的人重跑 `pnpm check:rendered` 仍然對得上同一天（比留一個半套的 dist 戳記好）。
//
// ⚠️ 檔名以 `.` 開頭：它是給 gate 讀的建置狀態，不是要發佈的內容。
//    （dist 內的隱藏檔不會出現在 sitemap、也沒有頁面連過去。）
//
// 用法：
//   node scripts/gen-build-stamp.mjs             # 寫 .build-date（build 鏈第一步）
//   node scripts/gen-build-stamp.mjs --publish   # 複製到 dist/.build-date 並刪掉根戳記

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { taipeiDateOf, ROOT_STAMP, DIST_STAMP } from '../src/lib/build-date.ts';

if (process.argv.includes('--publish')) {
  // 🔴 這裡刻意**不**呼叫 buildDate()：那支會 memoize、也會退回時鐘，
  //    而這一步要做的是「把根戳記原封搬進 dist」——搬不到就要炸，不能拿今天的日期頂替。
  const iso = readFileSync(ROOT_STAMP, 'utf8').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`${ROOT_STAMP} 內容不是 YYYY-MM-DD：${iso}`);
  writeFileSync(DIST_STAMP, `${iso}\n`);
  rmSync(ROOT_STAMP, { force: true });
  console.log(`✓ 建置基準日 ${iso} → ${DIST_STAMP}（已收回 ${ROOT_STAMP}）`);
} else {
  // 寫入者只能看時鐘：讀既有戳記會讓「上一次 build 的日期」黏在這一次身上。
  const { iso } = taipeiDateOf(new Date());
  writeFileSync(ROOT_STAMP, `${iso}\n`);
  console.log(`✓ 建置基準日（台北）：${iso} → ${ROOT_STAMP}`);
}
