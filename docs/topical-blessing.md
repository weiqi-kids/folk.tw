# 時事集氣祈福 — 自動化 SOP / Runbook

> 神酷 folk.tw「時事層」：真實災難發生時，自動立一頁「為○○祈福／集氣」，事件過後轉成可長期查閱的
> **事件記錄頁**並持續追蹤後續發展。**全自動跑在本機 cron**；本檔為單一真實來源，改動管線前先讀。
> 建置：2026-07-20（P1-P4 通用化＋歷史記錄化）。

## 0. 紅線（不可破，改任何一支腳本都要守）

1. **只做正向祈福**：為平安／復原／集氣。非政治、非爭議對立、非消費痛苦、不對災難算吉凶、不變現。
2. **絕不杜撰**：每個事件、每筆後續更新都必掛**可查證的真實來源 URL**，且經**機器複驗**（見 §3）。
3. **面向使用者文案絕不出現具體傷亡／災損數字**（幾人罹難、幾棟受損、幾人疏散、金額…）。
   理由：那些數字未經機器複驗、且隨救援變動；本站是祈福站不是災情速報。
   **這是機器強制的硬 gate（`scripts/lib/topical-guard.mjs`），不是靠 LLM prompt 自律**——見 §3。
4. **slug 永久承諾**：`/qiugian/blessing/<id>/` 一旦上線就不可改、不可 404。
5. **地名以來源原文為準**：有台灣通用譯名才用；中文來源地名（如「重慶市彭水縣」）直接沿用原漢字、不另譯。

## 1. 管線總覽（4 支腳本 + 對應 cron，皆在 `/etc/cron.d/folk-qiugian`）

| 階段 | 腳本 | cron（UTC） | 職責 |
|---|---|---|---|
| P1 結構化偵測 | `topical-orchestrate.mjs` | `*/20`（每 20 分） | USGS 地震＋GDACS 全球災害 → 去重 → 正向閘 → 開頁；逾 14 天歸檔 |
| P2 新聞掃描 | `topical-news-scan.mjs` | `13 3,11,19`（每 8h） | LLM+WebSearch 掃新聞型長尾（山崩/橋垮/氣爆…）→ 機器複驗 → 開頁 |
| P4 後續追蹤 | `topical-followup.mjs` | `30 12`（每日） | 追蹤中事件找新進展 → 機器複驗 → 掛源接時間軸；archived 有後續→memorial |
| （集氣聚合） | `qiugian-aggregate.mjs` | `0 15`（每日） | GA4 → 集氣人數；峰值凍結回寫 `bless_snapshot` |

每支都有 `*-cron.sh` 包裝：`pull --rebase --autostash → 跑 → topical.json 有變才 commit/push（觸發部署）→ Slack 通知`。
腳本自身**不碰 git**；支援 `--dry`（只印不寫）。**push main 即自動部署，勿手動補跑 workflow**（見根 CLAUDE.md）。

### 事件生命週期（同一網址走三態，`src/data/topical.json` 的 `status`）
```
active（即時集氣，集氣鈕）──逾14天(P1)──▶ archived（薄頁+集氣快照, noindex）
                                              │ P4 掛上首筆有來源的後續
                                              ▼
                                         memorial（事件記錄頁：凍結集氣快照＋後續發展時間軸, 有 updates 才 index）
```
- active→archived 只由 P1 orchestrator 做；archived→memorial 只由 P4 做。互不侵犯。
- 頁面模板 `src/pages/qiugian/blessing/[slug].astro` 依 status 分三態渲染。
- `example: true` 的條目（範例頁）永久 noindex、永不進 sitemap。

## 2. 偵測來源（可插拔）

- **USGS 地震**：台灣周邊規模 ≥5.0／全球 ≥6.8。
- **GDACS**（歐盟 JRC，免金鑰，走 `xml/rss.xml`）：只取 Orange/Red 的 **TC 熱帶氣旋／FL 水災／VO 火山／WF 野火**；
  **排除 EQ（地震歸 USGS 免雙源）與 DR 乾旱（非急性）**；座標取 `geo:lat`/`geo:long`。
- **LLM 新聞掃描（P2）**：涵蓋不在結構化 feed 裡的長尾（山崩/橋垮/氣爆/重大火災…）。
- 未接：CWA 颱風陸上警報（需一次性註冊氣象會員金鑰，暫緩靠 GDACS TC 涵蓋）。新增來源＝在 orchestrate 的
  `DETECTORS` 註冊表加一個回傳統一候選 `{id,eventType,place,time,lat?,lon?,sources[]}` 的偵測器即可。

## 3. 兩道機器硬 gate（本站命脈，不靠 LLM 自律）

### (a) 防杜撰：來源機器複驗（P2/P4）
LLM 回報的候選**一律不信其自述**，逐一機器驗證：
- ≥N 個 `http(s)` 來源（P2 開頁需 ≥2、P4 更新需 ≥1）。
- **逐一實 `fetch`（browser UA、redirect follow、15s timeout），要求最終 2xx 存活**達門檻；死連結/擋爬者剔除。
- **內容比對**（P2）：去 HTML 標籤後至少一頁需含事件關鍵詞（地名等），擋「真 URL＋假內容」。
- 去重：見下方 §3.5（2026-07-25 重寫）。時效：只收近 21 天內、非未來。
- 失敗一律保守 **block/丟棄**（寧漏不錯）。

### 3.5 同事件去重：`scripts/lib/topical-dedup.mjs`（純函式，可回測）

