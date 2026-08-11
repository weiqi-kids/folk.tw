# 2026-09—2027-09 月度發布計畫與編輯生產規格

> 這是一份編輯排程與審核規格，不是路由清單，也不是 sitemap 清單。全年可以先做研究、圖片與草稿，但只有通過來源與重複頁審核、取得 `publish_at` 的條目才可以進入發布 manifest。未到發布日的條目不得出現在 build、sitemap、Pagefind、RSS、站內導覽或 IndexNow。
>
> 盤點基準：2026-08-11（Asia/Taipei）。本文件只新增規格，不直接新增節日頁；日期、活動檔期與官方連結仍須在每次 release 前重新核對。

52 週的主題呈現與現有 canonical 對照，見 [`annual-52-week-map.md`](annual-52-week-map.md)。

目前 2026-08 至 2027-07 的實際正文與來源證據包已整理在
[`docs/topic-drafts/`](topic-drafts/README.md)，但仍是 `review-gate`，不代表已發布；
只有逐月補齊當年度一手公告、圖片授權、重複率與 production QA 後，才可把條目轉為
`scheduled`。

本計畫的驗收分成兩層，避免把「稿件完成」誤稱為「可發布」：`content-packet-complete`
表示每個週槽已有正文、facts、FAQ、canonical 與發布注意事項；`scheduled` 則還必須
完成逐句來源核對、當年度公告、圖片／OG／手機視覺、production build 與發布 manifest。
只有後者才代表「時間到可以直接發佈」。完整阻塞盤點見
[`annual-release-readiness.md`](annual-release-readiness.md)。

## 1. 狀態定義

| 狀態 | 意義 | 可否進入 build／sitemap |
|---|---|---|
| `idea` | 只有題目與搜尋意圖，尚未完成研究；不可視為承諾要做頁。 | 否 |
| `source_required` | 已確認值得研究，但缺少日期、儀式或主辦方的一手來源；可做研究卡，不可寫成定稿。 | 否 |
| `content-packet-complete` | 正文、facts、FAQ、canonical 與圖片／OG 規格已寫完；仍待逐句來源與年度資料核對。 | 否 |
| `ready` | 已有 canonical 頁、資料節點或事件頁；本年度只需補核定日期、年度活動資訊或來源更新。 | 既有頁可維持；不因年度刷新新增 URL |
| `scheduled` | 來源包、正文、圖片授權、重複頁審核與視覺檢查都通過，manifest 已有 `publish_at`。 | `publish_at` 前否，當日後是 |
| `published` | 已經過 production build 與線上驗證；後續只做年度刷新或事件後續。 | 是 |
| `merge_only` | 不建立新頁；把問題併入現有節日、習俗、神明或民俗活動 canonical。 | 否 |

`ready` 不等於「本月一定發布」，`source_required` 也不等於可以先用 AI 補日期。沒有一手來源時，日期欄保留「待核定」，不換算成看似精確的國曆日。

## 2. 目前可重用的 canonical 入口

現有 `src/data/festivals.json` 已經涵蓋一組可反覆更新的節日頁：

- 農曆七月叢集：`guimenkai`、`qixi`、`fangshuideng`、`zhongyuan`、`jilong-zhongyuan`、`qianggu`、`yimin`、`dizang`。
- 九月與中秋叢集：`september-solar-terms`、`zhongqiu`、`kinmen-bo-bing`、`kongzi-birthday`。
- 既有年度入口：`baitiangong`、`qingming`。

`src/lib/seasonal-campaigns.ts` 目前是 2026 年 8—9 月首頁與相關頁 CTA 的連續排程，不是全年內容 manifest。下一年度不得把候選議題直接塞進這個檔案；先完成本文件規定的來源包與審核，再由發布流程產生當月 campaign。

目前 `deities.json` 有神明聖誕與其他紀念日資料，但其中部分日期來自通行彙整，且同一神明可能有多個日期或地方差異；不能因此批次建立 94 個「神明生日」薄頁。`events.json` 的地方民俗活動已有可重用的事件入口（如青山王祭、媽祖遶境、保生大帝祭典、王船祭、搶孤等），應優先更新事件頁，而不是另造同義節日頁。`practices.json` 的 `pudu`、`zuo16`、`saomu`、`baizuxian`、`baitiangong`、`antaisui` 等是儀式 canonical，節日頁只保留該節日獨有的脈絡並連回習俗頁。

