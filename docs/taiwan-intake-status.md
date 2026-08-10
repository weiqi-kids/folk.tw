# 台灣端投遞管道：現況與每一份資料的去向

> **要看現在的數字，跑指令，不要讀這份文件裡的數字——這裡刻意不寫數字。**
>
> ```bash
> node scripts/intake-status.mjs           # 四段完整報告
> node scripts/intake-status.mjs --brief   # 略過「已發揮作用」與「偵察/放棄」兩段；對帳與站上統計仍會印
> ```
>
> 那支腳本即時讀 `docs/intake-manifest.json`、台灣端的 `state.json`、
> 以及站上的 `temples.json`／`deities.json` 三邊算出來。
> **要改「某份資料怎麼處置」，改 `scripts/intake-status.mjs` 的 `LEDGER` 表，不要改這份文件。**
>
> 管道本身怎麼運作（金鑰、manifest 欄位契約、rsync、新鮮度提醒）→ `docs/taiwan-host-handoff.md`。

---

## 🔴 架構裁示：解法**不是搬主機**

內政部全國宗教資訊網與 MOI `temple.xml` 都擋境外 IP。**但只有「取資料」需要台灣 IP**——
解析、查證、gate、部署、seo-ops 全部留在這台。台灣端跑定時腳本當**笨水管**
（照清單抓、送原始 bytes、一行都不解析）。

⚠️ **不要提議把主機搬到台灣**，也不要為了「就近取資料」把解析邏輯搬過去。
parser 只能寫在境外這台的理由見 [`taiwan-host-handoff.md`](taiwan-host-handoff.md) 開頭。

---

## 為什麼需要這份文件

inbox 是 **write-only 的暫存區**：台灣端只能寫、不能刪（`rrsync -wo -no-del`），
而 `scripts/intake-ingest.mjs` 會把有上位目標的檔「原子上位」並清空。
⚠️ **但 `PROMOTE_TO` 目前只有 `temple-xml/temple.xml` 一筆**——其餘 job 印的是「無上位目標，留在 inbox」，
所以 inbox 會持續累積——**現有幾個檔跑 `node scripts/intake-status.mjs` 看**（對帳段會列出未被 LEDGER 涵蓋者）。
所以**光看目錄看不出哪些處理過了**——得同時對照 manifest（我們要什麼）、
`state.json`（他們抓到什麼）、站上資料（實際用了什麼）三邊。

### 🔴 判準：授權看「在不在 data.gov.tw 上」，不是「從哪個網址抓的」

`religion.moi.gov.tw` 這一台**同時**供應兩種東西：

| 性質 | 例子 | 授權 | 能不能發佈 |
|---|---|---|---|
| **政府資料開放平臺的資料集** | `Report/temple.xml`（8203）、`Report/Festival.xml`（8209）、法人教會 8204／基金會 8205／宗祠 8206／宗祠基金會 8208／表揚名冊 8210 | **OGDL 1.0**：可再散布、可商用，**需標示出處** | ✅ |
| **網站內容** | 慶典查詢網頁、`GetUploadFile` 的沿革／建築特色／參拜流程、`Knowledge/*` 條目頁 | 站台版權宣告：第二條許可僅限**個人及非商業**的瀏覽下載；第三條**明禁商業機構或團體轉載、重製、散布**。**但 2026-08-06 已取得內政部同意，見下** | ✅（依同意條件） |

版權宣告原文在 `inbox/misc/religion-copyright.html`（2026-08-05 台灣端投遞）。

**事實資料與語文著作要分開看**：慶典的「廟名＋祭典名＋日期」是事實，且同一份本來就以 8209
開放授權發佈 → 站上已匯入的沒有問題。

### ✅ 2026-08-06：內政部同意使用（沿革／建築特色／參拜流程／`Knowledge/*`／**含照片**）

用戶 2026-08-05 依版權宣告第五條去函洽詢，2026-08-06 回報**已獲同意**。承辦的說法是
**這些資料本來就是公開、就是要給大家用的**。

**唯一條件：標示資料來源連結。** 範圍為「都可以」，**含照片**。

🔴 **落實方式＝每一筆掛回它自己的公開網址**，而不是引用一紙同意函：
- 沿革／建築特色／參拜流程 → `Religion/GetUploadFile?UploadFileID=<N>&IndexID=<2|3|4>`
- `Knowledge/*` 條目 → `Knowledge/Content?ci=2&cid=<N>`

