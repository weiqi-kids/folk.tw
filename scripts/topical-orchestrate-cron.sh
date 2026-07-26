#!/usr/bin/env bash
# 時事祈福自動編排 cron 包裝：pull → 跑編排 → topical.json 有變才 commit + push（觸發部署）+ Slack 通知。
# 由 /etc/cron.d/folk-qiugian 每 20 分呼叫。時事頁時效性高 → 不用 [skip ci]，push 即自動部署上線。
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/lib/cron-worktree.sh"

# 在隔離 worktree 執行：主工作樹的未提交改動不會被誤 commit（見 lib/cron-worktree.sh 檔頭）。
cw_begin "[topical-cron]"

OUT="$(/usr/bin/node scripts/topical-orchestrate.mjs)" || { echo "[topical-cron] 編排失敗"; exit 1; }
[ -n "$OUT" ] && echo "$OUT"

cw_commit_push "[topical-cron]" "feat(topical): 時事祈福自動編排 $(date -u +%FT%H:%MZ)" || { echo "[topical-cron] 無變更"; exit 0; }

# 對每個新開的祈福頁發 Slack（過了正向議題閘、開後通知、可事後撤）
TOKEN="$(cat /root/.config/folk-tw/slack-bot-token)"
echo "$OUT" | grep '^PUBLISHED' | while IFS=$'\t' read -r _ id title url; do
  TEXT="🕯 已自動開一個祈福頁（已過正向議題閘）：${title}  ${url}　（部署中，約一分鐘上線；若不妥可回覆撤下）"
  PAYLOAD="$(TEXT="$TEXT" node -e 'process.stdout.write(JSON.stringify({channel:"C0BCPHBF1ML",text:process.env.TEXT,unfurl_links:false}))')"
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer ${TOKEN}" -H "Content-type: application/json; charset=utf-8" \
    --data "$PAYLOAD" >/dev/null && echo "[topical-cron] 已通知：$title"
done
