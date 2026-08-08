# 台灣主機交接清單：資料投遞管道

> **給台灣主機上的 Claude**。你的角色很窄也很明確：
>
> ## 你是笨水管。照清單抓，把原始 bytes 原封不動送回去。**一行都不要解析。**
>
> 為什麼：內政部全國宗教資訊網的「慶(祭)典查詢」是**網頁 UI 不是 API**，
> folk.tw 的主機在境外看不到那些頁面，所以 parser 只能寫在境外那台。
> 如果你「順手」把 HTML 轉成 JSON、挑欄位、改編碼，境外那台就失去了原始資料，
> 而且每次 parser 要調整都得回頭改你這邊的程式。**送原始 bytes 是刻意的設計，不是偷懶。**
>
> 建立於 2026-07-30。你完成任一項後，請把結果回報給用戶，由他轉給境外那台更新本檔狀態。

---

## 步驟 0：先確認你真的在台灣端（**沒過就停手**）

```bash
# ① 應回 HTTP 200。境外會 ECONNREFUSED 223.200.23.218:443
curl -s -o /dev/null -w "religion.moi.gov.tw → HTTP %{http_code}\n" --max-time 25 \
  "https://religion.moi.gov.tw/Knowledge/Content?ci=2&cid=233"

# ② 應回 HTTP 200 且 size 約 6 MB 以上
curl -s -o /dev/null -w "temple.xml → HTTP %{http_code}  %{size_download}B\n" --max-time 60 \
  "https://religion.moi.gov.tw/Report/temple.xml"
```

兩行都過才繼續。**若失敗，不要往下做、也不要下結論說「資料不存在」**——
境外那台就是因為連不到才需要你；把「連不到」誤判成「沒有資料」會讓整件事白做。

順便測一個境外連不上、但你可能連得到的來源（有就是大收穫）：

```bash
curl -sL -o /dev/null -w "中研院 CRGIS → HTTP %{http_code}\n" --max-time 30 \
  "https://crgis.rchss.sinica.edu.tw/resources/internet/folk_customs/list"
```

---

## 步驟 1：產金鑰，把**公鑰**交出去

```bash
ssh-keygen -t ed25519 -f ~/.ssh/folk_tw_intake -C "folk-tw-intake@tw" -N ""
cat ~/.ssh/folk_tw_intake.pub
```

把 `.pub` 那一行給用戶，他會轉給境外那台加進 `authorized_keys`。
**私鑰留在你這台，不要傳給任何人、不要貼進對話。**

境外那台會用這個前置限制收你（你不必自己設，只要知道限制是什麼）：

```
restrict,command="/usr/bin/rrsync -wo -no-del /root/.config/folk-tw/intake/inbox" ssh-ed25519 …
```

意思是：**你只能往那個目錄寫**。你拿不到 shell、讀不回任何東西（連自己剛送的都讀不到）、
也不能刪。所以：
- 不要期待能 `ssh` 進去看結果或 `rsync` 拉東西回來——會被拒絕，這是正常的
- 送錯了不用急著刪，重送正確版即可（境外那台驗 sha256，錯的自然不會被採用）

---

## 步驟 2：取抓取清單

每輪先抓最新版（**由境外那台維護，你不要改**——改了下輪會被覆蓋）：

```bash
curl -fsSL https://raw.githubusercontent.com/weiqi-kids/folk.tw/main/docs/intake-manifest.json \
  -o ~/folk-tw-intake/manifest.json
```

清單長這樣（節錄）：

```jsonc
{
  "politeness": { "min_interval_ms": 1000, "user_agent": "folk.tw-intake/1.0 (+https://folk.tw)",
                  "max_requests_per_run": 200 },
  "jobs": [{
    "id": "temple-xml",
    "url": "https://religion.moi.gov.tw/Report/temple.xml",
    "dest": "temple-xml/temple.xml",          // ← inbox 內的相對路徑，照放
    "max_age_days": 35,
    "expect": { "http_status": 200, "min_bytes": 4000000, "contains": "<OpenData_3>",
                "not_smaller_than_current_pct": 90, "min_occurrences": {"<OpenData_3>": 12000} }
  }]
}
```

