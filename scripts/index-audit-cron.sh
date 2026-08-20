#!/usr/bin/env bash
# 全站索引涵蓋率稽核 cron 包裝（2026-07-28 建；2026-08-20 實作抽到 gsc-index）。
#
# ⚠️ 實作已不在本 repo：/root/gsc-index（https://github.com/weiqi-kids/gsc-index），
#   對 14 個納管站台通用。本站的 scripts/audit-index-coverage.mjs 現在是薄包裝。
#   **要改行為去 gsc-index 改**，改這裡只有 folk.tw 生效、其他站不會跟上。
#
# 做什麼：對站上每一個頁面逐一跑 GSC URL Inspection，把收錄狀態全量記錄下來（不抽樣）。
#   每日配額 2,000、全站約 12,000 頁 → 約 6 天掃完一輪；掃完後自動改為滾動重查最舊的，
#   所以長期永遠有一份「全站每頁的最新收錄狀態」，不必再從 GSC 後台匯出。
#
# 為什麼不進隔離 worktree：它**完全不碰 git**（進度檔在 repo 外 /root/.config/folk-tw/index-audit.json），
#   且必須讀主工作樹的 dist/ 才涵蓋得到刻意排除 sitemap 的頁面（土地公廟／未來農民曆）——
#   gsc-index 由站台設定的 `repo` 欄位定位 dist，所以就算不 cd 也找得到。
#   dist 不存在時腳本會自己退回線上 sitemap 並在 log 標明涵蓋範圍縮小。
#
# 查結果：node scripts/audit-index-coverage.mjs --report
#         node scripts/audit-index-coverage.mjs --list "Crawled - currently not indexed"
set -euo pipefail
cd /root/folk.tw

echo "=== $(date -u +%FT%H:%MZ) 全站索引稽核 ==="
# --max 1800：留 200 額度給 seo-collect 的每日收錄檢查（它每天約用 34 次）與臨時人工查詢。
/usr/bin/node scripts/audit-index-coverage.mjs --max 1800
