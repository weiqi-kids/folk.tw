# 節日・民俗活動・意圖頁（情境／比較／行業）

> 節日日期一律由 `src/lib/lunar-date.ts` 在 build 時算、倒數由前端依台灣時區即時算，勿在頁面自行換算農曆。

> 2026-08-06 自 `CLAUDE.md` 抽出後再依主題拆分，**原文一字未改**。
> （中間曾短暫存在 `content-modules.md`，已於同日拆掉，該檔不存在。）
> ⚠️ **本檔是決策的歷史脈絡，不是現況規格。** 實作以程式碼與 gate 為準——
> 兩者不一致時**信程式碼**，並回頭在這裡標上更正。數字同理，一律跑指令查。
> 回索引：[`../README.md`](../README.md)｜總路由：[`../../CLAUDE.md`](../../CLAUDE.md)

## 目次

- **節日模組**
  - `/festivals/` 節日模組
  - 民俗活動續擴
  - 新港奉天宮官網
- **意圖頁：情境・比較・行業**
  - 情境頁＋比較頁
  - 行業守護神＋農民曆行業視角
- **名廟內容**
  - 名廟 沿革/聖誕 內容豐化
- **來源管道與掛源可複驗性（2026-08-19）**
  - nchdb 個案 id 掛錯事故與 check:source-refs
  - taiwangods／文獻館的授權風險與 grandfather 基準
  - 可用但還沒接的管道（觀光署 7778／記憶庫）

---

## 🔴 本檔的場景紅線 → 全文在 [`temples.md`](temples.md)

**陳述「神明的」事實，不替廟方宣稱活動。** 可寫／不可寫的對照表與理由，
**單一權威處在 [`temples.md`](temples.md) 的同名章節**——本檔不重寫一份
（2026-08-06 稽核發現這段原本在兩個檔逐字複製，正是同一次重整才收斂掉的漂移形態）。

一句話：可以說「該廟**登記了**這個祭典」「**這位神明的**聖誕是某日」；
不可以說「這些廟在過中元節」「本廟那天有辦活動」。


## 節日模組

