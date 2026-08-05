# folk.tw（神酷）— 待辦與待驗證數據

> ## ⏭️ 下一步（2026-07-31 定，用戶已同意此順序）
>
> 1. ~~**匯入慶典資料**~~ ✅ **2026-07-31 完成**：**2,500 間廟、4,108 筆**年度慶(祭)典已進
>    `temples.json` 的 `festivals[]`（原本只有 21 間有 `main_festival`）。
>    細節、裁示與清洗規則見 [`docs/festival-data-import.md`](docs/festival-data-import.md)、
>    本檔下方「年度慶(祭)典」條目。
> 2. ~~**處理 appi.news 撞題**~~ 🅤 **2026-08-02 用戶裁示「不用理他」，結案不做。**
>    （原內容：appi.news 有四篇 2026 中元/鬼月/七夕文章連過來，其中三篇打的正是
>    `/festivals/zhongyuan/`、`/festivals/qixi/` 的目標查詢。）
>    **不要再把它列進待辦或建議**，除非用戶自己重開。
> 3. **降 GSC 權限**（資安衛生，不緊急，排在 8/31 後亦可）：共用服務帳號在 9 個網域是「擁有者」，
>    只有用 Google Indexing API 的站才需要。降成「完整使用者」是十分鐘、風險降最多的一步。
>    背景見 `/root/CLAUDE.md` 紅線與 `/root/seo-ops/notes/identity-migration.md`
>    （⚠️ 該檔開頭有一段 2026-07-31 的前提更正，**先讀那段**再看其餘內容）。
>
> **8/8** 是節日頁收錄檢查點、**8/16** 是節日類查詢曝光檢查點（每日心跳自動出數，不需人盯）。

> 🇹🇼 **台灣端資料投遞管道（2026-07-30 建）**：內政部全國宗教資訊網與 MOI `temple.xml` 皆擋境外 IP。
> 解法**不是搬主機**——只有「取資料」需要台灣 IP，解析／查證／gate／部署／seo-ops 全留這台。
> 台灣主機跑定時腳本當**笨水管**（照清單抓、送原始 bytes、**一行都不解析**，因為慶典查詢是網頁 UI、
> 境外看不到，parser 只能寫這邊）。
> - 台灣端交接清單：**[`docs/taiwan-host-handoff.md`](docs/taiwan-host-handoff.md)**
> - 抓取清單（我維護，台灣端每輪取最新）：**[`docs/intake-manifest.json`](docs/intake-manifest.json)**
> - 收件：`/root/.config/folk-tw/intake/inbox/`（**repo 外**，因 temple.xml 含 12,419 間廟的
>   電話與負責人＝個資，而本 repo 為 public 且每日 seo cron 會 commit 整個工作區）
> - 處理：`scripts/intake-ingest.mjs`（驗 sha256＋expect → 原子 rename 上位 → 舊版進 archive；
>   **內容與現有上位檔相同就略過上位、不歸檔**）；`scripts/intake-watch-cron.sh`
>   （每小時 :07 收件、每日 01:20 UTC 查新鮮度）；排程 `/etc/cron.d/folk-intake`
> - 🔴 **新鮮度提醒的判準是台灣端回傳的 `state.json`，不是本地檔案 mtime**（2026-08-03 改，
>   commit `8e595aa`＋`d0ea634`）。只有**境外端能動手**的兩種情況發 Slack：①`state.json` 逾 36h
>   沒更新＝台灣端沒在跑 ②台灣端記錄抓取成功、sha 也與現有檔不同，檔卻沒進來＝rsync 那段斷了。
>   **來源掛了／來源沒更新一律不發**（用戶：「台灣端資料不一定會有更新，主要還是看資料來源」）。
>   病灶＝舊版只做 `ageDays(檔案)`，於是每天對著掛掉的中研院 CRGIS 發「台灣主機的抓取腳本可能
>   沒在跑」，而同一份 state.json 正寫著台灣端前一晚才跑過＝**指控錯的一方**。
>   已知停擺的來源在 manifest 加 `_alert: false` 靜音（目前只有 crgis）。
>   ⚠️ **境外端專用欄位一律底線開頭**——台灣端遇到不認得的 manifest 欄位會**整個停擺**
>   （handoff 3.5，2026-08-01 事故換來的）。
>   ⚠️ 「略過上位」與「靠 sha 判新鮮度」是**配套**：略過後 mtime 就凍住，只看 mtime 必然誤報。
> - ⚠️ **`expect` 的絕對下限擋不住殘檔**：2026-07-30 實測 5 MB 截斷檔（真檔 6.27 MB）通過
>   `min_bytes: 4000000` 並**覆蓋掉完整檔**（12,419 筆只剩前 5 MB），靠 archive 救回。
>   故必須有 `not_smaller_than_current_pct`（不得比現有檔小 10% 以上）與 `min_occurrences`
>   （整檔記錄筆數下限）兩道**相對**檢查。改 manifest 時別把這兩道拿掉。
> - ⚠️ 上位必須原子（寫暫存再 `rename`）：`/root/.config/folk-tw/temple.xml` 被
>   `/root/folk-outreach/outreach-daily.mjs` 每日 04:30 台北讀取，讀到半個檔會產生錯誤的外撥名單。

> 本檔在 `/root/folk.tw` 開新 session 會自動載入。詳細專案脈絡見自動記憶
> `/root/.claude/projects/-root-folk-tw/memory/`（MEMORY.md 為索引）。
> **守則：報現況/缺口/數量前一律用指令查證、不臆測；部署後以 curl 線上實證；
> 資料整合性欄位（聖誕/宜忌/來源/官網）查無權威源就留空，絕不杜撰。**

## 🔴 第一優先：已進入搜尋，觀察 CTR 與收錄轉化（2026-07-02 更新）

每週一 09:30(台) cron（`/root/seo-ops` 框架週報層）：抓一次資料 → 開週報 Issue（含索引稀釋判讀）→ Slack `神酷-folk-tw` 發重點＋Issue 連結。
**人要看的數據（gh issue list --label weekly-report 讀最新週報，或看 Slack）：**

1. **起飛已確認（2026-07-02 查證）**：週報 6/30（Issue #4）：台灣自然搜尋訪客 **137/週**（前週 5）、
   GSC 曝光 5,572、點擊 111；日收集（資料窗至 6/29）：7 天點擊 172（週增 24%）、曝光 9,845（週增 26%）、平均排名 10.8。
   （舊基準留檔供對照：2026-06-21 前 90 天僅 47 曝光/3 點擊、GA4 27 sessions 幾乎全 Direct＝形同不存在。）
2. **索引收錄轉化（續觀察）**：旗艦獨特頁 **3/5 已收錄**（`/deities/mazu` 從 unknown 轉 ✅、
   `/poems/liushi_jiazi-1` ✅、`/allusions/suitang_qinshubao` ✅）；`/deities/guangong` 仍 Discovered-not-indexed
   （URL Inspection 偶回 unknown＝API 既有雜訊，8 天內交替出現，勿當退化）；`/poems` 仍 Crawled-not-indexed。
3. **廟宇頁 CTR（新焦點）**：廟宇頁已佔曝光 **52%**（基準時「廟宇頁 0 搜尋貢獻」的前提已被推翻）。
   CTR≈0 的結構性根因（全站 ~6500 廟宇頁無 meta description、落回首頁通用文案）已由大腦 7/2
   commit `a231e2d` 修復；**7/4 起看廟宇頁整體 CTR 是否回升**（結構性改動，看群體趨勢非單頁）。
4. **Sitemap 提交數疑點（2026-07-16 已修正結案）**：根因＝**週報腳本計數 bug**，非 GSC 後台有問題。
   線上結構正確（robots.txt 只宣告 `sitemap-index.xml` 包裹層→指向 `sitemap-0.xml`），但 GSC API 會同時
   列出 index 與其子檔（各報 submitted 9,825），`seo-weekly.mjs` 原本一併相加＝雙倍虛胖（9,825×2≈19,570）。
   commit `fa480f6` 改為**只計葉子 sitemap、跳過 `isSitemapsIndex` 包裹層**，乾跑回正 9,825。無需進 GSC 刪 sitemap。

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
> twdro.net／vuko.life；12 個站台設定檔 sha256 比對，11 個完全相同），等於共搶同一份 200。
> 配額以**太平洋時間**換日 ≈ 07:00 UTC ≈ **台北 15:00**。原本 folk.tw collect 排 20:30 UTC＝
> 配額日 +13.5h，前面三站先吃光 → **實測待送佇列（含農曆七月節日頁）連兩天一筆都沒送出**，
> 兩次手動執行都是第一筆就 429。移到 +0.5h 成為第一順位。
> **代價**：每日 Slack 心跳（`seo-collect.mjs` 直接 import slack）從早上變下午，用戶已同意。
> ⚠️ **要排進配額日前段就必然落在台北下午，無法兩全。** 完整緣由寫在 `/etc/cron.d/seo-ops` 的
> folk.tw 段註解。雲端三個 routine 與
`seo-daily.yml`／`weekly-report.yml`／`seo-notify.yml` 三個 Action 已退役刪除。
**維運操作用 `/seo` skill；完整 runbook 見 [`docs/seo-automation.md`](docs/seo-automation.md)。** 共五段（另有反思層 05:20 台排在大腦前，自動改寫 playbook 策略段，見 `/root/seo-ops/README.md` § 反思）：
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
  playbook 殘留的「本機 push 不觸發部署」過時句。）**唯一允許的介入**：deploy job 因 Pages 服務端暫時性
  錯誤失敗（build job 成功）時，`gh run rerun <run-id> --failed` 重跑同一 run 一次（不另開 run、無毒化
  風險，2026-07-04 實證）；再失敗交人工。

