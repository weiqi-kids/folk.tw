# folk.tw 年曆資產、來源權威與真人背書計畫

> 建立日期：2026-08-22
> 目的：把 folk.tw 從「有很多頁」推進成「每年可重用、每句可追溯、重要內容有真人入口、每次改動可歸因」的民俗文化資料站。
> 性質：經營與內容治理計畫，不是新頁面承諾，也不是流量或收入預測。

## 0. 執行紅線

每次執行本計畫的工作包前，先讀：

1. `CLAUDE.md`
2. `docs/growth-worklist.md`
3. `docs/annual-release-plan.md`
4. `docs/source-authority-matrix.md`
5. `docs/human-authority-ledger.md`

現況一律用指令取得，不引用本文件或其他文件裡的會變動數字。所有變更遵守：

- 日期、儀式、活動、廟宇、神明與地方差異，查無權威來源就留空。
- 新頁必須同時滿足需求證據、獨立搜尋意圖、可掛權威來源三條件；否則併入既有 canonical 或不做。
- 年度活動日期、路線、報名、服務時段與供品，不得用往年資料推算當年資訊。
- 真人姓名、職稱、機構、審閱狀態與引言，未取得本人／機構同意前一律留空，不得用候選人想像值填入。
- 每次 SEO／IA／模板變更都要有明確 cohort、部署日期、重爬證據與 scoreboard；`lastCrawlTime` 早於變更時不得歸因。
- Codex 可以準備研究包、邀請包、審閱表與驗收報告；聯繫、同意、採訪與公開署名由真人完成。

## 1. 長期目標

### 1.1 年曆資產

把臺灣民俗的節氣、節慶、神明聖誕、地方祭典與年度活動，整理成能跨年刷新而不必重造 URL 的 canonical 網路：

- 日期與年度公告分離；常青文化脈絡不因年份消失，年度欄位每年重新核對。
- 一個使用者問題只保留一個主要 canonical；地方活動保留地區與主辦方範圍，不泛化成全臺規則。
- `/festivals/`、`/events/`、`/practices/`、`/deities/birthdays` 與 `/almanac/` 互相承接，但不靠同義薄頁堆廣度。
- 檔期倒推、年度 release manifest、來源 evidence packet 與部署後線上驗證形成同一條生產線。

### 1.2 來源權威

讓每個可被引用的主張都能回答「誰說的、適用範圍、何時核對、原文在哪裡」：

- 法定／固定日期優先用中央或地方政府、中央氣象署、內政部等官方來源。
- 文化脈絡與民俗個案優先用文化資產、博物館、學術典藏、地方文化機關與可識別的一手資料。
- 年度活動資訊只接受主辦廟、場館或地方政府當年度公告。
- 社群、商業文章與搜尋結果只能作為發現線索，不能單獨支撐正文事實。
- 來源連不上、內容已撤下或授權不明，要記錄為阻塞／待重查，不得改寫成「查無資料」或拿其他低權威來源補洞。

### 1.3 真人背書

建立可長期合作的民俗文化審閱網，而不是在頁面上裝飾一個專家名字：

- 先從地方文史、祭典主辦、廟方文化工作者、博物館／文化資產工作者與民俗研究者等角色建立候選池。
- 合作階梯由輕到重：指定段落核閱 → 具名審閱 → 專欄／訪談 → 一手資料合作。
- 每位審閱者只對自己同意的題目、地域與文字範圍負責；不能把一位地方人士的做法宣稱為全臺共通。
- 未完成同意、審閱範圍與公開方式確認前，網站不顯示姓名、不使用「專家背書」文案。

### 1.4 可歸因的反思目標

反思層的任務不是每天找一個檔案來改，而是逐步驗證四個假設：