- [x] **`/festivals/local/` 全台地方宗教慶典（2026-08-06 上線；slug＝永久承諾勿改）**：
      資料是內政部「地方宗教慶典」＝**縣市層級**政府登錄的慶典清單。
      🔴 **站上因此有三種互不相同的「慶典」事實，動手前先分清楚，它們不可互相推論**：
      | 資料 | 主體 | 來源 |
      |---|---|---|
      | `temples.json` 的 `festivals[]` | **廟**（廟方自己登記的年度祭典） | 慶(祭)典查詢＋8209 |
      | `festivals.json`（節日頁） | **節日**（全台性節俗） | 自建、逐條掛源 |
      | `local-celebrations.json`（本項） | **縣市**（政府登錄的地方慶典） | 地方宗教慶典 |
      - **授權與慶(祭)典那批不同，別套錯**：慶典能發佈是因為同一批事實另有開放資料 8209
        （OGDL 1.0）背書；**地方宗教慶典沒有對應的 data.gov.tw 資料集**，站得住的只有
        「縣市＋曆別＋月日＋活動名稱」這層純事實。詳情頁的簡介與照片是語文／攝影著作，
        **一個字都不取**——所以本頁**沒有也不會有**任何介紹文字，別替它們補寫。
        脈絡見 [`../taiwan-intake-status.md`](../taiwan-intake-status.md) §二。
      - **配廟只用規則消歧，對不上就留空**（`scripts/import-local-celebrations.mjs`）。
        🔴 這裡有兩個**實測踩過**的假陽性，規則就是為了擋它們：
        ① 初版在「縣市內找不到同名廟」時退回全國候選 → 「臺北保安宮—保生文化祭」被配到
        **臺中市北區**的保安宮。**縣市是權威欄位，不符就留空，絕不跨縣市配。**
        ② 鄉鎮消歧若允許單字詞幹，「北區」→「北」會命中「臺**北**保安宮」＝必然錯。
        故鄉鎮名去後綴後**至少 2 字**才拿來比對。
        另「東隆宮迎王平安祭典」屏東縣有 2 間同名且標題無鄉鎮線索 → **留空是正確結果**，
        別為了讓數字好看去放寬規則。
      - **回曆 2 筆（開齋節）刻意不換算**：伊斯蘭曆與國曆的對應逐年前移約 11 天，
        我們沒有可信換算源，硬算就是杜撰。頁面明寫「國曆日期逐年不同，本站不換算」，
        `check:rendered` 不變量 7 會驗這句在、且不得替它印出國曆日期。
      - **回灌兩處**（這是選這個方案的理由：一個新 slug，全部資料都被用到）：
        節日頁「同一天登錄的地方宗教慶典」（歸屬沿用 `festivalOwnerByLunarDate`，
        同一農曆日期只有一頁掛名單，否則 07-15 的中元節與搶孤會各帶一份一樣的清單）、
        廟宇頁「地方宗教慶典登錄」。
        🔴 **措辭**：只能說「這份清單收錄了以本廟為名的項目」，
        **不可**說「本廟舉辦」——登錄者是縣市政府不是廟方，我們也沒有任何一年的實際舉辦紀錄。
      - 全量 gate：`check:integrity`（曆別／日期存在／名稱漢字／`temple_ref` 不 dangling／有來源）
        ＋ `check:rendered` 不變量 7（三層**雙向**比對：該列的都列了、不該有區塊的廟頁沒有）。
        ⚠️ 兩道 gate 都**刻意不驗**「`temple_ref` 該有幾筆」——留空是正確行為，
        設數量門檻只會逼未來的人放寬消歧規則去湊數。

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
        ① **廟宇頁 →節日頁 238 → **606** 間（原文寫 678＝238＋440 直接相加，**重複計了 72 間**同時命中兩條規則的廟；2026-08-06 實查聯集為 606）**：原本只有 `festivalOwnerByLunarDate`（該廟登記祭典與節日**同天**）
        命中 238 間；改用 `festivals.json` 既有 `deity_refs` 反查**主祀神**再涵蓋 440 間
        （中元 221／拜天公 136／地藏 98／七夕 37／義民 36／清明 10／鬼門開 5 —— 2026-08-06 實查，原文四個數字略有出入，實測期望 440＝實得 440）。
        🔴 **措辭界線同 7/31 那條**：講的是「**神明**與節日的關係」（節日資料自己的 deity_refs、逐條掛源），
        **不是「這間廟在辦這個節日」**，頁面明寫「不是本廟的活動公告」；class 與 `fsame` 分開，
        `check:rendered` 既有不變量不受影響。
        ② **節日頁互連**：原本 10 頁彼此**完全不相連**、只各自連回樞紐＝十個並排的葉子。
        依既有 `season` 欄位分組互連，農曆七月那 7 頁成一叢集（`qianggu` 因此被 8 頁連到）。
        ⚠️ 起算日用**今天（台北）**而非本頁的 `iso`（`iso` 是本節日的下一次國曆日，拿它當起算點會把
        同月份、日期比它早的節日推到明年）；排序用 `lunar_date` 字串，**不可用農曆中文標籤 localeCompare**
        （「初一」「十五」「廿」排不出正確順序）。

