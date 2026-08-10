# folk.tw SEO 自動化 — 指標檔（Pointer）

> ⚠️ **本檔僅為指標。** SEO 自動化已於 2026-07-02 遷至統一框架 `/root/seo-ops`。
> **單一真相＝[`/root/seo-ops/README.md`](/root/seo-ops/README.md)**；維運操作用 `/seo` skill。
> （本檔原本描述的 `scripts/seo-collect-cron.sh`／`seo-report-slack.mjs`／`seo-brain-cron.sh`／
> `seo-weekly.mjs` 舊鏈與 `/etc/cron.d/folk-tw-seo*` 舊排程**皆已退役**，勿再引用。）

## 現況架構（六層，folk.tw 用其中五層）

排程檔：`/etc/cron.d/seo-ops`（源 `/root/seo-ops/cron/seo-ops.cron`）。設定 `seo-ops/sites/folk.tw.json`、
大腦站規 `seo-ops/playbooks/folk.tw.md`、log `seo-ops/logs/folk.tw-*.log`。

> 🔴 **2026-08-06 更正**：下表原本寫 04:30／05:00／05:20／05:55，**那是 2026-08-01 之前的舊時刻**，
> 且把「心跳」列成獨立一層——實際 `/etc/cron.d/seo-ops` 裡**沒有 heartbeat 行**（已併進 collect）。
> 現行時刻以該 cron 檔為準。⚠️ 改時刻要同步改這裡與 cron 註解（根 CLAUDE.md 紅線）。

| 層 | 時間（台 / UTC） | 進入點 | 產出 |
|----|----------------|--------|------|
| 收集＋心跳 | **15:30 / 07:30** | `bin/seo-collect.mjs --site folk.tw` | GA4+GSC+索引覆蓋 → `data/seo-daily/<日期>.json`、commit/push、index:ping；**heartbeat 已併入本層、直接發 📊 Slack，無獨立排程**|
| 反思 | **16:00 / 08:00** | `bin/seo-reflect.sh --site folk.tw` | **大腦前半段**：跨源對比 → 只改 playbook 標記區策略段 → 🧭 Slack（僅有改動時）＋留痕 `reflections/folk.tw/<日期>.md` |
| 大腦 | **16:40 / 08:40** | `bin/seo-brain.sh --site folk.tw` | headless `claude -p`（Sonnet）：自動優化→push→deploy→notify→🤖 Slack |
| 週報 | 週一 09:30 / 01:30 | `bin/seo-weekly.mjs --site folk.tw` | 開 GitHub Issue + 📈 Slack |

folk.tw **無內容產出層**（第六層 `seo-content.mjs` 只給有內容工廠的站）。

### 每日完整搜尋需求與地區 × 神明頁（2026-08-10 起）

collect 對 GSC `page × query` 使用 25,000 列分頁抓取，直到短頁或 250,000 列安全上限；
`gsc.pageQueryCoverage` 明示是否完整，`gsc.demandEvidence` 保存達 50 曝光且至少 1 點擊的逐 query
聚合，`gsc.cannibalization` 列出同一 query 由兩個以上頁面承接的候選。互搶清單只供人工／大腦判讀
搜尋意圖，不會自動做 canonical、redirect 或刪頁。

大腦每天先執行 `pnpm growth:temple-demand -- --write`。只有同時符合 GSC 需求門檻，且精確
`main_deity_ref` 主祀宮廟數達到 `TEMPLE_DEMAND_THRESHOLDS.minTemples` 的「地區 × 神明」交集，才追加至
`src/data/temple-demand-pages.json`。此檔是永久 URL 台帳：只增不減；歷史證據保留在每筆
`evidenceFile`，當期需求下降不會讓已發布頁消失。可用 `pnpm check:temple-demand` 驗證候選完整性、
路由、宮廟數、地圖與祭典措辭。

### 8/31 活躍使用者目標（2026-08-09 起自動對帳）

原目標口徑不變：**2026-08-31 當天 GA4 `active28DayUsers` 至少 20,000**。該日的近 28 日
視窗為 2026-08-04..2026-08-31，因此 `sites/folk.tw.json` 的 `heartbeat.audienceGoal`
同時固定 `windowStart=2026-08-04`、`targetDate=2026-08-31`、`target=20000`。

每日 collect 額外寫入 `ga4.audienceGoal`，Slack 的 🎯 區塊顯示：當日近 28 日活躍使用者、
8/4 起累積 `activeUsers`、距 20,000 的缺口、剩餘日數／每日所需新增活躍使用者，以及
8/13（6,100）、8/19（10,700）、8/27（16,900）、8/31（20,000）檢查點。這裡不用
sessions、PV 或推估月速率替代目標，因此不會悄悄降低門檻。

## 仍在本 repo 使用的 live 腳本（**勿退役**）

