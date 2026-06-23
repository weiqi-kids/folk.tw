#!/usr/bin/env node
// 部署後「一鍵雙推」：同一組網址同時送 Google Indexing API ＋ IndexNow（Bing/Yandex/Seznam/Naver）。
// 兩者涵蓋互補（Google 不參與 IndexNow），故更新內容後跑這支即完整通知各大引擎。
//
// 用法（參數會同時轉給兩支子腳本）：
//   node scripts/notify.mjs                 # 預設高槓桿集（各模組首頁＋封存＋月份樞紐）
//   node scripts/notify.mjs <url> [url...]  # 只送指定網址
//   node scripts/notify.mjs --all           # 送 sitemap 全部網址
//   （或 pnpm notify [...]）
//
// 設計：Google 配額有限（每日 200）會先跑；IndexNow 無配額後跑。任一支失敗只記錄、不中斷另一支。

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function run(script) {
  return new Promise((resolve) => {
    const label = script.replace(/\.mjs$/, '');
    console.log(`\n──────── ${label} ────────`);
    const child = spawn(process.execPath, [join(here, script), ...args], { stdio: 'inherit' });
    child.on('close', (code) => resolve({ script, code }));
    child.on('error', (e) => { console.error(`${label} 啟動失敗：${e.message}`); resolve({ script, code: 1 }); });
  });
}

const results = [];
results.push(await run('index-ping.mjs'));    // Google（配額有限，先跑）
results.push(await run('indexnow-ping.mjs'));  // IndexNow（無配額，後跑）

const failed = results.filter((r) => r.code !== 0);
console.log(`\n════ 雙推完成：成功 ${results.length - failed.length}/${results.length} ════`);
if (failed.length) {
  console.log('失敗：' + failed.map((r) => r.script).join('、') + '（其餘已送達）');
  process.exit(1);
}