| 假設 | 可觀察證據 | 不可接受的替代品 |
|---|---|---|
| 年曆頁能跨年累積需求 | GSC query×page、年度重爬、同 canonical 的季節性回升 | 只看全站流量或文件裡的預測 |
| 來源密度提升可增加可引用性 | source refs、GEO／AEO 實際引用、人工抽查可追溯性 | 把有 schema 當成已被 AI 引用 |
| 真人審閱能提升信任 | 同意紀錄、審閱修訂、公開範圍與使用者回訪／引用訊號 | 沒有同意的姓名、頭銜或 logo |
| 站台改動造成結果 | deploy SHA、頁面 `lastCrawlTime`、變更前後 cohort 與 scoreboard | 把尚未重爬的頁面當成成功或失敗 |

## 2. 工作包 A：年曆資產

### A1. 資產骨架

以既有資料與 manifest 為正本，不另做一份容易漂移的節日清單：

- canonical 資料：`src/data/festivals.json`、`src/data/events.json`、`src/data/local-celebrations.json`、`src/data/deities.json`。
- 年度生產：`docs/annual-release-manifest.json`、`docs/annual-release-evidence/`、`docs/topic-drafts/`。
- 查詢與檔期：`pnpm growth:calendar-gaps`、`pnpm growth:source-candidates`。
- 發布狀態：沿用 `idea`、`source_required`、`ready`、`scheduled`、`published`、`merge_only`；狀態變化要有來源與驗收證據。

### A2. 年度刷新契約

每個年度節點進入 queue 前，至少要能回答：

1. 今年的日期依哪份官方／主辦來源核定？
2. 哪些內容是常青文化脈絡，哪些只適用今年？
3. 是否已有 canonical 可以承接？若要新頁，三條件是否都成立？
4. 圖片、OG、手機版、FAQ、內鏈與來源標示是否完成？
5. 上線後要觀察哪個 query×page cohort，首訊與完整窗口何時對帳？

### A3. 現階段執行順序

- 先完成已存在節點的年度來源刷新與歸因，不以新增 URL 當成進度。
- `growth-calendar-gaps` 發現既有頁時，先做 query×page 與頁型判讀；只有未承接的問題型意圖才建立候選。
- `growth-source-candidates` 只做來源型盲點盤點，不把地方慶典清單直接當成搜尋需求，也不自動發布。
- 檔期壓力解除後，把年度資產回填成跨年互鏈與可重用 hub，不追逐已退潮的單日流量。

## 3. 工作包 B：來源權威

來源分級、欄位契約、阻塞狀態與驗收方式見 [`docs/source-authority-matrix.md`](../source-authority-matrix.md)。每個新增或修改的事實主張，都要能回到該矩陣的來源類型與 evidence packet。

最低 evidence packet：

- `claim`：可被核對的一句主張。
- `scope`：全臺、地區、單一廟宇、單一年度或單一文資個案。
- `source_type`、`source_url`、`source_locator`：來源類型、網址與頁碼／段落／欄位位置。
- `checked_at`、`annuality`、`status`：核對時間、是否每年要重查、目前狀態。
- `notes`：來源限制、地域差異、不能推導的內容。

來源不足時的輸出不是補一段通用敘述，而是 `source_required`、`blocked` 或 `not_found`，並停止進入年度 release queue。

## 4. 工作包 C：真人背書

`docs/human-authority-ledger.md` 是內部台帳，不是公開專家頁。它目前只放角色與欄位契約，不預填任何未經同意的人名。

每個真人合作項目必須留下：

- 身分與機構的可核對來源。
- 對方明確同意的合作方式、審閱範圍、地域／題材限制與有效日期。
- 審閱前稿、意見、修訂結果與最終核准日期。
- 是否同意公開姓名、頭銜、機構、照片、引言與外部連結。
- 退出、撤回或來源更新時的下線與替換流程。

第一階段只做兩種 Codex 產出：

1. 依題材準備邀請包：為什麼找對方、希望核閱哪一段、需要多少時間、如何標示。
2. 依既有來源包準備審閱包：逐句主張、來源、地域範圍、待確認問題與不可泛化提醒。

