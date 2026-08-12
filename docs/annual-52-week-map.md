# 52 週主題呈現盤點

> 這是「編輯週槽」與 52 個草稿頁的對帳表。每週只選一個主要搜尋意圖；已有
> canonical 的週次做年度刷新或事件更新，另以固定的 `/festivals/draft-week-XX-*/`
> 路由承接完整草稿。沒有來源的年度欄位停在 `source_required`，不用 AI 補日期，
> 也不把同義查詢再拆成年份薄頁。實際 `publish_at` 仍要等當年度官方資料核對後才填。
>
> 盤點基準：2026-08-12（Asia/Taipei）。目前 `festivals.json` 有 68 個節日頁（16 個既有頁＋52 個草稿頁）、
> 另有 36 個民俗活動頁、
> 12 個習俗頁、8 個情境頁、13 個比較頁與 94 個神明節點；表內的「已發佈」是指可重用
> 的 canonical，不代表該週的年度資訊已更新；草稿頁的固定 route 已在 repo build 內實作。

## 狀態與判讀

| 狀態 | 意義 | URL 政策 |
|---|---|---|
| `published-refresh` | 已有 canonical；本週只更新日期、當年度公告、來源或 FAQ。 | 不新增 URL |
| `published-merge` | 已有頁型可承接意圖，改用章節、FAQ 或內鏈。 | 不新增 URL |
| `published-watch` | 已有頁面但要看 GA4/GSC、事件後續或收錄狀態再調整。 | 不新增 URL |
| `source_required` | 頁面或 packet 已存在，但缺當年度一手來源、地方活動欄位或獨有事實；不能把空缺填成猜測。 | 草稿 route 可建置；年度確定資訊不進 release queue |
| `review-gate` | 內容仍需通過來源、重複率、圖片與視覺審查。 | 不宣稱 production 已發布；不另造年份 URL |
| `implemented-local` | `draft-week` 頁面、資料、OG／Discover、canonical 與 repo gate 已完成。 | 可進 build／sitemap；仍須部署後驗證 |

## 52 個編輯週槽