這樣同時滿足對方的條件與總紅線第 1 條（來源要能被機器複驗）——
⚠️ **別再去要公文文號**。2026-08-06 曾因為把「授權憑證」和「資料出處」混為一談而回頭索取文號，
結果是讓用戶被承辦唸了一頓；紅線要的從來就是**資料出處**，而出處本來就是那個公開網址。

---

## 一、已經在站上發揮作用：每一份的整合方式

> 數量請跑上面的指令。這裡只記「怎麼接進站的」。

### `temple-xml` — 全站的骨架
- **是什麼**：內政部寺廟開放資料（8203，OGDL 1.0），約每月更新。
- **怎麼整合**：
  1. `scripts/import-temples.ts` → `src/data/temples.json` 的名稱／地址／主祀神／教別，
     生成全站廟宇頁。⚠️ **`temples.json` 的 id 不是 MOI 編號**，是匯入當下的陣列索引
     （`moi_1044_保民廟` 的 1044），對映一律用「廟名＋行政區」。
  2. `pnpm data:temple-coords <temple.xml>` → 回填 `lat`／`lng`（廟頁地圖、OG 卡）。
     安全閘見 `scripts/refresh-temple-coords.ts` 檔頭。
  3. **每日五間外撥名單**（`/root/folk-outreach/outreach-daily.mjs`，台北 04:30 推 Slack）。
     ⚠️ **電話與負責人是個資，只讀 repo 外的 `/root/.config/folk-tw/temple.xml`，絕不進 repo。**
- **上位路徑**：`/root/.config/folk-tw/temple.xml`（**原子 rename**——`outreach-daily.mjs`
  每日 04:30 會讀它，讀到半個檔會產生錯誤的外撥名單）。

### `religion-festival-entry` — 年度慶(祭)典
- **是什麼**：慶典查詢網頁（7.5 MB，網站 UI）。**曆別只有這份有**。
- **怎麼整合**：`scripts/import-festivals.mjs`（乾跑為預設）→ `temples.json` 的 `festivals[]`。
  消費端三處共用 `src/lib/temple-festival.ts`：廟宇頁「年度祭典」區塊、OG 卡第三行、
  `/festivals/<slug>/` 的「當天有登記祭典的宮廟」名單。
- **完整規格與三個陷阱** → `docs/festival-data-import.md`（**改動前必讀**）。
- 🔴 措辭界線：只能說「該廟登記了這個祭典」，**不可推論成「這些廟在過中元節」**。

### `religion-festival-ods` — 只當對帳用
- 官方 ODS 匯出。**刻意不進站**：日期欄沒有農曆／國曆標記，只用它會把絕大多數的農曆當國曆（2026-07-31 實測：全量 6,644 筆中農曆 6,365）。

---

## 二、還沒處理好（待處理清單）

> **跑 `node scripts/intake-status.mjs --brief` 看目前每一項的目標、卡點、以及檔案躺了幾天。**
>
> 站立會議式的三欄（目標／卡點／現況）由腳本輸出；要改內容改 `LEDGER` 表。
> 檔案躺超過 3 天會被標出來——那是提醒，不是錯誤（多數卡在授權，不是卡在我們）。

待處理項目落在**兩個**不同的卡點，別混為一談：

- **`knowledge-*`（灶神／神祇列表）＝✅ 授權已解，改卡在資料與匯入器**。
  ⚠️ 這條的卡點換過**兩次**，別再引用舊敘述：
  ①「擋境外 IP」（早就不是，檔案 2026-08-01 就抓回來了）→
  ②「授權未定」（2026-08-06 已解，見下方）→
  ③ 現況：列表頁只有**截斷摘要**，iconography 的敘述在條目內頁，
  已由 `knowledge-deity-entries`（第一個 `url_list` 型 job）逐條抓，
  清單筆數跑 `node -e "console.log(require('./docs/intake-urls-knowledge.json').length)"` 看。
  🔴 **iconography 是把敘述讀成短語（如「腳踏龜蛇」），不是取欄位**——
  拿一篇樣本設計抽取規則再套到整批語料上會量產假資料，故等語料到齊再做。