> ⚠️ **2026-07-25 事故（修法的由來）**：2026-07-17 重慶彭水山崩被 P2 開了**三頁**——
> 「重慶市彭水縣」／「重慶市彭水苗族土家族自治縣」／「重庆彭水县汉葭街道」。
> 根因：prompt 要求「地名用來源原文」（紅線 5），而去重只有 `normPlace` **字串完全相等**這條退路；
> 新聞型事件又沒有座標（`km()` 回 `Infinity`，10km 判定形同虛設）→ 三種寫法互不相等 → 各自開頁
> （id ＝ `hash(normPlace+time)`，也跟著分裂）。`/qiugian/` 清單上同一件事因此列了三次。

`findDuplicate(list, cand)` 三道規則，任一命中即不開頁；全部先要求**時間差 ≤3 天**：

| 規則 | 內容 | 擋得住什麼 |
|---|---|---|
| `place` | `normPlace` 字串相等 | 同一寫法重複回報（原有規則） |
| `source-url` | 候選與既有條目**引用到同一篇報導**（`normSourceUrl`：去 protocol/www/query/尾斜線） | 地名寫法變了但引用同一批新聞——上面事故的第二頁就屬此類 |
| `geo` | 同 `eventType` 且**距離 ≤10km** | 地名寫法與來源都不同時的最後一道；靠座標，與字串無關 |

- **座標哪來**：P2 在複驗通過後對地名做地理編碼（`lib/topical-geo.mjs`，Nominatim，內建 1.2s 間隔＋UA）。
  上述三種寫法實測都落在 29.296,108.161 附近（相距 <0.2 km）。**查無座標或服務失效一律回 `null`，
  去重自動退回字串比對**——不因外部服務掛掉而放行或誤擋。既有條目座標已於 2026-07-25 一次性回填。
- **`list` 要傳全部條目**（含 `mergedInto` 的併頁舊條目）：它們的地名字串仍是擋住同事件再開頁的有效線索。
- **回測**：這是純函式，改規則後請用歷史事故資料驗，至少涵蓋「當初漏掉的三種寫法會被擋」與
  「不同事件（如前橋橋樑坍塌）不被誤擋」兩側。2026-07-25 實測：A 情境（同來源）`source-url` 擋下、
  B 情境（來源全新）補座標後 `geo` 擋下、四種地名寫法全擋、對照組不誤擋。

### 3.6 已重複開頁時怎麼併（`mergedInto`）

紅線 4 說 slug 永久承諾、不可 404，所以**併頁不是刪頁**：

1. 挑一頁當正本（canonical，通常是最早、地名最通用的那個 id），把其餘條目的 `sources` 併進正本（去重），
   後續（`updates`）只挑「內容真正新增且來源網址未用過」的併入——**整份時間軸照搬會在正本頁內製造新的重複**。
2. 被併條目加 `mergedInto: '<canonical id>'`（另記 `merged_at`／`merged_reason`），**條目留在 `topical.json` 不刪**。
3. 其餘全自動：`[slug].astro` 的 `getStaticPaths` 跳過它們 → `astro.config.mjs` 依 `mergedInto` 產靜態
   redirect（meta-refresh ＋ canonical 指向正本 ＋ noindex）→ sitemap 排除 → `/qiugian/` 清單排除 →
   P4 不再追蹤（`isTracked` 回 false）→ P1 不再改其狀態。

### (b) 禁數字：`scripts/lib/topical-guard.mjs`（純函式，三支共用）
- `hasBannedNumber(text)`：偵測「數字（阿拉伯/全形/中文）＋傷亡/災損量詞（人/名/罹難/失蹤/棟/戶/座/億/萬/元…）」。
  **刻意不含 日/月/時/分/個/起/橋/地** → 不誤傷日期、地名、次數。
- 接法：
  - 開頁（P1/P2）：`title` 觸雷→**攔下不開頁**；`event` 觸雷→**換成無數字祈福語 `SAFE_EVENT`**（保住頁面、去掉數字）。
  - 後續（P4）：`update.text` 觸雷→**丟棄該筆**（保留其他乾淨更新）。
- **改守門後務必跑自測**：`node scripts/lib/topical-guard.mjs`（檔尾自帶違規全攔＋正當字零誤傷測試，須綠）。
- LLM prompt 也寫了「禁具體數字」當第一層軟約束（三支的 gate/scan prompt）；**但真正的保證是這道機器 gate**。

## 4. 監看與回退

- **看**：Slack `神酷-folk-tw`（C0BCPHBF1ML）。每次自動開頁／後續更新／升記錄頁都會通知，**可回覆訂正／要求撤下**。
- **回退**：`git revert <sha>`；或直接改 `src/data/topical.json`（改 status、刪條目、修文案）後 push。
- **log**：`/root/seo-ops/logs/folk.tw-topical*.log`。
- **手動跑**：`node scripts/topical-news-scan.mjs`（或 `--dry`）、`node scripts/topical-followup.mjs --dry`。

## 5. 改動守則

- 改事件/更新文案的**產生方式**（prompt）→ 必須確認**兩道硬 gate（§3）仍有效**；prompt 只是第一層。
- 改 `topical.json` schema → 顧及既有 archived 條目**向後相容**（靠 `inferType` 推論）、舊網址不 404。
- 改任何 cron → 同步更新 `/etc/cron.d/folk-qiugian` 註解與本檔（根 CLAUDE.md 紅線）。
- 改 `topical-guard.mjs` → 跑其自測。改複驗邏輯 → 用真實觸雷案例回歸。
- 改 `topical-dedup.mjs`／地理編碼 → 依 §3.5 用歷史事故資料回測（含「不同事件不被誤擋」的對照組）。
- 全站文案／設計另受 `check:copy-voice`、`check-design.mjs` gate（見 CLAUDE.md）。⚠️ topical.json 的
  title/event/update 文字**不被 check:copy-voice 掃**（那只掃 .astro），故其品質靠本頁 §3 gate ＋ 人工 Slack 把關。
