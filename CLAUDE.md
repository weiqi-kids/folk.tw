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
   - 分母＝廟宇頁：`/temples/dajia_zhenlan`（名廟）、`/temples/moi_0_竹圍仔福德祠`（土地公）
   - 覆蓋狀態（Submitted and indexed / Crawled-not indexed / Discovered-not indexed / unknown）。
2. **GSC 曝光/點擊**：目前 0；觀察是否開始出現、查詢字與到達頁。
3. **Sitemap 提交 vs 實際索引數**：sitemap 約 10.8k URL（含 7891 廟、過去日期頁）。
4. **GA4 流量來源**：目前 26 sessions、US/KR 為主＝雜訊；要看**台灣自然搜尋**是否出現。

## 🟠 待決策（看上面數據後）

- [ ] **是否翻土地公退場開關**：若獨特頁長期 not indexed/discovered 且廟宇頁（尤其
      1384 間土地公廟）吃掉爬取 → 把 `astro.config.mjs` 的
      `EXCLUDE_TUDIGONG_FROM_SITEMAP` 設 `true`、push（已實測 ON→sitemap 廟 6508、OFF→7892）。
      頁面仍在、仍可內連被爬，只退出 sitemap。
- [ ] **是否需更激進降稀釋**：必要時連過去農民曆日期頁也只留月份樞紐入口。

## 🟡 選配開發（有數據佐證再排序，皆非當務之急）

- [ ] speakable schema（語音/AI 答案；目前全站 0）
- [ ] 神明 `sameAs` 補齊（48/76 → 76，src/data/deities.json）
- [ ] 名廟 沿革/聖誕 內容豐化（需逐間查證來源，僅名廟可行）
- [ ] 民俗活動續擴（已 21 場，長尾）
- [ ] 新港奉天宮官網 `https://www.hsinkangmazu.org.tw/`：已查證但 MOI 廟資料無對應
      記錄（只有大林/嘉義市的「奉天宮」），待確認正確 temple id 再套用
- [ ] 廟宇鄉鎮二級瀏覽（若某縣市頁仍過大，如台南/高雄）

## 關鍵指令 / 檔案備忘

- 部署：**直接 `git push origin main`** 自動部署（~75s，無 PR）。⚠️push main 即上線、無 staging。
- 驗證套件（push 前跑）：`pnpm check:integrity` / `pnpm check`(astro) / `pnpm verify:almanac` / `pnpm build`
- `pnpm data:weekly`：GA4+GSC 週報（需 scripts/.google-sa-key.json，已 gitignore）
- `pnpm index:ping [url...]`：送 Indexing API（每日配額 200；SA 須為 GSC 擁有者）
- 部署驗證坑：`gh run list` 要**比對 headSha 是否為本次 commit**，否則會抓到上一次 run 誤判成功。
- 稀釋開關：`astro.config.mjs` `EXCLUDE_TUDIGONG_FROM_SITEMAP`（changefreq 須用 `ChangeFreqEnum.*` 列舉）。
- 廟宇 staging：`scripts/import-temples.ts <temple.xml> --write`（MOI 端點境外 IP 連不到，須台灣端下載 XML）。