- [x] **節日頁自我重複（2026-08-09，用戶裁示「頭部詞當一件事來打」後查出的根因）**：
      🔴 **這條推翻了上一條（8/03 補內鏈）對同一批頁的診斷，接手時先讀完再動手。**

      **當時的處置與結果**：8/03 判定 `qianggu` 等頁曝光為 0 是「缺內鏈」，於是補了廟宇頁→節日頁
      與節日頁互連兩層。**5 天後狀態沒有改變**——2026-08-09 逐頁 URL Inspection：
      `qianggu`／`qingming` 仍是 `Discovered - currently not indexed`，
      `jilong-zhongyuan` 甚至是 `URL is unknown to Google`，而它當時已經有 **191 頁**連過去。
      另有 `yimin`／`dizang` 收錄了但 GSC 7 天 **0 曝光**。
      ⚠️ **所以不要再重做一輪補內鏈**，入口不是瓶頸。

      **真正的原因是站內自我重複**。`pudu` 被 **7 個**節日頁的 `practice_refs` 指到
      （中元節／鬼門開／放水燈／雞籠中元祭／搶孤／義民／地藏），
      而 `festivals/[slug].astro` 原本一律把它的完整步驟＋供品＋金紙＋禁忌＋地區差異整組渲染，
      於是那 7 頁彼此高度重複。實測（與 `/festivals/zhongyuan/` 的 8 字片段重疊率）：
      | 頁 | 全頁重疊 | 只比 `<main>` 內文 | 索引狀態 |
      |---|---|---|---|
      | 搶孤 | 84.4% → 69.9% | 60.3% | ❌ Discovered, not indexed |
      | 雞籠中元祭 | 71.6% → 56.0% | 46.8% | ❌ unknown to Google |
      | 鬼門開 | 70.3% → 55.5% | 46.8% | ✅（臨界） |
      | 清明 | 29.9% | 12.5% | ❌（這頁用 `saomu`，不是重複問題，是**真的薄**：1,561 字、來源只有一筆維基） |

      🔴 **量重複要用「只比 `<main>` 內文」的數字**。全頁比會把 header／footer／nav 一起算進去，
      清明那欄的 12.5% 就是這套量法的樣板底噪——低於它才叫「不重複」。

      **處置**：`practices.json` 加 `home_festival`（`pudu` → `zhongyuan`），
      只有主場節日攤開完整內容，其餘節日頁改成一句摘要＋連到 `/practices/<id>/` 與主場節日。
      ⚠️ **沒設 `home_festival` ＝維持舊行為**，所以只需要替「被多頁共用」的儀式設；
      目前只有 `pudu` 需要（`zuo16`／`baitiangong`／`saomu` 各只被一個節日指到）。
      同時補「文化資產登錄」區塊（層級＋公告文號，取自 `events` 既有 `heritage`，此前完全沒渲染；
      ⚠️ 該區塊在**取得授權後**又擴充了登錄理由／歷史沿革／注意事項的逐字內容，見下方 2026-08-09 稍晚那段），
      那是各節日**真正獨有**的事實，正好補上去重後少掉的份量。
      🔴 措辭只說「被登錄為什麼、文號是什麼」，**不推論「所以當天有辦什麼」**（同本檔開頭的界線）。
      不變量 5d 進 `check:rendered`（**雙向**：主場頁少了會擋、非主場頁多了會擋、非主場頁沒指回正主頁也會擋），
      **三個反例逐一改 `dist` 實測會響、還原後安靜**。

      **✅ 2026-08-09（同日稍晚）：用戶取得文化部授權，敘述文字改為可用。**
      🔴 **這不是推翻上面那段查證**——「不在 data.gov.tw 開放資料集裡＝網站語文著作」的判定仍然成立，
      改變的是**授權狀態**。做法沿用內政部 2026-08-06 那次：**逐字引用、不改寫、每筆掛回個案公開網址**
      （`https://nchdb.boch.gov.tw/assets/overview/folklore/<caseId>`）。我們沒有立場替官方敘述做摘要，
      改寫反而引入杜撰風險（同 `deities` 的 `moi_knowledge` 欄位註解）。
      實得：頭城搶孤 登錄理由 208 字＋歷史沿革 278 字＋醮典三日各段說明；
      恆春搶孤 71＋324 字；雞籠中元祭 335＋137 字＋13 段儀式說明＋參觀注意事項。
      ✅ **授權條件已確認＝標示資料來源連結**，與內政部 2026-08-06 那次相同
      （2026-08-09 用戶明確確認：「文化部授權條件你沒錯！就是這樣！」——這是確認，不是我方推測）。
      🔴 **別再去問一次條件、也別因為「這是引用官方文字」就自行收回內容**，
      同 `taiwan-intake-status.md` 對內政部那條「別再去要公文文號」的教訓。
      不變量 5f 進 `check:rendered`：逐字內容要真的渲染、**且來源連結必須在同一頁**——
      少了連結就是違反授權，而那是不會有任何錯誤訊息的違反（同內政部那批的規格）。

      ⚠️ **仍未做完的部分**：去重讓那幾頁變薄（搶孤 `<main>` 內文剩 1,122 字），
      而且「相關詞彙／相關神明／相關宮廟」三個區塊在農曆七月那一叢**仍然互相重複**
      （同一批詞彙定義被逐頁完整印出）。要真的排上去，還需要替各頁補「只有它有」的掛源內容
      （搶孤的孤棚結構與頭城／恆春差異、雞籠中元祭的字姓輪值與開龕門），那是研究工作，**尚未開始**。

