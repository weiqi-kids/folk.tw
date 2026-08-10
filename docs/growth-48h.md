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

- 五個 campaign landing page 的 `activeUsers`、sessions、PV、engaged sessions
- landing page × session source × session campaign
- 首頁 campaign card 的 `campaign_click`
- 首頁三個常青入口的 `intent_click`，依目的網址分列
- 全站 `share`、`calendar_add`
- GA4 的 New／Returning 分類

Campaign landing 清單不在報表另抄一份，直接 import 首頁使用的
`src/lib/seasonal-campaigns.ts`，所以首頁戰役換頁時報表會同步。`--hours` 必須是 24 的倍數；
這是為了讓 GA4 對整段期間的 `activeUsers` 去重，不能把逐小時 users 相加（同一人跨小時會重複）。

`share` 已由 `ShareRow.astro` 埋點。首頁 campaign 三個入口透過 `Base.astro` 的共用事件委派送
`campaign_click`，頁面只放 `data-growth-campaign`，不各自複製追蹤程式。
`intent_click` 由首頁固定的今日宜忌、情境求籤、附近宮廟三個入口送出；報表使用 GA4 內建
`linkUrl` 維度分辨目的頁，不依賴未註冊的 custom dimension。`calendar_add` 同樣由共用 selector
`data-calendar-add` 送出，目前節日頁已有 Google Calendar 與 ICS 入口。

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
