# 站內搜尋需求探勘

執行：

```bash
pnpm growth:search-demand
pnpm growth:search-demand -- --json
```

報表唯讀查詢 GA4 最近 7 天的 `view_search_results`、`search_zero_results` 與
`search_result_click`，不寫檔、不發通知。每週既有 SEO Issue 也會帶同一段摘要。

## 個資界線

站內搜尋是自由文字，可能被使用者輸入人名、電話、email 或網址。前端只在查詢明確含有
廟、神明、籤詩、農民曆、祭典等公開民俗領域詞，且未命中常見個資格式時，才送出查詢字面。
其餘查詢只送 `[redacted:<topic>]`、長度區間與結果數，原文不進 GA4。

這項限制是資料契約，不應為了看見更多零結果關鍵字而放寬。`[redacted:*]` 的用途是判斷需求
大類和量級，不是還原使用者輸入。