**`expect` 是你的自我檢查**：抓到的東西不符（HTTP 非 2xx／太小／缺預期字串／筆數不足）
就**不要送**，記進 `state.json` 下輪重試。理由：把錯誤頁或截斷檔送過去，
最壞情況會覆蓋掉境外那台既有的好資料。境外那台也會再驗一次，但別把把關丟給對方。

> 實例（真的發生過）：2026-07-30 測試時投了一個 5 MB 的截斷檔（真檔 6.27 MB），
> 只有 `min_bytes: 4000000` 這種絕對下限時它**通過了**並覆蓋掉完整檔，靠 archive 才救回。
> 所以現在有 `not_smaller_than_current_pct` 與 `min_occurrences` 兩道相對檢查。

---

## 步驟 3：抓取腳本要滿足的條件

你自己寫（Node 或 shell 都可），放 `~/folk-tw-intake/fetch.mjs`。硬要求：

### 3.1 禮貌（對政府網站，不可省）
- **每個請求間隔 ≥ 1 秒**（照 manifest 的 `min_interval_ms`）
- 帶 manifest 的 `user_agent`，讓對方知道是誰
- **先讀 `robots.txt`**，被 disallow 的路徑不要抓
- 每輪請求數上限（`max_requests_per_run`），不要一次打爆
- 失敗指數退避：第 n 次失敗等 `2^n` 秒（上限 300 秒）；連續 5 次失敗就收工，下輪再來

### 3.2 可續傳（用戶明確要求：「斷了下次接續、帶進度檔」）
那台不一定常開，**不要假設一次跑得完**。`~/folk-tw-intake/state.json`：

```jsonc
{
  "updated": "2026-07-31T02:00:00Z",
  "jobs": {
    "temple-xml":  { "last_ok": "2026-07-31T02:00:00Z", "bytes": 6270920, "attempts": 0, "etag": "…" },
    "festival-p3": { "last_ok": null, "attempts": 2, "last_error": "HTTP 503" }
  }
}
```
- 每輪先讀 state，**跳過已完成且未過 `max_age_days` 的 job**
- 大量分頁工作要逐頁記進度，斷線後從下一頁接續，不要從頭重抓
- **把 `state.json` 一起送回**（`dest: state.json`）——境外那台會顯示進度，你卡在哪它看得到

### 3.3 每個檔要附兩個側檔
```
out/temple-xml/temple.xml
out/temple-xml/temple.xml.sha256      # sha256sum 輸出即可（含或不含檔名都能吃）
out/temple-xml/temple.xml.meta.json   # {"url":…,"http_status":200,"fetched_at":"…","bytes":…}
```
`.sha256` 是境外那台判斷「傳完了沒」的**唯一依據**，缺了就不會被採用。

### 3.4 不要解析（再說一次）
原始 bytes 原封送回。不要轉 JSON、不要改編碼、不要挑欄位、不要美化、不要去空白。

### 3.5 欄位契約（**改 manifest 前必讀**）

台灣端的 `fetch.mjs` 碰到**不認得的欄位會停下，不抓也不送**，原因寫進 `state.json`。
所以在 manifest 加新欄位前，請先確認台灣端支援，或同時通知台灣端升級。

目前台灣端支援：

| 層級 | 欄位 |
|---|---|
| job | `id` `url` `dest` `max_age_days` `note` `expect` `paginate` `method` `form` `token` |
| expect | `http_status` `http_status_any_of` `record_status_only` `min_bytes` `contains` `min_occurrences` `not_smaller_than_current_pct` |
| token | `field` `from` `from_job` |
| paginate | `method` `page_param` `start` `max_pages` `form` `token` `dest_template` `total_pages_re` `stop_when_missing` `expect_per_page` |
| **url_list**（2026-08-05 台灣端實作、自測 67/67） | `url_list` `dest_dir` `dest_template` `expect_per_item` |