Codex 不自行寄信、不代替對方同意、不把「候選」寫成「審閱完成」。

## 5. 工作包 D：反思與歸因

反思 playbook 要維持四條固定優先序：

1. **季節窗口**：先看 `growth-calendar-gaps` 與來源盲點，再看一般 striking distance。
2. **高意圖問題**：優先能讓使用者必須點入才能得到完整答案的 query，不追 Google 可直接回答的事實詞。
3. **權威證據**：沒有 source packet 或真人同意，不把候選升級成公開內容。
4. **可歸因變更**：每次改動建立一注或一筆 observation，直到頁面重爬後才開始讀結果。

每筆觀察至少記錄：

```text
goal_id
change_files
change_commit
deploy_date
cohort_query_page
baseline_window
expected_first_signal_date
expected_full_window_date
last_crawl_time
post_window_metrics
verdict
```

判讀順序固定為：部署成功 → URL 線上內容正確 → `lastCrawlTime` 晚於變更 → 首訊窗口 → 完整窗口 → verdict。任一環節缺資料就保持 `open` 或 `observing`，不提前下結論。

## 6. 角色分工

| 工作 | Codex 可直接做 | 需要真人完成 |
|---|---|---|
| 年曆 | 盤點 canonical、產 source candidate、更新 manifest 草稿、跑 gates | 核定當年度公告與地方活動變更 |
| 來源 | 建 evidence packet、逐句掛源、報告阻塞 | 提供未公開的一手資料或授權 |
| 真人 | 建候選角色、邀請包、審閱包、修訂紀錄模板 | 聯繫、同意、訪談、審閱、公開署名決定 |
| 反思 | 建 cohort、scoreboard、重爬與前後窗口報告 | 決定商業合作、公開背書與對外承諾 |

## 7. 里程碑

### 現在至 2026-09-02

- 讓本輪節日／籤詩／events 變更完成重爬後再歸因。
- 確認大腦層留下 actions 留痕，並把檔期 radar 作為第一優先資料。
- 對中秋只保留已證明的問題型 canonical 候選；不因頭部詞競爭而開同義薄頁。
- 完成來源矩陣與真人台帳的第一版，不填未核實人名。

### 2026-09-03 之後

- 依下一個檔期與 GSC query×page 證據，選一個可歸因的長尾 cluster 做試點。
- 對既有 hub 做跨年內鏈與精選入口實驗；每次只改一個可觀察的經營槓桿。
- 由真人實際回覆後，才把第一個審閱範圍寫入公開內容或 Person／reviewedBy 結構。

### 2026 年第四季至 2027 年

- 把年度 release 從「有稿」提升到「有日期來源、主辦公告、審閱、圖片授權與線上驗收」。
- 將已完成的來源包整理成可被人與機器引用的一手資料頁；不把 schema 或 FAQ 本身當成權威證明。
- 累積足夠合作案例後，再評估品牌內容、資料授權或地方文化合作；在此之前不把收入假設寫成目標數字。

## 8. 驗收與回報格式

每次執行後回報四段：

1. **年曆資產**：哪個 canonical／manifest／source candidate 有變，是否新增 URL。
2. **來源權威**：每項主張的來源狀態；查無源、阻塞與待重查分開列。
3. **真人背書**：台帳狀態；未取得同意的欄位保持空白。
4. **反思歸因**：change commit、deploy、last crawl、觀察窗口、scoreboard verdict；未達條件就明寫 `open`。

建議驗收指令：

```bash
node scripts/growth-calendar-gaps.mjs --days 60
node scripts/growth-source-candidates.mjs --as-of YYYY-MM-DD --days 120
pnpm check:annual-release
pnpm check:source-refs
pnpm check:doc-numbers
git diff --check
```

本計畫不取代各資料檔、年度 manifest、來源 gate 或 `docs/growth-worklist.md`；它是四者的長期方向與反思判準。