- [x] 民俗活動續擴（2026-06-24，21→**36 場**）：文化部文資逐筆查證新增 15 場（北中部 7＋南東離島 8，
      含金門迎城隍、南關線三大廟王醮 2 個國家重要民俗）；主辦廟「名稱＋鄉鎮」消歧後 10 場對映 temple id、
      5 場（多廟/委員會/同名難辨）留空不強連；二結王公主神古公三王無 deity 節點故留空（軟報表 35/36）。

- [x] 新港奉天宮官網（2026-06-24）：MOI 資料其實有 `moi_4080_財團法人台灣省嘉`＝新港奉天宮（舊註過時），
      已查證官網 `https://www.hsinkangmazu.org.tw/` 並填入 website＋掛源。

- [x] **Article／Discover 資料訊號：`datePublished`／`dateModified`／`author`／`image`（2026-08-12）**
      —— 目標是 Google Discover。初始盤點先強化既有節日頁，後續先補上
      `/festivals/chongyang/` 與 `/festivals/duanwu/`；在本次需求確認後，52 個草稿週槽全部各自
      轉成固定的 `/festivals/draft-week-XX-*/` 頁面，節日資料由 16 筆擴為 68 筆。這些草稿頁
      保留自己的搜尋意圖、facts、FAQ、日期狀態與 Discover 主圖；`merge_only`、`/events/` 或
      `/practices/` 仍是長期 canonical 的分流規則，不再用來否定草稿頁的存在，也不另造年份薄頁。

      **為什麼做這個**：2026-08-12 實測全站 `Article` schema **零個 `datePublished`**，
      而 Discover 對缺日期的 Article 幾乎不推。節日頁其餘條件當時已到位：
      `max-image-preview:large`（全站）、頁內 1200×630 插圖（`loading="eager"`／`fetchpriority="high"`）、
      `Article`＋`FAQPage` schema。當時缺的是日期與 author；2026-08-12 追加 Article 的
      專屬無字 1200×675（16:9）主圖，避免把帶大量文字的社群分享卡當成 Discover 縮圖。

      🔴 **兩個日期＝該筆資料的實際變動日**（初值由 git 歷史回推，之後手動維護），
      **不可改成 build 時間**——全站每日 cron 重建，掛 build 時間＝天天謊報全站更新，
      與 `astro.config.mjs` 只給 `/` 與 `/almanac` lastmod 是同一個取捨。
      `check:integrity` 驗格式與 `updated ≥ published`；忘記 bump 是低報（安全方向），不擋。

      🔴 **`author` 用既有 `ORG`（Organization），不掛個人姓名。** 本站條目是彙整＋逐條掛源，
      沒有具名撰稿者，掛人名就是杜撰署名（同廟宇代表圖「查不到署名就不採用那張圖」那條）。
      Google 明確接受 Organization 當 author。

      可見更新日放在 `<header class="dh">` 末，標籤**必須**寫「本頁資料更新」——
      這頁通篇在講節日日期，只印一個裸日期會被讀成節日日期。沿用 `.muted.small`，不新增 CSS。

      Article 的 `image` 使用同一份授權背景產生的 `/og/festivals/<slug>-clean.webp`（1200×675、16:9），
      分享用的 `/og/festivals/<slug>.png` 仍保留節名／日期／提問文字層；`postbuild` 兩者都產生，
      `check:rendered` 逐節日驗證網址與檔案存在。

      52 個草稿週槽已轉入 `festivals.json`，各自有官方／公立來源 facts、`published`／`updated`、canonical、
      Article／FAQ 結構化資料與無字 Discover 主視覺；其中 23 筆頁面沒有可安全換算的固定日期，會顯示
      「日期待官方公告」並隱藏假造的 Calendar／ICS 日期。當年度地方活動與官方日期仍維持 source-required，
      不把單一地方做法泛化成全臺規則。

      ⚠️ **這是技術補件，不是內容補件。** 用戶選這條時已被告知「常青頁很少進 Discover」，
      仍選擇尊重原設計。真正決定 Discover 會不會推的是內容與時效性，而那部分沒有做。

