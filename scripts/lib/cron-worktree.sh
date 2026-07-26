#!/usr/bin/env bash
# 時事祈福 cron 的隔離執行環境（2026-07-25 建立）
#
# 為什麼要有這支：三支 topical cron 原本直接在 /root/folk.tw 工作樹裡跑
# 「`git pull --rebase --autostash` → 跑腳本 → `git diff --quiet src/data/topical.json`
# 有變就 commit」。那個判斷分不出「變更是腳本寫的」還是「人正在改」——2026-07-25 就發生過
# P1 把人手改到一半的 topical.json（併頁 WIP）連同工作樹一起 commit＋push（`a4e52da`，
# 訊息卻寫「時事祈福自動編排」），資料先上線、對應程式碼還沒推，站上短暫處於半套狀態。
#
# 修法：cron 一律在**獨立 worktree**（detached、sparse，只取 `scripts` 與 `src/data`）跑，
# 每輪先 reset 到 origin/main 的乾淨狀態。主工作樹的未提交改動 cron 根本看不到，
# 因此**只可能 commit 自己寫出來的內容**。再加一道硬檢查：異動範圍若不是只有 topical.json，
# 一律中止不 commit（寧可漏一輪，不可誤送）。
#
# 用法（三支 *-cron.sh 共用）：
#   source "$(dirname "$0")/lib/cron-worktree.sh"
#   cw_begin "[topical-cron]"                      # 取鎖＋備妥 worktree＋cd 進去；取不到鎖即 exit 0
#   OUT="$(node scripts/topical-orchestrate.mjs)"  # 此時 cwd 已是 worktree
#   cw_commit_push "[topical-cron]" "commit 訊息"  # 無變更回 1（呼叫端自行 exit 0）
#
# 三支共用同一把 flock：它們都寫 topical.json，重疊會互相蓋掉。取不到鎖＝有另一支在跑，本輪跳過
# （P1 每 20 分、P2 每 8 小時、P4 每日，跳一輪無損）。

CW_MAIN=/root/folk.tw
CW_WT=/opt/folk-tw-cron/topical
CW_LOCK=/var/lock/folk-tw-topical-cron.lock

# 取鎖（非阻塞）＋備妥乾淨 worktree＋cd 進去。
cw_begin() {
  local tag="$1"
  exec 9>"$CW_LOCK"
  if ! flock -n 9; then
    echo "$tag 另一支 topical cron 正在跑（flock），本輪跳過"
    exit 0
  fi

  git -C "$CW_MAIN" fetch -q origin || { echo "$tag fetch 失敗，跳過"; exit 1; }

  if [ ! -e "$CW_WT/.git" ]; then
    echo "$tag 初次建立隔離 worktree：$CW_WT"
    mkdir -p "$(dirname "$CW_WT")"
    git -C "$CW_MAIN" worktree add --detach --no-checkout "$CW_WT" origin/main || { echo "$tag worktree 建立失敗"; exit 1; }
    git -C "$CW_WT" sparse-checkout init --cone
    git -C "$CW_WT" sparse-checkout set scripts src/data
  fi

  # 每輪回到 origin/main 的乾淨狀態（worktree 是拋棄式的，不保留任何殘留）。
  git -C "$CW_WT" reset -q --hard origin/main || { echo "$tag reset 失敗，跳過"; exit 1; }
  git -C "$CW_WT" clean -qfd

  cd "$CW_WT" || { echo "$tag 無法進入 worktree"; exit 1; }
}

# 只 commit src/data/topical.json；無變更回 1。異動範圍異常則中止（exit 1）。
cw_commit_push() {
  local tag="$1" msg="$2"
  local dirty
  dirty="$(git status --porcelain)"

  [ -z "$dirty" ] && return 1

  # 硬檢查：worktree 是每輪 reset 過的，此刻的異動只可能來自剛剛那支腳本；
  # 若冒出 topical.json 以外的東西，代表有非預期的寫入，寧可中止也不送出。
  if [ -n "$(echo "$dirty" | grep -v ' src/data/topical.json$' || true)" ]; then
    echo "$tag ⚠️ 異動範圍不只 topical.json，中止不 commit："
    echo "$dirty"
    exit 1
  fi

  git add src/data/topical.json
  git commit -q -m "$msg"

  # push 到 main（detached HEAD → HEAD:main）；被別人搶先就 rebase 重試。
  local i
  for i in 1 2 3; do
    if git push -q origin HEAD:main; then
      echo "$tag 已 commit/push"
      return 0
    fi
    echo "$tag push 被搶先，rebase 後重試（$i/3）"
    git fetch -q origin
    git rebase -q origin/main || { git rebase --abort 2>/dev/null || true; echo "$tag rebase 失敗，放棄本輪"; exit 1; }
  done
  echo "$tag push 連續失敗，放棄本輪（下輪會重跑）"
  exit 1
}
