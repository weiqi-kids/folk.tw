#!/usr/bin/env node
// ⚠️ 這支已經變成薄包裝。實作在獨立專案 gsc-index（2026-08-20 抽出）：
//   /root/gsc-index/lib/audit.mjs　repo: https://github.com/weiqi-kids/gsc-index
//
// 全站索引涵蓋率稽核：對站上每一個頁面逐一跑 GSC URL Inspection，全量記錄收錄狀態。
// 進度檔仍在 /root/.config/folk-tw/index-audit.json（repo 外），行為完全不變。
//
// 🔴 讀結果時的坑沒有變：那是**滾動掃描的快照**，一輪要好幾天。
//    不要拿它回答「某幾頁現在收錄了沒」——要問現況就對那幾頁重跑 URL Inspection。
//
// 用法與原本完全相同：
//   node scripts/audit-index-coverage.mjs            # 掃描（跨天續跑）
//   node scripts/audit-index-coverage.mjs --report   # 只出報表
//   node scripts/audit-index-coverage.mjs --list "Crawled - currently not indexed"
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const i = args.indexOf('--list');
const cmd = i >= 0 ? ['list', '--state', args[i + 1]]
  : args.includes('--report') ? ['report']
    : ['audit', ...args];
const r = spawnSync('node', ['/root/gsc-index/bin/gsc-index.mjs', ...cmd, '--site', 'folk.tw'],
  { stdio: 'inherit' });
process.exit(r.status ?? 1);