## 🟠 待決策（看上面數據後）

- [x] **翻土地公退場開關**（2026-06-23 commit `49b7b58` 設 `true` → **2026-07-31 設回 `false`，已結案**）：
      當初依 GSC 基準判讀（廟宇頁 0 搜尋貢獻、獨特頁 mazu 仍 unknown）把
      `EXCLUDE_TUDIGONG_FROM_SITEMAP` 設 `true`，線上 sitemap 廟 7913→6530、總 10799→9415。
      **2026-07-31 設回 `false`**：稀釋疑慮早在 7/2 就判定未成真（見下方那條），但開關忘了關。
      關掉的實測依據——被排除的 1,384 頁中**有 329 頁光靠內鏈被爬到就產出 3,967 曝光／61 點擊，
      CTR 1.54%＝與其餘廟宇頁（1.74%）同級，完全沒有拖累獨特頁**；另外 1,055 頁是零曝光。
      而廟宇頁已佔全站曝光 91%，是唯一被驗證的成長引擎。
      實證：sitemap **9,877 → 11,279**，1,384 間土地公廟全數回歸（`grep <loc> dist/sitemap-0.xml`）。
      **若未來獨特頁收錄倒退且曝光停滯，才重新考慮設回 `true`。**
- [x] **首頁直連旗艦神明頁**（同上 commit）：首頁新增「熱門神明」區塊，直連
      媽祖/關聖帝君/廣澤尊王/中壇元帥/保生大帝/城隍爺（依 GSC 曝光查詢挑選），旗艦頁離首頁跳數 2→1。
- [x] **送 Indexing API**（2026-06-23）：對 11 個未索引但有需求的頁（首頁、/deities 樞紐、
      6 尊旗艦神明、liushi_jiazi-1/45、suitang_qinshubao）送出，成功 11/失敗 0。
- [x] **是否需更激進降稀釋 → 決策：不做（2026-07-02 關閉）**：廟宇頁已佔曝光 52%、獨特頁 3/5 收錄、
      曝光週增 26%——稀釋疑慮未成真，動過去農民曆日期頁的理由消失；焦點轉為廟宇頁 CTR（見 🔴 第 3 點）。
      除非未來數據反轉（獨特頁收錄倒退且曝光停滯）才重開此項。

## 🟡 選配開發（有數據佐證再排序，皆非當務之急）

- [x] 行業守護神＋農民曆行業視角（2026-07-02 commit `a09d6e2` 上線；2026-07-03 擴充至 12 頁）：`/trades` 樞紐＋
      12 行業頁（scholars/business/healthcare/maritime/construction/agriculture/engineers[現代延伸]＋第二批
      performers/educators/uniformed-services/beauty/civil-servants[現代延伸]，**slug＝永久承諾勿改**）；
      月份樞紐加「本月各行業吉日」（零新頁）。守護神對映在 `src/data/trades.json` 逐筆掛源（第二批全部經
      agent 直抓查證；已排除命理香業[用戶指示]/餐飲[易牙無台灣信仰現場]/花卉/特種行業）；
      **M3 verified 篩選唯一入口＝`src/lib/almanac/select.ts`**（勿另建判定）；
      宜側僅 10 事項有 verified 資料（開市/出行恆空，check-integrity 有軟警告擋）。兩批各一次性 notify，
      **不**進每日 cron 高槓桿集，四週後看 GSC 再議。