- ~~**`local-celebration`**~~ → **已上線，不再是待處理項目**（2026-08-06 同日走完）：
  台灣端 2026-08-06 補齊全部 6 頁（cid 去重後與頁面自報筆數一致，sha256 逐檔複驗相符），
  分頁確認**用 GET 就能翻**、已改成一般 job → 這條線之後全自動；
  資料進 `src/data/local-celebrations.json`，頁面 `/festivals/local/`，
  並回灌節日頁與廟宇頁。決策脈絡與兩個實測踩過的配廟假陽性見
  [`decisions/festivals-and-intent.md`](decisions/festivals-and-intent.md)。以下授權判準仍適用：
  ⚠️ 它的授權**不能直接套慶(祭)典那套**：慶典能用是因為同一批事實另有 8209（OGDL 1.0）
  背書，而地方宗教慶典**沒有**對應的 data.gov.tw 資料集。站得住的只有
  「縣市＋曆別＋月日＋活動名稱」這層純事實；詳情頁只有簡介與照片
  （語文／攝影著作，2026-08-06 台灣端實看確認沒有主辦單位／地點／廟宇欄位），**不取**。
  🔴 **配廟不可用樸素字串比對**：2026-08-06 實測，標題含廟名者樸素比對會**配錯**
  （「東隆宮迎王平安祭典」會配到潮州鎮東隆宮，正主是東港東隆宮）——
  走既有的「廟名＋地址」消歧，同 `festivals` 匯入那套。

---

## 三、偵察結論（**別重做一遍**）

> 跑完整報告看第三段。這些是花過時間、確認過的結論，重做只是浪費。

要點摘記（細節在腳本的 `LEDGER`）：
- **`Festival.xml`（8209）不換來源**：授權乾淨但日期是裸 `MM/DD`、**沒有曆別**，且是 HTML 那份的子集。
  獨有「地址」欄 → 留作將來同名廟消歧的第三把鑰匙（現行消歧用「廟名＋電話」，電話不能進 repo）。
- **觀音一百籤**：線上無可用權威全文。唯一線索是國立臺灣文學館藏「觀音籤譜」`NMTL20060200544`，
  著錄明寫「第 1-100 首**龍山寺**籤詩」＝完整且版本錨定，**但未數位化**，要另外向該館申請。
  這正是 `CLAUDE.md` 說籤系「卡在版本錨定」的解法所在。
- **臺史博 33 件籤詩藏品清單**：將來擴籤系的線索池（`inbox/misc/TEMPLE-QIANBAN-LIST.md`）。
- **表單 payload／`url_list` 規格**：台灣端已實作自測，目前無 job 使用，要開直接拿。

---

## 四、放棄／暫停

- **`collections.culture.tw` — 結案**：17 組查詢跑完，該平台每一筆籤詩藏品都是
  「描述文字僅限公開瀏覽、圖像另需個案申請」＝看得到、抓得到、**不能轉載**。
- **沿革／建築特色／參拜流程 — 暫停（非永久）**：語文著作，不在任何開放資料集。
  2026-08-05 已依版權宣告第五條寄出洽詢函。**獲准前不抓、不匯入**；
  獲准後沿革、參拜流程、`Knowledge/*` 的 iconography 應**一批處理**（同一份授權、同一支匯入器）。
- **寺廟 `FoundationOdsReport`（ODS）— 不開 job**：比 `temple.xml` 多出的部分多是
  法人教會／基金會／宗祠，各自都有開放資料集。
- **CRGIS — 不刪 job**：中研院站台自 2026-07-30 起不通（台灣端亦然＝站台本身停擺，
  **不是境內外差異**）。已設 `_alert: false` 靜音，每輪仍重試。
  🔴 **是連不上，不是沒有資料——不得據此判定該來源無效。**

---

## 維護守則

1. **數字一律由腳本算**。這份文件與 `CLAUDE.md` 都不該出現會過期的數量。
2. **改處置方式 → 改 `scripts/intake-status.mjs` 的 `LEDGER`**，不要在多處各寫一份。
3. **改 manifest 前先讀 `docs/taiwan-host-handoff.md` §3.5 欄位契約**：
   台灣端遇到不認得的欄位會**整個停擺**（2026-08-01 事故換來的）。
   境外端專用的開關一律用底線開頭（`_alert` 等），台灣端會忽略。
4. **給台灣端的工單寫進 repo ≠ 送達**：用戶是唯一傳話人，同一則回覆就要附上可貼的指令。
5. **manifest 加新形態的 job → 同一回合檢查 `scripts/intake-ingest.mjs` 吃不吃得下。**
   兩端的契約不是只有台灣端那一半；我們這端一樣會因為欄位長得不一樣而整支倒下（見下方 2026-08-10）。

### 🔴 2026-08-06 → 08-10：那段時間「沒有警報」不代表健康

