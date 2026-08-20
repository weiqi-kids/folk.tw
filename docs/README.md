# docs/ 索引

> 每檔一行：**用途｜什麼時候該讀｜現況**。總路由在 [`../CLAUDE.md`](../CLAUDE.md)。
>
> 🔴 **這份索引不放數字。** 會過期的數量一律由指令算：
> `node scripts/intake-status.mjs`（台灣端管道）、`gh issue list --label weekly-report`（SEO）。

---

## decisions/ — 已完成工作的決策脈絡與陷阱

2026-08-06 自 `CLAUDE.md` 抽出（原本 600 行、其中 308 行是這些），**原文一字未改**，並依主題重新分組、每檔加目次。
共同性質：都是「為什麼當初這樣做」「改動前要知道什麼」，不是待辦。

| 檔 | 涵蓋 | 什麼時候讀 |
|---|---|---|
| [`decisions/temples.md`](decisions/temples.md) | 廟宇頁的一切：meta description 去樣板、title 加主祀、鄉鎮二級瀏覽、在地脈絡、專屬 OG 分享卡、慶典與觀光署匯入、座標回填、外撥名單 | 動 `src/pages/temples/` 或 `temples.json` 之前 |
| [`decisions/deities-and-qian.md`](decisions/deities-and-qian.md) | 神明頁（聖誕曆／title 國曆／sameAs）、籤詩尾斜線、籤系樞紐、藥籤 330 首、speakable | 動神明或籤詩相關之前 |
| [`decisions/almanac.md`](decisions/almanac.md) | `/good-days/` 擇日專區、嫁娶宜忌與四個判定維度、剃頭／農曆日 token、擇日後續動線 | 動農民曆或宜忌判定之前 |
| [`decisions/festivals-and-intent.md`](decisions/festivals-and-intent.md) | `/festivals/` 節日模組、`/festivals/local/` 地方宗教慶典（含「三種慶典事實不可互推」與兩個配廟假陽性）、民俗活動、情境／比較／行業守護神、名廟內容 | 動節日或意圖頁之前 |
| [`decisions/nav-and-ui.md`](decisions/nav-and-ui.md) | nav 從 13 項扁平 → 7 組 → 單一主題軸的兩次重整，含用戶逐題裁示。⚠️ **不含卡片代表圖規範**（那條只在自動記憶 `card-photo-pattern.md`） | 動 `Base.astro` 的 nav 之前 |
| [`decisions/deploy-and-gates.md`](decisions/deploy-and-gates.md) | 驗證套件每一道 gate 為何存在、擋什麼、反例；`pnpm notify` 的兩個參數解析坑；部署驗證的三個陷阱 | 動部署流程或任何 `check:*` 之前 |
| [`decisions/seo-calls.md`](decisions/seo-calls.md) | 「做／不做」的裁示：土地公 sitemap 開關、索引稀釋、農民曆封存頁、索引長尾三類不做 | 想重開任何一個已裁示的題目之前 |

---

## 待辦

| 檔 | 用途 | 現況 |
|---|---|---|
| [`writing-queue.md`](writing-queue.md) | **還沒寫的東西的單一清單**：專屬深頁（白沙坑／蕭壠香／土城香／麻豆香／三山國王）、既有頁要補的歷年紀錄、taiwangods 掛源修復、來源日期矛盾、授權風險 | **活的**。寫完一項就從清單刪掉，證據寫進 commit 訊息 |

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
| [`topical-blessing.md`](topical-blessing.md) | 時事集氣祈福 P1／P2／P4（無 P3） 全自動管線的 SOP：四道硬 gate、去重規則、生命週期 | **活的**。改管線前必讀 |
| [`seo-automation.md`](seo-automation.md) | SEO 自動化閉環（收集／反思／大腦／週報）＋ 2026-07-02 起飛基準（歷史存查） | **活的**。操作用 `/seo` skill |
| [`growth-48h.md`](growth-48h.md) | GA4 48 小時 campaign 成效對帳、事件埋點口徑與首頁版位淘汰規則 | **活的**。執行 `pnpm growth:48h` |
| [`search-demand.md`](search-demand.md) | 站內搜尋零結果需求、結果點擊與個資保護規則 | **活的**。執行 `pnpm growth:search-demand` |
| [`temple-ctr-cohorts.md`](temple-ctr-cohorts.md) | GSC 宮廟 page×query 全量分頁、意圖／排名帶 CTR cohort 與高曝低 CTR 行動門檻 | **活的**。執行 `pnpm seo:temple-ctr`；不逐廟自動改 title |
| [`yaoqian-physician-spec.md`](yaoqian-physician-spec.md) | 保生大帝藥籤 330 首的產製規格與紅線措辭 | **活的** |
| [`th-dict-uncollected.json`](th-dict-uncollected.json) | 《臺灣民俗文物辭典》裡本站尚未使用的辭條（含大量儀式詞）＝擴 /practices/ 與神明頁 th_dict 的素材庫。🔴 工作用素材，不是可直接發佈的資料集 | **活的**。要用先在 `th-dict-map.json` 加對映再跑 `import-th-dict.mjs` |
| [`qian-systems-sources.md`](qian-systems-sources.md) | 擴籤系的原料：臺史博籤詩藏品的逐件授權盤點（PDM／CC0／僅限瀏覽／未標）、兩層授權要分開看、臺史博申請管道 | **活的**。逐件結果在 `qian-collections-nmth.json` |
| [`temple-partner-links.md`](temple-partner-links.md) | 宮廟合作連結：`?temple=` 歸因＋GA4 `temple` 維度＋`_temples` 聚合；P1–P3 分期與紅線 | **活的**。發連結給廟方前必讀 |
| [`qian-interactive.md`](qian-interactive.md) | 求籤互動迴圈：選擇題／pulse 儀表板／籤詩人格／同籤留言（送審制）＋門檻紅線 | **活的**。改互動機制前必讀 |
| [`yaoqian-batch-01.md`](yaoqian-batch-01.md) | 藥籤第一批 5 首送審內容（給醫師看的實際文字，非規格） | ✅ **330 首全部審過**（2026-08-06）。🔴 **頁面上不寫審閱狀態、不掛醫師姓名**——授權/來源/典藏警語已由樞紐頁與 `/about/` 統一處理，逐首頁再加就是多餘警語 |
| [`../contracts/bot-index.schema.json`](../contracts/bot-index.schema.json) | 跨 repo 資料契約：`https://folk.tw/bot-index.json`（build 期由 `src/pages/bot-index.json.ts` 產出）餵給 `/root/my-line-bot-customer/tenants/shenku/`（LINE 官方帳號「神酷」）。改任一輸出欄位前先改這份 schema——消費端對不上不會報錯，只會靜靜降級 | **活的**。產生器 `src/pages/bot-index.json.ts`；不進 sitemap（見 `astro.config.mjs` 的 filter） |

