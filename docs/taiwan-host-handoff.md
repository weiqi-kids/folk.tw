# 台灣主機交接：擋境外 IP 的資料工作

> **給接手的 Claude**：這份文件列出**只能在台灣 IP 執行**的資料工作。
> 你會讀到 `CLAUDE.md` 自動載入的專案脈絡，但下面這些是那裡沒有的「為什麼卡住、卡在哪、怎麼做」。
> 建立於 2026-07-30（境外主機最後一次交接）。每完成一項就回來更新本檔狀態。

## 0. 先確認你真的在台灣端

境外主機（原本那台）跑下面兩行會失敗，台灣端應該會成功。**做任何事之前先跑這個確認**：

```bash
# 應回 HTTP 200；境外會 ECONNREFUSED（223.200.23.218:443）
curl -s -o /dev/null -w "religion.moi.gov.tw → HTTP %{http_code}\n" --max-time 25 \
  "https://religion.moi.gov.tw/Knowledge/Content?ci=2&cid=233"

# 應回 HTTP 200 且是 XML；境外 25s timeout
curl -s -o /dev/null -w "temple.xml → HTTP %{http_code}  %{size_download}B\n" --max-time 40 \
  "https://religion.moi.gov.tw/Report/temple.xml"
```

若這兩行仍失敗，**不要繼續往下做**——先確認網路出口真的在台灣，否則你會把「連不到」誤判成「資料沒有」。

---

## 1. 【最高價值】全國宗教資訊網「慶(祭)典查詢」→ 廟宇活動資料

### 為什麼這件事重要

廟宇頁的社群分享卡（`scripts/gen-og-temples.mjs`）第三行要顯示該廟的活動。
用戶的實際用途是**外撥給廟方主委**時傳連結，希望主委看到自己廟的名字與近期活動。

現況：**7,891 間廟裡只有 21 間有 `main_festival`**（已查證的祭典），其餘 7,424 間退而顯示
「主祀神聖誕」（`○○聖誕・農曆X月X日（國曆 M/D）`），467 間（城隍／太歲等無聖誕者）只顯示廟名。

「主祀神聖誕」是事實陳述、不是該廟的活動。要有**真正的廟宇活動**，只剩這個來源。

### 2026-07-30 實測過、確認**沒用**的來源（別重做一遍）

