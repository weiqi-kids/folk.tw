# 節日・民俗活動・意圖頁（情境／比較／行業）

> 節日日期一律由 `src/lib/lunar-date.ts` 在 build 時算、倒數由前端依台灣時區即時算，勿在頁面自行換算農曆。

> 2026-08-06 自 `content-modules.md`（原 207 行）依主題再拆，**原文一字未改**。
> 回索引：[`../README.md`](../README.md)｜總路由：[`../../CLAUDE.md`](../../CLAUDE.md)

## 目次

- **節日模組**
  - `/festivals/` 節日模組（2026-07-30 commit `279c35
  - 民俗活動續擴（2026-06-24，21→36 場）：文化部文資逐筆查證新增 15 場（
  - 新港奉天宮官網（2026-06-24）：MOI 資料其實有 `moi_4080_財團法人
- **意圖頁：情境・比較・行業**
  - 情境頁＋比較頁（2026-07-07 commit `5d1c65a` 上線；AEO/G
  - 行業守護神＋農民曆行業視角（2026-07-02 commit `a09d6e2` 上線
- **名廟內容**
  - 名廟 沿革/聖誕 內容豐化（2026-06-24）：temple schema 加 `f

---

## 🔴 本檔的場景紅線：陳述「神明的」事實，不替廟方宣稱活動

這條從 `CLAUDE.md` 移過來（2026-08-06）——它只有在寫這類文案時才會被踩到，
所以放在這裡、你進來時才載入。**動任何面向使用者的文案前先讀這一段。**

| 可以說 | 不可以說 |
|---|---|
| 「該廟**登記了**這個祭典」（逐筆掛源、可反查） | 「這些廟在過中元節」 |
| 「**這位神明的**聖誕是農曆三月廿三」 | 「本廟那天有辦活動」 |
| 「當天有登記祭典的宮廟」 | 「當天有慶典的宮廟」 |

**為什麼**：我們手上只有「廟方向政府登記了什麼」與「神明的聖誕日是哪天」兩種事實。
把它們說成「這間廟在辦什麼」就是替廟方宣稱一件我們沒有證據的事＝杜撰（總紅線第 1 條）。
台灣實務上年度主祭典常常就是主祀神聖誕，主委看日期自然知道所指，**但我們不替他們斷言**。


## 節日模組

- [x] **`/festivals/` 節日模組（2026-07-30 commit `279c351` 上線；農曆七月季節戰役的承重項）**：
      用戶設定目標「2026-08-31 的 GA4 28 日活躍人數破 2 萬」（7/29 實測 3,189）。GSC 實查根因＝
      **全站曝光 ≥100 的「非廟名」查詢只有 1 個**（5,633 查詢中 4,175 是廟名）＝頭部詞覆蓋率為零，
      且週曝光已停滯（42,119→44,331，+5%）。28 日窗口（8/04–8/31）有 **19 天在農曆七月內**：
      **鬼門開 8/13、七夕 8/19、放水燈 8/26、中元節 8/27**（鬼門關/地藏王聖誕 9/10 在窗口外）。
      補的是 `practices.json` 早有 `festival_ref` 欄位卻**沒有對應模組**的懸空引用。
      - 5 筆＋樞紐：`zhongyuan`／`qixi`／`guimenkai`／`jilong-zhongyuan`／`fangshuideng`，
        **slug＝永久承諾勿改**。仿 `/compare/` 純 JSON 模式（`src/data/festivals.json`，非 collection——
        所連的 practices/events/deities 三者都已有 Zod schema 與掛源閘，新建 collection 不多驗證任何東西）。
      - **日期一律由 `src/lib/lunar-date.ts` 的 `lunarToNextSolar()` 在 build 時算**，倒數由
        `FestivalCountdown.astro` 依台灣時區前端即時算（同 `UpcomingBirthdays` 機制，故 `[skip ci]`
        不部署的日子倒數也不會過期）。**勿在頁面自行換算農曆**。
      - ⚠️ **`src/lib/lunar-date.ts` 刻意零專案內 import**（連 `almanac/dates` 的 `addDays` 都不接，
        改用 lunar-javascript 自己的 `Solar.next()`）：`birthdays.ts` 依賴 `astro:content`，
        `scripts/check-rendered.mjs` 無法載入它 → 若不抽出來，gate 就得自己重寫一份日期邏輯（＝新的漂移源）。
      - 第二批已於同日一併完成（原排 8/3–8/5，無技術相依擋著、越早收錄越好，故不分批）：
        `qianggu`（頭城＋恆春搶孤）／`yimin`（義民祭 9/1）／`dizang`（七月三十，本年短月順延廿九 9/10，
        同日為鬼門關）／`baitiangong`（正月初九）／`qingming`（清明）＝**共 10 頁**。
      - ⚠️ **節氣型節日**：清明是節氣、不是農曆固定日（由太陽黃經定，國曆約 4/4–4/6，農曆日期逐年不同）。
        故 schema 為 **`lunar_date` 與 `solar_term` 恰二選一**（integrity 硬驗，且 solar_term 須為
        二十四節氣之一）；兩種型別由 `festivalNextSolar()` 統一，**頁面與 gate 都不自行判斷型別**。
      - ⚠️ **跨多日用明確的 `multi_day` 欄位，不可用 `Boolean(date_note)` 推斷**：date_note 也用來寫
        純說明（地藏王的短月順延、搶孤的頭城/恆春異地異日），初版誤推斷而產生
        「地藏王菩薩聖誕｜農曆七月三十起・儀式順序」這種與事實不符的標題。目前僅雞籠中元祭為 true。
      - **2026-08-03 補內鏈（commit `a030482`）**：GSC 實查 10 頁 **28 天曝光合計 = 0**，內容完整、
        多數也已收錄（8/1–8/3 才第一次被爬），缺的純粹是內鏈——`qianggu` 甚至是
        「URL is unknown to Google」＝孤兒。補了兩層：
        ① **廟宇頁 →節日頁 238 → 678 間**：原本只有 `festivalOwnerByLunarDate`（該廟登記祭典與節日**同天**）
        命中 238 間；改用 `festivals.json` 既有 `deity_refs` 反查**主祀神**再涵蓋 440 間
        （中元 219／拜天公 137／地藏 93／七夕 37／義民 36／清明 10／鬼門開 6，實測期望 440＝實得 440）。
        🔴 **措辭界線同 7/31 那條**：講的是「**神明**與節日的關係」（節日資料自己的 deity_refs、逐條掛源），
        **不是「這間廟在辦這個節日」**，頁面明寫「不是本廟的活動公告」；class 與 `fsame` 分開，
        `check:rendered` 既有不變量不受影響。
        ② **節日頁互連**：原本 10 頁彼此**完全不相連**、只各自連回樞紐＝十個並排的葉子。
        依既有 `season` 欄位分組互連，農曆七月那 7 頁成一叢集（`qianggu` 因此被 8 頁連到）。
        ⚠️ 起算日用**今天（台北）**而非本頁的 `iso`（`iso` 是本節日的下一次國曆日，拿它當起算點會把
        同月份、日期比它早的節日推到明年）；排序用 `lunar_date` 字串，**不可用農曆中文標籤 localeCompare**
        （「初一」「十五」「廿」排不出正確順序）。

- [x] 民俗活動續擴（2026-06-24，21→**36 場**）：文化部文資逐筆查證新增 15 場（北中部 7＋南東離島 8，
      含金門迎城隍、南關線三大廟王醮 2 個國家重要民俗）；主辦廟「名稱＋鄉鎮」消歧後 10 場對映 temple id、
      5 場（多廟/委員會/同名難辨）留空不強連；二結王公主神古公三王無 deity 節點故留空（軟報表 35/36）。

- [x] 新港奉天宮官網（2026-06-24）：MOI 資料其實有 `moi_4080_財團法人台灣省嘉`＝新港奉天宮（舊註過時），
      已查證官網 `https://www.hsinkangmazu.org.tw/` 並填入 website＋掛源。

