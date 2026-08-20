#!/usr/bin/env node
// ⚠️ 這支已經變成薄包裝。實作在獨立專案 gsc-index（2026-08-20 抽出）：
//   /root/gsc-index/bin/gsc-index.mjs notify　repo: https://github.com/LightChang/gsc-index
//
// 部署後「一鍵雙推」：同一組網址同時送 Google Indexing API ＋ IndexNow。
// 設計不變：Google 配額有限（每日 200）先跑；IndexNow 無配額後跑；任一支失敗只記錄不中斷另一支。
//
// 🔴 **不要在這裡改行為**——要改去 gsc-index，否則其他 13 個站不會跟上。
// 用法與原本完全相同：pnpm notify [url...] / --all
import { spawnSync } from 'node:child_process';

const r = spawnSync('node', ['/root/gsc-index/bin/gsc-index.mjs', 'notify', '--site', 'folk.tw',
  ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