| 來源 | 結論 |
|---|---|
| MOI 全國宗教資訊系統・寺廟（dataset 8203，即 `temple.xml`） | **完全沒有祭典欄位**。只有：編號／寺廟名稱／主祀神祇／行政區／地址／教別／登記別／統一編號／電話／負責人／WGS84X／WGS84Y |
| 文化部 nchdb 民俗（`nchdb.boch.gov.tw`） | 網站可達但是 **JS SPA、無公開 API**（試過 5 個常見端點全回前端殼 10,858B）。現有 36 筆 events 是逐筆人工查證掛源來的 |
| 文化部全國藝文活動（`cloud.culture.tw/.../doFindTypeJ&category=N`） | 有 JSON API、20 個分類全掃過，**是表演/展覽/講座**。關鍵詞命中全是誤判（宮崎駿、《神明便利商店》音樂劇、文武廟只是街頭藝人場地） |
| 觀光署宗教慶典（`taiwan.net.tw/m1.aspx?sNo=0001022`） | 2000 年代靜態散文，只講大甲媽祖等數個知名祭典 |
| 中研院 CRGIS 宗教禮俗（`crgis.rchss.sinica.edu.tw`） | 境外連不上（HTTP 000）。**台灣端請重試**——它是學術級、含例祭日，若可達則價值很高 |
| [data.gov.tw dataset 7723 文化部國家文化資料庫-民俗](https://data.gov.tw/dataset/7723) | **已下架**，僅保存為歷史資料 |

### 要做什麼

1. 進 <https://religion.moi.gov.tw/>，找「**慶(祭)典查詢**」功能（首頁功能列；亦見
   [內政部功能介紹 PDF](https://ws.moi.gov.tw/001/Upload/OldFile/news_file/4.107%E5%B9%B4%E5%85%A8%E5%9C%8B%E5%AE%97%E6%95%99%E8%B3%87%E8%A8%8A%E7%B6%B2%E5%8A%9F%E8%83%BD%E4%BB%8B%E7%B4%B90621.pdf)）。
2. 先**人工看一筆**，確認欄位到底有什麼：廟名？慶典名稱？農曆日期？國曆日期？地址？
   有沒有可對映到 `temples.json` 的鍵（統一編號最好，其次「廟名＋行政區」）。
3. 確認後再寫抓取腳本。**寫之前先回報你看到的欄位給用戶**，不要自己決定資料模型。
4. 資料落點（**照這個結構，卡片與廟頁的程式碼已經在等這個欄位**）：

```jsonc
// src/data/temples.json 的單筆廟宇物件，新增選填欄位：
{
  "id": "moi_1044_保民廟",
  // …既有欄位…
  "main_festival": "……"   // ← 已存在。單一句子描述主要祭典，21 間已有
}
```

**若慶典資料能對映**，優先填進既有的 `main_festival`（卡片與 description 都已讀它，
不必改任何程式碼）。只有在需要「多筆活動＋各自日期」時才新增 `events[]`——
那會需要同步改 `gen-og-temples.mjs` 的 `recentActivity()` 與 `src/pages/temples/[id].astro`。

### 紅線（違反就是砸掉整個站的可信度）

- **絕不杜撰**。查到什麼寫什麼，每筆都要 `sources`（type/ref/note）。查不到就留空。
- **不可用「主祀神聖誕」去填 `main_festival`**。那是神明生日、不是該廟辦的活動；
  混進去等於替 7,424 間廟宣稱他們有辦祭典。措辭界線見 `gen-og-temples.mjs`
  的 `recentActivity()` 註解（2026-07-30 與用戶討論後定案）。
- **面向使用者的文案不得出現具體傷亡／災損數字**（硬 gate `scripts/lib/topical-guard.mjs`）。
- 改完跑全套 gate（見 `CLAUDE.md`「驗證套件」），特別是 `pnpm check:integrity`
  與 `pnpm check:rendered`（後者逐頁驗 7,891 間廟的卡片與 meta）。

---

## 2. `temple.xml` 更新（每月）

MOI 資料集 8203 約每月更新，境外抓不到。台灣端可直接：

```bash
curl -o /root/.config/folk-tw/temple.xml "https://religion.moi.gov.tw/Report/temple.xml"
pnpm data:temple-coords /root/.config/folk-tw/temple.xml        # 乾跑，看要補幾筆座標
pnpm data:temple-coords /root/.config/folk-tw/temple.xml --write
pnpm check:integrity && pnpm build && pnpm check:rendered
```

現況：229 間缺座標。`scripts/geocode-missing-temples.mjs` 用 Nominatim 只補到約一成
（台灣門牌覆蓋差），且**地址只有行政區時一律跳過**——Nominatim 會回行政區中心點，
台南開基天后宮實測差約 1 公里，**那比留空更糟**（地圖會把人導到錯的地方）。
要大批補座標只能靠這份 XML 的 `WGS84X`／`WGS84Y`。

---

## 3. 灶神 `iconography` 補齊（小事，順手做）

`src/data/deities.json` 的灶神缺 `iconography`。唯一權威源是內政部全國宗教資訊網，
境外 `ECONNREFUSED`。台灣端可直接查該站灶神條目後補上並掛源。

---

## 4. 目前的主線任務脈絡（別把上面幾項當成全部）

站台當前第一優先是**農曆七月季節戰役**：用戶設定目標 2026-08-31 的 GA4「28 日活躍人數」
破 20,000（2026-07-29 實測 3,189）。已上線 `/festivals/` 節日模組 10 頁
（鬼門開 8/13、七夕 8/19、放水燈 8/26、中元節 8/27 皆在 28 日窗口內）。

- 完整計畫：`/root/.claude/plans/rosy-singing-graham.md`（**若沒隨機器搬過來，向用戶要**）
- 每日自動化與當期策略：`/root/seo-ops/playbooks/folk.tw.md` 的
  `<!-- playbook:strategy:start -->` 段（人工維護區，反思層不會改寫）
- **檢查點 8/8**：節日頁是否翻收錄；**8/16**：`/festivals/` 頁組有無節日類查詢曝光。
  若 8/16 仍近零，改把力氣轉到 9 月第二批節日與 AI/GEO 可見度，**如實回報缺口、不要繼續加頁充數**。

上面第 1 項（慶典資料）若成功，會讓 7,424 張分享卡從「主祀神聖誕」升級成真實活動——
那是外撥轉換率的直接槓桿，但**不是**衝 8/31 目標的路徑，別搞混優先序。

---

## 狀態

| 項目 | 狀態 | 更新日 |
|---|---|---|
| 1. 慶(祭)典查詢 → 廟宇活動 | ⏳ 待台灣端執行 | 2026-07-30 |
| 2. temple.xml 更新＋座標回填 | ⏳ 待台灣端執行 | 2026-07-30 |
| 3. 灶神 iconography | ⏳ 待台灣端執行 | 2026-07-30 |
| 4. 農曆七月戰役 | 🔴 進行中，8/8 與 8/16 為檢查點 | 2026-07-30 |
