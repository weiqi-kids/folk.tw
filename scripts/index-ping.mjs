#!/usr/bin/env node
// ⚠️ 這支已經變成薄包裝。實作在獨立專案 gsc-index（2026-08-20 抽出）：
//   /root/gsc-index/lib/ping.mjs　repo: https://github.com/weiqi-kids/gsc-index
//
// 為什麼抽出去：GSC 後台的「網頁未編入索引的原因」沒有公開 API，只能靠 urlInspection
// 全掃自己建清單；而配額續送、佇列、尾斜線正規化這些坑對 14 個納管站台一模一樣。
// 各站各寫一份就是各踩一次。
//
// 🔴 **不要在這裡改行為**——改了只有 folk.tw 生效，其他站不會跟上，
//    而且下一個人會以為這裡就是實作。要改去 gsc-index。
//
// 站台設定（含 coreUrlsCommand、indexNowKey）在 /root/seo-ops/sites/folk.tw.json。
// 用法與原本完全相同：node scripts/index-ping.mjs [url...] / --all / --deleted <url>
import { spawnSync } from 'node:child_process';

const r = spawnSync('node', ['/root/gsc-index/bin/gsc-index.mjs', 'ping', '--site', 'folk.tw',
  ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
