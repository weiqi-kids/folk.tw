#!/usr/bin/env node
// 把「這次 build 用的台北日期」寫進 dist，供產物層 gate 比對。
//
// 🔴 為什麼要有這支（2026-08-19）：`check:rendered` 的 render-context 用
//    `taipeiToday()` 在**gate 執行當下**重算日期，而完整 build 要 20 分鐘——
//    只要 build 跨過台北午夜，頁面是用昨天算的、gate 用今天重算，
//    所有「下一次國曆日期」的比對就會整批對不上。
//    實際發生：2026-08-19 15:45Z 開始（台北 23:45）、16:11Z 跑 gate（台北 00:11），
//    兩間廟的 meta description 被判「未含代表祭典句」——資料沒錯，是 gate 自己換了基準日。
//    這種假紅燈會擋住部署，而且每天午夜前後都可能再發生。
//
// ⚠️ 檔名以 `.` 開頭：它是給 gate 讀的建置狀態，不是要發佈的內容。
//    （dist 內的隱藏檔不會出現在 sitemap、也沒有頁面連過去。）

import { writeFileSync } from 'node:fs';

const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
writeFileSync('dist/.build-date', `${iso}\n`);
console.log(`✓ 建置基準日（台北）：${iso} → dist/.build-date`);
