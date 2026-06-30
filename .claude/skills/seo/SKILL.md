---
name: seo
description: 操作 folk.tw 的本機 SEO 自動化（收集/心跳/大腦/週報）。當使用者要查 SEO 自動化狀態、手動跑某段、看 log 排錯、或回退自動優化時使用。完整架構見 docs/seo-automation.md。
---

folk.tw 的 SEO 自動化全跑在**這台 server 的 cron**（非雲端）。四段：收集 04:30 / 心跳 05:00 / 大腦 05:55（headless claude）/ 週報 週一 09:30（台）。完整參考：`docs/seo-automation.md`。

先釐清使用者要做什麼，對應到下面動作。所有指令在 `/root/folk.tw` 下執行。

## 查狀態

```bash
cd /root/folk.tw
echo "— 排程 —"; grep -hv '^#' /etc/cron.d/folk-tw-seo*
echo "— 最新數據 —"; ls -t data/seo-daily/*.json | head -1
echo "— 近期自動優化 —"; git log --oneline | grep auto-claude-seo | head -5
echo "— 各段最後 log 尾段 —"; for f in collect report brain weekly; do echo "[$f]"; tail -3 logs/seo-$f.log 2>/dev/null; done
```
要看 Slack 實際發了什麼：用 Slack 工具讀頻道 `C0BCPHBF1ML`（#神酷-folk-tw）。

## 手動跑某段

```bash
cd /root/folk.tw
GA4_PROPERTY_ID=542419964 node scripts/seo-daily.mjs   # 收集當日 JSON
node scripts/seo-report-slack.mjs                       # 數據心跳（--dry 預覽）
node scripts/seo-weekly.mjs                             # 週報：開 Issue+發 Slack（--dry 只預覽）
DRY_RUN=1 ./scripts/seo-brain-cron.sh                   # 大腦乾跑（讀數據+提案，不 push/不發）
./scripts/seo-brain-cron.sh                             # 大腦正式（會改站+push+發 Slack）
```

⚠️ **安全守衛**：在 agent session 內直接執行大腦的 `claude -p`（即 `seo-brain-cron.sh` 正式版）會被擋（「Create Unsafe Agents」）。需要時請：(a) 指示使用者用輸入框 `! ./scripts/seo-brain-cron.sh` 自己跑，或 (b) 交給 cron。乾跑（DRY_RUN=1）的執行通常可行。`/etc/cron.d/` 與 `.claude/settings.json` 的修改、以及 commit 含此腳本，也可能被守衛擋——同樣請使用者用 `!` 處理。

## 排錯

- 沒收到 Slack → 看對應 `logs/seo-*.log` 當日尾段；確認 token：`head -c9 /root/.config/folk-tw/slack-bot-token`（應為 `xoxb-...`）。
- 大腦沒 push → 多半是 gate（check:integrity/build）沒過＝設計上不 push；讀 `logs/seo-brain.log`。
- 數據缺當日 → 收集失敗（Google 金鑰/額度），看 `logs/seo-collect.log`。
- 部署沒跑 → 本機 push 不自動觸發；`gh workflow run deploy.yml` 補。

## 回退某次自動優化

```bash
cd /root/folk.tw
git log --oneline | grep auto-claude-seo        # 找 sha
git revert <sha> && git push origin main
gh workflow run deploy.yml                        # 補觸發部署
```

## 守則（沿用專案 CLAUDE.md）

報現況/數量前一律用指令查證、不臆測；事實型欄位查無權威源就留空、絕不杜撰；改動上線後以 curl 線上實證。