## 意圖頁：情境・比較・行業

- [x] 情境頁＋比較頁（2026-07-07 commit `5d1c65a` 上線；AEO/GEO 高意圖突圍試點）：
      **情境頁** `/scenarios`（4：求姻緣/考試求功名/開店求財/搬家入厝，slug 永久承諾）＝新增 `scenarios`
      content collection（schema 同 trades），沿用「訴求→神明＋逐筆掛源」模式；情境→神明對應皆為該神
      **已掛源之職司本身**、來源沿用 repo 內既有權威源（**絕不杜撰**，未派網路研究）。affairs_yi 只挑有
      verified 宜票者（避恆空）。**比較頁** `/compare`（3：月老vs註生娘娘/城隍vs土地公/文昌vs魁星）＝
      全衍生自 `src/data/comparisons.json`＋`deities.json` 已掛源欄位、零新增事實。兩類皆 answer-first
      H1＋speakable＋FAQPage。nav 加「怎麼拜」入口；check-integrity 硬驗 scenarios/comparisons 之
      deity_ref/affairs/related_scenario。一次性 notify（Google 9＋IndexNow 9 皆成功），**不**進每日 cron
      高槓桿集。**關注方式（用戶指示）＝每週週報固定追蹤，不等四週**：seo-ops 站台設定
      `sites/folk.tw.json` 已加 `watchGroups`（`/scenarios/`、`/compare/`）＋兩組代表頁進
      `trackUrls`/`flagship`，週報新增「🎯 頁組關注」段（收錄率＋曝光/點擊 WoW＋冒出的查詢，
      commit seo-ops `77cab90`）；下週一 09:30 週報起生效。**是否擴更多頁**再依週報數據判斷（勿平均擴張）。
      未做：神明頁反連情境/比較（留每日大腦漸進補）。

- [x] 行業守護神＋農民曆行業視角（2026-07-02 commit `a09d6e2` 上線；2026-07-03 擴充至 12 頁）：`/trades` 樞紐＋
      12 行業頁（scholars/business/healthcare/maritime/construction/agriculture/engineers[現代延伸]＋第二批
      performers/educators/uniformed-services/beauty/civil-servants[現代延伸]，**slug＝永久承諾勿改**）；
      月份樞紐加「本月各行業吉日」（零新頁）。守護神對映在 `src/data/trades.json` 逐筆掛源（第二批全部經
      agent 直抓查證；已排除命理香業[用戶指示]/餐飲[易牙無台灣信仰現場]/花卉/特種行業）；
      **M3 verified 篩選唯一入口＝`src/lib/almanac/select.ts`**（勿另建判定）；
      宜側僅 10 事項有 verified 資料（開市/出行恆空，check-integrity 有軟警告擋）。兩批各一次性 notify，
      **不**進每日 cron 高槓桿集，四週後看 GSC 再議。

## 名廟內容

- [x] 名廟 沿革/聖誕 內容豐化（2026-06-24）：temple schema 加 `founded`/`history`/`main_festival`＋
      詳情頁「沿革」區塊（有沿革者加 speakable）；21 間有官網名廟逐間查證（文化部文資/官網/維基）填入、各掛源。
