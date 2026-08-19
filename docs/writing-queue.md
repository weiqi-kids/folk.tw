# 待撰寫清單

> **還沒寫的東西的單一清單。** 決策脈絡在 `docs/decisions/`，不在這裡。
> 寫完一項就從這裡刪掉，證據寫進對應的 commit 訊息。
>
> 🔴 **本檔不寫死任何數量**（`check:doc-numbers` 會擋）。要現況跑指令：
>
> ```bash
> # 地方宗教慶典各自有沒有專屬頁（對帳 page_ref ↔ events.json）
> node -e "const o=require('./src/data/celebration-occurrences.json').items,\
> e=new Set(require('./src/data/events.json').map(x=>x.id));\
> const p=o.filter(x=>x.page_ref);console.log('有對應頁的慶典',p.filter(x=>e.has(x.page_ref.id)).length,'/',p.length)"
>
> # 活動頁總數與有無文資登錄明細
> node -e "const e=require('./src/data/events.json');\
> console.log('活動頁',e.length,'｜有登錄個案',e.filter(x=>x.heritage?.case_id).length)"
>
> # 歷年舉辦紀錄的涵蓋
> node -e "const o=require('./src/data/celebration-occurrences.json').items;\
> console.log('有時間軸的項目',o.filter(x=>x.occurrences.length>=2).length,'｜總紀錄筆數',o.reduce((s,x)=>s+x.occurrences.length,0))"
> ```

---

## 🔴 動手前的共同前提

- **查無權威源就留空、絕不杜撰。** 這是本 repo 第一紅線。
- **「檔期查不到」不是不產頁的理由**——改用歷年舉辦紀錄時間軸
  （`src/data/celebration-occurrences.json` ＋ `OccurrenceTimeline.astro`）。
  2026-08-19 原本因此卡住的項目全部靠這個解掉。真正不產頁的只有一種：查無權威源。
- **逐字引用只准掛已授權網域**：`religion.moi.gov.tw`、`nchdb.boch.gov.tw`／`data.boch.gov.tw`、
  `taiwangods.moi.gov.tw`。其餘一律只能摘述（`check:source-refs` 規則②會擋）。
- **caseId 一律用 `src/data/nchdb-folklore-index.json` 驗**，不要 fetch nchdb 前台
  （SPA，不同 id 回傳相同位元組數，驗不出來）。⚠️ 古蹟案不是活動的登錄，不可當
  `heritage.case_id`（實際踩過兩次：千龜來朝、芝山巖過炭火）。
- **`note` 是 `<a>` 的可見文字**，不要塞查證備註、網址或維護語彙——`date_note` 同理，
  它渲染在活動頁與列表頁上（實際外洩過一次，讀者看得到「🔴 repo 的…不可沿用」）。
- 產頁走 `node scripts/build-events-from-batch.mjs <batch.json>`（乾跑預設）。

---

## ⏳ 待撰寫：查無權威源、暫不產頁的項目

> 🔴 **這些是「查證後判定不做」，不是「還沒做」。** 不要再排進待辦重查一次。
> 解鎖條件多半是同一個：請台灣端抓
> `religion.moi.gov.tw/LocalCelebration/Content?ci=96&cid=<N>` 詳情頁（本機連不上），
> 或向各該縣市民政局問登記的主辦宮廟。

