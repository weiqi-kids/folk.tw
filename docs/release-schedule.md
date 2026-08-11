# 預寫內容的按月釋出

節日頁可以先把全年內容、來源、圖片與 SEO 文案寫完，但不要用「先建頁、再加
`noindex`」的方式等待日期。未到釋出日的頁面應該不存在於 build 產物，這樣才不會
進 sitemap、Pagefind、RSS、bot feed、IndexNow 或站內內鏈。

## 資料欄位

在 `src/data/festivals.json` 的條目加上日期型 `publish_at`（台北時間的曆日）：

```json
{
  "slug": "example-september-topic",
  "publish_at": "2026-09-01",
  "name": "…"
}
```

沒有 `publish_at` 的既有條目視為已釋出；`publish_at` 必須是 `YYYY-MM-DD`，不可帶
時間或時區。build 的 cutoff 使用 `todayInTaipei()`，因此 GitHub Actions 在台北日曆
切換後的下一次部署就會自動釋出。日期本身不代表活動日期，活動日期仍須由資料內的
農曆／節氣／固定國曆欄位與來源證明。

## 釋出邊界

所有會產生節日 URL 的資料流都先呼叫 `releasedItems()`：

- `/festivals/`、`/festivals/[slug]/` 與 `.ics` route
- 首頁、農民曆、神明／習俗／活動／廟宇反向連結
- RSS、`llms-full.txt`、`bot-index.json`、節日分享卡產生器

Astro 因而不會為 future slug 產出 HTML 或 ICS；Astro sitemap 只會看到已存在的
HTML，Pagefind 只索引已存在的 HTML，IndexNow 只走 build 後的 dist 清單。首頁 campaign
也只從已釋出的節日挑選目標；完整 campaign 排程仍可預先保留，等待下次 build。

## CI 驗證

`scripts/check-release-schedule.mjs` 會先檢查日期格式與 slug 唯一性；在 build 後以
`--require-dist` 執行時，還會逐一掃描 dist，確保 future slug 沒有出現在：

- 節日 HTML／ICS route
- 任何 HTML／JSON／JS／CSS／文字產物的 `/festivals/<slug>/` 內鏈
- sitemap、RSS、Pagefind 產物與 `indexnow-urls.txt`

建議 postbuild 的最後一個步驟是：

```sh
node scripts/check-release-schedule.mjs --require-dist
```

若要在沒有 build 的工作樹只驗資料格式，可執行不帶 `--require-dist` 的版本。新增一
個 future 條目時，不要用手工 URL 測試取代 gate；先跑完整 build，再確認 gate 通過，
到了 `publish_at` 的下一次 build 才會讓它出現在搜尋與站內導覽。