## 3. 來源包與生產契約

每個準備進入 `scheduled` 的條目，都要有一份可供 reviewer 重跑的 evidence packet：

1. **日期證據**：依類型使用中央氣象署（節氣／天文）、政府年曆或人事行政總處（固定紀念日／放假）、內政部宗教文化資料，或主辦廟／地方政府的當年度公告。農曆基準與國曆落點分開記錄。
2. **文化與儀式證據**：優先使用內政部全國宗教資訊網、臺灣宗教文化地圖、文化部文化資產局、地方文化局、博物館／學術典藏；儀式細節若屬單一廟宇，必須標示為該廟做法，不能泛化為全台規則。
3. **活動證據**：地方活動一定要有主辦廟、縣市政府或活動官方頁的年度檔期、地點與變更公告。社群貼文只能作發現線索，不能單獨支撐日期或交通資訊。
4. **圖像證據**：活動現場照片要有作者、授權與原始頁；沒有現場照時，只能用明確標示「通用視覺／非活動現場」的授權圖，不得把神像照當成活動紀實。
5. **寫作證據**：每個獨有主張逐句對應來源；至少三個相互獨立、不是換字重複的事實。來源不足的段落刪除，不用泛用 AI 敘述填長度。

可執行的 manifest 位於 [`annual-release-manifest.json`](annual-release-manifest.json)。它以 52 份週稿為來源，
只在需要年度資料的週次寫 override；未列出的週次套用 `blocked/source_required/pending` 預設值。
因此 manifest 永遠能對帳 52/52，但不會因為週稿存在就假造日期。每月建置會執行
`pnpm check:annual-release`，只有 `scheduled`、`date_status=verified`、`review_status=pass`
且 `publish_at` 正好是活動日前一個月的 canonical 才能進 queue。

manifest 的欄位契約如下：

```text
slug, canonical_intent, kind, release_month, publish_at, review_at,
date_basis, source_status, source_owners, source_urls, source_checked_at,
merge_into, image_status, reviewer_status
```

`kind` 僅能是 `evergreen`、`annual` 或 `event`。`date_basis` 要明寫 `lunar:MM-DD`、`solar:MM-DD`、`solar_term:name` 或 `official_announcement`；沒有核定日期時只能寫 `source_required`，不能先填推算出的 `publish_at`。

## 4. 月度候選與發布窗口

下表的「節日前 21—28 天」是相對窗口，不代表已核定的國曆日期。凡寫 `source_required` 的項目，窗口只用來安排採集與審稿，不得直接排程上線。

### 2026-09

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 中秋節（`/festivals/zhongqiu/`） | 中秋節哪一天、拜月娘／土地公供品與準備清單 | 節日前 21—28 天；節後保留 evergreen | `evergreen` + `annual` | 年度年曆；內政部宗教文化資料；地方廟宇做法只標地區 | `ready`／年度刷新 `source_required` |
| 金門中秋博狀元餅（`/festivals/kinmen-bo-bing/`） | 六骰規則、彩名、金門活動檔期 | 官方活動公告後、活動前 14—21 天 | `annual` + `event` | 金門縣政府、主辦單位／場館當年度公告 | `ready`／年度檔期 `source_required` |
| 孔子誕辰紀念日／教師節（`/festivals/kongzi-birthday/`） | 9/28 是什麼、祭孔釋奠流程與教師節關係 | 固定紀念日前 21 天 | `annual` | 政府紀念日規範；孔廟／教育單位當年度釋奠公告 | `ready`／年度儀式 `source_required` |
| 白露與秋分（`/festivals/september-solar-terms/`） | 節氣日期差異、農漁產與生活脈絡 | 白露前 14 天至秋分後 3 天 | `evergreen` + `annual` | 中央氣象署節氣／天文資料；農政或漁業官方資料 | `ready`／年度日期 `source_required` |

四頁已經覆蓋「中秋／博餅／教師節／九月節氣」四個不同意圖；不要再建立「中秋拜拜」「中秋月娘」「秋分日期」等同義薄頁，改用章節、FAQ 與相關連結承接查詢。

