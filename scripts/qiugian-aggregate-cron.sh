#!/usr/bin/env bash
# 求籤共情層每晚聚合 cron 包裝：同步 → 跑 GA4 聚合 → 有變更才 commit [skip ci] + push。
# 由 /etc/cron.d/folk-qiugian 每日 UTC 15:07 呼叫；deploy.yml 每日 16:00 UTC 重建套用新數字。
#
# 🔴 2026-08-03 修：本支從 2026-07-29 起每天都失敗（`fatal: Cannot rebase onto multiple
# branches.`），src/data/qiugian-stats.json 因此停在 7/29，站上「本週 N 人求籤」是舊數字。
# 根因是**跟 topical cron 搶 FETCH_HEAD**：
#   - topical 三支跑在隔離 worktree `/opt/folk-tw-cron/topical`，但 worktree 共用同一個
#     common git dir，`FETCH_HEAD` 就在 `/root/folk.tw/.git/FETCH_HEAD`＝**兩邊同一個檔**。
#   - `lib/cron-worktree.sh` 會跑 `git fetch -q origin`；本支原本用 `git pull --rebase origin main`
#     （內部也會 fetch 並寫 FETCH_HEAD）。兩個 fetch 交錯寫入 → FETCH_HEAD 出現 2 筆
#     for-merge 條目 → rebase 拒絕執行。
#   - 觸發是必然而非偶然：topical 是 `*/20`（:00/:20/:40），本支原排 **15:00**＝每天固定對撞。
# 兩道修法一起上（缺一都還會再犯）：
#   ① 不再依賴 FETCH_HEAD：改成 `git fetch origin main` 後 rebase 到 **`origin/main`** 這個
#      remote-tracking ref。它是具名的單一 ref，別人同時 fetch 也不會讓它變成「多個分支」。
#   ② cron 分鐘從 :00 移到 :07，避開 `*/20` 的固定重疊（純降低機率，真正的修法是 ①）。
#
# ⚠️ 已知缺口（未修，需另案）：本支仍在**主工作樹**跑並用 `--autostash`，
# 與 2026-07-25 topical 那次「把人手改到一半的檔一起 commit」是同一個風險類別
# （見 lib/cron-worktree.sh 檔頭）。topical 已改成隔離 worktree，本支還沒。
# 要改需把 cw_* 那組 helper 參數化（目前寫死只准動 topical.json）。
set -euo pipefail
cd /root/folk.tw

git fetch -q origin main || { echo "[qiugian-cron] fetch 失敗，跳過"; exit 1; }
git rebase --autostash origin/main || {
  git rebase --abort 2>/dev/null || true
  echo "[qiugian-cron] rebase 失敗，跳過"
  exit 1
}

/usr/bin/node scripts/qiugian-aggregate.mjs

if ! git diff --quiet src/data/qiugian-stats.json; then
  git add src/data/qiugian-stats.json
  git commit -q -m "chore(qiugian): 每晚共情數字聚合 $(date -u +%F) [skip ci]"
  git push origin main
  echo "[qiugian-cron] 已更新並推送"
else
  echo "[qiugian-cron] 數字無變化，不 commit"
fi
