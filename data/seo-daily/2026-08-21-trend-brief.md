# 外部搜尋趨勢自動優化 brief｜folk.tw｜2026-08-21

> 這份 brief 只回答「現在值得查證哪個題材」。趨勢詞不是法規依據，也不代表核准功效、產品推薦或個人適用性。

## 來源狀態
- Google Trends：正常（10 筆）｜https://trends.google.com/trending/rss?geo=TW
- Bing Webmaster：正常（100 筆）｜https://folk.tw/
- GSC 本站交叉證據：24 條目（2026-08-12..2026-08-18）

## 可進入自動內容優化佇列
### 1. 千歲爺籤詩（分數 57｜refresh-existing-page）
- 訊號：／上升｜來源：Bing Webmaster。
- 對應頁面：[既有籤詩頁](https://folk.tw/poems/)。
- 為什麼進佇列：Bing Webmaster 查詢表現上升或首次出現；對應既有頁面「既有籤詩頁」。
- 安全自動化範圍：src/data/poems.json；只調整閱讀動線、入口或不含法規事實的文案。
- 來源查證：來源查證、日期與站內搜尋意圖；任一項不成立就不自動發布；未找到官方來源就不寫，自動流程直接跳過。
- 來源連結：[Bing Webmaster](https://folk.tw/)。
### 2. 竹蓮福德祠籤詩（分數 57｜refresh-existing-page）
- 訊號：／上升｜來源：Bing Webmaster。
- 對應頁面：[既有籤詩頁](https://folk.tw/poems/)。
- 為什麼進佇列：Bing Webmaster 查詢表現上升或首次出現；對應既有頁面「既有籤詩頁」。
- 安全自動化範圍：src/data/poems.json；只調整閱讀動線、入口或不含法規事實的文案。
- 來源查證：來源查證、日期與站內搜尋意圖；任一項不成立就不自動發布；未找到官方來源就不寫，自動流程直接跳過。
- 來源連結：[Bing Webmaster](https://folk.tw/)。

## 需要人工審核或暫不自動化的相關題材
- 恆春搶孤2026：本站 Google 搜尋位置正在上升或剛出現；對應既有頁面「既有節日頁」；符合題材門檻，但依站台自動化規則留給人工審核；只留人工審核，不自動改正文。

## 執行規則
- 符合 article-create-and-publish 的候選可由大腦建立獨立文章並自動發布；來源、內容與 build gate 任一失敗就不發布。
- 不得把熱門詞改寫成產品推薦或功效承諾。
- src/pages/**、src/layouts/**、src/lib/**、src/components/**、src/data/deities.json、src/data/temples.json、src/data/poems.json、src/data/festivals.json、src/data/practices.json、src/data/events.json、public/** 不在趨勢流程的自動化寫入範圍。
- 每次改動仍須通過站台既有 claims、copy、typecheck、test 與 build gates。
