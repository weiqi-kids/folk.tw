# 52 週完整文章稿

這個目錄放的是每週一篇的「文章正文交付物」，不是題目清單，也不是只有來源的 evidence packet。`week-01.md` 到 `week-52.md` 每篇都包含：

- 可直接使用的 H1、導讀與文化脈絡正文
- 讀者常見問題（FAQ）
- 逐段可追溯的來源連結
- 既有 canonical／承接位置
- 年度資料維護欄，供發布前只更新當年度日期、路線、服務與公告

文章正文先寫可長期使用的文化脈絡，年度可變欄位不以往年資料猜填。這樣在接近節日或活動時，仍要核對當年度一手公告、圖片授權、OG 與手機畫面，再回填既有 canonical；不會把 52 週變成 52 個薄頁或一次送出大量新 URL。

## 完成標準

`pnpm check:topic-articles` 是收錄前的硬 gate，會檢查：

1. 52 個週次檔案齊全且週號不跳號。
2. 每篇有標題、單一合法 canonical、來源包、固定 `annual_status`、年度更新欄、正文、FAQ 與來源段落；指向既有 hub 的承接稿另須在 frontmatter 明確寫 `merge_only: true`。
3. 核心文化段落（不計閱讀提示、來源與 FAQ）至少 800 字、至少 3 個主題段落；明確標記 `merge_only: true` 的承接稿至少 600 字、2 個不同網域的來源 URL。一般稿至少 3 個 URL、2 個不同網域。
4. 正文不得混入 GA4／GSC、工具操作、來源包或發布作業等內部工作語；FAQ 答案不得逐字複製導讀 lead。
5. 文章之間沒有過高的八字組合重複；共享文化背景若達警示門檻，需人工確認是否應改成互鏈。

若已有 production `dist/`，再執行 `pnpm check:topic-articles -- --require-dist`，會逐一核對 canonical 頁、self-canonical、`index, follow`、OG 圖片、sitemap 與至少一條站內入鏈。這個 dist gate 不會把仍屬草稿的週文自動加入 sitemap 或 IndexNow。

`article-ready` 是文章作者標記；只有 checker 顯示 0 errors 才算正文通過 gate，且不代表年度公告或圖片 QA 已完成。年度資料未核對前，不加入 sitemap、RSS 或 IndexNow。