| 週 | 主題／主要意圖 | canonical／呈現位置 | 現況 | 這週要做什麼 |
|---:|---|---|---|---|
| 01 | 白露、秋分日期與差別 | `/festivals/september-solar-terms/` | `published-refresh` | 以中央氣象署資料更新日期與農漁脈絡；不另開「秋分日期」頁。 |
| 02 | 中秋節日期、拜月娘與土地公準備 | `/festivals/zhongqiu/` | `published-refresh` | 年度日期、清單與連假資訊核對；維持單一中秋 canonical。 |
| 03 | 金門博狀元餅規則與活動檔期 | `/festivals/kinmen-bo-bing/`、`/events/kinmen_yingchenghuang/` | `published-refresh` | 只等金門縣政府／主辦方當年度公告，不沿用去年的活動日。 |
| 04 | 教師節、孔子誕辰與祭孔釋奠 | `/festivals/kongzi-birthday/` | `published-refresh` | 更新教育／孔廟公告與儀式差異；不拆「教師節日期」副頁。 |
| 05 | 重陽日期、敬老與祭祖 | `/almanac/`（歲時總覽中的重陽章節） | `review-gate` | 以歲時總覽承接重陽日期、敬老與祭祖脈絡；年度日期與地方活動依官方公告刷新。 |
| 06 | 艋舺青山王祭：暗訪與正日 | `/events/qingshan/` | `published-refresh` | 等臺北市文化局、區公所與廟方公告後更新檔期、地點與變更。 |
| 07 | 下元節與三官信仰 | `/deities/`、相關習俗頁 | `published-merge`／`source_required` | 先確認是否有獨立搜尋意圖；優先合併，不因「下元節日期」另造薄頁。 |
| 08 | 王醮、王船祭的地方差異 | `/events/xigang/`、`/events/donggang/`、`/events/anding_zhenhugong_wangchuan/` | `published-watch` | 各活動只用自己的主辦方資料；禁止建立「全台王船祭」通用頁。 |
| 09 | 東山迎佛祖暨遶境 | `/events/dongshan_yingfozu/` | `published-refresh` | 取得碧軒寺／地方政府年度公告，再更新日期與路線。 |
| 10 | 冬至日期、祭祖與湯圓 | `/almanac/`（歲時總覽中的冬至章節） | `review-gate` | 以歲時總覽承接冬至日期、祭祖與湯圓脈絡；年度天文日期依官方資料刷新。 |
| 11 | 送神、謝太歲與年末還願 | `/practices/antaisui/`、`/practices/buyun/` | `published-merge` | 把「廟方服務」與民俗通說分開；不做年末服務大全薄頁。 |
| 12 | 除夕祭祖、拜公媽 | `/practices/baizuxian/` | `published-refresh` | 更新年曆與區域做法來源；維持習俗 canonical，不另開除夕節日頁。 |
| 13 | 安太歲、點燈與祈安 | `/practices/antaisui/`、`/practices/diandeng/` | `published-refresh` | 只補有廟方來源的服務時間／方式；不得泛化成全台統一規則。 |
| 14 | 拜天公、正月初九與供桌 | `/festivals/baitiangong/`、`/practices/baitiangong/` | `review-gate` | 先補三個逐句掛源 facts，再做年度日期刷新；暫不新增同義頁。 |
| 15 | 元宵節與地方燈／炮活動 | `/events/yanshui/`、`/events/taitung_handan/` | `published-refresh`／`source_required` | 一般元宵問題先研究；鹽水、寒單各自使用主辦方公告，不建「元宵大全」。 |
| 16 | 鹽水蜂炮、臺東寒單 | `/events/yanshui/`、`/events/taitung_handan/` | `published-refresh` | 更新活動公告、參與與安全資訊；事件頁各自維持 canonical。 |
| 17 | 大甲、白沙屯媽祖進香 | `/events/dajia/`、`/events/baishatun/` | `published-refresh` | 只在擲筊／主辦方公告後更新起駕、回鑾與路線。 |
| 18 | 北港迎媽祖與北港進香差異 | `/events/beigang/` | `published-refresh` | 區分朝天宮地方迎媽祖與各地進香團；更新年度公告，不把不同媽祖進香合成一個活動頁。 |
| 19 | 內門宋江陣與地方藝陣 | `/events/neimen/` | `review-gate` | 已列入缺稿補寫；以文化資產資料與主辦方公告補年度檔期，保留羅漢門迎佛祖與宋江陣的名稱邊界。 |
| 20 | 清明日期、掃墓與培墓 | `/festivals/qingming/`、`/practices/saomu/` | `published-merge` | 節日頁回答日期與脈絡，習俗頁回答步驟；兩頁不複製正文。 |
| 21 | 清明祭祖的區域做法 | `/practices/saomu/`、`/practices/baizuxian/` | `published-merge` | 只補有來源的區域差異；沒有來源就不擴寫成全台規則。 |
| 22 | 保生大帝聖誕與保生文化祭 | `/events/dalongdong_baosheng/` | `published-refresh` | 更新保安宮／文化局年度活動；生日資料留在神明頁。 |
| 23 | 三峽清水祖師聖誕祭典 | `/events/sanxia_qingshui/` | `published-refresh` | 取得長福巖與地方公告後更新活動資訊。 |
| 24 | 大稻埕霞海城隍迎城隍 | `/events/dadaocheng_chenghuang/` | `published-refresh` | 更新暗訪、正日與交通；不另建「五月十三日期」頁。 |
| 25 | 學甲上白礁暨刈香 | `/events/xuejia_shangbaijiao/` | `review-gate` | 已列入缺稿補寫；以國家重要民俗資料與學甲慈濟宮公告更新年度程序。 |
| 26 | 大甲、白沙屯、北港媽祖進香差異 | `/events/`（dajia、baishatun、beigang 等） | `published-watch` | 比較三場進香差異，日期、路線與服務分別依各自主辦廟公告更新。 |
| 27 | 端午日期、祭祖與香包／龍舟區分 | `/almanac/`（歲時總覽中的端午章節） | `review-gate` | 以歲時總覽承接端午日期、家庭習俗與地方活動差異；年度公告與圖片資訊依主辦方刷新。 |
| 28 | 關聖帝君聖誕與大溪遶境 | `/events/daxi_pujitang_guangong/`、`/deities/` | `published-refresh` | 事件頁更新年度檔期，神明頁承接生日與職司，不複製。 |
| 29 | 口湖牽水車藏 | `/events/kouhu_qianshuizang/` | `published-refresh` | 更新雲林縣政府／主辦方公告；追思脈絡與參與資訊分層。 |
| 30 | 東港迎王、西港香 | `/events/donggang/`、`/events/xigang/` | `review-gate` | 西港已有研究卡，東港另補獨立正文；兩地週期、王船與主辦廟分開掛源，不合併成通用日期。 |
| 31 | 南關線王醮與地方王船祭 | `/events/nanguanxian_wangjiao/`、`/events/anding_zhenhugong_wangchuan/` | `published-watch` | 依各主辦方公告維護；沒有公告的年度維持歷年資料，不預測今年。 |
| 32 | 玄天上帝香期與地方進香 | `/events/mingjian_shoutiangong_xuantian/` | `review-gate` | 已列入缺稿補寫；更新受天宮／地方公告，玄天上帝職司回到 `/deities/`。 |
| 33 | 求平安、收驚與補運的信仰邊界 | `/scenarios/qiu-pingan/`、`/practices/shoujing/`、`/practices/buyun/` | `review-gate` | 寫清信仰脈絡、服務差異與不可承諾的醫療效果；不新增症狀型薄頁。 |
| 34 | 求姻緣、求子與神明分工 | `/scenarios/qiu-yinyuan/`、`/scenarios/qiu-zi/`、`/compare/` | `review-gate` | 以月老／註生娘娘的職司差異承接查詢，不把不同祈願混成單一求願清單。 |
| 35 | 搬家入厝、安神位與儀式分層 | `/scenarios/banjia-ruzhai/`、`/practices/ruocuo/`、`/practices/anshenwei/` | `review-gate` | 區分搬家情境、入厝與安神位步驟；廟方服務細節逐廟掛源。 |
| 36 | 收驚、補運與祭解的差異 | `/practices/shoujing/`、`/practices/buyun/` | `review-gate` | 以來源說明名詞、流程與信仰界線，避免療癒套語或保證效果。 |
| 37 | 七夕、七娘媽與做十六歲 | `/festivals/qixi/`、`/practices/zuo16/` | `published-refresh` | 農曆日期與年度活動分開核對；節日頁不重複完整成年禮步驟。 |
| 38 | 鬼門開、開龕門與起燈腳 | `/festivals/guimenkai/`、`/events/jilong/` | `published-refresh` | 更新官方文化資料與當年度公告；維持節日／事件兩層。 |
| 39 | 放水燈與中元前置儀式 | `/festivals/fangshuideng/`、`/events/jilong/` | `published-refresh` | 只寫基隆／特定地方有來源的做法，不泛化成全台普渡流程。 |
| 40 | 中元普渡日期、供品與順序 | `/festivals/zhongyuan/`、`/practices/pudu/` | `published-merge` | 中元頁回答節日與日期，pudu 頁承接完整步驟；避免七月頁互貼。 |
| 41 | 雞籠中元、民雄大士爺、搶孤、義民節 | `/festivals/jilong-zhongyuan/`、`/events/jilong/`、`/events/minxiong_dashiye/`、`/festivals/qianggu/`、`/events/yimin/` | `published-refresh` | 更新各自文資／主辦公告；特有歷史與地區差異留在各 canonical，不合併成中元大全。 |
| 42 | 地藏王聖誕與鬼門關 | `/festivals/dizang/`、`/deities/` | `review-gate` | 先核短月標籤與年度來源；不新增「鬼門關日期」副頁。 |
| 43 | 神明生日異說與來源並列 | `/deities/`、神明頁 birthday | `review-gate` | 寫清農曆／國曆、地方異說與來源層級；不批量生成神明生日薄頁。 |
| 44 | 神明比較：職司差異而非靈驗排名 | `/compare/` | `review-gate` | 以媽祖／觀音／關帝等比較頁回答職司與信仰類別，不做靈驗排名。 |
| 45 | 求願情境：考試、姻緣、開店與健康 | `/scenarios/` | `review-gate` | 以情境分流到已有神明與習俗頁，不把祈願寫成結果保證。 |
| 46 | 農民曆宜忌怎麼讀 | `/almanac/`、`/almanac/month/` | `review-gate` | 說明節氣、建除、日干支與宜忌的資料邊界，不把黃曆建議寫成命令。 |
| 47 | 如何選廟：主祀、祭典與參拜資訊 | `/temples/`、`/temples/region/`、`/temples/nearby/` | `review-gate` | 教讀者讀內政部資料、主祀神、年度祭典與開放資訊，不批量複製廟頁。 |
| 48 | 地方民俗文化資產怎麼看 | `/festivals/local/`、`/events/` | `review-gate` | 解釋登錄等級、保存者、祭典週期與年度公告的差別。 |
| 49 | 祈福事件後續如何查證 | `/qiugian/` | `review-gate` | 說明事件更新、來源時間與合併規則，避免重複開相同事件頁。 |
| 50 | 籤詩、典故與籤系如何閱讀 | `/poems/` | `review-gate` | 以籤文、典故與籤系脈絡讀解，不把單句籤詩當成絕對預言。 |
| 51 | 儀式詞彙差異：遶境、進香、刈香和迎王 | `/vocabulary/` | `review-gate` | 做名詞與流程分流，將廟方服務與民俗通說分開掛源。 |
| 52 | 臺灣歲時年表：節氣、農曆與地方祭典 | `/almanac/` | `review-gate` | 以全年歲時脈絡作導覽主題，不把 GA4／GSC 操作當文章內容。 |

