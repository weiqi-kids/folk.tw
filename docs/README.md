# docs/ 索引

> 每檔一行：**用途｜什麼時候該讀｜現況**。總路由在 [`../CLAUDE.md`](../CLAUDE.md)。
>
> 🔴 **這份索引不放數字。** 會過期的數量一律由指令算：
> `node scripts/intake-status.mjs`（台灣端管道）、`gh issue list --label weekly-report`（SEO）。

---

## decisions/ — 已完成工作的決策脈絡與陷阱

2026-08-06 自 `CLAUDE.md` 抽出（原本 600 行、其中 308 行是這些），**原文一字未改**。
共同性質：都是「為什麼當初這樣做」「改動前要知道什麼」，不是待辦。

| 檔 | 涵蓋 | 什麼時候讀 |
|---|---|---|
| [`decisions/temples.md`](decisions/temples.md) | 廟宇頁的一切：meta description 去樣板、title 加主祀、鄉鎮二級瀏覽、在地脈絡、專屬 OG 分享卡、慶典與觀光署匯入、座標回填、外撥名單 | 動 `src/pages/temples/` 或 `temples.json` 之前 |
| [`decisions/content-modules.md`](decisions/content-modules.md) | 神明／籤詩／節日／情境／比較／行業／擇日／藥籤各模組的上線背景與 slug 承諾 | 動任何內容模組之前 |
| [`decisions/nav-and-ui.md`](decisions/nav-and-ui.md) | nav 從 13 項扁平 → 7 組 → 單一主題軸的兩次重整，含用戶逐題裁示 | 動 `Base.astro` 的 nav 之前 |
| [`decisions/deploy-and-gates.md`](decisions/deploy-and-gates.md) | 驗證套件每一道 gate 為何存在、擋什麼、反例；`pnpm notify` 的兩個參數解析坑；部署驗證的三個陷阱 | 動部署流程或任何 `check:*` 之前 |
| [`decisions/seo-calls.md`](decisions/seo-calls.md) | 「做／不做」的裁示：土地公 sitemap 開關、索引稀釋、農民曆封存頁、索引長尾三類不做 | 想重開任何一個已裁示的題目之前 |

---

## 資料管線

| 檔 | 用途 | 現況 |
|---|---|---|
| [`taiwan-intake-status.md`](taiwan-intake-status.md) | 台灣端投遞管道：授權判準、每份資料的整合方式、四段分類 | **活的**。數字跑 `scripts/intake-status.mjs` |
| [`taiwan-host-handoff.md`](taiwan-host-handoff.md) | 管道怎麼運作：金鑰、manifest 欄位契約、rsync、新鮮度提醒 | **活的**。改 manifest 前必讀 §3.5 |
| [`intake-manifest.json`](intake-manifest.json) | 抓取清單（台灣端每輪取最新版） | **活的**。境外端維護 |
| [`festival-data-import.md`](festival-data-import.md) | 慶(祭)典匯入：三個陷阱（ODS 無曆別／id 是陣列索引／來源自身矛盾）、對映方法、gate | **活的**。改慶典相關必讀 |
| [`TODO-FOR-TAIWAN.md`](TODO-FOR-TAIWAN.md) | **與台灣端互動的流程**：prompt 固定骨架、追蹤清單、目前待辦、不要再問的事 | **活的**。2026-08-06 已清掉全部已完成待辦（338→約 110 行）。🔴 每則要台灣端做事的回覆都必須附可貼的完整 prompt |

---

## 功能規格

| 檔 | 用途 | 現況 |
|---|---|---|
| [`topical-blessing.md`](topical-blessing.md) | 時事集氣祈福 P1–P4 全自動管線的 SOP：四道硬 gate、去重規則、生命週期 | **活的**。改管線前必讀 |
| [`seo-automation.md`](seo-automation.md) | SEO 自動化閉環（收集／反思／大腦／週報）＋ 2026-07-02 起飛基準（歷史存查） | **活的**。操作用 `/seo` skill |
| [`yaoqian-physician-spec.md`](yaoqian-physician-spec.md) | 保生大帝藥籤 330 首的產製規格與紅線措辭 | **活的** |
| [`yaoqian-batch-01.md`](yaoqian-batch-01.md) | 藥籤第一批 5 首送審內容（給醫師看的實際文字，非規格） | ✅ **330 首全部審過**（2026-08-06）。🔴 **頁面上不寫審閱狀態、不掛醫師姓名**——授權/來源/典藏警語已由樞紐頁與 `/about/` 統一處理，逐首頁再加就是多餘警語 |

---

## 一次性文件

| 檔 | 用途 | 現況 |
|---|---|---|
| [`nmtl-guanyin-qianpu-request.md`](nmtl-guanyin-qianpu-request.md) | 向國立臺灣文學館申請閱覽「觀音籤譜」`NMTL20060200544` 的送件備忘 | ✅ **已送件**（2026-08-06 用戶確認）。等館方回覆，追蹤在 `TODO-FOR-TAIWAN.md` |

---

## 維護守則

1. **數字一律由指令算**，這份索引與 `CLAUDE.md` 都不該出現會過期的數量。
2. **新增文件必須在這裡加一行**，否則下一個 session 找不到它——本次重整就是因為
   `docs/` 底下累積了 11 個檔而沒有索引，其中數個連我自己都是重整時才發現。
3. **`decisions/` 是唯讀的歷史**：新的決策繼續往對應檔追加，不要回頭改寫舊條目的結論；
   結論變了就在原條目下方註明「YYYY-MM-DD 改為…，理由…」。
4. 標 ⚠️ **待裁示** 的檔案需要用戶決定去留，**不要自行刪除**。
5. **不要主動寫「對外分享文」這類沒人要求的文件。** 2026-08-06 刪掉
   `building-a-folk-divination-site.md`（406 行，2026-08-02 某個 session 自作主張寫的，
   零引用、用戶不知情）與 `festival-social-drafts.md`（社群備稿，本機無憑證故從未發出，
   農曆七月已過）。要寫這類東西之前先問。