- [ ] **`/festivals/local/` 從未被收錄（2026-08-12 URL Inspection 實測）**
      —— 狀態 `Discovered - currently not indexed`、`lastCrawlTime` 空。
      🔴 CLAUDE.md 待辦表排了「2026-08-20 看 `/festivals/local/` 曝光再決定要不要擴縣市頁」，
      但**它還沒被收錄，8/20 不會有曝光可看**——到期時別把「沒有曝光」讀成「這個題目沒需求」而砍掉方向，
      那會是拿收錄問題的證據去否定需求假設。同日同批實測：搶孤與九月節氣已從 `Discovered` 翻成
      `Submitted and indexed`（所以這個狀態會自己好，只是慢）；基隆中元祭、清明、孔子誕仍未收錄。

## 意圖頁：情境・比較・行業

- [x] 情境頁＋比較頁（2026-07-07 commit `5d1c65a` 上線；AEO/GEO 高意圖突圍試點）：
      **情境頁** `/scenarios`（原文寫 4，**現為 8**：求姻緣/考試求功名/開店求財/搬家入厝，slug 永久承諾）＝新增 `scenarios`
      content collection（schema 同 trades），沿用「訴求→神明＋逐筆掛源」模式；情境→神明對應皆為該神
      **已掛源之職司本身**、來源沿用 repo 內既有權威源（**絕不杜撰**，未派網路研究）。affairs_yi 只挑有
      verified 宜票者（避恆空）。**比較頁** `/compare`（原文寫 3，**2026-08-03 已擴到 13**：月老vs註生娘娘/城隍vs土地公/文昌vs魁星）＝
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
      宜側僅 10 事項有 verified 資料（開市/出行恆空，check-integrity 有軟警告擋）　⚠️ **2026-08-06 更正：這句已過期**——2026-08-01 解掉 7 個（含開市與出行），現在恆空的只剩破土／開光／入殮 3 項，見 [`almanac.md`](almanac.md)。兩批各一次性 notify，
      **不**進每日 cron 高槓桿集，四週後看 GSC 再議。

## 名廟內容

- [x] 名廟 沿革/聖誕 內容豐化（2026-06-24）：temple schema 加 `founded`/`history`/`main_festival`＋
      詳情頁「沿革」區塊（有沿革者加 speakable）；21 間有官網名廟逐間查證（文化部文資/官網/維基）填入、各掛源。

## 來源管道與掛源可複驗性（2026-08-19）

> 這一節是 2026-08-19 兩次查證的產物：一次是「哪些權威源可用」的管道盤點，
> 一次是由它揭出的**已上線掛源錯誤**。兩者都改變了「產新頁時能掛什麼源」的前提。

- [x] **掛錯的 nchdb 個案 id（事故，已修並上線）**：`src/data/festivals.json` 有四個
      caseId 不存在於官方民俗名錄，分佈在三頁（`draft-week-16-yanshui-handan`／
      `draft-week-09-dongshan-yingfozu`／`draft-week-06-qingshan-king-festival`），
      commit `da84444`。
      🔴 **為什麼撐了約四個月沒被發現**：nchdb 前台 `assets/overview/folklore/<caseId>`
      是 Next.js SPA，**不同 caseId 回傳的 HTML 位元組數完全相同**（實測三個不同 id 皆
      39,690），且 robots.txt 404 → **HTTP 層拿不到「這個 id 不存在」的訊號**。
      而同一個 repo 別處（`temples.json`／`events.json`／`docs/topic-articles/week-06.md`／
      `week-16.md`／`annual-release-evidence/group-a.json`／`group-c.json`）**全都掛對**，
      只有對外的頁面資料錯——**沒有任何東西比對這兩組**。
      👉 已做成 gate：`check:source-refs`（規則 ①），拿 `src/data/nchdb-folklore-index.json`
      名錄快照比對。⚠️ 兩種書寫形式都要驗：個案網址，以及 `heritage.authority_ref`
      那種「府文資字第…號（nchdb <14 位>）」——第一次稽核只驗了網址形式，非網址形式漏在外面
      （後來補驗，那 7 個都是對的）。