- `scripts/index-ping.mjs`（Google Indexing API，配額 200/日；`indexPing.command` 與 `pnpm notify` 都用）
- `scripts/indexnow-ping.mjs`（IndexNow → Bing/Yandex/Seznam/Naver）
- `scripts/notify.mjs`（`pnpm notify` 一鍵雙推）
- `/root/.config/folk-tw/ga4-sa.json`（收集/週報用；SA 須為 GSC 擁有者；2026-08-04 自 scripts/.google-sa-key.json 遷出 repo 樹）

## 部署紅線（保留）

- `git push origin main` 即自動觸發 `deploy.yml on:push`；**絕不再 `gh workflow run deploy.yml` 補跑**
  （同 SHA 兩 run 搶 Pages 佇列 → build version 標 cancelled → 同 SHA 後續部署秒失敗，只能換 SHA 解）。
- 驗證：`gh run list --workflow=deploy.yml --limit 1` 比對 `headSha` 為本次 commit。
- ⚠️ 例外有**兩個**（補觸發／重跑），條件不同，**權威在 [`decisions/deploy-and-gates.md`](decisions/deploy-and-gates.md) 的「🔴 部署觸發規則」一節**；本檔不重寫。原文保留供對照：本 SHA 的 run 存在但 `deploy` job 因 Pages 服務端暫時性錯誤失敗（`build` job 成功）時，
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

---

## 附錄：閉環總覽（2026-08-06 自 CLAUDE.md 抽出，原文未改）

## 🔁 每日自動優化閉環（2026-07-02 起由統一框架 `/root/seo-ops` 接手）

> ⚠️ **2026-07-02 遷移**：六層（收集/心跳/反思/大腦/週報/內容；folk 無內容層）改由 `/root/seo-ops` 統一框架執行，
> 排程在 `/etc/cron.d/seo-ops`（時刻沿用原值）、站台參數在 `seo-ops/sites/folk.tw.json`、
> 大腦站規在 `seo-ops/playbooks/folk.tw.md`、log 在 `seo-ops/logs/folk.tw-*.log`。
> 本節下方描述的 `scripts/seo-*` 舊腳本與 `/etc/cron.d/folk-tw-seo*` 已退役（腳本檔保留供查考；
> cron 備份在 `/root/.claude/backups/seo-cutover-20260702-023954/`）。維運指南見 `seo-ops/README.md`。

全部跑在**這台 server 的 cron**（排程 `/etc/cron.d/seo-ops`，log 在 `/root/seo-ops/logs/`）。

> 🔴 **2026-08-01 排程改點（勿順手改回清晨）**：folk.tw 三層從台北清晨移到下午——
> **collect 15:30、反思 16:00、大腦 16:40**（UTC 07:30／08:00／08:40）。
> 原因：**Google Indexing API 的每日 200 配額是 per GCP 專案**，不是 per 站
> （API 實測回 `project_number:970644545797`、`quota_unit "1/d/{project}"`），
> 而 seo-ops 有 **5 站共用同一把 `ga4-insights@yaocare`**（arthurs.tw／folk.tw／sutta.io／
> twdro.net／vuko.life；2026-07-31 全站台設定檔 sha256 比對，幾乎全部相同），等於共搶同一份 200。
> 配額以**太平洋時間**換日 ≈ 07:00 UTC ≈ **台北 15:00**。原本 folk.tw collect 排 20:30 UTC＝
> 配額日 +13.5h，前面三站先吃光 → **實測待送佇列（含農曆七月節日頁）連兩天一筆都沒送出**，
> 兩次手動執行都是第一筆就 429。移到 +0.5h 成為第一順位。
> **代價**：每日 Slack 心跳（`seo-collect.mjs` 直接 import slack）從早上變下午，用戶已同意。
> ⚠️ **要排進配額日前段就必然落在台北下午，無法兩全。** 完整緣由寫在 `/etc/cron.d/seo-ops` 的
> folk.tw 段註解。雲端三個 routine 與
`seo-daily.yml`／`weekly-report.yml`／`seo-notify.yml` 三個 Action 已退役刪除。
**維運操作用 `/seo` skill。**

🔴 **以下五段是 2026-07-02 遷移前的舊描述，時刻與腳本名皆已過期**（本檔開頭已註明 `scripts/seo-*` 皆退役、
時刻於 2026-08-01 改為下午）。**保留僅供追溯，勿照此操作**——現況看上方表格與 `/etc/cron.d/seo-ops`。

共五段（另有反思層排在大腦前，自動改寫 playbook 策略段，見 `/root/seo-ops/README.md` § 反思）：
1. **收集 04:30 台**＝`scripts/seo-collect-cron.sh`（純 node）：`seo-daily.mjs` 拉 GA4+GSC →
   產 `data/seo-daily/<台灣日期>.json`（**page×query／strikingDistance 排名5-15／highImpZeroClick／index 覆蓋**）
   → commit `[skip ci]` push → `index:ping`。手動：`pnpm data:seo-daily`。
