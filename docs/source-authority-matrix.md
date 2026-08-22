# folk.tw 來源權威矩陣

> 這是來源治理契約，不是來源數量報表。來源是否可用，必須以當次實際抓取、頁面內容、授權與 claim scope 判斷。

## 1. 來源層級

| 層級 | 可支撐的內容 | 優先來源 | 限制 |
|---|---|---|---|
| A：官方規範／日期 | 國定節日、固定紀念日、節氣、政府公告 | 中央／地方政府、內政部、中央氣象署、主辦機關 | 只能支撐該公告範圍；年度公告未出不得推算 |
| B：文化資產／學術典藏 | 歷史沿革、登錄理由、儀式脈絡、典藏描述 | 文化資產主管機關、博物館、學術典藏、國史館臺灣文獻館 | 個案資料不可泛化為全臺習俗 |
| C：主辦方／一手活動 | 當年度日期、地點、路線、報名、服務與變更 | 主辦廟、地方祭典組織、場館、地方政府活動頁 | 只對該主辦方、該年度有效 |
| D：具名真人資料 | 地方做法、口述歷史、實務差異、審閱意見 | 經身分與同意核對的研究者、文史工作者、廟方／主辦方 | 必須記錄地域、題材範圍、同意與是否公開 |
| E：發現線索 | 題目發現、同義詞、可能的主辦方 | 搜尋結果、社群、商業文章、論壇 | 不能單獨支撐正文事實或日期 |

## 2. 目前可用的來源入口

下列是來源類型與已存在於 repo 的入口；每次使用仍須重查，不把這張表當成永久有效背書：

- 內政部全國宗教資訊網地方宗教慶典：`https://religion.moi.gov.tw/LocalCelebration/Index?ci=96`
- 國史館臺灣文獻館〈七月半之緣起及基隆中元慶典〉：`https://th.gov.tw/Epaper_Content/238/5723/`
- 文化資產開放資料：`https://data.boch.gov.tw/opendata/v2/assetsCase/5.1.json`
- 內政部年度紀念日／節日公告：以當年度 `moi.gov.tw` 公告為準。
- 節氣與天文日期：以當年度中央氣象署／官方天文資料為準。
- 地方活動：以當年度主辦廟、場館或地方政府公告為準。

來源連不上時，狀態記為 `blocked` 並保留重試線索；不得把連線失敗改寫成「沒有資料」。

## 3. Claim evidence 欄位契約

每一個準備進入正文、FAQ、meta、結構化資料或年度 manifest 的事實主張，都應有以下欄位；可放在既有資料的 source 欄位或 evidence packet，不要求另造重複資料庫。

```text
claim              可核對的一句主張
scope              全臺／地區／單一廟宇／單一年度／單一文資個案
source_type        A／B／C／D／E
source_url         原始網址
source_locator     頁碼、段落、欄位、個案 ID 或公告文號
checked_at         實際核對日期
annuality          evergreen／annual-refresh／event-only
status             verified／needs_recheck／blocked／not_found／disowned
limitations        地域、年份、版本、授權或不可推導事項
owner              後續要重查的角色；未知就留空
```

`E` 類只能填 `discovery_note`，不得把它當成 `verified`。`not_found` 與 `blocked` 必須區分：前者是查過仍沒有權威證據，後者是來源目前不可達或尚未完成查證。

## 4. 來源到頁面的驗收

- 節日／活動：跑 `pnpm check:annual-release`，年度日期與 release status 必須符合 manifest 契約。
- 來源引用：跑 `pnpm check:source-refs`，每個 caseId、引用網址、授權與允許網域由 gate 複驗。
- 檔期候選：跑 `node scripts/growth-source-candidates.mjs`，只把來源型盲點列成候選，不自動開頁。
- 公開前：跑 `pnpm check:claims`、`pnpm check:integrity`、完整 build 與線上 curl。

任何一項無法通過，輸出 `source_required`／`blocked`／`merge_only`，不以 AI 生成段落填空。

## 5. 真人來源的額外規則

真人提供的內容不能因為「本人說過」就自動變成全臺事實。必須保留：身分來源、訪談／審閱日期、逐句範圍、地域限制、公開同意與撤回方式。詳見 [`human-authority-ledger.md`](human-authority-ledger.md)。