- [x] 神明聖誕曆（2026-07-08 commit `19e8dcd` 上線；反思層/競品 temples.tw 啟發）：**首頁「近期神明聖誕」區塊**
      （近 60 天取 6）＋**`/deities/birthdays` 全年聖誕曆**（60 尊全數、依國曆序、breadcrumb/FAQPage）。核心
      `src/lib/birthdays.ts`：build 只算「農曆聖誕→下一次國曆日期」（靜態事實、SEO 要的），**倒數「N 天後」與
      隱藏已過者由 `UpcomingBirthdays.astro` 的 client script 依台灣時區即時算**＝就算某天沒重新部署倒數也永遠準
      （解決每日收集 `[skip ci]` 不部署→build 不新鮮的問題）。反算沿用 `deityBirthdayIndex()`＋lunar-javascript
      （與農民曆同源）；**短月卅日聖誕順延農曆月底**（地藏王七月卅→今年無卅日順延廿九 9/10，標真實聖誕日）、
      `uniqueDeity` 去重保 60 尊各一次。已 notify＋進 trackUrls/flagship/**watchGroups**。**監控改每日**：每日心跳
      （05:00 Slack）「🎯 關注」段每天報聖誕曆曝光/冒出的字＋「📄 重要頁面」段每天報收錄翻牌；週報另有週對週。
      數據足夠再議是否擴（勿平均擴張）。
- [x] /poems 樞紐 not-indexed 根因＝**尾斜線分裂**（2026-07-08 同 commit 修）：實查 GSC 發現 canonical `/poems/`
      （sitemap 收的）**內鏈數=0、從未被爬**，而全站 nav/內鏈都指非 canonical `/poems`（Crawled-not-indexed、
      lastCrawl 凍 6/21）→ 內鏈權重全卡在 301 來源、canonical 孤兒化。修法：**nav 全部＋首頁 modules＋
      404/systems/poems/allusions 的 /poems 內鏈一律改 canonical 尾斜線**（active 判斷已正規化不失準），
      並對 `/poems/` 送 Indexing API。**監控改每日**：trackUrls 已換 canonical `/poems/`，每日心跳「📄 重要頁面」段
      每天顯示 `/poems/`（籤詩首頁）收錄狀態＋翻牌——**看哪天從 Discovered/Crawled-not-indexed 翻成已收錄**。
      **7/16 為決策點**：若內鏈修到那時仍未翻，才輪更激進手段（sitemap priority／外部連結／評估列表頁內容深度）。
- [x] 情境頁＋比較頁（2026-07-07 commit `5d1c65a` 上線；AEO/GEO 高意圖突圍試點）：
      **情境頁** `/scenarios`（4：求姻緣/考試求功名/開店求財/搬家入厝，slug 永久承諾）＝新增 `scenarios`
      content collection（schema 同 trades），沿用「訴求→神明＋逐筆掛源」模式；情境→神明對應皆為該神
      **已掛源之職司本身**、來源沿用 repo 內既有權威源（**絕不杜撰**，未派網路研究）。affairs_yi 只挑有
      verified 宜票者（避恆空）。**比較頁** `/compare`（3：月老vs註生娘娘/城隍vs土地公/文昌vs魁星）＝
      全衍生自 `src/data/comparisons.json`＋`deities.json` 已掛源欄位、零新增事實。兩類皆 answer-first
      H1＋speakable＋FAQPage。nav 加「怎麼拜」入口；check-integrity 硬驗 scenarios/comparisons 之
      deity_ref/affairs/related_scenario。一次性 notify（Google 9＋IndexNow 9 皆成功），**不**進每日 cron
      高槓桿集。**關注方式（用戶指示）＝每週週報固定追蹤，不等四週**：seo-ops 站台設定
      `sites/folk.tw.json` 已加 `watchGroups`（`/scenarios/`、`/compare/`）＋兩組代表頁進
      `trackUrls`/`flagship`，週報新增「🎯 頁組關注」段（收錄率＋曝光/點擊 WoW＋冒出的查詢，
      commit seo-ops `77cab90`）；下週一 09:30 週報起生效。**是否擴更多頁**再依週報數據判斷（勿平均擴張）。
      未做：神明頁反連情境/比較（留每日大腦漸進補）。
- [x] speakable schema（2026-06-23 commit `365b78f`＋`b1aff85` 上線）：Base 加 `speakable` prop →
      輸出 WebPage SpeakableSpecification；神明/籤詩/典故/習俗/農民曆日期五類常青詳情頁宣告
      answer-first 區塊（`h1`＋`.summary`/`.lead`/`.story`/`.yiji-section`）。僅內容詳情頁、未外溢首頁/列表頁。
      （events 為結構化欄位無整句摘要、已有 FAQPage 覆蓋，故不加。）首頁「熱門神明」同批補上月老（yuelao）。
- [x] 神明 `sameAs` 補齊（2026-06-23，48→**69/76**，src/data/deities.json）：21 尊查證 Wikidata/維基百科
      補上；餘 7 尊（花公花婆/使者公蛇神/三尊甲乙丙太歲/妙應仙妃/祖神）查無權威條目，依無源不杜撰**留空**。
- [x] 名廟 沿革/聖誕 內容豐化（2026-06-24）：temple schema 加 `founded`/`history`/`main_festival`＋
      詳情頁「沿革」區塊（有沿革者加 speakable）；21 間有官網名廟逐間查證（文化部文資/官網/維基）填入、各掛源。
- [x] 民俗活動續擴（2026-06-24，21→**36 場**）：文化部文資逐筆查證新增 15 場（北中部 7＋南東離島 8，
      含金門迎城隍、南關線三大廟王醮 2 個國家重要民俗）；主辦廟「名稱＋鄉鎮」消歧後 10 場對映 temple id、
      5 場（多廟/委員會/同名難辨）留空不強連；二結王公主神古公三王無 deity 節點故留空（軟報表 35/36）。
- [x] 新港奉天宮官網（2026-06-24）：MOI 資料其實有 `moi_4080_財團法人台灣省嘉`＝新港奉天宮（舊註過時），
      已查證官網 `https://www.hsinkangmazu.org.tw/` 並填入 website＋掛源。
- [x] 廟宇鄉鎮二級瀏覽（2026-06-24）：`temple-region` 加 `templeTownship`（縣/市別後綴規則，0 個 null）；
      縣市頁改列鄉鎮樞紐、新增 `/temples/region/[county]/[town]`（351 鄉鎮頁）、廟頁麵包屑+底部連鄉鎮，化解台南1076/高雄973 過大。
      **2026-07-28 內容深化**：原本整頁只有「共 N 間」＋一長串清單＝薄列表頁，GSC 抽驗（URL Inspection API，40 頁）
      收錄率僅 **23/40（57%），全站最低**（廟宇頁 88%、農民曆過去日期頁 8/8、籤詩/典故/神明各 7/8）。
      補的內容**全部由既有資料衍生、零杜撰**：answer-first 摘要（間數＋主祀神分布＋在全縣/市的排名與佔比）、
      主祀神分布區塊（有 `main_deity_ref` 者連神明頁、查無對映只顯示文字不硬連）、已查證沿革/官網的宮廟
      （無則整區塊不出現，不硬湊）。每鄉鎮統計天然不同＝頁面之間不再是同一套模板句。
      **不變量已進 `check:rendered` 全量 gate**（351 頁逐頁驗「摘要存在且間數等於資料」，含雙向反例測試）。
      ⚠️ 該 gate **直接 import `src/lib/temple-region.ts`**、不自行重寫地區解析——初版自己寫正則，
      立刻在桃園區/麻豆區等 12 處對不上（lib 依縣市別區分後綴＋臺→台正規化）。因此 `check:rendered`
      改用 `node --experimental-strip-types` 執行。

- [x] **`/festivals/` 節日模組（2026-07-30 commit `279c351` 上線；農曆七月季節戰役的承重項）**：
      用戶設定目標「2026-08-31 的 GA4 28 日活躍人數破 2 萬」（7/29 實測 3,189）。GSC 實查根因＝
      **全站曝光 ≥100 的「非廟名」查詢只有 1 個**（5,633 查詢中 4,175 是廟名）＝頭部詞覆蓋率為零，
      且週曝光已停滯（42,119→44,331，+5%）。28 日窗口（8/04–8/31）有 **19 天在農曆七月內**：
      **鬼門開 8/13、七夕 8/19、放水燈 8/26、中元節 8/27**（鬼門關/地藏王聖誕 9/10 在窗口外）。
      補的是 `practices.json` 早有 `festival_ref` 欄位卻**沒有對應模組**的懸空引用。
      - 5 筆＋樞紐：`zhongyuan`／`qixi`／`guimenkai`／`jilong-zhongyuan`／`fangshuideng`，
        **slug＝永久承諾勿改**。仿 `/compare/` 純 JSON 模式（`src/data/festivals.json`，非 collection——
        所連的 practices/events/deities 三者都已有 Zod schema 與掛源閘，新建 collection 不多驗證任何東西）。
      - **日期一律由 `src/lib/lunar-date.ts` 的 `lunarToNextSolar()` 在 build 時算**，倒數由
        `FestivalCountdown.astro` 依台灣時區前端即時算（同 `UpcomingBirthdays` 機制，故 `[skip ci]`
        不部署的日子倒數也不會過期）。**勿在頁面自行換算農曆**。
      - ⚠️ **`src/lib/lunar-date.ts` 刻意零專案內 import**（連 `almanac/dates` 的 `addDays` 都不接，
        改用 lunar-javascript 自己的 `Solar.next()`）：`birthdays.ts` 依賴 `astro:content`，
        `scripts/check-rendered.mjs` 無法載入它 → 若不抽出來，gate 就得自己重寫一份日期邏輯（＝新的漂移源）。
      - 第二批已於同日一併完成（原排 8/3–8/5，無技術相依擋著、越早收錄越好，故不分批）：
        `qianggu`（頭城＋恆春搶孤）／`yimin`（義民祭 9/1）／`dizang`（七月三十，本年短月順延廿九 9/10，
        同日為鬼門關）／`baitiangong`（正月初九）／`qingming`（清明）＝**共 10 頁**。
      - ⚠️ **節氣型節日**：清明是節氣、不是農曆固定日（由太陽黃經定，國曆約 4/4–4/6，農曆日期逐年不同）。
        故 schema 為 **`lunar_date` 與 `solar_term` 恰二選一**（integrity 硬驗，且 solar_term 須為
        二十四節氣之一）；兩種型別由 `festivalNextSolar()` 統一，**頁面與 gate 都不自行判斷型別**。
      - ⚠️ **跨多日用明確的 `multi_day` 欄位，不可用 `Boolean(date_note)` 推斷**：date_note 也用來寫
        純說明（地藏王的短月順延、搶孤的頭城/恆春異地異日），初版誤推斷而產生
        「地藏王菩薩聖誕｜農曆七月三十起・儀式順序」這種與事實不符的標題。目前僅雞籠中元祭為 true。
      - **2026-08-03 補內鏈（commit `a030482`）**：GSC 實查 10 頁 **28 天曝光合計 = 0**，內容完整、
        多數也已收錄（8/1–8/3 才第一次被爬），缺的純粹是內鏈——`qianggu` 甚至是
        「URL is unknown to Google」＝孤兒。補了兩層：
        ① **廟宇頁 →節日頁 238 → 678 間**：原本只有 `festivalOwnerByLunarDate`（該廟登記祭典與節日**同天**）
        命中 238 間；改用 `festivals.json` 既有 `deity_refs` 反查**主祀神**再涵蓋 440 間
        （中元 219／拜天公 137／地藏 93／七夕 37／義民 36／清明 10／鬼門開 6，實測期望 440＝實得 440）。
        🔴 **措辭界線同 7/31 那條**：講的是「**神明**與節日的關係」（節日資料自己的 deity_refs、逐條掛源），
        **不是「這間廟在辦這個節日」**，頁面明寫「不是本廟的活動公告」；class 與 `fsame` 分開，
        `check:rendered` 既有不變量不受影響。
        ② **節日頁互連**：原本 10 頁彼此**完全不相連**、只各自連回樞紐＝十個並排的葉子。
        依既有 `season` 欄位分組互連，農曆七月那 7 頁成一叢集（`qianggu` 因此被 8 頁連到）。
        ⚠️ 起算日用**今天（台北）**而非本頁的 `iso`（`iso` 是本節日的下一次國曆日，拿它當起算點會把
        同月份、日期比它早的節日推到明年）；排序用 `lunar_date` 字串，**不可用農曆中文標籤 localeCompare**
        （「初一」「十五」「廿」排不出正確順序）。

- [x] **廟宇頁 meta description 去樣板（2026-07-30 同批，影響 7,891 頁）**：原尾句
      「神酷（folk.tw）廟宇資料庫收錄，資料源自內政部全國宗教資訊網。」在 **~7,869 頁一字不差**
      （`history` 只有 22 間有），對「台南○○宮」這類查詢零資訊量（GSC 實測廟宇頁 CTR 僅 1.76%）。
      改為依序取每頁天然不同的既有衍生資料：**沿革首句 → 主祀神聖誕 → 鄉鎮脈絡（間數／同主祀數）→ 可求籤**，
      零新增事實。實測後**已無任何一頁落回通用尾句**。不變量進 `check:rendered`（不變量 2b）：
      該鎮不只一間廟者（7,884 頁）description 不得為通用樣板——防未來改動又退回樣板。
      - **不可寫**：大士爺／普渡公**無 deity 節點**（大士爺＝觀音經「點睛」附於鬼王，源：國史館）。
      - ⚠️ **原「7,891 間廟無一間 `main_festival` 提到七月/中元/普渡 → 不可在廟頁放七月祭典宣稱」
        這條前提已於 2026-07-31 被慶典資料匯入解除**：現在 2,500 間廟有廟方**自己向內政部登記**的
        年度祭典，其中農曆七月十五當天有登記祭典者 105 間。**逐廟、逐筆、掛源**，不是宣稱。
        但界線不變：只能陳述「該廟登記了這個祭典」，**不可推論成「這些廟在過中元節」**。

- [x] **廟宇頁 title 加「主祀○○」（2026-07-31，7,801/7,891 頁生效）**：GSC 實查發現一件事——
      廟宇頁佔全站曝光 **91%**（130,748/143,500），但 **CTR 按排名分層看，第 1–10 名全部只有產業基準的
      0.17～0.42 倍，而第 11 名以後是正常的 0.99 倍**。這個對比只有一個解釋：排在前面的字都是廟名查詢，
      SERP 上方被 Google 地圖包／GMB 吃走點擊。**在地圖包旁邊唯一能贏的是「地圖不給的資訊」**，
      且主祀神直接命中「○○宮 主祀／拜什麼」這類**沒有地圖包**的修飾詞長尾。
      title 由 `廟名・縣市鄉鎮` → `廟名・縣市鄉鎮・主祀○○`（僅用既有欄位，零新增事實）。
      - ⚠️ **兩道清洗規則不可省**（`main_deity_raw` 是 MOI 原始欄位，很髒）：
        ① 逗號分隔**取首位**——有廟登記了 7 尊（「虎爺將軍,韋馱佛祖,註生娘娘,關聖帝君…」）；
        首位超過 8 全形字則回退到已對映的神明節點短名，再不行整段不加。
        ② 組出來含站名超過 **30 全形字就整段退回原樣，不截字**。
      - 實測：7,801 頁加得上、中位數 20 全形字、p90 24。
      - 不變量進 `check:rendered`（不變量 1d）＋**三種違規已逐一造反例實測會擋**（含分隔符／神名超長／超過 30 字）。
        ⚠️ 上限**只對帶主祀子句者**斷言——有 3 間廟光是「登記全名＋鄉鎮」就已超過 30
        （如「財團法人蚵子寮朝天宮天上聖母船仔媽(94年9月變動更名)」），那是改動前就存在的既有狀態，
        **不該為了湊字數去截廟方的登記全名**（廟名正是使用者搜的字，截掉比被 Google 省略更糟）。

- [x] **年度慶(祭)典匯入（2026-07-31，2,500 間廟／4,108 筆）**：內政部全國宗教資訊網「慶(祭)典查詢」，
      經台灣端投遞管道取得（擋境外 IP）。原本只有 21 間有已查證的 `main_festival`＝**119 倍**。
      **完整規格、陷阱、裁示與 gate 清單＝[`docs/festival-data-import.md`](docs/festival-data-import.md)，改動前必讀。**
      - 匯入器 `scripts/import-festivals.mjs`（**乾跑為預設**，`--write` 才寫；已實測 idempotent）。
      - 資料進 `temples.json` 的 **`festivals[]`**（`{name, calendar, date, desc?}`）；
        **`main_festival` 一個字都不碰**——那 21 間是逐間查證的敘述句，品質高於 MOI 短語，顯示層永遠讓它優先。
      - ⚠️ **`calendar` 必須逐筆帶**：官方 ODS 匯出**沒有農曆／國曆標記**，而來源 6,644 筆中農曆 6,365、
        國曆 279 → 只用 ODS 會把媽祖聖誕農曆三月廿三寫成國曆 3/23。**HTML 是唯一可用的主來源。**
      - ⚠️ **`temples.json` 的 id 不是 MOI 編號**（`moi_1044_保民廟` 的 1044 是匯入當下的陣列索引），
        只能用「廟名＋行政區」對映；同名者走**電話橋**（廟名＋電話 → `temple.xml` → 完整地址 → temples.json，
        救回 99 筆）。**電話僅供比對、絕不寫進 repo**（個資，本 repo 為 public）。
      - **顯示推導唯一入口＝`src/lib/temple-festival.ts`**（代表筆＝**農曆日期最早**，用戶裁示不做語意判斷）。
        廟宇頁／OG 卡／`check:rendered` 三處共用，**勿在任一端自行挑代表筆或自行換算農曆**。
      - `/festivals/<slug>/` 新增**反向名單**「當天有登記祭典的宮廟」（中元 105 間、拜天公 91 間、
        鬼門開 15 間…）＝逐廟掛源、可反查，是 appi.news 那類內容站給不了的角度。
        🔴 措辭僅止於「當天有登記祭典」，**不是**「這些廟在過中元節」。
      - Gate 皆全量硬擋：`check:integrity`（曆別／日期真實存在／名稱含漢字／有 festivals 必有來源標註）、
        `check:rendered`（**雙向**：2,500 間必須渲染且筆數名稱逐筆相符＋代表句進 description，
        5,391 間必須不渲染；節日頁名單間數與資料相符）。

- [x] 神明頁 title 補國曆聖誕日（同 commit）：GSC 實測神明頁 CTR 僅 1.13%，主流意圖是「○○生日／聖誕」＝
      一個日期就滿足（`朱府千歲生日` 曝139 **點0**、`七爺八爺生日` 曝79 **點0**）。原 title 只有農曆、
      且用阿拉伯數字「農曆3月23日」——**從未命中查詢用的「農曆三月廿三」形式**，也沒有使用者真正要的國曆。
      改為 `媽祖（天上聖母）・聖誕農曆三月廿三（國曆 4/29）`。同時修兩個既有錯誤：
      ① `find(kind==='聖誕') ?? realBdays[0]` 會讓只有飛昇者的 title 出現「・飛昇…」；
      ② **9 尊神有多筆聖誕**（七爺八爺 04-26/04-27/10-01、三官大帝 01-15/07-15/10-15…），
      初版標籤取陣列首筆、國曆取最近一次＝**兩者不同筆**，產生「農曆四月廿六（國曆 11/9）」這種假事實
      （**7 尊會帶錯日期上線，被新 gate 抓到**）。現改為逐筆算下一次、挑最近者，標籤與國曆同出一筆。
      不變量已進 `check:rendered`（該檔首次涵蓋 deity 頁）：60 尊做**「國曆轉回農曆」往返驗證**——
      刻意**不依賴「今天」**（build 與 gate 若跨越台灣午夜就會差一天而誤報），無聖誕的 15 尊雙向驗不得帶後綴。

- [x] **nav：13 個扁平項目 → 7 組（2026-07-31）→ 單一主題軸 7 項（2026-08-01 重整，commit `68939a8`）**：
      行動版佔流量 **70%**（GA4 實測 2,369/3,389），一長串扁平連結在小螢幕是一面牆。
      7/31 首版收成 7 組，但**同時用了三條分類軸**——時間（今日宜忌／節日／農民曆）、意圖（我想…）、
      主題（神明・宮廟・解籤／習俗與典故）——使用者無法預測東西在哪一格；更嚴重的是**同一批內容被切到兩組**
      （籤：求籤 vs 解籤/籤系/藥籤；神明：拜哪尊/行業守護神/比一比 vs 神明/聖誕曆）。「我想…」因此變成
      11 項的雜物櫃、「搬家入厝看日子」在浮層裡折行。🔴 **寬度不一致是結果不是原因**——一組 11 項、
      一組 4 項，寬度不可能一致；別再從 CSS 下手修「寬度」。
      - **現行結構（8/1 用戶逐題裁示，勿擅改）**：`今日宜忌`／`農民曆`⌄／`籤詩`⌄／`神明`⌄／`廟宇`／
        `節慶習俗`⌄／`搜尋`。① 籤全合一組（線上求籤／解籤／籤系／藥籤／擲筊）。② 拜哪尊／行業守護神／
        比一比 跟神明同組（資料上就是 `deities.json` 的切片）。③ **日期類全合一組**，面板內分
        「農民曆」「看日子」兩小段——⚠️ 這是用戶明示的合併，**別再拆回兩個頂層項**。④ 節日與習俗典故合一組。
        ⑤ 廟宇升頂層單頁（8,265 頁、佔全站曝光 91%）。23 個樞紐全部有歸屬、無重疊，每頁 nav 34 條連結。
      - **沿用 7/31 命名裁示（勿改）**：首頁錨文字**不可寫「運勢」**（首頁實際區塊是熱門神明／近期節日／
        近期神明聖誕／今日農民曆，**站上沒有運勢內容**；nav 是全站 12,000 頁指向首頁的錨文字）；
        求籤＝抽一支、解籤＝查第 X 籤要在字面上分得出來（GSC 實測籤詩頁查詢多為「第X籤」）；
        錨文字用搜尋詞不用介面修飾詞（「近期節日」→「節日」）。
      - **分組必須是靜態 `<details>`／`<summary>`**（小標題用靜態 markup，不可用巢狀 details、不可 JS 注入）——
        爬蟲未必看得到，且會踩 Astro scoped style 套不到 JS 注入 DOM 的坑（記憶 [[astro-scoped-style-innerhtml-pitfall]]）。
      - ⚠️ **收闔行為是漸進增強**（`Base.astro` 的 `<script is:inline>`）：互斥開闔／點外面關／Esc 關，
        **只切 `open` 屬性、不動 DOM**。原生 `<details>` 開了就一直開，桌機浮層可以四個同時疊著。
      - ⚠️ **不可用 `groupActive()` 去設 `<details open>`**：桌機 `.nav-sub` 是絕對定位浮層，
        預設展開＝一進站就有白底浮層壓在正文上（進 `/poems/` 實測過）。它只能用來給 `summary` 標紅。
      - ⚠️ **「看日子」子項由 `good-days.json` 驅動、不硬編**，且用每筆的 `name`（結婚／搬家入厝）
        而非 `nav_label`（結婚看日子）——後者是 `[slug].astro` 的 H1 用字，放進已叫「看日子」的小段會重複，
        也正是折行元凶。硬編過一次就漂移成「資料 11 個、nav 只顯示 3 個」。
      - 順帶接回三個**原本完全不在 nav 的孤兒樞紐**：`/compare/`、`/jiaobei/`、`/vocabulary/`（＋8/1 的 `/systems/`）。
      - ⚠️ `/qiugian/`、`/jiaobei/` 是全站僅有的拼音 slug（其餘皆英文）。`/qiugian/` 已被 Google 收錄
        且在 seo-ops `trackUrls` 內，**改網址會斷收錄，維持不動**。
      - ⚠️ **擇日子項只放真的推得出宜日的**。清單見 `src/data/good-days.json` 的 `_policy`。

- [x] **`/good-days/` 擇日專區（2026-07-31）**：slug＝**永久承諾**，用戶指定現代英文
      （`wedding`／`moving`／`groundbreaking`／`burial`／`worship`；2026-08-01 補上 `haircut`／
      `business-opening`／`bed-placement`／`travel`／`engagement`／`roof-beam`＝**共 11 頁**）。
      宜日一律由 `src/lib/almanac/select.ts` 的 `verifiedYiDays` 取得（M3 唯一入口）。
      - 一頁可對多個用事（`worship`＝祭祀＋祈福），**分組列出不合併**成一個模糊的「宜拜拜」。
      - ✅ **原「10 個用事恆空」已於 2026-08-01（commit `bce5e2b`）解掉 7 個**：求嗣 宜7／出行 宜9／
        納采 宜8／上樑 宜8／安床 宜1／開市 宜3／移徙 宜8。安床與開市是擇日類搜尋量最高的兩個詞。
      - 🔴 **仍空 3 個，是查證後的結論、不是待辦**（理由記在 `votes.json` 的 `_pending_affairs`）：
        **破土**——卷十一宜列僅「鳴吠／鳴吠對」，兩者定位義例未實作，補上即可解鎖；
        **開光、入殮**——卷十一「用事」三份總目與逐條宜忌中**根本沒有這兩條**（已查卷 10/11/12
        並以 Wikisource insource 全站檢索確認），依「無源不發佈」**永不臆造**，除非改採其他經典為據。

- [x] **嫁娶宜忌補 11 條＋新增日相標記維度（2026-07-31，commit `39353ab`）**：
      實測 2026-08-17 建除為「平」、協紀卷十一嫁娶條明列忌平日，本站卻列為「宜嫁娶」。
      **根因不是漏填規則，是投票表少了一個維度**——卷十一清單裡的「平日／收日／閉日／亥日／丁日」
      根本不是神煞，而 `votes.json` 只認神煞 id。
      - 修法：**`src/lib/almanac/daytokens.ts`** 把建除值／日干／日支包裝成與神煞同形的 token
        併入 `activeShenSha` 集合 → 投票表寫法、制化查表、`verified` 傳播鏈**一行都不用改**。
        日後為剃頭加「丁日」只要多寫一條票。
      - 新增 7 個神煞（天喜／月害／厭對／四忌／四窮／五墓／八專），逐條附四庫本原文與 `_verify_note`；
        `shensha.ts` 新增兩型定位 `month->ganzhi`（五墓）、`ganzhi_set`（八專）。
      - 補完後嫁娶宜 7/10、忌 18/20。**仍缺 5 條**（宜：天赦／天願／不將；忌：大時／天吏），
        定位義例未於卷04–06 查得，依「無源不發佈」不入表，記在 `votes.json` 的 `_pending_jiaqu`。
      - Gate：`check:rendered` 不變量 5——把擇日頁列出的每個宜日翻到該日農民曆頁比對建除／日干／日支。
        **禁忌清單不在 gate 硬編，從 `votes.json` 的忌票反推**，日後加同類禁忌自動涵蓋；
        涵蓋 `/almanac/yiji/<事項>/` 與 `/good-days/<slug>/` 兩個露出面。

- [x] **擇日頁「日子挑好之後」動線（2026-08-02，用戶裁示）＋🔴 決定不做店家名錄**：
      用戶問「能不能接附近的店面資訊」。**本站不存任何店家資料**，只在真的有服務可約的擇日頁
      放一個地圖搜尋深連結（由使用者裝置定位），或連站內既有資料。
      - 目前只有 3 個有：`haircut`→地圖搜「理髮」、`moving`→地圖搜「搬家公司」、
        `worship`→站內 `/temples/`（我們已有 7,891 間廟且有座標）。
        資料在 `good-days.json` 的 `next_step`，理由寫在同檔 `_next_step`。
      - 🔴 **其餘用事刻意不放**：結婚／訂婚／安床／開市／出行／上樑／動土 沒有對應得上的單一服務，
        硬放會變成為了填欄位而填。**安葬刻意不放**——那件事由禮儀公司連擇日一起處理，
        頁面上出現「去約」的動線不合時宜。
      - 🔴 **不做店家名錄的三個實查理由**（別再重開此案，除非數據反轉）：
        ① **GA4 近 90 天：台灣 93.0%**（3,956/4,252）、美國 2.6%、其餘全在 1% 以下；
           城市分布是全台各都會區（三民 9.1%／西屯 7.8%／東區 6.0%／板橋 5.0%），不是只有雙北。
        ② **資料拿不到堪用的**：OSM 全台理髮店 2,039 筆，**只有 1,708 有店名、765 有地址、239 有電話**
           ＝約 2.5% 涵蓋率；商業司開放資料是**登記**資料（不代表還在營業、無電話與營業時間）；
           Google Places ToS 限制快取欄位、要求顯示在 Google 地圖上、按次計費且靜態站得把金鑰放前端。
        ③ **這是廟宇頁那場仗的重演**：「附近的○○」是純在地意圖，SERP 由 Google 地圖包回答。
           本站實測廟宇頁排名 1–10 的 CTR 只有產業基準的 **0.17～0.42 倍**（11 名後才回到 0.99 倍）。
           拿 2.5% 涵蓋率的資料進同一個戰場，是拿更差的牌打同一手。

- [x] **剃頭／整手足甲＋農曆日 token（2026-08-01，commit `bce5e2b`）**：`affairs.json` 新增
      `titou`（剃頭，即理髮）與 `zhengshoujia`（整手足甲），逐條掛協紀卷十一原文。
      - ⚠️ **新增了第四個判定維度「農曆日 token」**（`daytokens.ts` 的 `lunarday_<n>`）：卷十一有
        「忌每月十二日十五日」這類**農曆日期**規則，既非神煞也非建除／日干支，原本完全落在判定之外。
        包裝成與神煞同形併入 `activeShenSha`，投票表寫法／制化查表／`verified` 傳播鏈**一行都不用改**。
        （前一維度「日相標記」＝建除／日干／日支，見上一條。）
      - 剃頭忌丁日這條與民間彭祖百忌「丁不剃頭」互相印證；台灣「正月不剃頭」是另一套講法，
        **不是通書系統**，頁面已寫明不混為一談。

- [x] **`/systems/` 籤系樞紐頁（2026-08-01，同 commit）**：原本各籤系頁**沒有共同入口**，
      只能從 `/poems/` 或神明頁側門進來，彼此不相連——籤系擴充前必須先有這一層，
      否則每加一套籤就多一個孤兒頁。每籤系涵蓋幾間廟的統計純由既有 `main_deity_ref` 對映衍生、零新增事實。
      ⛔ **籤系仍只有 2 套**（六十甲子、關帝靈籤）：觀音靈籤卡在**版本錨定**（維基文庫無定本、
      各民間版本互有異文，這步沒做好後面 100 首全部站不住）、月老靈籤**連來源都還沒查**。
      這是四項欠帳中唯一未動的一項。

- [x] **保生大帝藥籤 330 首（2026-07-31）**：臺南興濟宮版，大人科120／小兒科60／外科60／眼科90。
      **完整規格＝[`docs/yaoqian-physician-spec.md`](docs/yaoqian-physician-spec.md)**（產製規格，非邀請函）。
      - 資料取得：`opendata` API 需金鑰（403），但 **`tcmbdata.culture.tw` 的 detail API 開放存取**；
        典藏 id **連號 487660–487990**（331 個 id ＝ 330 首 ＋ 487790 空洞）。**別重做一遍探源。**
      - ⚠️ **解析器坑**：該庫籤號用「**廿**」「**卅**」，且以**大寫 O 表示零**（一二O＝120）。
        初版漏這三種寫法 → 四科同時「缺 21-29、31-39」，那是 bug 不是資料缺。
      - **事實層已由政府寫好**：每首都有國家中醫藥研究所撰寫的藥材說明（含「連喬（即連翹）」這類現代名對照），
        授權 OGDL 1.0；藥方數位物件 PDM。**不必從零查證。**
      - 🔴 **原始典藏本身有錯，這是最好的「不能照抄」證據**：大人科 71 首藥方有赤芍但說明沒解釋、
        72 首說明解釋赤芍但藥方沒有（**謄錄錯位**）；78 首藥方寫「香菇」說明寫「香茹（香薷）」；
        「故紙」在 38 首註為木蝴蝶、44/60 首註為補骨脂（**同名異物，禁忌不同**）。
      - **12 首的典藏自帶警語**（如小兒科第一首藥方原文即寫「黑丑白丑屬毒劇、藥方請勿使用」）。
        🔴 措辭鐵則：只能說「**此警語出自原始典藏，非本站加註**」，不可說成本站的判斷。
      - 醫師四段（安全警示／為什麼不能照著抓藥／真的不舒服該去哪裡／醫師說）由科別人格 prompt 產製，
        存 `src/data/yaoqian-notes.json`，頁面收在「**醫師解說**」大標題下。
        🔴 **未經執業醫師逐首審閱前，頁面不得掛醫師姓名、不得宣稱由醫師撰寫。**
      - ⚠️ **用戶明確否決過的措辭，不要再加回去**：頁面 `<title>` 不帶「已禁用．文獻保存」；
        lead 與 description 不放「藥籤已於民國 88 年…禁止使用」；不寫「醫師審閱完成前不顯示醫療判斷」。
        （FAQ 中回答「可以照著抓藥嗎」的**答案**保留——那是回答問題，不是掛標籤。）

- [x] **`check:copy-voice` 補掃資料 JSON 的散文欄位（2026-07-31）**：原本 `check:copy-voice` 只掃
      `.astro`、`check:content` 只掃 `.md(x)` → **由 AI 產製、存在資料 JSON 裡的散文兩道 gate 都不掃**
      （藥籤醫師解說 330 首 × 4 段就是這種）。當初排除 JSON 的理由是「含公有領域古文會誤判」，
      故改為**白名單**（`PROSE_JSON`）：只列確定全部是現代散文的檔與欄位，不整批放行 JSON。
      新增 `AI_TELLS` 通用套語表（總的來說／值得注意的是／讓我們／首先…其次…）。反例已實測會擋。

## 關鍵指令 / 檔案備忘

- **時事集氣祈福自動化（P1-P4，全自動開頁/追蹤/轉記錄頁）完整 SOP＝[`docs/topical-blessing.md`](docs/topical-blessing.md)**。
  🔴 紅線：只做正向祈福、**絕不杜撰**（來源機器複驗）、**面向使用者文案絕不出現具體傷亡/災損數字**
  （硬 gate `scripts/lib/topical-guard.mjs`，非靠 LLM prompt 自律；改管線前先讀 SOP）。
- 部署：**直接 `git push origin main`** 自動部署（~75s，無 PR）。⚠️push main 即上線、無 staging。
- 驗證套件（push 前跑）：`pnpm check:integrity` / `pnpm check`(astro) / `pnpm check:scoped-styles` / `pnpm check:design` / `pnpm check:design-tokens` / `pnpm check:copy-voice` / `pnpm check:content` / `pnpm check:outbound-urls` / `pnpm verify:almanac` / `pnpm build`（build 後另有 `check:canonical`／`check:rendered`）
  - 🔴 **`pnpm check`（astro check）是 CI 擋門、但不在 `pnpm build` 裡**（2026-08-03 立）：
    deploy.yml 的 build job 有獨立的「型別檢查」step 跑它，型別錯誤會讓 **build failure、deploy skipped**。
    而 `pnpm build` ＝ `check-design && check-content && check-outbound-urls && astro build`，**不含型別檢查**；
    大腦／反思層的 gate 是 `check:integrity + build`，**同樣不含**。
    後果實例：今早 `[auto-claude-reflect] 194e665` 加了 `/events/[id] → /festivals/[slug]` 反向連結，
    `festivals.json` 部分條目的 `event_refs` 是空陣列字面量 → TS 推成 `never[]`、`.includes(string)` 報
    `ts(2345)`，**從 08:24 起兩次部署全部卡住、線上內容停在 `63c20e2`，且無任何告警**
    （自動化層自己不跑型別檢查，所以它不知道自己推壞了）。修法＝顯式標型別（commit `cbff645`）。
    ⚠️ **從 JSON 衍生欄位時一律顯式標型別**（`(f as { xxx?: string[] }).xxx ?? []`），別靠 TS 推斷。
    ⚠️ 手動 push 前 `pnpm check` 要跑；**自動化層目前沒有這道 gate，是已知缺口**。
  - **尾斜線兩道 gate，守的是兩個不同表面，別搞混**（2026-07-28 立；此根因已復發三次）：
    `check:canonical`（build 後）掃 **dist 產物**的內部網址（nav/canonical/og:url/JSON-LD/sitemap）；
    `check:outbound-urls`（已內建進 `pnpm build` 最前段）掃 **`scripts/` 裡會被主動送出去的網址**
    （`pnpm notify` 的 CORE 清單、各報表腳本的追蹤網址）。**後者是前者長期的盲區**——站台輸出乾淨，
    但 `pnpm notify` 的 9 個高槓桿網址裡有 8 個不帶尾斜線，每次部署後都在對 Google Indexing API 與
    IndexNow 送 301 網址，GSC 因此累積「頁面會重新導向」且來源標成**網站**（＝我們自己提交的）。
    另有第三層 runtime 保底：`index-ping.mjs`／`indexnow-ping.mjs` 送出前 `normalizeUrl()` 補斜線並印警告
    （gate 擋靜態寫死的、normalize 擋命令列參數這類動態來的）。
  - `check:design`（2026-07-20 新增，**團隊統一設計規範守門 v2**，已內建進 `pnpm build` 最前段＝本機/CI/seo-ops gate 全繼承）：掃 `src/**/*.{css,astro,svelte}` 五條規則——①font-size 禁 px（一律 `var(--text-*)`）②顏色（hex/rgb/hsl）只准 `src/styles/variables.css`（token 唯一來源；oklch/color-mix/var 合規）③禁 `!important` ④禁外部 CDN（fonts.googleapis/cdnjs/unpkg/jsdelivr）⑤src/ 下 .css 白名單只准 `src/styles/{variables,global}.css`（元件樣式寫 scoped `<style>`）。本站唯一例外＝`<meta name="theme-color">`（HTML 規格只能字面色，腳本內註明）。token 已於 2026-07-20 自 global.css 拆出 `variables.css`（global.css 首行 `@import` 保持載入順序）。見 `scripts/check-design.mjs` 檔頭。
  - `check:copy-voice`（2026-07-18 新增，deploy.yml build gate＋大腦 headless 自驗）：攔「面向使用者的產品文案出現 AI 療癒腔／假掰詩意」（源自用戶反覆要求去 AI 味、人眼仍漏，如 /qiugian「…回來說一聲——你可能是第一個」）。只掃 `src/**/*.astro`（資料 json 含公有領域古文不掃），禁語清單**逐次養、只收嚴不放寬**（種子＝記憶 copy-voice-no-ai-speak 的地雷＋歷來被抓到的句子）。命中即擋部署。新增禁語直接在 `scripts/check-copy-voice.mjs` 的 `BANNED` 加一列。
  - `check:content`（2026-07-21 新增，跨站統一去 AI 味引擎，已內建進 `pnpm build`：`check:design && check:content && astro build`）：掃**文章正文** `src/**/*.md(x)`（典故 137＋籤解 160），與 `check:copy-voice` 掃 UI `.astro` 是**不同表面、互補不替換**。引擎＝`/root/.claude/skills/new-astro-site/templates/check-content.mjs` 統一版（強指紋單命中即 ERROR＋詞彙/句式/結構/語氣四層軟訊號跨 ≥3 層升 ERROR），另把 folk 療癒腔黑名單 port 進 `SITE_ERROR_TELLS`（`放下了`/`釋懷了`/`(添|多)了一分暖`/`不是一個人走過`/`照亮彼此`/`你的消息會陪`/`你(可能|可以…)是第一個`），與 UI gate 規則同源。**grandfather**：預設只掃相對 origin/main 變動的 md（既有 297 篇存量不回溯擋，全站盤點 `pnpm check:content:all` 永遠 exit 0）；CI 淺 checkout 抓不到 base 時掃 0 檔安全放行。新增禁語時 UI 補 `check-copy-voice.mjs`、文章補 `check-content.mjs`，兩處同步。首次全站盤點：298 檔 0 ERROR、178 WARN（172 為破折號單層軟訊號，未達門檻不擋）。
  - `check:scoped-styles`（2026-07-17 新增，deploy.yml build gate）：全站攔「Astro scoped `<style>` 套不到 client JS 注入 DOM」的 bug 類別（源自 /qiugian 抽籤結果卡四句擠一行事故）。命中即擋部署；修法＝該規則移 `<style is:global>`＋容器 id 命名空間。見 `scripts/check-scoped-styles.mjs` 檔頭。
  - `check:design-tokens`（2026-07-17 新增、2026-07-18 收嚴，deploy.yml build gate；**2026-07-20 起與 v2 `check:design` 並存保留**——它的 font-size 規則比 v2 嚴：`<style>` 內任何硬編數值（含 rem/em）皆擋，v2 只擋 px，移除即放水故不撤）：守設計系統房規（見 memory design-system-tokens）。兩層皆**硬 gate 零容忍**：**顏色**＝`<style>` 內禁 hex/rgb/hsl（改 `var(--…)`／`oklch`／`color-mix`；`<meta theme-color>` 屬 HTML 合法例外不掃）；**font-size**＝必須 `var(--text-*)`，任何硬編數值皆擋。（原 69 處非階梯值已於 7/18 全數語意對映到 token、基線機制已移除，不再有「暫時放行」。）見 `scripts/check-design-tokens.mjs` 檔頭。
- `pnpm data:weekly`：本機週報乾跑預覽（＝`seo-weekly.mjs --dry`，不開 Issue/不發 Slack；需 /root/.config/folk-tw/ga4-sa.json）
- **廟宇頁在地脈絡（2026-07-28）**：GSC 抽驗推估約 810 頁未索引，最單薄那批只有 273 字、4 條內鏈。
  補了兩樣**每頁都不同、純由既有資料衍生**的：①脈絡句「本鎮登記在案的宮廟共 N 間，其中主祀○○者 M 間」
  ②同鄉鎮鄰近宮廟 ≤5 條（優先已查證沿革/官網者，其餘依廟名排序＝固定不隨機）。仍守「廟宇不建密網」
  （單向、上限 5、有鄉鎮樞紐可上行）。**刻意不引用神明節點的 `summary`**——那會讓數百間同主祀的廟
  出現一模一樣的段落，反而加重重複內容。不變量已進 `check:rendered`（7884 間有鄰居的廟頁全驗）。
- **廟宇專屬分享卡（2026-07-30，用戶指示）**：外撥把廟宇連結傳給廟方時，原本 **12,018 頁共用同一張**
  `public/og.png`＝神酷品牌卡，主委看到的是別人的招牌。改為**每間廟一張** 1200×630 卡：
  - 產生器 `scripts/gen-og-temples.mjs`（`pnpm og:temples`，已串進 `postbuild`）→ `dist/og/temples/<id>.png`。
    **7,891 張共 64.8 MB**，只進 dist、不進 repo。
  - 卡面＝**廟名／縣市鄉鎮／主祀神**；第三行依序取 `main_festival`（21 間，標「主要祭典」）
    → **主祀神聖誕（7,424 間＝94.1%，標「○○聖誕」）**；兩者皆無者（城隍/太歲等 467 間）只顯示廟名。
    卡面**完全不出現神酷／folk.tw 字樣**。
  - ⚠️ **標籤措辭是刻意的**：標「近期活動：農曆三月廿三」＝**替廟方宣稱那天有辦活動**（我們沒這事實＝杜撰）；
    標「媽祖聖誕：農曆三月廿三（國曆 4/29）」＝陳述**神明的**聖誕日，不宣稱該廟辦什麼。
    台灣實務上年度主祭典就是主祀神聖誕，主委看日期自然知道所指，但我們不替他們斷言。**改措辭前先想清楚這條界線。**
  - ✅ **2026-07-31 已取得真正的廟宇活動**：卡面第三行現在依序取 `main_festival`（21 間查證敘述句）
    → **`festivals[]` 代表筆（2,500 間，標「主要祭典」）** → 主祀神聖誕（標「○○聖誕」）。
    見下方「年度慶(祭)典匯入」條目。以下為當時的探源紀錄，**別重做一遍**：
  - **要有真正的廟宇活動只剩一條路**：全國宗教資訊網「慶(祭)典查詢」，但它擋境外 IP。
    2026-07-30 已實測 7 個替代來源全數不可用（MOI XML 無祭典欄位／nchdb 無 API／文化部藝文活動是表演展覽／
    觀光署是靜態散文／CRGIS 連不上／data.gov.tw 7723 已下架）→ 清單見 `docs/taiwan-host-handoff.md`，**別重做一遍**。
    已建**台灣端投遞管道**取這份資料（見本檔開頭 🇹🇼 段）；拿到後填進既有的 `main_festival` 欄位即可，
    卡片與 description 都已讀它、**不必改任何程式碼**。
  - `Base.astro` 新增 `ogImage`／`ogImageAlt`／（既有）`ogTitle` prop；廟宇頁傳 `ogTitle={templeTitle}`
    ＝**不帶站名**。⚠️ 頁面 `<title>` 仍保留「｜神酷」（瀏覽器分頁與 SEO），**只有 og:title 去站名**。
  - ⚠️ **PNG palette 固定 16 色**：實測 8 色會讓量化器拿硃紅去補文字抗鋸齒，廟名筆畫出現紅色雜邊；
    16 色乾淨且 10.4 KB/張。**不可為了省空間降到 8 色**。
  - 字型靠系統 `Noto Serif CJK TC`（與 global.css 明體同族）。CI runner 若無此字型，中文會變空框——
    改動產生器時要留意 deploy.yml 的環境。
  - 不變量進 `check:rendered`（不變量 1b，全 7,891 間逐頁）：og:image 須指向本廟的卡、
    **該檔須真的存在**（防指向 404）、og:title 不得含「神酷」。兩種反例皆實測會擋。
- **主動通知搜尋引擎（部署後跑這支）**：`pnpm notify [url...|--all]`＝一鍵雙推，
  同一組網址同時送 Google＋IndexNow，涵蓋互補（Google 不參與 IndexNow）。
  - 無參數＝高槓桿集（各模組首頁＋封存＋月份樞紐）；帶 url＝只送指定頁；`--all`＝整份 sitemap；
    `--from <檔>`＝從檔案逐行讀網址（大批量用）。
  - **待送佇列（2026-07-28）**：Google Indexing API 每日配額 200，一次要送幾百頁必然撞 429。
    撞到（或超出單次上限）就把剩下的存進 `/root/.config/folk-tw/index-ping-queue.json`，
    **下次執行優先送、成功即移除**，跨天自動續完，不必人記得補送。佇列刻意放 repo 外——
    放進 repo 會被每日 cron 一起 commit 並觸發部署。
  - ⚠️ **`--from` 兩支子腳本都要支援**（2026-07-30 修，commit `5ea5dcc`）：`notify.mjs` 把同一組參數
    轉給兩支，但 `indexnow-ping.mjs` 原本沒實作 `--from` → 會把「--from」本身當路徑組成網址送出
    （實測送出 `https://folk.tw/--from`），**真正的 30 筆清單完全沒送到 Bing/Yandex/Seznam/Naver**，
    而畫面只顯示「完成 2/2」看起來像成功。加子腳本參數時**兩支要對齊**。
  - ⚠️ **`index-ping.mjs` 曾靜默吞掉第一個網址**（2026-08-03 修，commit `a030482`）：
    `resolveUrls()` 用 `args[fromIdx + 1]` 排除 `--from` 的值，但**沒帶 `--from` 時 `fromIdx = -1`**，
    `args[fromIdx + 1]` 就是 `args[0]`＝第一個網址 → 每次 `pnpm notify <url...>` 都少送一筆給 Google，
    畫面仍顯示「送 N 筆」像成功（IndexNow 那支沒這問題，所以兩邊筆數會差 1，但沒人會去對）。
    實測代價：送節日頁那次被吞的正是 `/festivals/qianggu/`——GSC 實查唯一「URL is unknown to Google」的頁。
    **與上一條同一類：參數解析出錯，而輸出看起來完全正常。** 改參數解析後請實際比對兩支的送出筆數。
  - 內部分別呼叫：`pnpm index:ping`（Google Indexing API，每日配額 200，SA 須為 GSC 擁有者）
    與 `pnpm indexnow:ping`（IndexNow → Bing/Yandex/Seznam/Naver；金鑰檔 `public/<key>.txt`，
    內容＝檔名 stem，須先部署上線供驗證；回 HTTP 202＝已受理待驗證屬正常）。
  - 慣用流程：**改內容 → `git push origin main` 部署 → `pnpm notify`（或帶改動頁 url）**。
