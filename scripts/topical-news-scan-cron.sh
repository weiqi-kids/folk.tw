#!/usr/bin/env bash
# 時事祈福 · 新聞掃描 cron 包裝：pull → 跑新聞掃描（LLM+WebSearch）→ topical.json 有變才
#   commit + push（觸發部署）→ 對新開頁發 Slack。時效性高 → 不用 [skip ci]，push 即自動部署上線。
# 排程由主控者親自裝進 /etc/cron.d（本檔不自行安裝）。
set -euo pipefail
cd /root/folk.tw

git pull --rebase --autostash origin main || { git rebase --abort 2>/dev/null || true; echo "[news-scan-cron] pull 失敗，跳過"; exit 1; }

OUT="$(/usr/bin/node scripts/topical-news-scan.mjs)" || { echo "[news-scan-cron] 掃描失敗"; exit 1; }
[ -n "$OUT" ] && echo "$OUT"

if git diff --quiet src/data/topical.json; then
  echo "[news-scan-cron] 無變更"
  exit 0
fi

git add src/data/topical.json
git commit -q -m "feat(topical): 新聞掃描自動編排 $(date -u +%FT%H:%MZ)"
git push origin main
echo "[news-scan-cron] 已 commit/push（觸發部署）"

# 對每個新開的祈福頁發 Slack（過了正向議題閘、開後通知、可事後撤）
TOKEN="$(cat /root/.config/folk-tw/slack-bot-token)"
echo "$OUT" | grep '^PUBLISHED' | while IFS=$'\t' read -r _ id title url; do
  TEXT="🕯 已自動開一個祈福頁（新聞掃描＋已過正向議題閘）：${title}  ${url}　（部署中，約一分鐘上線；若不妥可回覆撤下）"
  PAYLOAD="$(TEXT="$TEXT" node -e 'process.stdout.write(JSON.stringify({channel:"C0BCPHBF1ML",text:process.env.TEXT,unfurl_links:false}))')"
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer ${TOKEN}" -H "Content-type: application/json; charset=utf-8" \
    --data "$PAYLOAD" >/dev/null && echo "[news-scan-cron] 已通知：$title"
done
