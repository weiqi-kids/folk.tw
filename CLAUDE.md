# folk.tw（神酷）— 待辦與待驗證數據

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
4. **Sitemap 提交數疑點**：週報顯示 GSC「已提交 19,570」但線上 sitemap 應為 9,415——疑新舊 sitemap/分片
   重複計數；下次週報若仍如此，進 GSC 後台查是否有舊 sitemap 該刪。

## 🔁 每日自動優化閉環（2026-07-02 起由統一框架 `/root/seo-ops` 接手）

> ⚠️ **2026-07-02 遷移**：六層（收集/心跳/反思/大腦/週報/內容；folk 無內容層）改由 `/root/seo-ops` 統一框架執行，
> 排程在 `/etc/cron.d/seo-ops`（時刻沿用原值）、站台參數在 `seo-ops/sites/folk.tw.json`、
> 大腦站規在 `seo-ops/playbooks/folk.tw.md`、log 在 `seo-ops/logs/folk.tw-*.log`。
> 本節下方描述的 `scripts/seo-*` 舊腳本與 `/etc/cron.d/folk-tw-seo*` 已退役（腳本檔保留供查考；
> cron 備份在 `/root/.claude/backups/seo-cutover-20260702-023954/`）。維運指南見 `seo-ops/README.md`。

全部跑在**這台 server 的 cron**（排程 `/etc/cron.d/seo-ops`，log 在 `/root/seo-ops/logs/`）。雲端三個 routine 與
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

- [x] **翻土地公退場開關**（已於 2026-06-23 commit `49b7b58` 執行）：依上面 GSC 基準
      判讀（廟宇頁 0 搜尋貢獻、獨特頁 mazu 仍 unknown）已把 `EXCLUDE_TUDIGONG_FROM_SITEMAP`
      設 `true`、push。線上 sitemap 廟 7913→6530、總 10799→9415。**觀察期**：若 2～3 週後
      獨特頁索引/曝光未見起色，再考慮下一步；若反而變糟（不太可能）才回退設 `false`。
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

## 關鍵指令 / 檔案備忘

- 部署：**直接 `git push origin main`** 自動部署（~75s，無 PR）。⚠️push main 即上線、無 staging。
- 驗證套件（push 前跑）：`pnpm check:integrity` / `pnpm check`(astro) / `pnpm verify:almanac` / `pnpm build`
- `pnpm data:weekly`：本機週報乾跑預覽（＝`seo-weekly.mjs --dry`，不開 Issue/不發 Slack；需 scripts/.google-sa-key.json）
- **主動通知搜尋引擎（部署後跑這支）**：`pnpm notify [url...|--all]`＝一鍵雙推，
  同一組網址同時送 Google＋IndexNow，涵蓋互補（Google 不參與 IndexNow）。
  - 無參數＝高槓桿集（各模組首頁＋封存＋月份樞紐）；帶 url＝只送指定頁；`--all`＝整份 sitemap。
  - 內部分別呼叫：`pnpm index:ping`（Google Indexing API，每日配額 200，SA 須為 GSC 擁有者）
    與 `pnpm indexnow:ping`（IndexNow → Bing/Yandex/Seznam/Naver；金鑰檔 `public/<key>.txt`，
    內容＝檔名 stem，須先部署上線供驗證；回 HTTP 202＝已受理待驗證屬正常）。
  - 慣用流程：**改內容 → `git push origin main` 部署 → `pnpm notify`（或帶改動頁 url）**。
- 部署驗證坑：`gh run list` 要**比對 headSha 是否為本次 commit**，否則會抓到上一次 run 誤判成功。
- 稀釋開關：`astro.config.mjs` `EXCLUDE_TUDIGONG_FROM_SITEMAP`（changefreq 須用 `ChangeFreqEnum.*` 列舉）。
- 廟宇 staging：`scripts/import-temples.ts <temple.xml> --write`（MOI 端點境外 IP 連不到，須台灣端下載 XML）。