⚠️ **2026-08-06 補**：上表原本漏列 `url_list` 那一列，而本節自稱「改 manifest 前必讀」——照舊表辦事會得出「不得用 url_list」的錯誤結論。目前**無 job 使用**它（沿革收割因授權暫停）。

底線開頭的欄位（`_why` 等）一律忽略，可自由當註解用——**境外端專用的開關就走這條路**
（例如 `_alert: false` ＝新鮮度提醒對該 job 靜音，台灣端完全不必認得）。

🔴 **這一節是拿事故換來的**：2026-08-01 境外端加了 `http_status_any_of` / `record_status_only`，
台灣端當時不認得，**結果不是報錯而是整段狀態檢查被跳過**——一頁 ASP.NET 錯誤頁被當成合格資料
收下並推送。那次剛好真的是 404、無害，但**回 500 也會照收**。台灣端已改為遇到不認得的欄位就停擺：
**默默做錯比停擺危險。**

### 3.6 分頁 job（`paginate`）——已實作、目前無人使用

台灣端 2026-07-31 實作並自測（29/29）。**manifest 加上 `paginate` 區塊才走分頁路徑，
不加就跟以前一樣是單檔 job**，向後相容。目前**沒有任何 job 需要它**——留著是為了將來真的
遇到逐頁來源。

```jsonc
"paginate": {
  "method": "POST",                 // GET｜POST，預設 GET
  "page_param": "Page",             // GET＝query 參數名；POST＝表單欄位名
  "start": 1,
  "max_pages": 664,                 // 硬上限防呆；未給則 10000
  "form": { "…": "" },              // POST 的靜態欄位（全空＝全量查詢）
  "token": { "field": "__RequestVerificationToken", "from": "…" },  // 只有 POST 需要
  "dest_template": "a/b/page-{page}.html",  // 未給則由 dest 自動插 -p{page}
  "total_pages_re": "共 (\\d+) 頁",          // 選填：省下探尾頁的請求
  "stop_when_missing": "<tr",               // 選填：頁面缺此字串＝翻過尾頁
  "expect_per_page": { "http_status": 200, "min_bytes": 10000, "contains": "<tr" }
}
```

進度記在 `state.json` 該 job 的 `pages`：`{ total, done_ranges: [[1,120],[122,200]], done, next, bytes }`
（區間表，上百頁也只佔一行）。**境外端看 `next` 就知道卡在哪一頁**；`last_ok` 要全部頁抓完才填。

台灣端保證：已完成的頁一個請求都不再發／抓完一頁就寫 state（不是跑完才寫）／`SIGINT`·`SIGTERM`·`SIGHUP`
先存檔再退／達請求上限＝記斷點收工、不累加 `attempts`／`out/` 的檔被清掉會踢回待抓（只信 state 會漏）／
連續失敗數頁即指數退避收工（次數見 manifest 的 `politeness.backoff`）／每頁三件套 `.html`＋`.sha256`＋`.meta.json`（含 `page` 欄位）。

⚠️ **慶典查詢不要用分頁抓**（2026-07-31 實測 4 個請求）：那個來源**每一頁都把全部 6,644 列
渲染出來**（所以每頁都是 7.5 MB），分頁只是顯示層的假象。一個 GET 就拿到全部
＝現行的 `religion-festival-entry` job。

---

## 步驟 4：推送

```bash
rsync -az --partial --ignore-times \
  -e "ssh -i ~/.ssh/folk_tw_intake -o StrictHostKeyChecking=accept-new" \
  ~/folk-tw-intake/out/ root@172.235.205.148:
```

