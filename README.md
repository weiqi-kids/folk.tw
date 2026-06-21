# 眾神解析 · folk.tw

> 台灣民俗信仰考據工具 — 籤詩解碼與神明圖譜，逐條掛來源、諸說並陳。

[![站台](https://img.shields.io/badge/site-folk.tw-8a2b2b)](https://folk.tw)

**一套資料、兩種視圖**：以神明為脊椎，籤詩解碼與神明圖譜共用同一根結構，外加農民曆、民俗活動、拜拜習俗三模組。本站定位是**民俗文化考據**，不是運勢算命——凡取捨衝突，一律以「考據工具」為準。

## 設計哲學（為什麼這樣做）

參照「聖經恢復本原文逐字對照」一類考據站之所以成立，靠的是**有界語料 + 開放授權標註 + 跨文本追蹤**。民俗信仰沒有單一正典，但拆對子題後：

| | 籤詩解碼 | 神明圖譜 |
|---|---|---|
| 語料 | **現成**：四句本文公有領域、有界、有編號 | **無**：沒有結構化開放本體論，需自行策展標註 |
| v1 性質 | 對齊 + 加值（白話、典故、分項解） | 策展 + 結構化 + 引註紀律 |

**provenance 鐵律**是整站命脈：每筆事實掛 `sources[]`，**無源不發佈**；爭議欄（聖誕、神格位階、地方異說）一律**諸說並陳，不裁定**。

## 五模組架構

一根脊椎（神明）＋五個獨立模組，模組間**只透過 `神明.id`／`廟宇.id`／`農曆日期` 三鍵連接**（硬邊界）。

| 模組 | 引擎型態 | 狀態 | 資料 |
|---|---|---|---|
| **M1 籤詩** | 文本解碼 | **兩套籤系 160 籤**（六十甲子 60＋關帝百首 100），全含白話故事＋賞析＋8項分項解；137 典故 | `src/data/poems.json`、`src/content/allusions/`、`interpretations/` |
| **M2 神明** | 知識圖譜 | 59 尊（含五府千歲／城隍具名實例）＋21 關係邊 | `src/data/deities.json`、`deity-relations.json` |
| **M3 農民曆** | 曆法計算 | 日柱錨定常數已校準＋測試（verified）；進階層協紀辨方書首批規則（verified:false 待人工核）＋待接天文資料 | `src/lib/almanac/` |
| **M4 民俗活動** | 事件＋GIS | 11 活動（文資案號查證）＋28 廟宇（主祀對映 82%） | `src/data/events.json`、`temples.json` |
| **M5 拜拜習俗** | how-to 知識庫 | 12 主題，科儀步驟＋金紙供品逐筆掛源 | `src/data/practices.json` |

> **發佈模式**：M1–M5 全部完成才**單一發佈**，對外無分批、無深淺。剩餘缺口為誠實標注之待補項（少數神明聖誕待查、M3 協紀辨方書規則待人工核、天文資料待接），均以 draft／verified gate 不對外顯示。

## 跨文本追蹤（核心價值）

於 **build 期**預建反向索引（`src/lib/queries.ts`），靜態站查詢期零成本：

- 典故 → 反查出現在哪些籤（去重節點，如「太公／渭水遇文王」橫跨第 15、22 籤）
- 籤詩系統 → 哪些神明採用（橋接 M1↔M2）
- 神格分類 → 同類神明聚合；橫向群組（五文昌、五府千歲…）
- 神明關係 → 出邊／入邊列表；類別 → 具名實例
- 神明 → 主祀此神之廟宇（R5 主祀對映）；廟 → 主辦活動（M4↔M2）

## 技術

- **Astro 6**（純靜態輸出）＋ TypeScript strict，單一 Node.js 工具鏈
- **Content Layer**（`src/content.config.ts`）以 Zod 定義模組 schema；散文採每篇 Markdown
- **全文檢索** Pagefind（postbuild 建索引）；SEO：sitemap／OG／canonical
- 套件管理 **pnpm**
- 部署 **GitHub Pages**（自訂網域 `folk.tw`，CNAME），每日 cron 重建推進「今日選讀」

## 開發

```bash
pnpm install
pnpm dev               # 開發伺服器（顯示 draft 資料便於編輯）
pnpm build             # 靜態建置（prod gate：draft／無源不發佈）
pnpm check             # astro 型別檢查
pnpm check:integrity   # 完整性與對映率報表（R5／§9.6）
```

> `pnpm dev` 顯示全部資料（含 draft）；`pnpm build`（production）套用「無源不發佈」gate，draft 與待查欄位不輸出。

## 專案結構

```
src/
  content.config.ts      五模組 Content Collections schema（Zod）
  data/*.json            seed 資料（poems/allusions/deities/relations/events/practices…）
  lib/
    queries.ts           跨文本追蹤反向索引（build 期）
    daily.ts             每日一籤「今日選讀」（全站同一支，UTC+8）
    almanac/             M3 農民曆演算引擎（純函式 library）＋ rules/ 規則表
  layouts/Base.astro     全站版面（footer 含免責與範圍聲明）
  pages/                 今日中樞、籤詩、神明、農民曆、活動、習俗、關於
scripts/check-integrity.ts  完整性與對映率報表
```

## 資料紀律

- **每筆事實掛來源**；無源者標 `draft`／省略，production 不輸出。
- **籤詩四句**公有領域可收錄；**現代解籤文字有著作權，不抄**；分項解自行撰寫。
- **典故故事**取公有領域題材自行敘述，不抄特定改寫本。
- **諸說並陳**：聖誕多筆、典故各廟版本、地方異俗，各自掛源並列，不選一裁定。
- `pnpm check:integrity` 產出「未匹配報表」：尚未成節點的關係邊端點、活動主神對映率等（不阻 build，供策展追蹤）。

## 邊界與倫理

本站為民俗文化考據與教育呈現，**不構成醫療、法律、投資、命理或宗教指導建議**；涵蓋以**漢人民間信仰**為主（七大類），非窮盡台灣所有宗教信仰。詳見站內「關於與勘誤」頁。

## 授權

- 程式碼：見 [LICENSE](./LICENSE)（MIT）。
- 內容資料：各條目來源逐條標註於資料檔；公有領域本文、政府開放資料依各自條款，原創敘述（分項解、摘要）著作權歸本站。