- [x] **nchdb 有開放資料端點**（更正先前記載）：`https://data.boch.gov.tw/opendata/v2/assetsCase/5.1.json`
      為民俗類登錄個案，33 欄含 `registerReason`／`historyDevelopment`／`ceremonyFeature`／
      `ceremonies`／`activities`（國曆＋農曆起訖）／`announcementList`（公告文號）／
      `representImage` ＋ `representImageSource`（署名）。
      ⚠️ `scripts/gen-og-temples.mjs` 與 `docs/taiwan-host-handoff.md` 原本都寫「nchdb 無公開 API」，
      同日已就地更正——當初試的是**前台**常見端點，沒試到 `data.boch` 這個網域。
      🔴 **但 5.1 在 data.gov.tw 查不到資料集條目**，所以「它也是 OGDL」目前只是推測；
      現階段**繼續用 2026-08-09 那條個別授權的規格**（逐字引用、不改寫、每筆掛回個案網址）。

- [x] **`taiwangods.moi.gov.tw` 的授權是本站目前最大的來源風險**：版權宣告逐字寫
      「限於個人及非商業目的」「任何商業機構或團體，非經內政部以及各版面著作人書面同意，
      不得以任何形式轉載、重製、散布」。**它不在 2026-08-06 那份內政部同意書列舉的範圍內**
      （那份只列 `religion.moi` 的 `IndexID=2|3|4` 與 `ci=2`），而站主 2026-08-12 已定案
      不排除廣告投放 → **「非商業」這個前提對本站不成立**。
      ⚠️ `scripts/generate-topic-article-drafts.mjs` 的來源清單裡有一個 taiwangods 網址，
      那是**擴散源**（會再種進週稿），不只是一處引用。

- [x] **國史館臺灣文獻館（`th.gov.tw`）未查到明示授權**：主站著作權聲明抓不到（SPA＋常見路徑
      404，Wayback 同樣），子站僅「版權所有」，data.gov.tw 無其資料集。
      → **可摘述、不可逐字大段引用**。

- [x] **上面兩者做成 grandfather gate**（`check:source-refs` 規則 ③）：引用數**只能降不能升**。
      為什麼不直接禁：現況已有數百處，一刀切會讓所有部署紅燈，那不是擋錯誤、那是擋工作。
      改寫掉舊引用後把 `BASELINE` 往下調即可鎖住成果。等洽詢有結論再決定全禁或放行。

- [x] **逐字引用的來源網域改白名單制**（規則 ②）：只有 `religion.moi.gov.tw`（2026-08-06 同意）
      與 `nchdb.boch.gov.tw`／`data.boch.gov.tw`（2026-08-09 同意）可掛逐字。
      實測現況全部合規，所以這條訂得硬也不誤擋。

- [ ] **可用但還沒接的管道**：交通部觀光署 data.gov.tw 資料集 **7778「活動」**——OGDL 1.0
      （可商用）、每日更新、免金鑰，含起訖日期／地址／主辦／圖。
      ⚠️ 沒有宗教分類欄位，混著旅展與路跑（「五結走尪路跑」不是走尪祭典），**只能逐筆判斷**。
      國家文化記憶庫（`tcmbdata.culture.tw`）的民俗與宗教類**逐筆帶 `contentLicense`／
      `imageLicense`**，🔴 授權逐筆不統一（nchdb 來源那批是文字 OGDL、影像「僅限本平台瀏覽」
      ＝圖不可用），要用就逐筆讀那兩欄，不可整批推論。
      地方政府（台南／台中／屏東）**皆無**節慶結構化資料集，只能逐案抓網頁。
