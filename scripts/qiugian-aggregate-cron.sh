#!/usr/bin/env bash
# 求籤共情層每晚聚合 cron 包裝：pull → 跑 GA4 聚合 → 有變更才 commit [skip ci] + push。
# 由 /etc/cron.d/folk-qiugian 每日 UTC 15:00 呼叫；deploy.yml 每日 16:00 UTC 重建套用新數字。
set -euo pipefail
cd /root/folk.tw

git pull --rebase --autostash origin main || { git rebase --abort 2>/dev/null || true; echo "[qiugian-cron] pull 失敗，跳過"; exit 1; }

/usr/bin/node scripts/qiugian-aggregate.mjs

if ! git diff --quiet src/data/qiugian-stats.json; then
  git add src/data/qiugian-stats.json
  git commit -q -m "chore(qiugian): 每晚共情數字聚合 $(date -u +%F) [skip ci]"
  git push origin main
  echo "[qiugian-cron] 已更新並推送"
else
  echo "[qiugian-cron] 數字無變化，不 commit"
fi
