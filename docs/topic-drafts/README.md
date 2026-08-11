# 年度主題寫作進度（2026-08 → 2027-07）

這份是實際寫作交付記錄，不是候選題目清單。52 個週槽都必須有真正的內容意圖與可審核段落；GA4、GSC、工具維護與發布作業不算主題。每個月與補稿／通用主題都寫入 markdown 證據包，包含可放進正文的 lead／段落、官方來源、FAQ、canonical 分流與重複風險。這些檔案仍在 `review-gate`，不會自動變成公開頁面。

| 月份 | 實際交付 | 檔案 | 狀態 |
|---|---|---|---|
| 2026-08 | 鬼門開、七夕、放水燈、中元、雞籠中元、搶孤、義民、地藏 | [aug-nov.md](aug-nov.md) | 已寫，年度活動欄位 `source_required` |
| 2026-09 | 中秋、金門博餅、孔子誕辰／教師節、白露與秋分 | [aug-nov.md](aug-nov.md) | 已寫，既有 canonical 刷新 |
| 2026-10 | 重陽、艋舺青山王、下元研究 | [aug-nov.md](aug-nov.md)、[chongyang.md](chongyang.md) | 已寫；重陽新頁仍待審 |
| 2026-11 | 二結王公過火、地方王醮週期 | [aug-nov.md](aug-nov.md) | 已寫，活動公告待核 |
| 2026-12 | 冬至、送神、謝太歲／還願、東山迎佛祖 | [dec-mar.md](dec-mar.md)、[dongzhi.md](dongzhi.md) | 已寫，優先合併既有 canonical |
| 2027-01 | 除夕祭祖、安太歲、點燈、三峽祖師祭典 | [dec-mar.md](dec-mar.md) | 已寫，廟方服務逐廟核對 |
| 2027-02 | 拜天公、元宵、鹽水蜂炮、臺東寒單 | [dec-mar.md](dec-mar.md) | 已寫，活動日期待公告 |
| 2027-03 | 清明、掃墓、大甲／白沙屯／北港媽祖 | [dec-mar.md](dec-mar.md) | 已寫，採各 canonical 分流 |
| 2027-04 | 保生大帝聖誕、媽祖遶境年度更新 | [apr-jul.md](apr-jul.md) | 已寫，活動公告待核 |
| 2027-05 | 端午、五月十三迎城隍、新莊文武大眾爺 | [apr-jul.md](apr-jul.md)、[duanwu.md](duanwu.md) | 已寫；端午新頁仍待審 |
| 2027-06 | 關帝聖誕、口湖牽水車藏 | [apr-jul.md](apr-jul.md) | 已寫，活動公告待核 |
| 2027-07 | 農曆七月八頁、雞籠事件與民雄大士爺年度刷新 | [apr-jul.md](apr-jul.md) | 已寫，不新增「鬼月大全」薄頁 |
| 週次補稿 | 19 內門宋江陣、25 學甲上白礁、30 東港迎王、32 受天宮玄天上帝香期 | [missing-weeks.md](missing-weeks.md) | 已寫，年度公告與視覺仍待核 |
| 週次內容 | 33–36 求願／儀式邊界；43–52 生日、比較、情境、農民曆、選廟、文化資產、祈福查證、籤詩、詞彙、歲時總覽 | [content-themes-33-52.md](content-themes-33-52.md) | 已寫，維持 `review-gate` |

## 已通過的草稿 gate

```text
pnpm check:topic-drafts
主題草稿 gate 通過：8 檔，0 errors，0 warnings
```

gate 會檢查：每檔至少 3 個可追溯 URL（其中至少 2 個官方／公立來源）、搜尋意圖、FAQ、合併／重複風險、年度來源狀態、圖片／OG／授權檢核、模板化套語，以及跨檔 8-gram 重複率；路由／編號內容單元也要各自有最低正文長度與鄰近來源標記，不能用整份長文件掩蓋單一薄段落。週次補稿與 33–36／43–52 主題檔也列入 strict gate。

## 尚未宣稱完成的部分

- `review-gate` 不等於已發布：新增節日仍要完成圖片／授權、OG、canonical、內鏈、手機版與 production build 驗證。
- 2027 國曆日期、地方活動檔期、路線、交通、報名與廟方服務，尚未有當年度一手公告的欄位保持 `source_required`。
- 通過 reviewer 前不加入 `festivals.json`、sitemap、Pagefind、RSS 或 IndexNow；月度 release 仍依既有排程小批處理。
