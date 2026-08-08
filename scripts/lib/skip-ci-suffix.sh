#!/usr/bin/env bash
# `[skip ci]` 到底能不能加——由這支決定，各 cron 不要自己判斷。
#
# 🔴 這支存在的理由（2026-08-08 實際踩到）：
#   `[skip ci]` 是**看 push 的 head commit 訊息**決定要不要跑 workflow，不是看單一 commit。
#   所以當本機還有**別人的**未推送 commit 時，cron 一 push 就變成：
#
#       origin/main ← [我手動的 feature commit] ← [cron commit「… [skip ci]」]  ＝ head
#
#   整個 push **一個 run 都不會產生**——前面那個 feature commit 被順手帶上去、
#   卻永遠不會被部署，線上停在舊版而且**沒有任何告警**（CLAUDE.md 紅線 #3 講的就是這件事）。
#   2026-08-08 差一點就這樣：`4d22b8e chore(qiugian): … [skip ci]` 插在我兩個 commit 中間，
#   當時是因為我 commit 完立刻自己 push 才沒事——那是運氣，不是機制。
#
# 判準：`origin/main..HEAD` 只要有任何 commit（＝本次 cron 之外的東西要一起上去），
#   就**不可以**加 `[skip ci]`，讓 CI 正常跑、把那些 commit 部署出去。
#   cron 自己那次的資料更新順便觸發一次部署，成本是一次 build，遠低於「靜默停在舊版」。
#
# ⚠️ 必須在**建立 cron 自己的 commit 之前**呼叫，而且前面要先 fetch 過
#   （否則 origin/main 是舊的，會把已推送的東西誤判成未推送）。
#
# 用法：
#   source "$(dirname "$0")/lib/skip-ci-suffix.sh"
#   git fetch -q origin main
#   SUFFIX="$(skip_ci_suffix '[qiugian-cron]')"
#   git commit -q -m "chore(qiugian): 共情數字聚合 $(date -u +%F' '%H:%M)Z${SUFFIX}"

# 回傳 " [skip ci]" 或空字串（前面已含一個空格，直接接在訊息尾即可）。
# 第一參數是 log 標籤，用來在「刻意不加」時說清楚原因。
skip_ci_suffix() {
  local tag="${1:-[cron]}"
  local n
  n="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo unknown)"

  if [ "$n" = "unknown" ]; then
    # 數不出來（沒有 origin/main、剛 clone、fetch 失敗…）＝不確定，就別加。
    # 少跑一次 CI 只是浪費一次 build；漏跑一次 CI 會讓別人的 commit 靜默不上線。
    echo ""
    echo "$tag ⚠️ 數不出 origin/main..HEAD，保守起見不加 [skip ci]" >&2
    return 0
  fi

  if [ "$n" -gt 0 ]; then
    echo ""
    echo "$tag ⚠️ 本機有 $n 個尚未推送的 commit，本次**不加 [skip ci]**——" >&2
    echo "$tag    否則它們會被一起帶上去卻不觸發部署（紅線 #3）。" >&2
    git log --oneline "origin/main..HEAD" 2>/dev/null | sed "s/^/$tag      /" >&2
    return 0
  fi

  echo " [skip ci]"
}
