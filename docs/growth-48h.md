# 48 小時成效報表與淘汰規則

執行：

```bash
pnpm growth:48h
pnpm growth:48h -- --campaign ghost-month
pnpm growth:48h -- --landing /festivals/qixi/,/festivals/zhongyuan/ --json
```

這支工具只讀 GA4，不寫檔、不發 Slack，也不會自動刪頁。設定與憑證沿用現有 Google 資料腳本：

- GA4 property：`GA4_PROPERTY_ID`，否則 `scripts/.google-config.json`
- 服務帳號：`GOOGLE_SA_KEY`／`GOOGLE_APPLICATION_CREDENTIALS`，否則
  `/root/.config/folk-tw/ga4-sa.json`

## 報表口徑

預設以 GA4 property 時區 `Asia/Taipei` 取最近兩個完整曆日（00:00–23:59，共 48 小時），列出：

- 七個農曆七月 campaign／相關 landing page 的 `activeUsers`、sessions、PV、engaged sessions
- landing page × session source × session campaign
- 首頁 campaign card 的 `campaign_click`（只以 `pagePath=/` 計算 CTR）
- campaign 依 `campaign_placement` 拆分主版位、次入口、圖片、標題與 CTA
- 首頁三個常青入口的 `intent_click`，依目的網址分列
- 全站 `share`、`calendar_add`、`line_add_click`
- 中元普渡清單的勾選、複製、分享與清除事件
- LINE 加好友依事件範圍自訂維度 `line_placement` 拆分版位
- GA4 的 New／Returning 分類

Campaign landing 以首頁使用的 `src/lib/seasonal-campaigns.ts` 為排程來源，並加入同一搜尋
戰役但不獨佔首頁日期的雞籠中元祭與搶孤頁。放水燈、地藏頁已在排程中，去重後
預設共七頁。`--hours` 必須是 24 的倍數；
這是為了讓 GA4 對整段期間的 `activeUsers` 去重，不能把逐小時 users 相加（同一人跨小時會重複）。

`share` 已由 `ShareRow.astro` 埋點。首頁 campaign 圖片、標題、CTA 與中元次入口透過
`Base.astro` 的共用事件委派送 `campaign_click`。報表的首頁 CTR 分子只納入
`pagePath=/` 的點擊；相關內容頁的 `related_title`／`related_cta` 只列入全站總數，
絕不能除以首頁 PV。`campaign_placement` 已於 2026-08-10 註冊為事件範圍自訂維度，會再拆出
`home_image`、`home_title`、`home_cta`、`home_secondary`；GA4 metadata 尚未傳播完成時仍保留正確的
首頁總點擊，只沒有細分版位。
`intent_click` 由首頁固定的今日宜忌、情境求籤、附近宮廟三個入口送出；報表使用 GA4 內建
`linkUrl` 維度分辨目的頁，不依賴未註冊的 custom dimension。`calendar_add` 同樣由共用 selector
`data-calendar-add` 送出，目前節日頁已有 Google Calendar 與 ICS 入口。

中元普渡清單送出 `checklist_toggle`、`checklist_copy`、`checklist_share`、
`checklist_reset`；報表直接列事件數，用來判斷「看到內容」有沒有轉成「實際整理或分享」。

`line_add_click` 由 `Base.astro` 的共用事件委派送出，`line_placement` 會分辨首頁、全站頁尾、
求籤結果、節日、黃曆與看日子等 CTA。GA4 property 已把 `line_placement` 註冊為事件範圍自訂維度，
並把 `line_add_click` 設為每次事件計數的重要事件。新維度若仍在 GA4 metadata 傳播中，報表會保留
LINE 總點擊並標記「等待 GA4 生效」，不會讓整份報表失敗；生效後會自動列出版位明細。

真正的「本次 campaign 訪客是否在七日內回來」無法由匿名的 GA4 aggregate `runReport` 串成
user-level cohort。報表只列當期 New／Returning 分類，並明確把七日 campaign cohort 標為不可得；
需等滿七日後在 GA4 Explore/cohort 或另設的 user-level 匯出驗證，不能拿替代值冒充。

## 48 小時淘汰規則

淘汰範圍只限「首頁 campaign 版位」，**永不因 48 小時數據刪除內容頁**：

| 條件 | 決策 |
|---|---|
| `campaign_click` 未埋點，或首頁少於 200 PV | `HOLD`：樣本不足，不淘汰 |
| 首頁至少 200 PV，campaign CTR < 1.5% | `REVISE`：改標題／CTA，再跑下一個 48 小時 |
| 首頁至少 500 PV，campaign CTR < 0.5% | `RETIRE_PLACEMENT`：撤首頁版位，內容頁保留 |
| 首頁至少 200 PV，campaign CTR ≥ 1.5% | `KEEP`：保留版位 |

GA4 最近完整一天仍可能延遲回填。若決策剛好卡在門檻附近，隔日用同一參數重跑，
不要因延遲資料做不可逆操作。