### 2026-10

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 重陽節／敬老祭祖 | 重陽節哪一天、登高／敬老與祭祖怎麼做 | 農曆日期核定後，節日前 21 天 | `evergreen` + `annual` | 年度年曆；內政部或地方文化資料；敬老活動由主辦機關公告 | `idea` → `source_required` |
| 下元節／水官解厄 | 下元節意義、與三官信仰的關係 | 農曆十月十五落點確認後、節日前 14—21 天 | `evergreen` + `annual` | 內政部宗教文化資料；寺廟／道教團體公告 | `idea`／先 `merge_only` 到三官神明與既有習俗頁 |
| 艋舺青山王祭（`/events/qingshan/`） | 暗訪、正日、活動地點與民俗資產 | 主辦方公告後、活動前 14—21 天 | `event` | 臺北市文化局、萬華區公所、艋舺青山宮當年度公告 | `ready`／年度檔期 `source_required` |
| 十月神明聖誕彙整 | 查某神明生日 | 全年聖誕曆維護，不另設十月專頁 | `evergreen` | 個別神明的官方／廟方證據；有諸說要並列 | `merge_only` |

### 2026-11

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 下元節（若國曆落於本月） | 日期與祭祀脈絡 | 依官方年曆落點倒推 21 天；不預填國曆 | `annual` | 同 2026-10；須避免兩個月各做一頁 | `source_required`／與 10 月候選共用 canonical |
| 二結王公過火（`/events/erjie_wanggong_guohuo/`） | 農曆十一月十五過火由來、參與資訊 | 當年度主辦方確認後、活動前 14—21 天 | `event` | 宜蘭縣政府／地方文化局、二結王公廟公告 | `ready`／年度資訊 `source_required` |
| 王船祭／王醮地方活動 | 某地王醮何時、路線與是否舉行 | 只在該年度確定舉行時倒推 21 天 | `event` | 主辦廟、縣市政府與文化資產公告 | `source_required`／各活動留在 `/events/` |

同一個「王爺／王船」概念不能做全台通用節日頁：各府千歲、王醮週期與日期不同，沒有當年度主辦方公告就不建立新 URL。

### 2026-12

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 冬至祭祖／湯圓 | 冬至哪一天、祭祖與家庭習俗 | 節氣核定後、節日前 14—21 天 | `evergreen` + `annual` | 中央氣象署節氣資料；文化／博物館或地方官方民俗資料 | `idea` → `source_required` |
| 送神、謝太歲與年末還願 | 送神／謝太歲何時、哪些是廟方服務 | 農曆年末日期核對後、節日前 14—21 天 | `annual` | 內政部宗教資料；各廟當年度服務公告 | `source_required`／優先併入 `antaisui` 與既有習俗頁 |
| 東山迎佛祖暨遶境（`/events/dongshan_yingfozu/`） | 農曆十二月送佛祖、路線與回鑾 | 廟方公告後、活動前 14—21 天 | `event` | 東山碧軒寺／地方文化局當年度公告 | `ready`／年度資訊 `source_required` |

### 2027-01

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 除夕祭祖／年節拜公媽（`/practices/baizuxian/`） | 除夕拜祖先供品、時間與流程 | 官方年曆核定後、除夕前 21 天 | `evergreen` + `annual` | 年度年曆；內政部／文化館藏；地方做法分區標示 | `ready`／年度日期 `source_required` |
| 安太歲、點燈（`/practices/antaisui/`、`/practices/diandeng/`） | 何時安太歲、點燈是什麼 | 年節前 14—28 天 | `evergreen` + `annual` | 內政部宗教文化資料；個別廟宇服務公告 | `ready`／廟方細節 `source_required` |
| 清水祖師聖誕祭典（`/events/sanxia_qingshui/`） | 三峽祖師公生日、遊境與活動 | 農曆日期確認後、活動前 14—21 天 | `event` | 三峽長福巖、地方文化局／政府公告 | `ready`／年度資訊 `source_required` |

不能把某一間廟的安太歲價格、供品或開放時段寫成「全台標準」；沒有廟方來源的欄位留白。

