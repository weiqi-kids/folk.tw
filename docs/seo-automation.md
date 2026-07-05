# folk.tw SEO 自動化 — 指標檔（Pointer）

> ⚠️ **本檔僅為指標。** SEO 自動化已於 2026-07-02 遷至統一框架 `/root/seo-ops`。
> **單一真相＝[`/root/seo-ops/README.md`](/root/seo-ops/README.md)**；維運操作用 `/seo` skill。
> （本檔原本描述的 `scripts/seo-collect-cron.sh`／`seo-report-slack.mjs`／`seo-brain-cron.sh`／
> `seo-weekly.mjs` 舊鏈與 `/etc/cron.d/folk-tw-seo*` 舊排程**皆已退役**，勿再引用。）

## 現況架構（六層，folk.tw 用其中五層）

排程檔：`/etc/cron.d/seo-ops`（源 `/root/seo-ops/cron/seo-ops.cron`）。設定 `seo-ops/sites/folk.tw.json`、
大腦站規 `seo-ops/playbooks/folk.tw.md`、log `seo-ops/logs/folk.tw-*.log`。

| 層 | 時間（台 / UTC） | 進入點 | 產出 |
|----|----------------|--------|------|
| 收集 | 04:30 / 20:30 | `bin/seo-collect.mjs --site folk.tw` | GA4+GSC+索引覆蓋 → `data/seo-daily/<日期>.json`、commit/push、index:ping |
| 心跳 | 05:00 / 21:00 | `bin/seo-heartbeat.mjs --site folk.tw` | 📊 Slack 純數據 |
| 反思 | 05:20 / 21:20 | `bin/seo-reflect.sh --site folk.tw` | **大腦前半段**：跨源對比 → 只改 playbook 標記區策略段 → 🧭 Slack（僅有改動時）＋留痕 `reflections/folk.tw/<日期>.md` |
| 大腦 | 05:55 / 21:55 | `bin/seo-brain.sh --site folk.tw` | headless `claude -p`（Sonnet）：自動優化→push→deploy→notify→🤖 Slack |
| 週報 | 週一 09:30 / 01:30 | `bin/seo-weekly.mjs --site folk.tw` | 開 GitHub Issue + 📈 Slack |

folk.tw **無內容產出層**（第六層 `seo-content.mjs` 只給有內容工廠的站）。

## 仍在本 repo 使用的 live 腳本（**勿退役**）

- `scripts/index-ping.mjs`（Google Indexing API，配額 200/日；`indexPing.command` 與 `pnpm notify` 都用）
- `scripts/indexnow-ping.mjs`（IndexNow → Bing/Yandex/Seznam/Naver）
- `scripts/notify.mjs`（`pnpm notify` 一鍵雙推）
- `scripts/.google-sa-key.json`（收集/週報用；SA 須為 GSC 擁有者）

## 部署紅線（保留）

- `git push origin main` 即自動觸發 `deploy.yml on:push`；**絕不再 `gh workflow run deploy.yml` 補跑**
  （同 SHA 兩 run 搶 Pages 佇列 → build version 標 cancelled → 同 SHA 後續部署秒失敗，只能換 SHA 解）。
- 驗證：`gh run list --workflow=deploy.yml --limit 1` 比對 `headSha` 為本次 commit。
- 唯一例外：本 SHA 的 run 存在但 `deploy` job 因 Pages 服務端暫時性錯誤失敗（`build` job 成功）時，
  `gh run rerun <run-id> --failed` 重跑**同一 run** 一次（不另開 run）；再失敗交人工。

## 回退 / 排錯 / 護欄

見 `/root/seo-ops/README.md`（§ 驗證、§ 回滾、§ 反思）。大腦回退：`git log --oneline | grep auto-claude-seo`
→ `git revert <sha> && git push origin main`。反思回退：`git -C /root/seo-ops revert <commit>`（前綴 `[auto-claude-reflect]`）。
