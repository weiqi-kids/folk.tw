#!/usr/bin/env bash
# 變更感知的日常檢查入口。
#
# `pnpm build`／`pnpm build:release` 是部署用的完整靜態建置：會產出整站 dist、
# Pagefind、OG 分享卡，並掃描所有輸出頁。編輯期間不應為了看一個頁面重跑那套流程；
# 這支只依相對 origin/main 的變更檔案，挑需要的來源層 gate。
#
# 注意：本支不產生 dist，也不宣稱可以取代正式 release gate。

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

has_site_source=0
has_ui=0
has_article=0
has_data=0
has_release_data=0
has_script=0

for file in "${files[@]}"; do
  case "$file" in
    src/*|astro.config.mjs|package.json|pnpm-lock.yaml|public/*) has_site_source=1 ;;
  esac
  case "$file" in
    src/*.astro|src/*.svelte|src/*.css) has_ui=1 ;;
    src/*.md|src/*.mdx) has_article=1 ;;
  esac
  case "$file" in
    src/data/*|src/content/*|src/content.config.ts) has_data=1 ;;
  esac
  case "$file" in
    src/data/festivals.json|docs/annual-release-manifest.json) has_release_data=1 ;;
  esac
  case "$file" in
    scripts/*|astro.config.mjs|package.json) has_script=1 ;;
  esac
done

run_check() {
  local label="$1"
  local script="$2"
  echo
  echo "▶ ${label}: pnpm ${script}"
  pnpm "$script"
}

if ((has_site_source)); then run_check '型別檢查' check; fi
if ((has_ui)); then
  run_check '設計規範' check:design
  run_check '設計 token' check:design-tokens
  run_check '文案語氣' check:copy-voice
fi
if ((has_article)); then run_check '文章內容' check:content; fi
if ((has_data)); then run_check '資料完整性' check:integrity; fi
if ((has_script)); then run_check '外送網址' check:outbound-urls; fi
if ((has_release_data)); then
  run_check '釋出排程' check:release
  run_check '年度釋出' check:annual-release
fi

if ((has_site_source == 0 && has_ui == 0 && has_article == 0 && has_data == 0 && has_script == 0)); then
  echo '✓ 變更只涉及文件或未配置 gate 的檔案；略過來源檢查。'
else
  echo
  echo '✓ 變更感知檢查完成；未重建 dist、Pagefind、OG 或 Discover 全站 gate。'
fi
echo '正式發佈前請執行：pnpm build:release'
