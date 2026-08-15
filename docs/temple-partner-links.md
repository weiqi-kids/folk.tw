# 宮廟合作連結（專屬求籤連結＋用量追蹤）

> 2026-08-14 起。首例：碧雲宮（`moi_10478_碧雲宮`，南投國姓，主祀天上聖母、採**關帝靈籤**——
> 籤系覆寫見 `temples.json` 該廟 `divination_systems` 欄與 `docs/decisions/deities-and-qian.md` 同日條目）。
> 廟方需求：專屬解籤連結、可追蹤使用量；後續（P1+）專屬背景圖、照片合成籤文、社群分享。
> 用戶已確認（2026-08-14）：追蹤用 P0 即可；廟方背景圖授權**含公開散布**。

## P0 機制（已上線）

1. **前端**：`/qiugian/<concern>/` 頁帶 `?temple=<temples.json 的 id>` 時，
   該頁所有 GA4 事件（`qiugian`／`qifu`／`baoxi`）多帶一個 `temple` 維度。
   實作在 `src/pages/qiugian/[slug].astro` 的 `g()`（白名單字元＋限長，防注入）。
2. **GA4**：自訂維度 `temple`（EVENT scope）2026-08-14 以 Admin API 註冊。
   ⚠️ **非追溯**——只有註冊之後的事件查得到。
3. **聚合**：`scripts/qiugian-aggregate.mjs`（每 3 小時 cron）按廟輸出近 7 天
   求籤數與同籤分布到 `src/data/qiugian-stats.json` 的 `_temples` 鍵。
   查現況：`node -e "console.log(JSON.stringify(require('./src/data/qiugian-stats.json')._temples,null,2))"`

## 連結慣例（給廟方印刷品／NFC／QR）

```
https://folk.tw/qiugian/<concern>/?temple=<temple_id>&utm_source=temple&utm_medium=offline&utm_campaign=<temple_id 前綴>
```

- `temple` 給求籤事件歸因（進 `_temples` 聚合）；`utm_*` 給 GA4 流量歸因（進管道報表）。兩者互補、都要帶。
- concern 要選**該廟籤系**對映的情境（查 `src/data/concerns.json` 的 `system` 欄）——
  頁面上的「在廟裡抽到了？直接查籤號」正好接住實體抽籤→線上解籤的動線。
- 🔴 slug 與參數格式是對外承諾（印在實體物上收不回來），改法只能加不能改。

碧雲宮（關帝靈籤）可用的兩個入口（2026-08-14 時 `guandi_lingqian` 對映工作／考試兩情境）：

```
https://folk.tw/qiugian/qiuzhi/?temple=moi_10478_%E7%A2%A7%E9%9B%B2%E5%AE%AE&utm_source=temple&utm_medium=offline&utm_campaign=moi_10478
https://folk.tw/qiugian/kaoshi/?temple=moi_10478_%E7%A2%A7%E9%9B%B2%E5%AE%AE&utm_source=temple&utm_medium=offline&utm_campaign=moi_10478
```

## P1 籤詩頁合作主題（2026-08-14 上線）

用戶定案（2026-08-14）：入口是**廟方實體籤紙逐籤印 QR** → 落在該首籤頁帶 `?temple=`：

```
https://folk.tw/poems/<poem_id>/?temple=<temple_id>
```

- 合作白名單＝`src/data/temple-partners.json`（`active` 者生效；`check:integrity` 硬擋廟/籤系/素材檔）。
- 命中白名單：籤詩頁換該廟背景（素材路徑在 `theme.bg`，**目前是本站設計的裝飾素材**，
  廟方授權照片到貨後替換檔案即可、路徑不動）；前後籤導覽帶著參數走。
  **不放落款 banner**（2026-08-15 用戶裁示：授權已確認，頁面不需聲明；`theme.credit` 僅作資料層記錄）。
- 不論是否白名單，`?temple=` 合法即送 `poem_open` 事件（temple 維度）；聚合進 `_temples.<id>.poem_opens`。
- 求籤頁（P0 入口）抽完籤的「看完整籤解」連結會把 temple 參數帶去籤詩頁，兩條入口在籤詩頁匯流。
- 🔴 主題是 **client script 依參數套用**，靜態輸出完全不變——刻意如此（SEO 中性、
  不產生「廟×籤」的 thin duplicate 頁）。**不要**改成預產每廟版本的頁面。