- 部署驗證坑：`gh run list` 要**比對 headSha 是否為本次 commit**，否則會抓到上一次 run 誤判成功。
  - **2026-07-30 實遇「push 沒觸發 run」**：commit `279c351` push 成功（`git ls-remote` 確認遠端 main
    已是該 SHA）、`deploy.yml` 為 `on: push` 無 paths 過濾、commit 訊息無 `[skip ci]`，但**等 8 分鐘完全沒有
    該 SHA 的 run**＝GitHub 端自動觸發失靈。依 playbook 例外條款以 `gh workflow run deploy.yml --ref main`
    **補觸發一次**（此時該 SHA 的 run 數為 0，不存在同 SHA 雙 run 毒化風險），build/deploy/indexnow 三 job 全綠。
    **緊接的下一次 push（`5ea5dcc`）就正常自動觸發**＝屬偶發，不是設定問題。判斷準則不變：
    先等約 2 分鐘、確認「本 SHA 的 run 數為 0」才補觸發；**若已有本 SHA 的 run，絕不再開第二個**。
  - 🔴 **2026-08-05 新病灶：cron 的 `[skip ci]` commit 會把「人剛 commit 但還沒 push」的改動一起吞掉不部署。**
    經過：手動 commit `121970d`＋`ee3053b`（撤 13 頁祈福頁）後**還沒 push**，就先跑 build 驗證；
    這期間 seo cron 在主工作樹 `git rebase --autostash origin/main` → 自己 commit
    `4acd1b7 chore(seo): … [skip ci]` → `git push origin main`，**連我那兩個一起推上去**。
    GitHub 只看 **head commit** 的訊息 → 見到 `[skip ci]` → **整個 push 不觸發 workflow**。
    結果：改動在 repo 裡、`git push` 回「Everything up-to-date」看起來一切正常，
    但**線上內容仍是舊版，且沒有任何告警**（與 2026-08-03 型別檢查那次同一類：靜默停在舊版）。
    - **判準**：`git push` 回 up-to-date **不等於已部署**。一律再查一次
      `gh run list --workflow deploy.yml --json headSha` 有沒有「本 SHA」的 run。
    - **修法**：本 SHA run 數為 0 → `gh workflow run deploy.yml --ref main` 補觸發（同上例外條款，無毒化風險）。
    - **預防**：**手動 commit 後立刻自己 `git push`**，不要留在本地等 build 或等驗證跑完。
      本 repo 有多支會 push 的 cron（seo-ops 三層／qiugian-aggregate／topical P1·P2·P4），
      留在本地的 commit 隨時會被別人的 `[skip ci]` head 帶上去。
    - 🔴 **連帶陷阱：commit 訊息裡「提到」那個標記，也會觸發它**。GitHub 比對的是 head commit
      訊息裡有沒有那個字串，**不管你是在下指令還是在描述問題**。實例：記錄上面這條病灶的
      commit `b5d3de2`，訊息中為了說明而寫了該標記的字面形式 → **自己被跳過、run 數 0**
      （該次只改 CLAUDE.md、不影響站台，故未補觸發）。
      **要在 commit 訊息裡談這個標記，就用「那個標記」之類的說法帶過，不要寫出字面形式。**