manifest v16 起，`url_list` 型 job **沒有 `dest` 欄位**（2026-08-10 實查為 `religion-photos`／
`knowledge-deity-entries`／`religion-jianzhu-sample`／`religion-yange`／`religion-jianzhu`），
而 `intake-ingest.mjs` 兩處都直接 `join(INBOX, j.dest)` → `TypeError`。後果有三層，
**第二、三層比第一層嚴重**：

1. 收件每小時 exit 1 → cron 發「台灣端投遞收件驗證失敗」。**崩潰偽裝成資料問題**，
   害台灣端把整個 `out/`（2026-08-10 台灣端回報 8,008 個檔）逐一 `sha256sum -c` 複驗
   （結果：資料與傳輸全乾淨，是我們的 bug）。
   ⚠️ 那則通報的 code fence 是**空的**——`grep '✗'` 抓到 0 行卻仍發出＝崩潰的簽名。
2. 崩在 job 陣列中段，**其後的 job 從未被處理過**——
   2026-08-10 實查：崩在第 14 個、後面 6 個一輪都沒跑到，其中 `religion-foundation-list` 有 200 頁。
3. `--status` 走同一個地雷，而 cron 的 `--stale` 分支用 `|| true` 吞掉 →
   **「台灣端沒在跑」與「抓到了但檔沒送達」兩道警報自 08-06 起靜默失效**，
   且失效本身不會叫人。判讀那段期間的歷史時，別把「沒收到警報」讀成「一切正常」。

已修（2026-08-10）：三種 job 形態各自分流；結束碼 1（資料驗不過）與 2（腳本自己壞了）
分開、cron 文案跟著分開；`--stale` 不再吞錯誤。細節與當初的判斷寫在
`scripts/intake-ingest.mjs` 檔頭與 `jobKind()`／`verifyDir()` 的註解。

---

## 附錄：管道建置的原始記錄（2026-08-06 自 CLAUDE.md 抽出，原文未改）

> - 收件：`/root/.config/folk-tw/intake/inbox/`（**repo 外**，因 temple.xml 含全台寺廟的
>   電話與負責人＝個資，而本 repo 為 public 且每日 seo cron 會 commit 整個工作區）
> - 處理：`scripts/intake-ingest.mjs`（驗 sha256＋expect → 原子 rename 上位 → 舊版進 archive；
>   **內容與現有上位檔相同就略過上位、不歸檔**）；`scripts/intake-watch-cron.sh`
>   （每小時 :07 收件、每日 01:20 UTC 查新鮮度）；排程 `/etc/cron.d/folk-intake`
> - 🔴 **新鮮度提醒的判準是台灣端回傳的 `state.json`，不是本地檔案 mtime**（2026-08-03 改，
>   commit `8e595aa`＋`d0ea634`）。只有**境外端能動手**的兩種情況發 Slack：①`state.json` 逾 36h
>   沒更新＝台灣端沒在跑 ②台灣端記錄抓取成功、sha 也與現有檔不同，檔卻沒進來＝rsync 那段斷了。
>   **來源掛了／來源沒更新一律不發**（用戶：「台灣端資料不一定會有更新，主要還是看資料來源」）。
>   病灶＝舊版只做 `ageDays(檔案)`，於是每天對著掛掉的中研院 CRGIS 發「台灣主機的抓取腳本可能
>   沒在跑」，而同一份 state.json 正寫著台灣端前一晚才跑過＝**指控錯的一方**。
>   已知停擺的來源在 manifest 加 `_alert: false` 靜音（目前只有 crgis）。
>   ⚠️ **境外端專用欄位一律底線開頭**——台灣端遇到不認得的 manifest 欄位會**整個停擺**
>   （handoff 3.5，2026-08-01 事故換來的）。
>   ⚠️ 「略過上位」與「靠 sha 判新鮮度」是**配套**：略過後 mtime 就凍住，只看 mtime 必然誤報。
> - ⚠️ **`expect` 的絕對下限擋不住殘檔**：2026-07-30 實測 5 MB 截斷檔（真檔 6.27 MB）通過
>   `min_bytes: 4000000` 並**覆蓋掉完整檔**（整份只剩前 5 MB），靠 archive 救回。
>   故必須有 `not_smaller_than_current_pct`（比現有檔小超過設定比例就不收，值見 manifest）與 `min_occurrences`
>   （整檔記錄筆數下限）兩道**相對**檢查。改 manifest 時別把這兩道拿掉。
> - ⚠️ 上位必須原子（寫暫存再 `rename`）：`/root/.config/folk-tw/temple.xml` 被
>   `/root/folk-outreach/outreach-daily.mjs` 每日 04:30 台北讀取，讀到半個檔會產生錯誤的外撥名單。