## P2 祈福籤詩圖（前端已上線、後端 `api.folk.tw` 建置中）

- 流程：合作廟籤詩頁（帶 `?temple=`）→ 上傳照片 → `POST https://api.folk.tw/v1/qian-card`
  （multipart：photo/poem/temple）→ OpenAI 生成畫面＋**伺服器端確定性疊字**
  （🔴 籤詩文字絕不交給圖像模型寫——中文會寫錯字，錯字＝杜撰）→ 回傳 PNG → 下載／Web Share 分享。
- 前端 UI 只在 `GET https://api.folk.tw/healthz` 通過時出現——DNS／服務未就緒前自動隱藏，不需旗標。
- 隱私：照片即生即毀不儲存；`/about` 資料與統計段已於同一輪補上據實說明（2026-08-14）。
- 濫用/成本閘門：每 IP 限流＋每日全站上限（429 → 前端顯示「今日名額已滿」）。上限值見服務 `.env`。
- 成功生成送 `qian_card` 事件（temple 維度）→ 聚合進 `_temples.<id>.qian_cards`。

## P2b 預生成籤詩圖（無照片版，2026-08-15）

不上傳照片也能直接下載該籤的現成祈福籤詩圖。分工契約：

- **產圖方（外部，如 codex）**只產「**無文字背景畫**」放
  `/root/folk-qian-api/cards-bg/<temple_id>/<poem_id>.png|.jpg`
  （🔴 畫面不得含任何文字/字母/數字；建議 1024×1536 直式，其他尺寸會被 cover 裁切）。
- 之後跑 `cd /root/folk-qian-api && node compose-cards.mjs`（增量、可重跑）：
  疊上籤詩文字＋落款 → `cards/<temple_id>/<poem_id>.png` → 由
  `https://api.folk.tw/cards/…` 靜態對外（快取 1 小時）。
- 前端籤詩頁以 HEAD 探測該籤有無現成圖，**有才顯示「直接下載籤詩圖」鈕**（列首）；
  下載送 `qian_card_ready` 事件（temple 維度）。
- 不合契約的檔（temple 不在合作名單、檔名不是 poem_id）compose 會列出並跳過，不會整批失敗。

## P2c 一般籤詩頁的隨機風格版（2026-08-15）

無合作廟的籤詩頁（無 `?temple=`）也有同一個生成器介面：

- **風格選擇器**（2026-08-15 加）：`GET /v1/styles` 供前端清單（名稱＋縮圖
  `/style-thumbs/NN.webp`），預設「隨機」。下載與上傳生成都吃所選風格；
  合作廟頁的選擇只影響上傳生成，直接下載仍是廟方版。事件多帶 `style` 維度
  （GA4 已註冊，2026-08-15，非追溯）。
- **直接下載**：`GET api.folk.tw/v1/qian-card/<poem_id>[?style=NN]`——從
  `/root/folk-qian-api/style-previews/<NN-風格>/backgrounds/` 底圖池抽一張
  （指定風格＝只在該風格抽；未指定＝全池隨機）、套 `style-presets.mjs` 對應
  風格框＋疊正確籤詩文字。純 sharp 合成、不經 OpenAI、不吃每日額度；`no-store`。
- **上傳生成**：`POST /v1/qian-card` 不帶 temple → 一般頁；`style` 可指定
  （'01'…'10'，prompt 用風格名引導、框面同步），未指定＝合作廟走 01、一般隨機。
  帶了不合法的 temple 或 style 皆 400。額度照舊。
- 風格池目錄對應規則：資料夾名前綴 `NN-` ↔ `STYLE_PRESETS[NN-1]`；
  丟新底圖進 `backgrounds/` 即自動入池（10 分鐘內生效，不需重啟）。
- 合作廟頁行為不變（固定風格 01＋廟名落款＋cards/ 預生成圖）。

## P3 廟方自動報表（尚未做）

- `_temples` 聚合（week_draws／poem_opens／qian_cards）→ 週報。folk-outreach 對廟方的價值主張範本。

## 誠實界線

- GA4 計數會被廣告攔截器吃掉一部分——對廟方的說法是「趨勢與量級」，不承諾精確計數（用戶已確認 P0 夠用）。
- 專屬頁措辭：「○○宮採用關帝靈籤」這類**廟的事實**必須有籤系覆寫＋來源才可寫（見紅線 1）。
