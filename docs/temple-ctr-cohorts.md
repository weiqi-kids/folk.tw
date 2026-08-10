# 宮廟 CTR cohort 報表

`pnpm seo:temple-ctr` 是唯讀的 GSC 診斷工具。它回答的是「哪一類搜尋意圖在相同排名帶中 CTR 特別差」，不是替每間廟自動改 title。

## 執行

```bash
pnpm seo:temple-ctr
pnpm seo:temple-ctr -- --start 2026-07-01 --end 2026-07-31
pnpm seo:temple-ctr -- --json
pnpm check:temple-ctr
```

預設讀取今天前 3 天結束的 28 天資料，避免 GSC 最近資料尚未完整。憑證與站台設定沿用 `scripts/lib/google-data.mjs`，不會寫入 GSC，也不會覆寫 `data/seo/` 的日報或週報。

## 母體與分頁

- GSC 查詢維度固定為 `page × query`，API 每次最多 25,000 列；工具用 `startRow` 持續翻頁，直到空頁／短頁。
- API 先用 regex 限定 `/temples/{id}`，本地再以嚴格 pathname 規則排除 hub、縣市與鄉鎮頁。
- 預設安全上限 1,000,000 列。若碰到上限會標 `truncated`，不能拿該次結果下結論；可用 `--max-rows` 提高。
- 「已翻到短頁」只表示拿完 Search Analytics API 可提供的結果。GSC 仍可能因隱私門檻、省略匿名查詢或匯出限制不提供所有原始搜尋紀錄，報表會明示這個限制。

這避免舊式 Top 200 查詢先取熱門列、再推論全體所造成的選樣偏誤；但不宣稱突破 GSC 本身的資料限制。

## 分類口徑

每列依目標廟頁本身的名稱、地址與主祀分類，優先序如下：

1. `祭典／服務`：查詢含遶境、進香、法會、安太歲、點燈、開放時間等明確字詞。
2. `地區＋廟名`：查詢在廟名之外，另含該廟的縣市或鄉鎮。
3. `廟名`：查詢含登記名或 `commonTempleName()` 的一般稱呼。
4. `地區＋神明`：查詢含該廟所在地與已登錄的主祀名稱／別稱。
5. `其他`：無法由現有可靠資料判定者。

排名帶為 `1–3`、`4–10`、`11–20`、`21+`。平均排名按曝光加權；CTR 由總 clicks / 總 impressions 重算，不平均每列 CTR。

## 可採取行動的定義

預設同時符合以下條件才列入：

- cohort 至少 100 曝光（`--min-impressions` 可調）；
- CTR 低於同一 position bucket 全部宮廟查詢基準的 75%（`--max-relative-ctr` 可調）。

輸出的代表查詢只用來理解群組，不是逐廟改 title 的工作清單。應先選一個 cohort 做模板或內容入口實驗，保留前後窗口；祭典、服務、主祀與地址仍只能使用站內已有來源支持的事實。

`21+` 排名帶若達低 CTR 門檻，報表會先提示「主要瓶頸是可見度」；這類資料不能用來推導 title 有問題。
