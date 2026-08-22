#!/usr/bin/env bash
# 時事祈福 · 新聞掃描 cron 包裝：pull → 跑新聞掃描（LLM+WebSearch）→ topical.json 有變才
#   commit + push（觸發部署）→ 對新開頁發 Slack。時效性高 → 不用 [skip ci]，push 即自動部署上線。
# 排程由主控者親自裝進 /etc/cron.d（本檔不自行安裝）。
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/lib/cron-worktree.sh"

# 在隔離 worktree 執行：主工作樹的未提交改動不會被誤 commit（見 lib/cron-worktree.sh 檔頭）。
cw_begin "[news-scan-cron]"

OUT="$(/usr/bin/node scripts/topical-news-scan.mjs)" || { echo "[news-scan-cron] 掃描失敗"; exit 1; }
[ -n "$OUT" ] && echo "$OUT"

# 🔴 偵測器健康告警（2026-08-22）。scanNews() 失敗時回空陣列、腳本照樣 exit 0，
#    所以「掃描器掛了」與「這輪沒有事件」在這裡長得一模一樣——2026-08-11～08-17 就是這樣
#    連續失敗 10 輪沒有任何人發現（見 lib/topical-report.mjs 的 reportScanFailed 註解）。
#    node 那側在連續失敗達門檻時會印 SCAN_FAILED，恢復時印 SCAN_RECOVERED。
#    ⚠️ 這一段必須排在 cw_commit_push **之前**：那支在無變更時會 exit 0，
#    而掃描失敗的那一輪正好就是「無變更」。
SLACK_TOKEN_FILE=/root/.config/folk-tw/slack-bot-token
notify_scan() {
  [ -r "$SLACK_TOKEN_FILE" ] || { echo "[news-scan-cron] 讀不到 Slack token，告警未送出"; return; }
  PAYLOAD="$(TEXT="$1" node -e 'process.stdout.write(JSON.stringify({channel:"C0BCPHBF1ML",text:process.env.TEXT,unfurl_links:false}))')"
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $(cat "$SLACK_TOKEN_FILE")" -H "Content-type: application/json; charset=utf-8" \
    --data "$PAYLOAD" >/dev/null && echo "[news-scan-cron] 已送出告警"
}
echo "$OUT" | grep '^SCAN_FAILED' | while IFS=$'\t' read -r _ n detail; do
  notify_scan "🚨 時事祈福的新聞掃描（P2）已連續失敗 ${n} 次，管線可能整支停擺中（每 8 小時一輪）。最後一次錯誤：${detail}"
done
echo "$OUT" | grep '^SCAN_RECOVERED' | while IFS=$'\t' read -r _ n; do
  notify_scan "✅ 時事祈福的新聞掃描（P2）已恢復（先前連續失敗 ${n} 次）。"
done
# 候選連續過不了機器複驗（2026-08-22 加）。SCAN_FAILED 管「整支掛掉」，這條管「掃得到卻吃不下」
# ——後者才是「人為災害沒有入選」的實際漏法，而在此之前它完全靜音。
echo "$OUT" | grep '^CANDIDATE_STUCK' | while IFS=$'\t' read -r _ place rounds reason; do
  notify_scan "⚠️ 時事祈福：「${place}」連續 ${rounds} 輪過不了機器複驗（原因：${reason}）。若它是真事件，代表我們一直吃不下它，請看 log 判斷是來源抓不到還是地名對不上。"
done

cw_commit_push "[news-scan-cron]" "feat(topical): 新聞掃描自動編排 $(date -u +%FT%H:%MZ)" || { echo "[news-scan-cron] 無變更"; exit 0; }

# 對每個新開的祈福頁發 Slack（過了正向議題閘、開後通知、可事後撤）
TOKEN="$(cat /root/.config/folk-tw/slack-bot-token)"
echo "$OUT" | grep '^PUBLISHED' | while IFS=$'\t' read -r _ id title url; do
  TEXT="🕯 已自動開一個祈福頁（新聞掃描＋已過正向議題閘）：${title}  ${url}　（部署中，約一分鐘上線；若不妥可回覆撤下）"
  PAYLOAD="$(TEXT="$TEXT" node -e 'process.stdout.write(JSON.stringify({channel:"C0BCPHBF1ML",text:process.env.TEXT,unfurl_links:false}))')"
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer ${TOKEN}" -H "Content-type: application/json; charset=utf-8" \
    --data "$PAYLOAD" >/dev/null && echo "[news-scan-cron] 已通知：$title"
done