| lc_id | 名稱 | 判定理由 |
|---|---|---|
| `lc_30` | 土地公春遊 | ⛔ 全部素材＝一句 24 字的活動簡介。 |
| `lc_41` | 「天降神子．真愛基隆」歡慶聖誕活動 | ⛔ 不該產頁，但**理由要改**：交辦說「看起來是地方政府辦的耶誕城／報佳音，不是宗教民俗」——查證後前半對、後半要修正。 |
| `lc_37` | 聖誕踩街報佳音活動 | ⛔ 不該產頁。同樣要修正交辦的前提：它**不是**「市府觀光活動」，內政部逐字寫的是縣府與天主教、基督教會**共同**舉辦——報佳音本身就是基督宗教實踐。不產頁的理由是素材：全部可掛源內容只有一句 40 字的概述，無登錄 |
| `lc_10` | 新北平安夜 | ⛔ 不該產頁。內政部詳情頁自己就把它定位成「新北市歡樂耶誕城系列活動的壓軸」＝市府大型節慶的一個節目，主辦是市府＋各教會。無文資登錄、無主辦宮廟、無可陳述的固定檔期、無合授權代表圖，且與本站「廟宇／漢人民俗」的內容軸完全 |
| `lc_31` | 三月初三帝爺生迎鬧熱呷拜拜 | nchdb 民俗搜「帝爺」只有、全是臺南／文化部的其他個案，宜蘭縣無此案；觀光署宜蘭活動裡沒有這一項；內政部清單本身無主辦欄位；8209 又是廟同日。 |
| `lc_22` | 天上聖母聖誕遶境 | 查不到主辦廟＝所有事實都掛不上源。 |
| `lc_40` | 天上聖母聖誕系列活動 | 同 lc_22：查不到主辦廟、查不到任何活動內容，三個開放資料源都給不出可掛的事實。 |
| `lc_39` | 釋迦佛祖聖誕暨建寺週年系列活動 | ⛔ 名稱不含寺名，主辦寺院無法辨識：nchdb 無案、觀光署活動資料無案、temples.json 花蓮廟中主祀釋迦且登記有農曆四月初八祭典者為 0。 |
| `lc_2` | 新北國際佛誕文化節 | ⛔ 目前站得住的事實只有『名稱＋新北市＋農曆四月初八』這一層，而那正是 /festivals/local/ 清單頁已經有的內容——產深頁等於複製清單頁，沒有任何獨有事實。 |
| `lc_26` | 開齋節 | ⛔ 兩個理由各自都足以否決：① 回曆不可換算，/events/ 的檔期欄位無法誠實填寫；② 這兩項的**活動本身**查無主辦單位公告，站得住的只剩一個名稱與縣市。 |
| `lc_17` | 臺北開齋節暨穆斯林嘉年華 | ⛔ 兩個理由各自都足以否決：① 回曆不可換算，/events/ 的檔期欄位無法誠實填寫；② 這兩項的**活動本身**查無主辦單位公告，站得住的只剩一個名稱與縣市。 |

---

## ⏳ D. 來源日期矛盾（剩餘）

`src/data/local-celebration-cases.json` 的 `date_conflict` 欄位記著哪些項目的來源日期
互相矛盾。多數已被歷年時間軸繞過（頁面本來就不宣稱年度日期），仍待處理的：

- ⚠️ `lc_3` 大甲媽起駕日由元宵擲筊決定，卻被記成固定農曆日期；時間軸已擋住錯誤陳述，
  但資料本身仍錯。`lc_46` 保安宮是差一日、兩者都指向同一活動，**刻意不覆蓋**。

> ✅ `lc_59` 嘉義市鞦韆節已於 2026-08-19 依站主裁示「拆」完成：那個農曆三月初六是
> 登錄民俗（`/events/xialutou_qiuqian/`）的屬性，市府版不再以它做任何日期陳述或月份分類。
> 作法是對帳檔新增 `date_disown`（**與 `date_override` 的差別＝歸屬錯誤 vs 數值錯誤，
> 前者沒有正確值可換、只能整個不陳述**），判定入口 `src/lib/local-celebration-cycle.ts`，
> 三個消費端與 gate 鏡像都問過同一支，並補了不變量擋回歸。

---

## ⏳ E. 授權與內容風險（剩餘）

- ✅ taiwangods 已於 2026-08-19 取得內政部確認授權，去函那件不必做了。
- ✅ **國史館臺灣文獻館（`th.gov.tw`）2026-08-19 經站主確認亦已授權**，條件比照前述＝
  標示資料來源連結。`check-source-refs.mjs` 的 `UNLICENSED`／`BASELINE` 因此清空
  （機制留著備用），該網域已進 `VERBATIM_ALLOW`。
  ⚠️ 授權事實**只寫在 `/about/` 的版權段**，各條目頁不另掛授權說明（站主 2026-08-19
  明示「不要又到處加」）——逐筆的來源連結本身就是履行條件。
  ⚠️ 站主未逐字轉述條款，本 repo 依前兩次的一致條件辦理；若實際更嚴，改
  `check-source-refs.mjs` 的 `VERBATIM_ALLOW` 註解並同步 `/about/`。

---

## 🅤 F. 站主已追認（別再列成待辦）

2026-08-19 站主追認：`speakable` 的兩個 selector **維持不收斂**、description 的兩個單位
**不修**（`/qiugian/` 頁型當時已修）。判定理由與追認都寫進了程式碼註解——
`src/lib/page-head.ts` 的 `ANSWER_BLOCKS` 檔頭、`src/lib/text-width.ts` 的
`SERP_DESC_TRUNCATION_WIDTH` 檔頭。要重開這兩件之前先讀那兩段。
