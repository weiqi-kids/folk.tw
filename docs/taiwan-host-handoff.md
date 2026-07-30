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

---

## 步驟 4：推送

```bash
rsync -az --partial --append-verify \
  -e "ssh -i ~/.ssh/folk_tw_intake -o StrictHostKeyChecking=accept-new" \
  ~/folk-tw-intake/out/ root@172.235.205.148:
```

- 遠端路徑**留空**（結尾就是 `:`）——forced command 已把目標鎖定在 inbox
- `--partial --append-verify` 讓大檔斷線後續傳
- 目錄結構照 `out/` 底下的相對路徑落地（例如 `out/temple-xml/temple.xml` → `inbox/temple-xml/temple.xml`）

境外那台每小時 :07 收件、每日 09:20（台北）檢查新鮮度並在逾期時發 Slack。

---

## 步驟 5：第一波要做什麼

### 5.1 `temple-xml`（機械，照 manifest 跑）
順便解掉兩件早就卡住的事：資料集月更、以及 **229 間廟缺座標**
（Nominatim 對台灣門牌只成功約一成，只能靠這份 XML 的 `WGS84X`／`WGS84Y`）。

### 5.2 慶(祭)典查詢（**偵察，需要你動腦**）
這是最高價值的一項：目前 7,891 間廟只有 **21 間**有已查證祭典，其餘只能顯示「主祀神聖誕」。

**依序做**：

1. **先找有沒有官方 API／JSON／批次下載**。開發者工具看 Network，或看頁面 JS 有沒有打 XHR。
   **有就用那個，不要爬 HTML。** 也順便看 <https://data.gov.tw> 有沒有對應資料集。
2. 沒有才 dump 樣本（**不到 10 個請求**）：
   - 慶典查詢的入口頁 1 個
   - 任一查詢結果頁 1 個（記下你送的查詢條件）
   - 任一筆明細頁 1 個
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
| 文化部 nchdb（`nchdb.boch.gov.tw`） | JS SPA、**無公開 API**（試過 5 個常見端點全回前端殼 10,858B） |
| 文化部全國藝文活動（`cloud.culture.tw`） | 有 JSON API、20 個分類全掃過，**是表演/展覽/講座**。關鍵詞命中全是誤判（宮崎駿、《神明便利商店》音樂劇、文武廟只是街頭藝人場地） |
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
| 傳輸層（受限金鑰＋inbox＋ingest＋cron） | ✅ 境外端已完成，**等你的公鑰**才能開通 | 2026-07-30 |
| 步驟 0 出口確認 | ⏳ | |
| 步驟 1 公鑰交付 | ⏳ | |
| `temple-xml` 首次投遞 | ⏳ | |
| 慶(祭)典查詢偵察＋欄位回報 | ⏳ | |
| 灶神 iconography 頁 | ⏳ | |
| CRGIS 連通性回報 | ⏳ | |
