# 全年內容發布就緒盤點

> 目標是「到發布時間可以直接發佈」，不是「先把題目列完」。本檔把寫作完成、人工審核與正式發布分開，避免再次混用狀態。

盤點日期：2026-08-12（Asia/Taipei）

## 目前狀態

| 階段 | 目前數量 | 可否稱為已可發布 |
|---|---:|---|
| 52 週都有單一內容意圖 | 52/52 | 否，年度欄位仍要逐週更新 |
| 52 週都有正文／facts／FAQ／canonical packet | 52/52 | 否，仍要逐句驗證 |
| 52 個 `draft-week` 節日頁與固定 slug | 52/52 | repo 內已實作；不等於 production deployment |
| 52 份 packet 通過自動品質 gate | 52/52 | 否，自動 gate 不判斷來源是否真的支持每句話 |
| 49 份 evidence 完成獨立來源／日期複核 | 49/49 | evidence 已通過；年度主辦公告仍按 event_window 補回 |
| 節日頁圖片／OG／Discover／canonical 與 repo build gate | 68/68 節日資料 | repo gate 已通過；部署後 HTTP／收錄仍待驗證 |
| `scheduled`、可依 `publish_at` 直接進入小批 queue | 28/52 | 28 個有日期 anchor 與前一月 publish_at；24 個是既有 canonical 的 ready/merge 維護 |

## 進入 `scheduled` 前的硬條件

每個週次／canonical 都必須逐項打勾，不能用整批檔案的平均值掩蓋單一頁面的缺口：

1. **正文與意圖**：只有一個主要搜尋意圖；lead、正文、FAQ 和內鏈已完成，不是題目或方向句。
2. **逐句來源**：每個可驗證主張都能回到來源原文；官方資料、廟方說法、民間通說與編輯推論分層標示。
3. **年度欄位**：日期、路線、交通、報名、費用、服務時間與活動是否舉行，都有該年度一手公告；沒有就不能設 `publish_at`。
4. **合併與 canonical**：沒有同義薄頁、跨頁大段重複、錯誤內鏈或把地方做法泛化成全臺規則。
5. **圖片與 OG**：實際使用的圖片有作者、原始 URL、授權與 alt；OG 圖、手機首屏與分享裁切已實測。
6. **production QA**：build、canonical、JSON-LD、sitemap、RSS、Pagefind、站內入口與 HTTP 頁面均通過；草稿 route 可存在，但未公告的年度日期、路線與服務不得渲染成確定資訊。
7. **發布資料**：manifest 有 `slug`、`publish_at`、`reviewer_status=pass`、來源核對日期與發布後追蹤項目。

## 現在正在補的阻塞

- 52 個週槽已全部有對應的 `draft-week` 節日頁；原先 packet 的 `merge_only` 仍代表長期 canonical 分流，不代表缺少本次指定的草稿 route。
- 68 個節日頁的圖片／OG／Discover、Article／FAQ、canonical 與 repo build gate 已完成；production deployment 與線上收錄仍要另外驗證。
- 既有月份 packet 已有來源清單與圖片規格；仍不能把 URL 存在、來源數量達標，當成來源內容已支持每句主張。
- 2027 的節氣時刻、活動日期、路線、交通與廟方服務，必須在各月份 T-42 至 T-14 窗口重新抓取一手公告；這是發布前核對，不是現在用模型補日期。

## 發布規則

只有完成以上 7 項，才將該週／canonical 從 `content-packet-complete` 提升為 `scheduled`。未完成的項目留在 review queue，不進年度 release queue；固定的 `draft-week` 頁面仍可在 sitemap、Pagefind 與站內導航中存在。每月仍只發布 2–4 個不同搜尋意圖的年度更新或新 canonical。

## 實際自動化狀態（2026-08-11）

- `docs/annual-release-manifest.json` 是唯一的年度 queue 設定；週稿與 `draft-week` 頁面的年度更新都要透過它核對，頁面本身由 `festivals.json` 產生。
- `pnpm check:annual-release` 會對帳 52/52、驗證日期格式、活動日前一個月、審核狀態與每月 4 URL 上限。
- GitHub Pages 每日建置後執行 `pnpm annual:release:due`。它只輸出當月到期且通過審核的 URL；過去月份不追送，避免 backlog 一次灌入搜尋引擎。
- IndexNow job 只送上述小批，已移除部署時的全站 sitemap 提交。Google 不支援 IndexNow，GSC 的收錄仍由 sitemap 與自然爬取判定。
- 目前 manifest 透過三個 evidence group 對齊 52/52：28 個 `scheduled`、24 個 `ready`、0 個 `watch/blocked`。`scheduled` 才會進入當月小批 queue；`ready` 是既有 canonical 的 merge／常青維護，不會被當成新 URL 灌入搜尋引擎。
- 需要主辦方年度公告的路線、交通、報名與團次，已在各 evidence 的 `event_window`／`review_note` 明確標示，公告出現後只更新該 canonical，不另開年份薄頁。
