#!/usr/bin/env bash
# folk.tw 資料層「收集數據」本機 cron 進入點（取代 GitHub Action seo-daily.yml）。
# 純資料流、無 AI：拉 GA4+GSC → 產 data/seo-daily/<台灣日期>.json → commit [skip ci] → push
#   → Google index:ping（高槓桿集）。下游（心跳 05:00、大腦 05:55）讀此 JSON。
#
# 為何搬本機：配合大腦/心跳一起落到自有主機，整條 SEO 自動化不再依賴任何雲端。
# 金鑰：scripts/.google-sa-key.json（已 gitignore，本機既有）。
#
# 用法：scripts/seo-collect-cron.sh
# crontab：見 /etc/cron.d/folk-tw-seo-collect（每日 04:30 台 = 20:30 UTC，排在心跳/大腦之前）
set -uo pipefail

export PATH="/root/.local/bin:/usr/local/bin:/usr/bin:/bin"
export TZ="Asia/Taipei"
export GA4_PROPERTY_ID="${GA4_PROPERTY_ID:-542419964}"
export GSC_SITE_URL="${GSC_SITE_URL:-sc-domain:folk.tw}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1
mkdir -p logs
DATE="$(date +%F)"   # TZ=Asia/Taipei → 台灣日期

echo "===== [seo-collect] $DATE $(date '+%T %Z') 開始 ====="

# 1) 同步 main（避免與其他本機 push 衝突）
git pull --rebase --autostash origin main 2>&1 || echo "[seo-collect] git pull 失敗（續行）"

# 2) 產今日 JSON
if ! node scripts/seo-daily.mjs; then
  echo "[seo-collect] ✗ seo-daily.mjs 失敗，今日不 commit"
  echo "===== [seo-collect] $DATE $(date '+%T %Z') 結束（失敗）====="
  exit 1
fi

# 3) commit + push（[skip ci] 不觸發部署；本機 push 本就不自動部署）
git add data/seo-daily/
if git diff --cached --quiet; then
  echo "[seo-collect] 無變更，略過 commit"
else
  git commit -q -m "chore(seo): 每日數據 ${DATE} [skip ci]"
  git pull --rebase --autostash origin main 2>&1 || true
  if git push origin main 2>&1; then
    echo "[seo-collect] ✓ 已 push 今日數據"
  else
    echo "[seo-collect] ✗ push 失敗（JSON 已在本機，下游仍可讀本機檔）"
  fi
fi

# 4) Google Indexing API 推高槓桿集（金鑰在本機；失敗不影響）
node scripts/index-ping.mjs 2>&1 || echo "[seo-collect] index:ping 略過/失敗"

echo "===== [seo-collect] $DATE $(date '+%T %Z') 結束 ====="