## 盤點結論

- 這次把週次重新分成「真正內容主題」：第 19、25、30、32 週的缺稿已補入 [missing-weeks.md](topic-drafts/missing-weeks.md)；原本被誤列為維護工作的第 33–36、43–52 週，已改成可閱讀、可審稿的主題並寫入 [content-themes-33-52.md](topic-drafts/content-themes-33-52.md)。
- 目前 52 個週槽都有明確搜尋意圖、承接位置、寫作方向與一個固定 `draft-week` route；這 52 個 route 是本次需求指定的草稿頁，不是 52 個年份頁，也不取代已有 canonical 的長期主場。
- 品質 gate 要求新／年度內容有清楚 intent、至少 3 個不重複且逐句掛源 facts、可追溯來源、圖片／OG／授權與跨頁重複審查；當年度日期、路線、服務與公告仍缺一手資料時，維持 `source_required`／`review-gate`。
- 每週槽不等於每週發布年度活動資訊。實際 release 仍以月度小批更新公告與事件欄位，單批預設 2–4 個真正不同意圖的 canonical；沒有年度證據的一週可先保留草稿頁，但不得填猜測日期或另送出年份新 URL。

## 52 個已實作的草稿路由

以下路由一週一頁，全部由 `draft_week` 對帳；它們是可索引的知識草稿頁，年度日期待公告時仍在同一 slug 更新。