- 遠端路徑**留空**（結尾就是 `:`）——forced command 已把目標鎖定在 inbox
- `--partial` 讓大檔斷線後續傳
- 🔴 **`--append-verify` 不可用**（2026-08-01 台灣端實際中招）：它假設檔案只會變長，
  遇到「大小相同」的檔案會**跳過內容、只對齊 mtime**，而且對齊之後連普通 rsync 也不再修正。
  `.sha256` 是固定長度、`state.json` 也常同大小 → **兩者永遠傳不過去**。
  最壞情況是新的 `temple.xml` 配舊的 `.sha256`，境外端驗不過、整份不採用。
  `--ignore-times` 強制逐檔比對內容，正是為了擋這個。**別為了省頻寬改回去。**
- 目錄結構照 `out/` 底下的相對路徑落地（例如 `out/temple-xml/temple.xml` → `inbox/temple-xml/temple.xml`）

境外那台每小時 :07 收件、每日 09:20（台北）檢查新鮮度。

**新鮮度提醒只在「境外端能動手」的兩種情況發 Slack**（2026-08-03 改）：
① `state.json` 超過 36 小時沒更新＝台灣端沒在跑；
② 台灣端記錄抓取成功、sha 也與境外現有檔不同，卻沒有新檔進 inbox＝rsync 那段斷了。
**來源掛掉或來源沒更新一律不發**——那不是我們能處理的事，只留在 log。
因此 `state.json` 的 `updated`、以及每個 job 的 `last_ok` / `sha256` / `last_error` / `attempts`
**是境外端的判準，不只是給人看的**：漏傳 `state.json` 會被判成「台灣端沒在跑」而誤報。

---

## 步驟 5：第一波要做什麼

### 5.1 `temple-xml`（機械，照 manifest 跑）
順便解掉兩件早就卡住的事：資料集月更、以及 **219 間廟缺座標**（2026-08-06 實查；原文 229）
（Nominatim 對台灣門牌只成功約一成，只能靠這份 XML 的 `WGS84X`／`WGS84Y`）。

### 5.2 慶(祭)典查詢（**偵察，需要你動腦**）
這是最高價值的一項：⚠️ **這句已過期**（寫於 2026-07-30）：慶典資料已於 7/31 匯入，現為 **2,498 間廟／4,106 筆**（見本檔狀態表）。

**依序做**：

1. **先找有沒有官方 API／JSON／批次下載**。開發者工具看 Network，或看頁面 JS 有沒有打 XHR。
   **有就用那個，不要爬 HTML。** 也順便看 <https://data.gov.tw> 有沒有對應資料集。
2. 沒有才 dump 樣本（**十來個請求就夠**）：
   - 慶典查詢的入口頁一份
   - 任一查詢結果頁一份（記下你送的查詢條件）
   - 任一筆明細頁一份
   - 全部放 `out/religion-festival/`，命名隨意但要能對上你的說明
3. **回報這些**（這才是境外那台需要的）：
   - 欄位有哪些？**廟名／慶典名稱／農曆日期／國曆日期／地址／統一編號**各有沒有
   - **能不能對映到我們的廟**？最好是統一編號，其次「廟名＋行政區」
   - 分頁機制（query string 參數？POST？每頁幾筆？總筆數？）
   - 有沒有反爬（驗證碼／session／rate limit）

### 5.3 順手兩件小事
- 灶神條目頁（`religion.moi.gov.tw` 上的灶神）→ `out/misc/`，境外那台要補 `iconography`
- 步驟 0 那個 CRGIS 測試結果一併回報

---

## 已實測沒用的來源——**別重做一遍**

境外那台 2026-07-30 花了不少時間排除這些：

