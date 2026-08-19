#!/usr/bin/env bash
# 變更感知的日常檢查入口。
#
# `pnpm build`／`pnpm build:release` 是部署用的完整靜態建置：會產出整站 dist、
# Pagefind、OG 分享卡，並掃描所有輸出頁。編輯期間不應為了看一個頁面重跑那套流程；
# 這支只依相對 origin/main 的變更檔案，挑需要的來源層 gate。
#
# 注意：本支不產生 dist，也不宣稱可以取代正式 release gate。
#
# 🔴 「哪個檔案改了要跑哪道 gate」**不寫在這裡**：唯一真實來源是
#   scripts/lib/gates.mjs（各 gate 的 `changed` 欄位＋ CHANGED_RULES 的路徑規則）。
#   以前這裡手抄一份路由、deploy.yml／pre-push／CLAUDE.md 各手抄一份清單，四份互相矛盾。
#   本支只負責「收集變更檔案 → 問 manifest → 依序跑」。
#   ⚠️ 本支只會跑 needs:'source' 的 gate（manifest 已代為過濾）；吃 dist 的那幾道
#     （check:canonical／check:anchor-text／check:rendered）只能在 build:release 之後跑。

set -euo pipefail

mapfile -t files < <(
  {
    git diff --name-only origin/main...HEAD
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  } | sort -u
)

if ((${#files[@]} == 0)); then
  echo '✓ 沒有相對 origin/main 的變更；略過來源檢查。'
  exit 0
fi

echo "變更感知檢查：${#files[@]} 個檔案"
for file in "${files[@]}"; do
  echo "  · ${file}"
done

# manifest 決定要跑哪些 gate（輸出：`id<TAB>label`，一行一道，順序即執行順序）。
rows="$(printf '%s\n' "${files[@]}" | node scripts/lib/gates.mjs for-changed)"

if [ -z "$rows" ]; then
  echo '✓ 變更未命中任何已配置 gate 的路徑分類；略過來源檢查。'
else
  while IFS=$'\t' read -r gate label; do
    [ -n "$gate" ] || continue
    echo
    echo "▶ ${label}: pnpm ${gate}"
    pnpm "$gate"
  done <<< "$rows"
  echo
  echo '✓ 變更感知檢查完成；未重建 dist、Pagefind、OG 或 Discover 全站 gate。'
fi
echo '正式發佈前請執行：pnpm build:release'