### 2027-02

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 拜天公／天公生（`/festivals/baitiangong/`） | 正月初九日期、頂桌下桌、供品與流程 | 正月初九前 21—28 天；子時說法要標資料來源 | `evergreen` + `annual` | 年度年曆；內政部宗教資料；廟方儀式公告 | `ready`／年度日期 `source_required` |
| 元宵節與地方燈／炮／寒單活動 | 元宵哪一天、各地活動如何區分 | 官方活動公告後、活動前 14—21 天 | `annual` + `event` | 縣市政府、活動主辦廟：鹽水、臺東、後龍等各自公告 | `ready`（事件頁）／年度資訊 `source_required` |
| 泛稱「元宵拜拜」 | 元宵供品與祈福 | 與元宵活動共用一篇或現有習俗頁 | `evergreen` | 需文化／宗教官方資料 | `merge_only`，沒有三個獨有事實不開新頁 |

### 2027-03

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 清明（`/festivals/qingming/`） | 清明日期、掃墓／培墓與祭祖準備 | 節氣前 21 天至節後 7 天 | `evergreen` + `annual` | 中央氣象署節氣；內政部／地方公墓與文化資料 | `ready`／年度日期 `source_required` |
| 媽祖遶境與聖誕季 | 大甲、白沙屯、北港等活動日期、報名／路線 | 擲筊或主辦公告後、活動前 14—28 天 | `event` | 各主辦廟、地方政府、文化資產官方頁 | `ready`（多個事件頁）／年度資訊 `source_required` |
| 觀音、文昌等神明生日 | 查神明生日與職司 | 全年神明頁更新，不另拆節日頁 | `evergreen` | 個別神明官方／廟方來源 | `merge_only` |

### 2027-04

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 保生大帝聖誕與保生文化祭（`/events/dalongdong_baosheng/`） | 保生大帝生日、遶境與祭典程序 | 主辦公告後、活動前 14—28 天 | `event` | 大龍峒保安宮、臺北市文化局、內政部文化資料 | `ready`／年度資訊 `source_required` |
| 媽祖遶境地方分支 | 各庄遶境日期、起駕／回鑾 | 每一場官方日期確認後倒推 14—21 天 | `event` | 各主辦廟與地方政府；不要以去年日期代今年 | `ready`／年度資訊 `source_required` |
| 保生／媽祖「生日大全」 | 一次查所有神明生日 | 與神明圖譜及既有事件頁互連 | `evergreen` | 個別來源與日期異說 | `merge_only` |

### 2027-05

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 端午節祭祖／香包與地方民俗 | 端午日期、祭祖與民俗差異 | 年度年曆核定後、節日前 21 天 | `evergreen` + `annual` | 年度年曆；文化部／地方文化資料；活動由主辦方公告 | `idea` → `source_required` |
| 大稻埕霞海城隍迎城隍（`/events/dadaocheng_chenghuang/`） | 暗訪、正日遶境與交通 | 官方公告後、活動前 14—21 天 | `event` | 臺北市文化局、主辦廟／地方政府公告 | `ready`／年度資訊 `source_required` |
| 新莊地藏庵文武大眾爺祭典（`/events/xinzhuang_dizangan_dazhongye/`） | 祭典日期、暗訪與民俗脈絡 | 農曆日期／當年度公告後 | `event` | 新北市文化局、廟方公告 | `ready`／年度資訊 `source_required` |

端午的「粽子」「立蛋」「龍舟」不要各開一頁；若查詢意圖相同，集中到一篇節日 guide，龍舟競賽則只保留有主辦方資料的事件頁。

### 2027-06

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 關聖帝君聖誕／大溪普濟堂遶境（`/events/daxi_pujitang_guangong/`） | 關帝生日、遶境與祭典 | 農曆日期與廟方公告後、活動前 14—21 天 | `event` | 大溪普濟堂、桃園市文化局／政府公告 | `ready`／年度資訊 `source_required` |
| 口湖牽水車藏（`/events/kouhu_qianshuizang/`） | 追思祭典日期、由來與參與方式 | 主辦公告後、活動前 14—21 天 | `event` | 雲林縣政府、口湖牽水車藏主辦單位 | `ready`／年度資訊 `source_required` |
| 泛稱「六月神明生日」 | 查多位神明農曆六月聖誕 | 神明頁聖誕曆集中承接 | `evergreen` | 個別神明官方／廟方來源 | `merge_only` |

