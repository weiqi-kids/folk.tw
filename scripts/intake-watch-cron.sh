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

if [ "${1:-}" = "--stale" ]; then
  out="$(node scripts/intake-ingest.mjs --status 2>&1)" || true
  echo "$out"
  if stale_line="$(printf '%s' "$out" | grep '^STALE' || true)"; [ -n "$stale_line" ]; then
    detail="${stale_line#STALE$'\t'}"
    notify ":hourglass: *台灣端投遞資料過期*
${detail}

台灣主機的抓取腳本可能沒在跑（那台不一定常開）。
・清單：\`docs/intake-manifest.json\`
・交接說明：\`docs/taiwan-host-handoff.md\`"
  fi
  exit 0
fi

# 收件。ingest 對「驗證失敗」回 exit 1；我們要把它變成 Slack 通報而不是讓 cron 靜默失敗。
set +e
out="$(node scripts/intake-ingest.mjs 2>&1)"
rc=$?
set -e
echo "$out"

if [ "$rc" -ne 0 ]; then
  notify ":rotating_light: *台灣端投遞收件驗證失敗*（上位檔維持原狀、未被覆蓋）
\`\`\`
$(printf '%s' "$out" | grep '✗' | head -10)
\`\`\`
台灣端可能抓到錯誤頁或傳輸截斷；該 job 會留在 inbox，修正後重送即可。"
  exit 0   # 已通報，不讓 cron 反覆噴錯
fi

# 成功且真的有東西上位才通報（無新檔的常態輪次保持安靜）
if printf '%s' "$out" | grep -q '已上位'; then
  notify ":inbox_tray: *台灣端投遞已收件*
\`\`\`
$(printf '%s' "$out" | grep '已上位')
\`\`\`"
fi
