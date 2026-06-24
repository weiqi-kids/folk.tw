# folk.tw（神酷）— 待辦與待驗證數據

> 本檔在 `/root/folk.tw` 開新 session 會自動載入。詳細專案脈絡見自動記憶
> `/root/.claude/projects/-root-folk-tw/memory/`（MEMORY.md 為索引）。
> **守則：報現況/缺口/數量前一律用指令查證、不臆測；部署後以 curl 線上實證；
> 資料整合性欄位（聖誕/宜忌/來源/官網）查無權威源就留空，絕不杜撰。**

## 🔴 第一優先：待驗證的數據（等 Google 索引，2026-06-29 起）

每週一 09:00(台) GitHub Action 產週報 Issue；11:00(台) cloud routine
`trig_016aNyp3pbPTZMH3RM3aH3eG` 會自動判讀並把建議貼回該 Issue。
**人要看的數據（gh issue list --label weekly-report 讀最新週報）：**

1. **索引稀釋判讀（核心）**：對照
   - 分子＝獨特頁：`/deities/mazu`、`/deities/guangong`、`/poems/liushi_jiazi-1`、`/allusions/suitang_qinshubao`
   - 分母＝廟宇頁：`/temples/dajia_zhenlan`（名廟）、`/temples/moi_0_竹圍仔福德祠`（土地公，已退出 sitemap）
   - 覆蓋狀態（Submitted and indexed / Crawled-not indexed / Discovered-not indexed / unknown）。
   - **基準快照 2026-06-23（降稀釋措施實施當日，供下次對照「有沒有改善」）**：
     首頁/`/almanac`/`/temples`/`/temples/dajia_zhenlan`/`/allusions/suitang_qinshubao` 已 indexed；
     **`/deities/mazu`＝unknown、`/deities/guangong`＋`/poems/liushi_jiazi-1`＝Discovered-not-indexed、`/poems`＝Crawled-not-indexed**。
     目標：這幾筆轉成 Crawled→Indexed。
2. **GSC 曝光/點擊**：基準（近 90 天，至 2026-06-21）**僅 47 曝光、3 點擊、且全集中在 6/21 一天**＝形同尚未進入搜尋。
   有曝光的查詢全是獨特內容長尾（廣澤尊王 pos 4.3、中壇元帥、入厝儀式、籤詩句、典故），**無一來自廟宇頁**＝廟宇頁 0 搜尋貢獻。觀察是否開始出現連續多天曝光。
3. **Sitemap 提交 vs 實際索引數**：退場開關 ON 後線上 sitemap **9415 URL**（廟 6530＋過去日期頁）；
   注意 GSC「已提交」一度只認列 2904/10799（新域爬取保守、只讀部分 sitemap）——觀察此數是否回升。
4. **GA4 流量來源**：基準 27 sessions（Direct 21、Organic 僅 6）＝多為已知訪客雜訊；要看**台灣自然搜尋**是否出現。

## 🟠 待決策（看上面數據後）

- [x] **翻土地公退場開關**（已於 2026-06-23 commit `49b7b58` 執行）：依上面 GSC 基準
      判讀（廟宇頁 0 搜尋貢獻、獨特頁 mazu 仍 unknown）已把 `EXCLUDE_TUDIGONG_FROM_SITEMAP`
      設 `true`、push。線上 sitemap 廟 7913→6530、總 10799→9415。**觀察期**：若 2～3 週後
      獨特頁索引/曝光未見起色，再考慮下一步；若反而變糟（不太可能）才回退設 `false`。
- [x] **首頁直連旗艦神明頁**（同上 commit）：首頁新增「熱門神明」區塊，直連
      媽祖/關聖帝君/廣澤尊王/中壇元帥/保生大帝/城隍爺（依 GSC 曝光查詢挑選），旗艦頁離首頁跳數 2→1。
- [x] **送 Indexing API**（2026-06-23）：對 11 個未索引但有需求的頁（首頁、/deities 樞紐、
      6 尊旗艦神明、liushi_jiazi-1/45、suitang_qinshubao）送出，成功 11/失敗 0。
- [ ] **是否需更激進降稀釋**：必要時連過去農民曆日期頁也只留月份樞紐入口（看退場後是否仍稀釋）。

## 🟡 選配開發（有數據佐證再排序，皆非當務之急）

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
- `pnpm data:weekly`：GA4+GSC 週報（需 scripts/.google-sa-key.json，已 gitignore）
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