| 來源 | 結論 |
|---|---|
| MOI 寺廟開放資料（就是 `temple.xml`） | **完全沒有祭典欄位**。只有：編號／寺廟名稱／主祀神祇／行政區／地址／教別／登記別／統一編號／電話／負責人／WGS84X／WGS84Y |
| 文化部 nchdb（`nchdb.boch.gov.tw`） | JS SPA、**無公開 API**（2026-08-01 試過數個常見端點全回前端殼） |
| 文化部全國藝文活動（`cloud.culture.tw`） | 有 JSON API、2026-08-01 全分類掃過，**是表演/展覽/講座**。關鍵詞命中全是誤判（宮崎駿、《神明便利商店》音樂劇、文武廟只是街頭藝人場地） |
| 觀光署宗教慶典（`taiwan.net.tw/m1.aspx?sNo=0001022`） | 2000 年代靜態散文，只講大甲媽祖等數個 |
| `data.gov.tw` dataset 7723 文化部國家文化資料庫-民俗 | **已下架**，僅存歷史資料 |
| 中研院 CRGIS | 境外 HTTP 000。**你這邊請重試**，它是學術級、含例祭日，通了價值很高 |

---

## 紅線

- **絕不杜撰。** 抓不到就記 `state.json`，不要編、不要猜、不要拿相似資料替代。
- **不要解析。** 見上，說三次。
- **不要把私鑰、Slack token、任何憑證送過去或貼進對話。**
- 面向使用者的文案不得出現具體傷亡／災損數字（folk.tw 的既有紅線，你若產生任何文案時適用）。
- 對政府網站的請求量守步驟 3.1，不要為了快而拿掉間隔。

---

## 狀態

| 項目 | 狀態 | 更新日 |
|---|---|---|
| 傳輸層（受限金鑰＋inbox＋ingest＋cron） | ✅ 完成並開通；三項限制實測會擋（讀取／`--delete`／路徑穿越） | 2026-07-31 |
| 步驟 0 出口確認 | ✅ | 2026-07-30 |
| 步驟 1 公鑰交付 | ✅ 已裝 `folk-tw-intake@tw` | 2026-07-31 |
| `temple-xml` 首次投遞 | ✅ 12,419 筆、已原子上位（`Last-Modified` 7/29＝最新版）；11,916 筆有座標 | 2026-07-31 |
| 慶(祭)典查詢偵察＋欄位回報 | ✅ 找到官方 ODS 批次匯出、無反爬、無明細頁 | 2026-07-31 |
| 灶神 iconography 頁 | ✅ 已投遞 `misc/knowledge-zaoshen-cid265.html`，待境外端解析 | 2026-07-31 |
| CRGIS 連通性回報 | ⚠️ **站台層級不通**（台灣端亦然：TCP 443 逾時、母站同樣不通）＝非境內外差異。**未確認無資料**，待重試 | 2026-07-31 |
| `religion-robots` job | ✅ 已修（該站 robots.txt 回 404＝無限制）；expect 改為接受 404、只記錄狀態 | 2026-07-30 |
| 慶典資料匯入站台 | ✅ **2,498 間廟／4,106 筆已進 `temples.json` 的 `festivals[]`**（見 `docs/festival-data-import.md`） | 2026-07-31 |
| 慶典升為正式 manifest job | ✅ **已完成**：manifest v5 已有 `religion-festival-entry` 與 `religion-festival-ods` 兩個 job，皆抓取成功 | 2026-08-06 補記 |
| 「寺廟服務資訊」偵察 | ✅ **確認無此來源，本線結案**：服務項目／開放時間／創建年代／安太歲／光明燈／問事／收驚／籤詩籤系，在查詢表頭、ODS 23 欄、`GetUploadFile` 三處皆不存在（台灣端 2026-08-05 回報，境外端另已排除觀光署景點庫、新北市寺廟資料、文化部 nchdb、臺灣宗教文化地圖）。**不要再找替代來源。** | 2026-08-05 |
| 寺廟 ODS 全量（`FoundationOdsReport.ods`） | ✅ 已收 `recon-service/temple-export.ods`；境外端實解＝**13,608 筆 23 欄**，與台灣端回報一字不差。⏳ 待台灣端回 form payload 才能升為 manifest job | 2026-08-05 |
| 沿革／參拜流程收割 | ✅ **2026-08-06 授權已解**（內政部同意，條件＝標示資料來源連結）。現在卡的是**技術前置**：`UploadFileID` 不在任何開放資料集，要先由 `religion-foundation-list`（manifest v8）收查詢結果頁，才產得出 `url_list` 清單。四段流程與各自的匯入器見 `scripts/gen-intake-urls-yange.mjs` 檔頭。⚠️ `religion-yange` job **等清單檔產出後才可加進 manifest**——清單不存在時加上去，台灣端抓清單會 404 而整個 job 停擺。以下為授權解除前的紀錄： |
| ~~沿革／參拜流程收割（舊）~~ | ⛔ **暫停，卡在授權（不是卡在技術）**。兩個前置條件都已滿足：form payload 已於 2026-08-05 送達（`inbox/recon-service/FOUNDATION-FORM-PAYLOAD.md`）、`url_list` 台灣端已實作自測 67/67（🔴 依 §3.5，境外端在收到「已實作並自測」前不得把該欄位放進 manifest）。範圍＝沿革 idx=2（4,325 筆）＋參拜流程 idx=4（828 筆）；建築特色 idx=3 先抓 30 筆樣本評估佔位值比例 | 2026-08-05 |
| 授權聲明頁 | ✅ 已收 `misc/religion-copyright.html`。**結論見下方「授權盤點」** | 2026-08-05 |
| `url_list` 型 job（階段二用） | ✅ 台灣端已實作並自測（67/67，paginate 29/29 無回歸）。**目前無 job 使用**（沿革收割因授權暫緩） | 2026-08-05 |