---

## 一次性文件

| 檔 | 用途 | 現況 |
|---|---|---|
| [`nmtl-guanyin-qianpu-request.md`](nmtl-guanyin-qianpu-request.md) | 向國立臺灣文學館申請閱覽「觀音籤譜」`NMTL20060200544` 的送件備忘 | ✅ **已送件**（2026-08-06 用戶確認）。等館方回覆，追蹤在 `TODO-FOR-TAIWAN.md` |

---

## adr/ — 架構決策紀錄

只記**「為什麼不做」與「為什麼這樣做」**，讓下一次架構審查不必重新推導同一件事。
🔴 一份 ADR 就是一個「別再提這個」的證據，所以**否定的理由要寫得比肯定的更清楚**。

| 檔 | 決定 | 什麼情況下重開 |
|---|---|---|
| [`adr/0001-no-shared-ratchet-module.md`](adr/0001-no-shared-ratchet-module.md) | **不**抽共用 ratchet 模組——實查後 ratchet 語意只存在於 `check-source-refs.mjs` 一個檔，巡檢列的六個檔有五個是 ALLOW 清單或掃描範圍，不是同一回事 | 出現第二個真正的數值 ratchet 時（一個 adapter 是假想的 seam，兩個才是真的） |

---

## agents/ — Agent skill 的 repo 設定

`mattpocock-skills:*` 那組 skill 讀這裡決定「工單開在哪、標籤怎麼叫、domain 文件在哪」。
摘要在 `CLAUDE.md` §5，**唯一真實來源是這三份檔**。

| 檔 | 用途 | 現況 |
|---|---|---|
| [`agents/issue-tracker.md`](agents/issue-tracker.md) | 工單＝GitHub Issues（`gh` CLI）；PR 不當工單來源。🔴 含 repo 特有前提：public repo 個資不進 issue、`weekly-report` 是機器開的 | **活的**。換 tracker 才改 |
| [`agents/triage-labels.md`](agents/triage-labels.md) | 五個 triage 角色 → 實際標籤字串的對照。⚠️ 多數標籤尚未在 GitHub 建立，標籤現況跑 `gh label list` | **活的**。`triage` skill 目前未啟用 |
| [`agents/domain.md`](agents/domain.md) | domain 文件的消費規則＋single-context 佈局。⚠️ 本站脈絡實際在 `decisions/` 與 `src/` 檔頭註解，`CONTEXT.md`／`docs/adr/` 尚未建（刻意不預建空殼） | **活的** |

---

## repo 根目錄（不在 docs/ 但相關）

| 檔 | 用途 | 現況 |
|---|---|---|
| [`../CONTEXT.md`](../CONTEXT.md) | **領域詞彙表**：本站在講民俗時每個詞精確指什麼、哪些相近詞不可互換（舉辦週期／香科／曆別／豐化／來源型別／基準日／逐字引用／verified）。只收「弄錯會產生錯誤陳述」的詞 | **活的**。命名新模組用到沒收錄的概念就加進去；與程式碼不一致信程式碼 |
| `../README.md` | 對外技術概覽 | 全 repo 無任何 .md 指向它 |
| `../RELEASE-CHECKLIST.md` | 發佈檢查清單與交接文件 | ⚠️ **待裁示**：全 repo 無人引用；且其開頭寫「專案規格見上傳之 `SPEC.md`」，而 **`SPEC.md` 不在 repo 裡** |

---

## 維護守則

1. **數字一律由指令算**，這份索引與 `CLAUDE.md` 都不該出現會過期的數量。
2. **新增文件必須在這裡加一行**，否則下一個 session 找不到它——本次重整就是因為
   `docs/` 底下累積了一批檔案而沒有索引，其中數個連我自己都是重整時才發現。
3. **`decisions/` 是唯讀的歷史**：新的決策繼續往對應檔追加，不要回頭改寫舊條目的結論；
   結論變了就在原條目下方註明「YYYY-MM-DD 改為…，理由…」。
4. 標 ⚠️ **待裁示** 的檔案需要用戶決定去留，**不要自行刪除**。
5. **不要主動寫「對外分享文」這類沒人要求的文件。** 2026-08-06 刪掉
   `building-a-folk-divination-site.md`（406 行，2026-08-02 某個 session 自作主張寫的，
   零引用、用戶不知情）與 `festival-social-drafts.md`（社群備稿，本機無憑證故從未發出，
   農曆七月已過）。要寫這類東西之前先問。