### 2027-07

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 鬼門開至中元的整月叢集 | 鬼門開、七夕、放水燈、中元、搶孤、義民節、鬼門關日期與做法 | 農曆七月首日前 21—28 天；各事件各自公告 | `evergreen` + `annual` | 內政部／文化資產資料；基隆、頭城、恆春、新埔、地方主辦方年度公告 | `ready`／年度刷新 `source_required` |
| 雞籠中元祭（`/festivals/jilong-zhongyuan/`、`/events/jilong/`） | 儀式順序、字姓輪值、活動檔期 | 主辦公告後、活動前 14—28 天 | `event` + `annual` | 基隆市政府、慶安宮／主普壇官方公告 | `ready`／年度資訊 `source_required` |
| 民雄大士爺、頭城／恆春搶孤等地方活動 | 特定地點活動日期與規則 | 各地主辦公告後；不以中元節頁取代事件頁 | `event` | 縣市文化局／公所、廟方或主辦公告 | `ready`／年度資訊 `source_required` |

農曆七月八個既有節日頁已形成一個 cluster；普渡步驟由 `pudu` 習俗頁主講，其餘頁只寫各自獨有的日期、歷史、文資與地區差異，不能複製整套供品與禁忌。

### 2027-08

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 七夕／七娘媽生／做十六歲（`/festivals/qixi/`） | 七夕日期、七娘媽供品、成年禮流程 | 農曆七月初七前 14—21 天 | `evergreen` + `annual` | 內政部臺灣宗教文化地圖；開隆宮／地方文化資料 | `ready`／年度日期 `source_required` |
| 放水燈與中元前置儀式（`/festivals/fangshuideng/`） | 放水燈日期、對象與儀式意義 | 農曆七月十四前 14—21 天 | `evergreen` + `annual` | 國史館臺灣文獻館、文化資產局、基隆主辦方年度公告 | `ready`／年度資訊 `source_required` |
| 中元節／搶孤／義民節（既有頁） | 指定地點的普渡與活動細節 | 各主辦方公告後；不新增「中元供品大全」副本 | `event` + `annual` | 地方政府／主辦廟；事件頁各自掛源 | `ready`／年度刷新 `source_required` |

若 2027 的農曆七月主要落在 7 月或 9 月，仍依實際農曆換算調整首頁 campaign 月份；本表月份只代表預備與發布窗口，不是預填的國曆日期。

### 2027-09

| 候選議題／canonical | 搜尋意圖 | 窗口 | 類型 | 所需官方來源 | 狀態 |
|---|---|---|---|---|---|
| 中秋節（`/festivals/zhongqiu/`） | 中秋日期、拜月娘／土地公與供品 | 官方日期確認後、節日前 21—28 天 | `evergreen` + `annual` | 年度年曆；內政部宗教文化資料；廟方做法 | `ready`／年度刷新 `source_required` |
| 金門中秋博狀元餅（`/festivals/kinmen-bo-bing/`） | 博餅規則與當年度活動 | 主辦公告後、活動前 14—21 天 | `annual` + `event` | 金門縣政府／主辦單位 | `ready`／年度檔期 `source_required` |
| 孔子誕辰紀念日／教師節（`/festivals/kongzi-birthday/`） | 9/28、祭孔與釋奠流程 | 固定日以前 21 天 | `annual` | 政府紀念日規範；孔廟／教育單位公告 | `ready`／年度儀式 `source_required` |
| 白露與秋分（`/festivals/september-solar-terms/`） | 兩個節氣的日期、差異與季節脈絡 | 白露前 14 天至秋分後 3 天 | `evergreen` + `annual` | 中央氣象署與農漁業官方資料 | `ready`／年度日期 `source_required` |

## 5. 不製造薄頁、重複頁的合併規則

