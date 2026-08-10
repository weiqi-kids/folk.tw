#!/usr/bin/env bash
# 台灣端投遞的看門狗：收件 ＋ 資料過期提醒。
#
# 台灣主機（有台灣 IP）照 docs/intake-manifest.json 抓資料，rsync 進
# /root/.config/folk-tw/intake/inbox（受限金鑰 rrsync -wo -no-del，只能寫、不能讀不能刪）。
# 本腳本負責把收到的檔驗過並原子上位，以及「太久沒收到就提醒」。
# 架構與台灣端交接說明：/root/folk.tw/docs/taiwan-host-handoff.md
#
# 為什麼不需要 cron-worktree.sh：本工作**完全不碰 git**（intake 全在 /root/.config/folk-tw/ 底下，
# 因為 temple.xml 含 12,419 間廟的電話與負責人，而 folk.tw 是 public repo）。
# 同 index-audit-cron.sh 的模式：repo 外狀態、無 worktree 需求。
#
# 用法（cron 已排，見 /etc/cron.d/folk-intake）：
#   scripts/intake-watch-cron.sh          # 收件；有拒收才發 Slack
#   scripts/intake-watch-cron.sh --stale  # 只檢查新鮮度；逾期才發 Slack（每日跑一次）
set -euo pipefail

REPO=/root/folk.tw
CHANNEL=C0BCPHBF1ML          # Slack #神酷-folk-tw
LOCK=/var/lock/folk-tw-intake.lock

cd "$REPO"
echo "=== $(date -u +%FT%H:%MZ) intake-watch ${1:-收件} ==="

# 非阻塞鎖：搶不到就跳過本輪，不排隊（沿用 lib/cron-worktree.sh 的慣例——
# 寧可漏一輪，不要兩個 ingest 同時對同一個上位檔做 rename）。
exec 9>"$LOCK"
flock -n 9 || { echo "[intake] 另一輪仍在執行，本輪跳過"; exit 0; }

notify() {
  # 失敗不可讓整支腳本掛掉（通報失敗比資料處理失敗次要）
  printf '%s' "$1" | "$REPO/scripts/slack-notify.sh" "$CHANNEL" || echo "[intake] Slack 通報失敗（略過）"
}

# 🔴 崩潰不可以長得像資料問題（2026-08-10 事故，見 intake-ingest.mjs 檔頭）。
# intake-ingest.mjs 的結束碼：1＝檔驗不過（台灣端的事）／2＝腳本自己壞了（我們的事）。
# 2 之外再加一道保險：rc≠0 但**一則 ✗ 都沒有**也算崩潰——
# 語法錯誤之類的情況 node 自己 exit 1，輪不到我們的 handler 改成 2。
notify_crash() {
  notify ":boom: *intake $1 崩潰了——這不是台灣端的資料問題*
本腳本（\`scripts/intake-ingest.mjs\`）自己拋例外，rc=$2。**$3**
\`\`\`
$(printf '%s' "$4" | tail -12)
\`\`\`
修的是我們這端；台灣端不需要重送、也不必複驗資料。"
}

if [ "${1:-}" = "--stale" ]; then
  # 只在「我們這邊能動手」的兩種情況發 Slack（判讀邏輯與理由見 intake-ingest.mjs 的 --status 段）：
  #   ALERT_PIPELINE ＝台灣端沒在跑；ALERT_TRANSPORT ＝台灣端抓到了但檔沒進來。
  # 「來源掛了／來源沒更新」不發——那不是我們能處理的事，只留在 log。
  # 🔴 這裡以前是 `|| true`，把崩潰吞成靜默：--status 一崩潰就沒有任何 ALERT_ 行，
  # 底下兩個 grep 抓到 0 行 → 腳本安安靜靜 exit 0。
  # 結果是 2026-08-06 到 08-10 之間「台灣端沒在跑」與「檔沒送達」兩道警報**完全失效**，
  # 而失效本身也不會叫人。留 rc 判斷，別再把它丟掉。
  set +e
  out="$(node scripts/intake-ingest.mjs --status 2>&1)"
  rc=$?
  set -e
  echo "$out"

  if [ "$rc" -ne 0 ]; then
    notify_crash "--status" "$rc" "本輪的資料新鮮度完全沒有檢查——「沒收到警報」這次不代表一切正常。" "$out"
    exit 0
  fi

  if line="$(printf '%s' "$out" | grep '^ALERT_PIPELINE' || true)"; [ -n "$line" ]; then
    notify ":hourglass: *台灣端投遞管線沒在跑*
${line#ALERT_PIPELINE$'\t'}

台灣主機的抓取腳本可能停了（那台不一定常開）。**這與各來源站是否有新資料無關**——
是連進度回報都沒收到。
・清單：\`docs/intake-manifest.json\`
・交接說明：\`docs/taiwan-host-handoff.md\`"
  elif line="$(printf '%s' "$out" | grep '^ALERT_TRANSPORT' || true)"; [ -n "$line" ]; then
    notify ":electric_plug: *台灣端抓到了資料，但檔案沒送達*
${line#ALERT_TRANSPORT$'\t'}

台灣端 state.json 顯示抓取成功且內容與我們手上這份不同，卻沒有新檔進 inbox
＝rsync／金鑰／磁碟這一段有問題，不是來源的事。
・交接說明：\`docs/taiwan-host-handoff.md\` 步驟 4（rsync 參數）"
  fi
  exit 0
fi

# 收件。ingest 對「驗證失敗」回 exit 1；我們要把它變成 Slack 通報而不是讓 cron 靜默失敗。
set +e
out="$(node scripts/intake-ingest.mjs 2>&1)"
rc=$?
set -e
echo "$out"

problems="$(printf '%s' "$out" | grep '✗' | head -10 || true)"

if [ "$rc" -eq 2 ] || { [ "$rc" -ne 0 ] && [ -z "$problems" ]; }; then
  notify_crash "收件" "$rc" "本輪沒有任何檔被驗證或上位。" "$out"
  exit 0
fi

if [ "$rc" -ne 0 ]; then
  notify ":rotating_light: *台灣端投遞收件驗證失敗*（上位檔維持原狀、未被覆蓋）
\`\`\`
$problems
\`\`\`
台灣端可能抓到錯誤頁或傳輸截斷；該 job 會留在 inbox，修正後重送即可。
目錄型 job（url_list／paginate）的壞檔已搬進 \`/root/.config/folk-tw/intake/quarantine/\`——
inbox 是 write-only 刪不掉，不搬走的話匯入器會一直讀到它、而且每小時重報一次。"
  exit 0   # 已通報，不讓 cron 反覆噴錯
fi

# 成功且真的有東西上位才通報（無新檔的常態輪次保持安靜）
if printf '%s' "$out" | grep -q '已上位'; then
  notify ":inbox_tray: *台灣端投遞已收件*
\`\`\`
$(printf '%s' "$out" | grep '已上位')
\`\`\`"
fi