- 🔴 **農民曆封存頁（過去日期）永久不進 sitemap**（2026-08-03 用戶裁示，**未來也不要加回來**）：
  原本保留、僅以 priority 0.3 降權，實測不夠——sitemap 11,693 個網址裡有 **2,536 個是農民曆日期頁（22%）**，
  但它們近 29 天只帶 1,258 曝光（全站 175,735 的 **0.7%**，過去日期頁每頁僅 1.5 次）；
  同時鬼門開／七夕／中元三頁卡在「Discovered — 從未被爬取」＝抓取預算不足，且尖峰在窗口內。
  改為 `filter` 直接排除，sitemap **11,693 → 9,287**。
  頁面不會消失，仍可從 `/almanac/month/`（104 個月份樞紐仍在 sitemap）與 `/almanac/archive/` 被爬到。
  ⚠️ 對照：2026-07-02 曾以「稀釋**收錄**」為由評估並判定不做；這次的理由是「稀釋**抓取預算**」，
  證據與情境都不同，不是推翻同一件事。
- 稀釋開關：`astro.config.mjs` `EXCLUDE_TUDIGONG_FROM_SITEMAP`（changefreq 須用 `ChangeFreqEnum.*` 列舉）。
- 廟宇 staging：`scripts/import-temples.ts <temple.xml> --write`（MOI 端點境外 IP 連不到，須台灣端下載 XML）。
- **索引長尾決策（2026-07-28 定，用戶裁示「依建議進行」，勿再重開）**：GSC「已檢索－目前尚未建立索引」
  310 頁逐筆分析後，以下三類**明確不做**，理由是做不到或風險大於效益，不是忘了做：
  - **74 間小廟頁不補內容**：MOI 只給名稱／地址／主祀神，補沿革要逐間查權威源，小廟多半查無源，
    杜撰是紅線。**接受長尾頁不會全收**。
  - **典故 `gd_44`（王莽篡漢，338 字）不擴寫**：內容完整正確、有《漢書·王莽傳》來源，只是篇幅短。
    在有來源的史料上加自己的話＝杜撰風險大於收錄效益。
  - **灶神 `iconography` 不補**：唯一權威源（內政部全國宗教資訊網）擋境外 IP（`ECONNREFUSED`，
    與 MOI temple.xml 同一個問題），要補得從台灣端取得該頁內容。