| 週 | 草稿頁 |
|---:|---|
| 01 | [`/festivals/draft-week-01-september-solar-terms/`](https://folk.tw/festivals/draft-week-01-september-solar-terms/) |
| 02 | [`/festivals/draft-week-02-zhongqiu-guide/`](https://folk.tw/festivals/draft-week-02-zhongqiu-guide/) |
| 03 | [`/festivals/draft-week-03-kinmen-bo-bing-guide/`](https://folk.tw/festivals/draft-week-03-kinmen-bo-bing-guide/) |
| 04 | [`/festivals/draft-week-04-kongzi-teachers-day/`](https://folk.tw/festivals/draft-week-04-kongzi-teachers-day/) |
| 05 | [`/festivals/draft-week-05-chongyang-guide/`](https://folk.tw/festivals/draft-week-05-chongyang-guide/) |
| 06 | [`/festivals/draft-week-06-qingshan-king-festival/`](https://folk.tw/festivals/draft-week-06-qingshan-king-festival/) |
| 07 | [`/festivals/draft-week-07-xiayuan/`](https://folk.tw/festivals/draft-week-07-xiayuan/) |
| 08 | [`/festivals/draft-week-08-wangjiao-differences/`](https://folk.tw/festivals/draft-week-08-wangjiao-differences/) |
| 09 | [`/festivals/draft-week-09-dongshan-yingfozu/`](https://folk.tw/festivals/draft-week-09-dongshan-yingfozu/) |
| 10 | [`/festivals/draft-week-10-dongzhi-guide/`](https://folk.tw/festivals/draft-week-10-dongzhi-guide/) |
| 11 | [`/festivals/draft-week-11-songshen-xietaisui/`](https://folk.tw/festivals/draft-week-11-songshen-xietaisui/) |
| 12 | [`/festivals/draft-week-12-chuxi-ancestors/`](https://folk.tw/festivals/draft-week-12-chuxi-ancestors/) |
| 13 | [`/festivals/draft-week-13-antaisui-deng/`](https://folk.tw/festivals/draft-week-13-antaisui-deng/) |
| 14 | [`/festivals/draft-week-14-baitiangong-guide/`](https://folk.tw/festivals/draft-week-14-baitiangong-guide/) |
| 15 | [`/festivals/draft-week-15-yuanxiao-guide/`](https://folk.tw/festivals/draft-week-15-yuanxiao-guide/) |
| 16 | [`/festivals/draft-week-16-yanshui-handan/`](https://folk.tw/festivals/draft-week-16-yanshui-handan/) |
| 17 | [`/festivals/draft-week-17-dajia-baishatun-pilgrimage/`](https://folk.tw/festivals/draft-week-17-dajia-baishatun-pilgrimage/) |
| 18 | [`/festivals/draft-week-18-beigang-mazu-pilgrimage/`](https://folk.tw/festivals/draft-week-18-beigang-mazu-pilgrimage/) |
| 19 | [`/festivals/draft-week-19-neimen-songjiang/`](https://folk.tw/festivals/draft-week-19-neimen-songjiang/) |
| 20 | [`/festivals/draft-week-20-qingming-guide/`](https://folk.tw/festivals/draft-week-20-qingming-guide/) |
| 21 | [`/festivals/draft-week-21-qingming-tomb-practice/`](https://folk.tw/festivals/draft-week-21-qingming-tomb-practice/) |
| 22 | [`/festivals/draft-week-22-baosheng-birthday/`](https://folk.tw/festivals/draft-week-22-baosheng-birthday/) |
| 23 | [`/festivals/draft-week-23-sanxia-qingshui/`](https://folk.tw/festivals/draft-week-23-sanxia-qingshui/) |
| 24 | [`/festivals/draft-week-24-dadaocheng-chenghuang/`](https://folk.tw/festivals/draft-week-24-dadaocheng-chenghuang/) |
| 25 | [`/festivals/draft-week-25-xuejia-shangbaijiao/`](https://folk.tw/festivals/draft-week-25-xuejia-shangbaijiao/) |
| 26 | [`/festivals/draft-week-26-mazu-pilgrimage-differences/`](https://folk.tw/festivals/draft-week-26-mazu-pilgrimage-differences/) |
| 27 | [`/festivals/draft-week-27-duanwu-guide/`](https://folk.tw/festivals/draft-week-27-duanwu-guide/) |
| 28 | [`/festivals/draft-week-28-daxi-guangong/`](https://folk.tw/festivals/draft-week-28-daxi-guangong/) |
| 29 | [`/festivals/draft-week-29-kouhu-qianshuizang/`](https://folk.tw/festivals/draft-week-29-kouhu-qianshuizang/) |
| 30 | [`/festivals/draft-week-30-donggang-xigang/`](https://folk.tw/festivals/draft-week-30-donggang-xigang/) |
| 31 | [`/festivals/draft-week-31-nanguanxian-wangjiao/`](https://folk.tw/festivals/draft-week-31-nanguanxian-wangjiao/) |
| 32 | [`/festivals/draft-week-32-mingjian-xuantian-pilgrimage/`](https://folk.tw/festivals/draft-week-32-mingjian-xuantian-pilgrimage/) |
| 33 | [`/festivals/draft-week-33-qiu-pingan-shoujing-buyun/`](https://folk.tw/festivals/draft-week-33-qiu-pingan-shoujing-buyun/) |
| 34 | [`/festivals/draft-week-34-qiu-yinyuan-qiuzi/`](https://folk.tw/festivals/draft-week-34-qiu-yinyuan-qiuzi/) |
| 35 | [`/festivals/draft-week-35-banjia-ruzhai-anshen/`](https://folk.tw/festivals/draft-week-35-banjia-ruzhai-anshen/) |
| 36 | [`/festivals/draft-week-36-shoujing-buyun/`](https://folk.tw/festivals/draft-week-36-shoujing-buyun/) |
| 37 | [`/festivals/draft-week-37-qixi-zuo16/`](https://folk.tw/festivals/draft-week-37-qixi-zuo16/) |
| 38 | [`/festivals/draft-week-38-guimenkai-guide/`](https://folk.tw/festivals/draft-week-38-guimenkai-guide/) |
| 39 | [`/festivals/draft-week-39-fangshuideng-guide/`](https://folk.tw/festivals/draft-week-39-fangshuideng-guide/) |
| 40 | [`/festivals/draft-week-40-zhongyuan-guide/`](https://folk.tw/festivals/draft-week-40-zhongyuan-guide/) |
| 41 | [`/festivals/draft-week-41-zhongyuan-local-rituals/`](https://folk.tw/festivals/draft-week-41-zhongyuan-local-rituals/) |
| 42 | [`/festivals/draft-week-42-dizang-ghost-gate/`](https://folk.tw/festivals/draft-week-42-dizang-ghost-gate/) |
| 43 | [`/festivals/draft-week-43-deity-birthday-variants/`](https://folk.tw/festivals/draft-week-43-deity-birthday-variants/) |
| 44 | [`/festivals/draft-week-44-deity-comparison/`](https://folk.tw/festivals/draft-week-44-deity-comparison/) |
| 45 | [`/festivals/draft-week-45-prayer-scenarios/`](https://folk.tw/festivals/draft-week-45-prayer-scenarios/) |
| 46 | [`/festivals/draft-week-46-almanac-yiji-guide/`](https://folk.tw/festivals/draft-week-46-almanac-yiji-guide/) |
| 47 | [`/festivals/draft-week-47-temple-selection-guide/`](https://folk.tw/festivals/draft-week-47-temple-selection-guide/) |
| 48 | [`/festivals/draft-week-48-local-heritage-guide/`](https://folk.tw/festivals/draft-week-48-local-heritage-guide/) |
| 49 | [`/festivals/draft-week-49-blessing-followup-guide/`](https://folk.tw/festivals/draft-week-49-blessing-followup-guide/) |
| 50 | [`/festivals/draft-week-50-poem-reading-guide/`](https://folk.tw/festivals/draft-week-50-poem-reading-guide/) |
| 51 | [`/festivals/draft-week-51-ritual-vocabulary-guide/`](https://folk.tw/festivals/draft-week-51-ritual-vocabulary-guide/) |
| 52 | [`/festivals/draft-week-52-taiwan-festivals-year/`](https://folk.tw/festivals/draft-week-52-taiwan-festivals-year/) |