### 🔑 授權盤點 → **權威在 [`taiwan-intake-status.md`](taiwan-intake-status.md)**

判準一句話：**看「這份資料在不在 data.gov.tw 上」，不是「從哪個網址抓的」**——
同一台 `religion.moi.gov.tw` 同時供應 OGDL 開放資料與受版權宣告保護的網站內容。

完整對照表（哪些資料集是 OGDL、哪些是網站內容、各自能不能發佈）與版權宣告原文引述，
一律看 [`taiwan-intake-status.md`](taiwan-intake-status.md) 的「🔴 判準」一節。
🔴 **不要在本檔重寫一份**——2026-08-06 盤點時發現同一條判準寫在四個檔、措辭已開始漂移
（本檔那份多了「有沒有開放授權」），故收斂成單一權威處。

### 給台灣端的回覆（2026-07-31）

1. **`religion-robots` 早就修好了**——線上 manifest 自 2026-07-30 起已是
   `http_status_any_of: [200,404]` ＋ `record_status_only`。你看到的是舊快取，重抓一次即可。
2. **慶典 job：請出草案，會採用。但你的報告有兩處要更正**（境外端實測）：
   - **ODS 不能當主來源**。你建議「ODS 拿乾淨資料、HTML 補電話與宗教別」——但 ODS 的日期欄
     **完全沒有農曆／國曆標記**（2026-08-05 實測抽樣全無），而全量以農曆居多。
     照那個做法會把農曆當國曆，媽祖聖誕會從 4/29 變成 3/23。**HTML 是唯一可用的主來源。**
   - **那個對映率是對 `temple.xml` 全量算的**，不是站上實際收錄的廟數（兩者跑 `pnpm check:integrity` 與 `node scripts/intake-status.mjs` 各自查）。
     對站台而言正確數字是 **2,498 間（31.7%）**——**2026-07-31 已實際匯入完成**（4,106 筆）。
     差額來自：部分慶典的廟我們沒收錄、部分同名且行政區無法消歧（刻意捨棄，避免張冠李戴）、
     以及 439 列資料清洗（名稱無漢字如 `.`／`33333`、帶絕對年份的一次性日期、`07/00` 這類不存在的日子）。
     （偵察階段曾推估 2,558，那是**清洗前**的數字。）
     ⚠️ 同名消歧另有一招有效：**「廟名＋電話」對 `temple.xml` 再用完整地址對回站台**，
     救回數十筆。電話只在記憶體中比對、不寫進 repo（個資，本 repo 為 public）。
3. **請求量很好**：`requests_this_run: 3`，守住了對政府網站的禮貌。
