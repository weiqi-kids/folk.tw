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

## Sitemap `lastmod` ／內容更新時間機制（updatetime）

**單一真相＝`astro.config.mjs` 的 sitemap `serialize()`。** 更新時間訊號完全由 sitemap `lastmod` 提供，
內容層另有取捨，兩者要一起看：

- **只有 `/`（首頁今日選讀）與 `/almanac`（今日曆）掛 `lastmod`**，值＝`new Date().toISOString()`＝**build 當下時間**、`changefreq: DAILY`。
- 其餘頁**一律不掛 `lastmod`**：過去封存日期頁／廟宇頁 `priority 0.3`＋`YEARLY`；模組樞紐 `WEEKLY`；獨特詳情頁（神明／籤詩／典故／活動／習俗）`MONTHLY`。
- **設計取捨（勿改成全站掛 build 時間）**：全站每日 cron 重建，若每頁都掛 build 時間 → 對 Google **誤報「全站每日變動」、浪費爬取預算**，故只掛那兩個「內容真的每天不同」的頁。

⚠️ **關鍵事實：內容 collection／`src/data/*.json` 目前【沒有】per-article 的 `updated`／`lastmod`／`modified` 欄位。**
（`content.config.ts` 只有農曆聖誕 `date`、`date_resolution`／`date_note` 等，非「文章最後更新時間」。）
所以每篇文章**沒有各自的更新時間**，sitemap 的 `lastmod` 也就只有 `/` 與 `/almanac` 兩頁、且值是 build 時間而非「該頁內容實際變動時間」。

⚠️ **實務落差（新鮮度取決於有沒有真的部署）**：`lastmod = new Date()` 只在**實際重新 build 部署**那天才更新。
每日收集層 commit 帶 `[skip ci]` **不部署** → sitemap 不重生；**唯有大腦層那天真的改了內容並 push（觸發 `deploy.yml`）才會重 build**，那兩頁 `lastmod` 才前進。大腦「無動作」的日子 sitemap `lastmod` 停在上次部署日。

> 若要讓「持續更新」訊號更強，正解是**讓真有內容變動時觸發一次部署**（或給實際被改的頁補 per-article `updated` 欄位並據以掛精確 `lastmod`），**而非**對全站假造 `lastmod`。此為待評估項，尚未實作。

## 回退 / 排錯 / 護欄

見 `/root/seo-ops/README.md`（§ 驗證、§ 回滾、§ 反思）。大腦回退：`git log --oneline | grep auto-claude-seo`
→ `git revert <sha> && git push origin main`。反思回退：`git -C /root/seo-ops revert <commit>`（前綴 `[auto-claude-reflect]`）。