2. **心跳 05:00 台**＝`scripts/seo-report-slack.mjs`（純 node）：讀當日 JSON → 發 Slack `神酷-folk-tw`（C0BCPHBF1ML）純數據。
3. **大腦 05:55 台**＝`scripts/seo-brain-cron.sh`（headless `claude -p`，Sonnet）：讀當日 JSON → 驗昨日 `-actions.md` 勝負 →
   **守三護欄優化**（事實必查權威源否則只動內鏈/meta＝**絕不杜撰**；≤5 檔；check:integrity+build 不過不 push）→
   commit **`[auto-claude-seo]`** → push（`git pull --rebase` 防搶先；push 即自動觸發 deploy，比對 headSha 確認）→
   `pnpm notify` 雙推 Google+IndexNow → 寫 `-actions.md` → 發 Slack（首行 **🚦 行動標籤**）。失敗發 **🔴 保底 Slack**。
4. **週報 週一 09:30 台**＝`scripts/seo-weekly.mjs`（純 node）：抓一次 → 開週報 Issue → Slack 發重點＋**索引稀釋判讀**＋Issue 連結。
- **授權**：大腦 headless **不用** `--dangerously-skip-permissions`，改靠專案層 `.claude/settings.json` 指令白名單；`IS_SANDBOX=1` 僅供 root 執行。
  Slack 用 folk 專屬 bot（App「好棋寶寶 Claude 助手」，token `/root/.config/folk-tw/slack-bot-token`）。
- **回退**：`git log --oneline | grep auto-claude-seo` → `git revert <sha>`。**檢視**：Slack 每日/週摘要，或 `data/seo-daily/<date>-actions.md`。
- ⚠️ **push main 會自動觸發 deploy（deploy.yml on:push 實測 2026-07-02 確認）**，**絕不可再手動補 `gh workflow run deploy.yml`**：
  同 SHA 兩個 run 搶 Pages 佇列 → 先到者逾時取消部署時會把該 SHA 的 build version 標成 cancelled →
  後續同 SHA 部署全部秒失敗，只能推新 commit 換 SHA 解。（大腦 playbook 已於 7/2 禁止補跑、7/4 移除
  playbook 殘留的「本機 push 不觸發部署」過時句。）**例外 B（見 decisions/deploy-and-gates.md）**：deploy job 因 Pages 服務端暫時性
  錯誤失敗（build job 成功）時，`gh run rerun <run-id> --failed` 重跑同一 run 一次（不另開 run、無毒化
  風險，2026-07-04 實證）；再失敗交人工。

---

## 附錄：2026-07-02 的起飛基準（歷史存查，數字已過期，現況看週報）

## 🔴 第一優先：已進入搜尋，觀察 CTR 與收錄轉化（2026-07-02 更新）

每週一 09:30(台) cron（`/root/seo-ops` 框架週報層）：抓一次資料 → 開週報 Issue（含索引稀釋判讀）→ Slack `神酷-folk-tw` 發重點＋Issue 連結。
**人要看的數據（gh issue list --label weekly-report 讀最新週報，或看 Slack）：**

1. **起飛已確認（2026-07-02 查證）**：週報 6/30（Issue #4）：台灣自然搜尋訪客 **137/週**（前週 5）、
   GSC 曝光與點擊見當期快照；日收集（資料窗至 2026-06-29）：7 天點擊 172（週增約兩成）、曝光 9,845（週增 26%）、平均排名 10.8。
   （舊基準留檔供對照：2026-06-21 前 90 天僅 47 曝光/3 點擊、GA4 27 sessions 幾乎全 Direct＝形同不存在。）
2. **索引收錄轉化（續觀察）**：旗艦獨特頁 **3/5 已收錄**（`/deities/mazu` 從 unknown 轉 ✅、
   `/poems/liushi_jiazi-1` ✅、`/allusions/suitang_qinshubao` ✅）；`/deities/guangong` 仍 Discovered-not-indexed
   （URL Inspection 偶回 unknown＝API 既有雜訊，8 天內交替出現，勿當退化）；`/poems` 仍 Crawled-not-indexed。
3. **廟宇頁 CTR（新焦點）**：廟宇頁已佔曝光**過半**（基準時「廟宇頁 0 搜尋貢獻」的前提已被推翻）。
   CTR≈0 的結構性根因（全站 ~6500 廟宇頁無 meta description、落回首頁通用文案）已由大腦 7/2
   commit `a231e2d` 修復；**7/4 起看廟宇頁整體 CTR 是否回升**（結構性改動，看群體趨勢非單頁）。
4. **Sitemap 提交數疑點（2026-07-16 已修正結案）**：根因＝**週報腳本計數 bug**，非 GSC 後台有問題。
   線上結構正確（robots.txt 只宣告 `sitemap-index.xml` 包裹層→指向 `sitemap-0.xml`），但 GSC API 會同時
   列出 index 與其子檔（各報 submitted 9,825），`seo-weekly.mjs` 原本一併相加＝雙倍虛胖（9,825×2≈19,570）。
   commit `fa480f6` 改為**只計葉子 sitemap、跳過 `isSitemapsIndex` 包裹層**，乾跑回正 9,825。無需進 GSC 刪 sitemap。
