#!/usr/bin/env bash
# folk.tw 大腦層「每日 SEO 自動優化」本機 cron 進入點（取代原 claude.ai 雲端 routine）。
#
# 為何搬本機：雲端 routine 曾被整批 disable 致連日靜默（見記憶 seo-slack-heartbeat-local-cron）。
# 改本機 cron 後，優化與通報都在自有主機，受全域 ~/.claude 治理、用本機帳號額度，不依賴雲端。
#
# ⚠️ 本腳本已於 2026-07-02 退役（改由 /root/seo-ops 統一框架執行），僅留查考。
#   其中「push 後補觸發 deploy」的指示已證實錯誤且有害：push main 本會自動觸發 deploy（on:push），
#   同 SHA 雙 run 會毒化 Pages build version（見 CLAUDE.md / seo-ops/playbooks/folk.tw.md）。
#
# 流程：git 同步最新（含資料層 Action 當天 JSON）→ headless claude 讀數據→定優化→改≤5檔→
#   過 gate（check:integrity + build）→ commit [auto-claude-seo] → push → 補觸發 deploy →
#   pnpm notify 推搜尋引擎 → 寫 actions.md → 發 Slack（人話）。claude 全程自理；本包裝只做
#   環境/同步/殘留清理/失敗保底通報。
#
# 用法：
#   scripts/seo-brain-cron.sh           # 正式跑（會 commit/push/發 Slack）
#   DRY_RUN=1 scripts/seo-brain-cron.sh # 乾跑：claude 讀數據並「提案」，但不得 commit/push/發 Slack
#
# crontab（台灣 05:55 = UTC 21:55，排在資料層 Action 與數據心跳之後）：
#   CRON_TZ=UTC
#   55 21 * * * /root/folk.tw/scripts/seo-brain-cron.sh >> /root/folk.tw/logs/seo-brain.log 2>&1
set -uo pipefail

export PATH="/root/.local/bin:/usr/local/bin:/usr/bin:/bin"
export TZ="Asia/Taipei"
export IS_SANDBOX=1   # Claude Code 認可的 root 旁路，讓 headless 得以運行

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1
mkdir -p logs

DRY_RUN="${DRY_RUN:-0}"
DATE="$(date +%F)"   # TZ=Asia/Taipei → 已是台灣日期，勿再 +8
CHANNEL="C0BCPHBF1ML"   # #神酷-folk-tw
SLACK_NOTIFY="$REPO/scripts/slack-notify.sh"

echo "===== [seo-brain] $DATE $(date '+%T %Z') 開始（DRY_RUN=$DRY_RUN）====="

# 1) 同步 main：取資料層 Action 當天 commit 的 JSON，及任何先前 [auto-claude-seo]。
git pull --rebase --autostash origin main 2>&1 || echo "[seo-brain] git pull 失敗（續行，讀本機既有）"

HEAD_BEFORE="$(git rev-parse HEAD 2>/dev/null || echo unknown)"

# 2) headless claude：執行每日 SEO 自動優化閉環。
PROMPT="$(cat <<PROMPTEOF
你是 folk.tw（神酷）的「每日 SEO 自動優化執行者」，在**自有主機 cron**中以 headless 執行（非雲端，無先前對話）。folk.tw 是台灣民俗信仰常青資料站（神明/籤詩/典故/農民曆/廟宇/民俗活動），Astro 靜態站、pnpm。今天台灣日期＝$DATE（系統時鐘已是台灣時間，勿再 +8）。

# 鐵則（違反即停手）
1. 絕不杜撰：補事實型內容（神明 src/data/deities.json、廟宇、典故 allusions、民俗活動 events）一定先用 WebSearch 找到權威源（Wikidata／維基百科／文化部文資／廟方官網），把來源寫進該筆資料來源欄位；查無權威源就不補事實，只做不碰事實的動作（內鏈、meta／標題／描述、頁面結構）。seoDesc 等若含事實說法也須查證過或有源。
2. 每天最多改 5 個檔，寧少勿多。
3. 改完自我驗證：pnpm install --frozen-lockfile →（動到資料/schema）pnpm check:integrity → pnpm build。任一非零 → git checkout . 撤回、今日不 push、走步驟6發 Slack 標🔴回報。
4. 內容改動集中成一個 commit、訊息前綴 [auto-claude-seo]，便於辨識與 git revert。

