#!/usr/bin/env bash
# 時事祈福 · 後續發展追蹤 cron 包裝：pull → 跑後續追蹤（LLM+WebSearch 找新進展、機器複驗、去重、
#   append 時間軸、archived→memorial）→ topical.json 有變才 commit + push（觸發部署）→ 對
#   UPDATED／MEMORIAL 行發 Slack。後續發展屬持續記錄、非急件，但沿用 push 即部署上線。
# 排程由主控者親自裝進 /etc/cron.d（本檔不自行安裝）。
set -euo pipefail
cd /root/folk.tw

git pull --rebase --autostash origin main || { git rebase --abort 2>/dev/null || true; echo "[followup-cron] pull 失敗，跳過"; exit 1; }

OUT="$(/usr/bin/node scripts/topical-followup.mjs)" || { echo "[followup-cron] 追蹤失敗"; exit 1; }
[ -n "$OUT" ] && echo "$OUT"

if git diff --quiet src/data/topical.json; then
  echo "[followup-cron] 無變更"
  exit 0
fi

git add src/data/topical.json
# followup 中繼（last_checked/empty_runs/sealed）不被任何渲染頁使用 → 只有中繼變動時用 [skip ci] 免每日無謂部署；
# 有新進展（UPDATED）或升記錄頁（MEMORIAL）＝真的改到頁面 → 正常 push 觸發部署。
if echo "$OUT" | grep -qE '^(UPDATED|MEMORIAL)'; then
  git commit -q -m "feat(topical): 後續發展追蹤 $(date -u +%FT%H:%MZ)"
  echo "[followup-cron] 已 commit/push（有新進展/升態，觸發部署）"
else
  git commit -q -m "chore(topical): 後續追蹤中繼更新 $(date -u +%FT%H:%MZ) [skip ci]"
  echo "[followup-cron] 已 commit/push（僅中繼更新，[skip ci] 不部署）"
fi
git push origin main

TOKEN="$(cat /root/.config/folk-tw/slack-bot-token)"
slack() { # $1=text
  local payload
  payload="$(TEXT="$1" node -e 'process.stdout.write(JSON.stringify({channel:"C0BCPHBF1ML",text:process.env.TEXT,unfurl_links:false}))')"
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer ${TOKEN}" -H "Content-type: application/json; charset=utf-8" \
    --data "$payload" >/dev/null
}

# 逐筆後續發展通知（可回覆訂正）
echo "$OUT" | grep '^UPDATED' | while IFS=$'\t' read -r _ id title text url; do
  slack "🕯 事件有後續發展：${title}——${text}  ${url}（若有誤可回覆）" && echo "[followup-cron] 已通知後續：$title"
done

# 升為事件記錄頁通知
echo "$OUT" | grep '^MEMORIAL' | while IFS=$'\t' read -r _ id title url; do
  slack "📖 祈福頁已轉為事件記錄頁：${title}  ${url}" && echo "[followup-cron] 已通知轉記錄頁：$title"
done