- **宮廟開發名單「每日五間」（2026-07-30 建，用戶指示）**：每天台北 04:30 推 Slack `#神酷-folk-tw`，
  列出今天該打的五通電話（廟名／電話／負責人／近30日曝光點擊排名／頁面連結）。**純規則零 AI**：
  門檻＝曝光≥50 ×「頁面尚無沿革且無官網」× MOI 有電話 × 7 天內未推播過；排序＝曝光 × 排名權重
  × CTR缺口權重（已在第一頁、且高曝光零點擊者優先＝補內容邊際效益最大）。
  **本體與帳本刻意在 repo 外**（含電話與負責人姓名＝個資，本 repo 為 public 且每日 cron 會 commit 工作區）：
  腳本 `/root/folk-outreach/outreach-daily.mjs`、說明 `/root/folk-outreach/README.md`、
  帳本 `/root/.config/folk-tw/outreach-sent.json`、MOI 來源 `/root/.config/folk-tw/temple.xml`、
  排程 `/etc/cron.d/folk-outreach`。乾跑 `node /root/folk-outreach/outreach-daily.mjs --dry`、
  查帳本 `--stats`。候選池目前 501 間（每天 5 間約 100 天輪完一圈）。
- **缺座標廟宇地理編碼回填（不需 MOI XML）**：`node scripts/geocode-missing-temples.mjs [--write] [--max N]`。
  全站 229 間缺座標者用**既有完整地址**做地理編碼。五道安全閘：只補空值不覆寫既有座標／用地址不用廟名
  （全台數十間同名「福德宮」，用廟名查等於賭運氣）／命中須落在該縣市經驗 bbox 內／乾跑為預設／
  **地址只有行政區時一律跳過**——Nominatim 會回該行政區的中心點，台南開基天后宮實測就拿到與實際
  位置差約 1 公里的假座標，**那比留空更糟**（地圖會把人導到錯的地方）。Nominatim 對台灣門牌覆蓋差，
  成功率僅約一成，但每一筆都零錯誤風險；要大批補仍須走下面那支的 MOI XML。
- **廟宇座標回填（可重複、安全閘內建）**：`pnpm data:temple-coords <temple.xml>`（乾跑）→ 審 → 加 `--write` 回寫 →
  `pnpm check:integrity && pnpm build` → push → `pnpm notify`。只碰缺座標/垃圾座標的廟、不動策展欄位；
  匹配限「地址精確／廟名完全相符＋同鄉鎮＋(長獨特名或里村佐證)」＋縣市 bbox，通用名無地名佐證不採（防同名跨村塞假座標）。
  **XML 取得**：MOI 擋境外 IP（本 server／GitHub Actions 皆連不到，25s timeout），data.gov.tw 也只轉址回同一被擋端點＝
  **無境外可達鏡像**；須台灣 IP 下載 `https://religion.moi.gov.tw/Report/temple.xml`（資料集 8203，約每月更新）後放本機指定路徑。
  詳見 `scripts/refresh-temple-coords.ts` 檔頭與記憶 [[temple-google-map-reviews]]。