# DRY_RUN
本次 DRY_RUN=$DRY_RUN。若 DRY_RUN=1：照常讀數據、可在工作樹試改與跑 build 驗證，但**絕不 git commit/push、不 pnpm notify、不發 Slack**；最後只在 stdout 印「乾跑提案摘要」（今天會改哪些檔、賭哪些 query/page、預期效果）後結束。

# 每日流程
## 1. 讀今日數據
- ls -t data/seo-daily/*.json | head -1 取最新、Read 之。含 ga4（sessions、taiwanOrganicSessions、topPages）、gsc（totals、topQueries、topPages、pageQueryCross、strikingDistance 排名5-15、highImpZeroClick）、index（coverage）。
- 若今日 data/seo-daily/$DATE-actions.md 已存在（今天已跑過）→ 不重複大改，只做極小補強或直接 no-op（DRY_RUN=0 時仍發 Slack）。
- 若最新 JSON 不存在或各段皆 {error} → 無數據，跳步驟5寫「無數據」、步驟6發 Slack 標🟡結束。

## 2. 驗證昨天（閉環回饋）
- 讀昨天 data/seo-daily/<昨日>-actions.md（若有），取昨天賭的 query/page，對照今日 JSON 的 position/clicks/impressions → 判定進步/持平/退步（GSC 有 2-3 日延遲，資料區間未動時「持平」正常）。某賭注連續≥3 天明顯退步 → 考慮回退（git revert 或反向編輯）並在 Slack 標🟡。

## 3. 定本日優化（依訊號、結論先行、冷啟動期保守）
- strikingDistance（排名5-15）：補相關內鏈、在 answer-first 區塊把該詞講更完整（事實型受鐵則1約束）。
- highImpZeroClick：改該 page title/description/H1（典故頁可用 seoDesc 覆寫）更貼 query。
- pageQueryCross 錯配：調內鏈/結構把權重導向對的頁。
- index.coverage 仍 Discovered/Crawled-not-indexed 的獨特頁 → 強化內鏈入口。
- 本站搜尋訊號仍弱：若今天沒有可行動訊號就 no-op，不要為動而動、不要亂改全站。

## 4. 執行 + 自我驗證 + 上線（DRY_RUN=0 才 push）
- 鐵則內改 ≤5 檔；事實型先 WebSearch 查證、來源寫進資料欄位。
- pnpm install --frozen-lockfile →（動到資料/schema）pnpm check:integrity → pnpm build。任一失敗 → git checkout .、不 push、跳步驟5（Slack 標🔴）。
- 有內容改動且 DRY_RUN=0：
  - git add -A、git commit -m \"[auto-claude-seo] $DATE: <一句摘要>\"
  - git pull --rebase origin main（防搶先；衝突無法自動解 → git rebase --abort、放棄今日 push、跳步驟5）
  - git push origin main（被拒 non-fast-forward → git pull --rebase 後再 push）
  - **本機 push 不會自動觸發部署**，務必補：gh workflow run deploy.yml（然後 gh run list --workflow=deploy.yml --limit 1 確認有新 run）
  - 推搜尋引擎（本機有金鑰，直接雙推 Google+IndexNow）：pnpm notify <本次改動頁的完整 https://folk.tw/... 網址，空白分隔>。no-op 無 URL 可推則略過。

## 5. 留痕（供明日驗證）
- 寫 data/seo-daily/$DATE-actions.md：① 昨日賭注勝負 ② 今日判讀摘要 ③ 改了哪些檔、賭哪些 query/page、預期效果。技術細節（commit、build、deploy、推送）寫這裡，不寫進 Slack。
- no-op 日（DRY_RUN=0）：只 commit actions.md，訊息 chore(seo): $DATE 無動作 [skip ci]；git pull --rebase 後 git push。

## 6. 發 Slack（DRY_RUN=0 每天都發；一律人話、禁術語）
用 Bash 執行 folk.tw 專屬發送工具（**不是** MCP）：把組好的多行訊息用 here-string 餵給它：
  printf '%s' \"<整則訊息>\" | $SLACK_NOTIFY $CHANNEL
術語照翻：賭注→「今天調整的頁面/想改善的關鍵字」；strikingDistance→「排第5–15名、快擠進第一頁的關鍵字」；highImpZeroClick→「很多人看到卻沒人點的頁」；taiwanOrganicSessions→「台灣 Google 搜尋來的訪客」；pos N→「排第N名」；CTR→「點擊率/沒人點」；impressions→「被看到N次」；build/push/deploy→合併成「已自動上線」；IndexNow/index:ping→「已通知 Google 等搜尋引擎重新收錄」。不要出現英文縮寫、commit hash、檔名（留給 actions.md）。
訊息排版（每項一行「・」開頭、段落空行、【】標題、標題行用 *粗體*）：
🚦 今天要不要你出手：<🟢 不用，系統自己處理好了 ／ 🟡 建議你看一下：一句原因 ／ 🔴 需要你決定：一句事項>

📊 *folk.tw SEO 日報 · <M/D>*

【目前成效】
・台灣 Google 搜尋來的訪客：N 人（昨天 M，↑成長／↓下滑／持平）
・網站在 Google 被看到 N 次、有人點 M 次
　（Google 數據有 2–3 天延遲，本週數字下週才更新）

【今天做了什麼】
<一句總述改了哪頁；no-op／無數據就寫「今天沒有需要調整的地方，系統照常監看」並省略下三點>
・問題：<為什麼這頁值得改，人話>
・做法：<改了什麼，人話>
・狀態：已自動上線，並通知 Google 重新收錄

【昨天的調整有沒有效】
<進步／持平／退步白話；資料未更新就寫「還看不出來，Google 數據要 2–3 天才更新，下週才有得比」>

📄 完整紀錄：data/seo-daily/$DATE-actions.md

# 收尾
最後在 stdout 印 3 行內摘要（改了幾項/哪些/有無 push/有無發 Slack）。
PROMPTEOF
)"

CLAUDE_OK=1
timeout 1800 claude -p "$PROMPT" --model claude-sonnet-5 2>&1 \
  || { CLAUDE_OK=0; echo "[seo-brain] claude 執行失敗或逾時"; }

# 3) 殘留清理：claude 對該留的改動會自行 commit；此刻仍未提交的是 DRY_RUN 試改 / gate-fail / no-op 痕跡，
#    清回 HEAD 以免污染隔天 git pull --rebase。只清內容/資料區，不碰 scripts/ 等。
for p in src data/seo-daily; do
  if [ -n "$(git status --porcelain -- "$p" 2>/dev/null)" ]; then
    echo "[seo-brain] 清理未提交殘留：$p"
    git checkout -- "$p" 2>/dev/null || true
    git clean -fdq -- "$p" 2>/dev/null || true
  fi
done

# 4) 失敗保底通報：claude 整段失敗/逾時時，claude 內部的 Slack 步驟多半沒跑到 → 本包裝補一則🔴，
#    確保「大腦掛了」也不會像雲端那次一樣全靜默。DRY_RUN 不發。
if [ "$DRY_RUN" != "1" ] && [ "$CLAUDE_OK" = "0" ] && [ -x "$SLACK_NOTIFY" ]; then
  printf '%s' "🚦 今天要不要你出手：🔴 需要你看一下
:warning: *folk.tw SEO 自動優化 $DATE — 執行中斷*
本機大腦層 headless 執行失敗或逾時，今日可能未完成優化/通報。
請查 log：/root/folk.tw/logs/seo-brain.log" | "$SLACK_NOTIFY" "$CHANNEL" >/dev/null 2>&1 \
    && echo "[seo-brain] 已發失敗保底 Slack" || echo "[seo-brain] 失敗保底 Slack 也送不出（查 token）"
fi

echo "===== [seo-brain] $DATE $(date '+%T %Z') 結束 ====="