1. **一個問題一個 canonical。** 「哪一天／怎麼拜／供品」若指向同一節日，不因關鍵字改寫、年份或地區別名再開 URL；用同一頁的標題、FAQ、段落與內鏈承接。
2. **共享農曆日期只保留一份共享清單。** 同一日期的節日（例如農曆七月初一、十五）由主查詢頁承接共用廟宇／慶典清單；特定儀式頁只保留自己的文資、歷史與流程，不複製整段普渡內容。
3. **習俗、神明、活動分層。** 儀式步驟放 `/practices/`，神明生日與職司放 `/deities/`，當年度地方活動放 `/events/`，節日頁只補節日獨有的日期與文化脈絡。跨層只做有意義的關聯，不把同一段文字貼到三種頁型。
4. **事件日期不等於節日日期。** 廟方擲筊、輪值、路線或地方公告若尚未發布，保留 `source_required`；不得用上一年的日期、新聞摘要或農曆推算冒充今年活動檔期。
5. **神明生日不批次建頁。** 只有「生日」查詢仍未被神明 canonical 解決、且 evidence packet 能提供至少三個獨有事實與一手來源時，才提交新節日頁評估；諸說並存時標示差異，不選一個看似確定的日期。
6. **事件型頁不做永久新聞農場。** 同一事件的後續更新合併在既有事件頁；只有新的地點、主辦方、日期或明確可驗證的公共資訊才新增事件型頁，且必須設定生命週期與後續處理。
7. **薄頁硬門檻。** 沒有三個獨有事實、至少兩個可追溯來源、清楚搜尋意圖與可用圖片／授權，就回到 `idea` 或 `merge_only`；不能用 FAQ 改寫、泛用祝禱文或 AI 形容詞補足字數。
8. **年份不進 canonical slug。** 年度更新沿用同一 slug；只有不同事件或不同搜尋意圖才分頁。過期活動更新為歷年紀錄或合併，不留下大量 `2027-*` 薄頁。

## 6. 每月 release 流程（避免一次送大量 URL）

每月只處理一批已通過審核的 canonical；其餘全年草稿留在研究資料夾或未發布 manifest。建議節奏如下：

1. **T-42～T-28：研究批次。** 研究 subagent 只產生 evidence packet，不寫可直接上線的正文；確認日期系統、主辦方與來源更新日。
2. **T-28～T-21：寫作批次。** 寫作 subagent 只能引用 evidence packet；每句主張掛來源，補上搜尋意圖、FAQ、圖片授權與 `merge_into` 判定。
3. **T-21～T-14：兩道審查。** 獨立 reviewer 檢查日期／來源／安全措辭；另一個 reviewer 檢查跨頁 n-gram 重複、意圖蠶食、孤兒連結與是否誤把地方做法泛化。
4. **T-14～T-7：視覺與 build。** 確認 mobile／desktop、OG 圖、canonical、JSON-LD、sitemap 與站內入口；未到 `publish_at` 的候選必須在 build 產物中不存在。
5. **T-7～T+1：小批發布。** 預設每月新增不超過 2—4 個真正不同意圖的 canonical；年度刷新既有頁不算新 URL。首頁只放當月與下個窗口的少數 CTA。
6. **發布後：只提交已上線 URL。** `annual:release:due` 每日只讀取當月到期、已通過審核的 manifest 條目，最多 4 個去重 canonical；過去月份的 overdue 只報告、不自動追送。部署 workflow 會把這個小批清單送 IndexNow，絕不再把全站 sitemap 一次送出。Google 不吃 IndexNow，GSC 仍靠 sitemap／自然爬取或人工 URL Inspection，不能把 IndexNow 回應當成 GSC 收錄。

目前 manifest 已將 3 個有明確 2026 日期與既有 production canonical 的刷新槽設為 `scheduled`；其餘 49 個仍是 `blocked`，等當年度官方日期、活動公告或 production QA 完成後，才可逐筆加入 override。這是防止「整年先灌 52 個 URL」的硬閘門，不是把週稿漏掉。

### Release 完成條件

- `source_status=verified` 且每個日期都有日期系統與來源；地方活動有當年度主辦方證據。
- `reviewer_status=pass`：事實、日期、來源、重複率、搜尋意圖與內鏈均通過。
- 正文不是既有頁的換詞複製；共同儀式只在其 home canonical 展開。
- 有可用的授權圖片或明確的通用視覺說明，OG、alt、圖片 credit 齊全。
- `publish_at` 前，頁面、sitemap、Pagefind、RSS、內鏈、bot index、IndexNow 均查不到該 URL。
- production build 後以 HTTP、頁面標題、canonical、OG image、主要段落與行動版截圖驗證；任一項失敗即退回 `scheduled`，不可標 `published`。

這份清單的核心是「先備料，按意圖與證據小批釋出」，不是把全年候選當成全年路由。任何月份若沒有足夠的一手來源或獨有內容，該月可以只更新既有 canonical，整批候選維持 `source_required` 或 `merge_only`。
