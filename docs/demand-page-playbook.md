# 需求 → 掛源頁：固定流程

> **這份是為了不用每次重談。** 要開新頁、要補內容、要找成長題目，照這裡跑，不要重新發明流程。
> 由來見 §0；每一步都有可以直接貼的指令。
>
> 🔴 **第一鐵則：先盤站內，外部找源是最後手段。**
> `src/data/` 已經有十萬筆以上掛好源的資料，缺的通常是**版位與標題**，不是資料。
> 去外面找來源成本高、還要處理授權，而且常常繞一圈發現自己早就有。

---

## 0. 為什麼是這個流程（2026-08-22 的三個實據）

1. **同一批來源，兩種結果。** appi.news 在 2026-08-19 七夕那一叢吃到 14,790 曝光
   （`/articles/qixi-bed-mother-qiniangma-guide/` 單頁 8,508），本站 `/festivals/qixi/`
   同期 309 曝光、2 點擊。事後查證：它引的是**內政部臺灣宗教文化地圖＋國史館臺灣文獻館**，
   跟我們 `festivals.json` 的 `qixi` 條目掛的是同一批源。**素材在手上，輸的是頁型。**
2. **資料有、版位沒有。** 同日查習俗頁：20/20 都有 `steps` 或 `offerings`，卻全部掛裸名詞
   title（線上實測「普渡｜神酷」）；`taboo` 更是只餵進 `faqPage()` 的 JSON-LD，
   頁面上一個字看不到。改的是版位與標題，**沒有新增任何一筆事實**。
3. **判準早就定了。** 2026-08-20 用戶拍板的需求母體轉向：CTR 由「Google 能不能自己在
   SERP 上答完」決定——裸名詞與一句話事實會被 AI Overview 吃掉，**必須點進來的內容**才有 CTR。
   細節與反例見自動記憶 `demand-corpus-pivot` 與 `src/data/artifact-pages.json` 的 `_readme`。

---

## 1. 盤站內：有什麼資料，哪些沒露出

```bash
# 各資料集筆數（現況一律用指令查，不要引用文件裡的數字）
for f in src/data/*.json; do
  printf "%-38s %s\n" "$(basename $f)" \
    "$(node -e "const d=require('./$f');const a=Array.isArray(d)?d:Object.values(d).find(Array.isArray);console.log(a?a.length:'-')")"
done | sort -k2 -rn | head -25

# 🔴 主力工具：哪些欄位「有資料但模板沒消費」
node scripts/growth-field-exposure.mjs            # 全部
node scripts/growth-field-exposure.mjs practices  # 單一資料集
```

⚠️ `growth-field-exposure.mjs` 是**啟發式**，兩種誤差都會有：欄位出現在模板裡也可能只進
JSON-LD（`taboo` 就是活例）。**真正的驗收是抓線上 HTML 看讀者到底看不看得到**：

```bash
curl -s https://folk.tw/practices/pudu/ | grep -oE '<h2[^>]*>[^<]*</h2>' | sed 's/<[^>]*>//g'
curl -s https://folk.tw/practices/pudu/ | grep -oE '<title>[^<]*</title>'
```

## 2. 對需求：這個題目有人搜嗎、我們現在拿到多少

🔴 **有檔期的題目先跑這支**——它把「哪一檔快到了、那一檔的頁排第幾」變成每天算得出來的事，
不再靠人記得。輸出同時是大腦層每天的第一優先候選（掛在 `brain.preCommands`）：

```bash
pnpm growth:calendar-gaps                      # 未來 120 天
pnpm growth:calendar-gaps -- --days 45         # 只看近期
pnpm growth:calendar-gaps -- --write           # 寫檔＋T-21 內有新缺口就發 Slack
pnpm growth:calendar-gaps -- --as-of 2026-08-01  # 🔁 回測：假裝今天是那天（T-minus 與 GSC 一起撥回去）
```

🔴 **T-21 內的缺口會發 Slack，而且只在狀態改變時發**（同一檔的同一種判讀不重複刷）。
為什麼非有不可：缺口原本只寫進檔案給大腦層讀，而大腦層天天 no-op 時**沒有任何人看得到**；
每日 📊 Slack 又是 collect 層（07:30 UTC）發的，比大腦層（08:40）早，橋接不到。
狀態記在 repo 外的 `/root/.config/folk-tw/calendar-gap-alerts.json`，檔期過了自動清掉。
⚠️ 發送失敗時**刻意不記狀態**，否則那一則就永遠消失了。

🔁 **回測是這支工具的驗收方式**（2026-08-22 站主要求：機制要拿過去真的錯過的事件驗過才算數）。
`--as-of 2026-08-01`（七夕 T-18）實跑會把 `/festivals/qixi/` 標成「沒進候選池」並列入清單
——也就是說，這支工具若當時存在，七夕有 18 天的提前量。
🔴 **回測當場抓到工具自己的一個 bug**，寫下來當防線：原本用 `pageRows.length` 判斷「有沒有查 GSC」，
而那個窗口 `/festivals/` 整批 0 曝光 → 空陣列 → 每一檔都被判成「—」，
**把最該示警的「有頁卻拿不到任何曝光」整批吃掉**。已改成獨立的 `hasGsc` 旗標。
⚠️ 回測有個天生限制：GSC 只看得到「當時已經有頁」的題目，驗不了「我們根本沒開的題目」。

判讀欄（沒進候選池／在第二頁以後／在第一頁下緣／有曝光零點擊）是**編輯提示不是及格線**，
一律回到下面 §3 的三條件判。⚠️ `events.json` 的日期是**散文**（`date_note`，筆數自己跑指令查），
本支刻意不推算它們的國曆日——推算散文日期正是杜撰的溫床；要納入排程請先在資料層補結構化日期。


```bash
# 現成的每日快照（collect 台北 15:30 自動產）
node -e "const d=require('./data/seo-daily/<日期>.json');console.log(d.gsc.range,JSON.stringify(d.gsc.totals))"
```

要查**特定詞或特定頁**（快照只留 top-N，問單一題目一定要直接打 GSC）：

```js
// scratchpad/probe.mjs
import { gscQuery } from '/root/seo-ops/lib/google.mjs';
const KEY = '/root/.config/folk-tw/gsc-sa.json', SITE = 'sc-domain:folk.tw';
const rows = await gscQuery(KEY, SITE, {
  startDate: '2026-08-01', endDate: '2026-08-21', dimensions: ['query'],
  dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'contains', expression: '普渡' }] }],
  rowLimit: 20,
});
```
把 `dimensions` 換成 `['page']`、`expression` 換成路徑就能查單頁。競品同理，改 `KEY`／`SITE`
（設定在 `/root/seo-ops/sites/<站>.json`）。

🔴 **「0 曝光」有兩種意思**，別搞混：**沒人搜**（不要開頁）vs **我們沒有那個頁**（值得開）。
分辨法＝去看有沒有別人靠那個詞拿到曝光。

## 3. 決定頁型：開新頁還是補版位

先問 2026-08-20 那三個條件，**三者同時成立才逐條開頁**：
① 條目名本身就是使用者會打進搜尋框的字　② Google 無法一句話答完　③ 有掛源的權威資料。

| 情況 | 做法 |
|---|---|
| 資料已在站上，只是沒露出／標題是裸名詞 | **補版位＋改成問題型 title**（成本最低、零新增事實）→ §5 |
| 有一叢問題型查詢、站上沒有對應頁 | **開問題型深頁**（yanshui 模型已驗證）→ §4 |
| 只是「某個名詞的定義」 | ⛔ **不要開頁**。AI Overview 一句話答完；反例＝藥籤逐首頁、神明聖誕頁 |
| 想用補內鏈解 | ⛔ 2026-08-03 對節日頁做過、無效；yanshui 只有 1 個 referringUrl 照樣兩天到 pos 2 |

**問題型頁長什麼樣**（骨架照抄 appi、皮不照抄）：
- title＝使用者真的會打的那句話，不是條目名
- 區塊＝對照表／清單／步驟／常見問題（「必須點進來」的東西）
- **一個問題叢集一頁**，不是一個節日一頁

🔴 **不可照抄的三樣**：① 頁尾 `disclosure` 免責區塊——`check:copy-voice` 擋，房規是免責統一由
`/about/` 處理；② AI 生成封面——本站卡片圖要合授權實拍＋署名，且有商業行為故 **NC 授權一律不可用**；
③ `sourceType: editorial` 的單篇 md——本站是資料站，每筆事實要掛可機器複驗的 URL。

## 4. 開新的節日深頁：完整清單（漏一個就 CI 紅燈）

1. **`src/data/festivals.json` 加一筆。** 檔案是標準 2-space JSON，可以 python round-trip
   （改前先驗 `json.dumps(d,ensure_ascii=False,indent=2)+'\n' == 原文`）。
   - 必填：`slug`／`name`／`aliases`／`season`／`question`／`intent`／`lead`／`sources`／`facts`／`published`／`updated`
   - ⛔ **不要給 `draft_week`**——那欄硬要求恰好 52 筆
   - 沒有日期就給 `date_status` ＋ `source_status` 皆 `source_required`，**且一定要有 `date_note`**
   - `image_key` 可借既有背景（`src/assets/og-festivals/*.webp`），查不到會**安靜 fallback**不會報錯
   - `practice_refs[0]` 指到有 `home_festival` 的 practice（如 `pudu`）＝本頁**不可**渲染完整步驟，
     且**必須**連到 `/practices/<id>/`（不變量 `festival/practice-home`，雙向都擋）
2. **同步改三個檔**：`src/lib/festival-og.ts` 的 `FESTIVAL_OG_SLUGS`、
   `scripts/check-festival-calendar.mjs` 的硬編筆數、`src/pages/festivals/[slug].astro` 的
   `campaignSeo`（要問題型 title 就得加這裡，通用模板只會產日期型）。
3. **辭典引文走匯入器，不要手打**：
   ```bash
   # 先在 src/data/th-dict-map.json 的 festival_items 加一筆（每筆都要 basis：憑什麼說是同一個）
   node scripts/import-th-dict.mjs --only <slug>          # 乾跑
   node scripts/import-th-dict.mjs --only <slug> --write
   ```
   它會實抓原文並比對 `dict_name` 防 ID 漂移，比人工貼可靠。
   ⚠️ `th-dict-map.json` 是 **1-space 縮排**，不能用 2-space round-trip，要逐行插入。

**寫 `facts[]` 的紅線**：一句一源、不合併、不外推；純文字（Markdown 會被 `check:copy-voice` 擋，
且模板會 HTML-escape）；**來源原文講的是哪個時節就要寫出來**——辭典很多辭條講的是除夕或年節，
不是中元，直接拿來用就是把別人的話改成我們沒有的事實。

## 5. 補版位／改標題（最高投報，零新增事實）

改的是「資料怎麼被看到」，不是「有什麼資料」。做法見
`src/pages/practices/[id].astro` 2026-08-22 那批註解（問題型 title 產生器＋把
`offerings`／`joss_paper`／`taboo` 從 `<dl>` 與 JSON-LD 拉成 `<h2>` 區塊）。

- title 全形字 **≤30**（含 `｜神酷`），超過會被截在頓號後面等於白寫
- **只改 `<title>` 與 description，不動 `h1` 與麵包屑**——那兩處是實體名稱（同 `/festivals/`）
- 改任何面向使用者的字之前先查 gate：`scripts/` 裡有規則綁著頁面文字的**字面**

## 6. 驗證與上線

```bash
node scripts/lib/gates.mjs table                 # 有哪些 gate、吃 source 還是 dist
node scripts/lib/gates.mjs run pre-push          # 秒級，本機先跑
git push origin main                             # push 即部署，無 PR
gh run list --workflow deploy.yml --limit 3 --json headSha,status,conclusion
pnpm notify <url>                                # 部署成功後推送收錄
```

🔴 **push 完一定要查本 SHA 的 run**；⛔ **絕不手動補跑 `deploy.yml`**（例外與條件見
[`decisions/deploy-and-gates.md`](decisions/deploy-and-gates.md)）。連續 push 時前一個 run 會被
concurrency 取消，那是正常的，**最終狀態看最後一個 SHA**。

產物層 gate（`check:rendered` 的不變量）吃 `dist`，本機要跑得先 `build:release`（≈20 分），
平常交給 CI；新節日頁最容易踩的是 `festival/title-date`（title 沒有國曆 M/D 就一定要有
`date_note`）、`festival/discover-image`（OG 圖 1200×675）、`festival/practice-home`。

## 7. 上線後怎麼判定有沒有用

- **不要看 `index-audit.json` 回答「這頁收錄了沒」**——那是滾動掃描快照（一輪約 6 天）。
  要問就對那幾頁重跑 URL Inspection。
- 檔期型頁面看檔期（yanshui 模型：上線 1 天收錄、2 天 pos 2）；長青題目給兩週。
- 新題材**先開試點、量兩週再決定擴不擴**，別一次開幾千頁——GSC 只看得到「已經有頁的題目」，
  新題材的需求事前量不到。
- 頁變薄或彼此重複時，量法是**只比 `<main>` 內文的 8 字片段重疊率**（樣板底噪約 10%），
  作法見 [`decisions/festivals-and-intent.md`](decisions/festivals-and-intent.md)。

---

## 附：這一輪已經照這個流程做完的（可當範本抄）

| 產出 | 對應步驟 | 範本檔 |
|---|---|---|
| 20 個習俗頁問題型 title＋供品／金紙／禁忌上頁面 | §1 →§5 | `src/pages/practices/[id].astro` |
| `/festivals/haoxiongdi-dijizhu-zuxian/`（三對象對照） | §3 →§4 | `festivals.json` 同 slug 條目 |
| `/festivals/zhongyuan-jinzhi/`（金紙與銀紙、各地用法） | §3 →§4 | 同上 |
| `/festivals/gongpu-sipu/`（公普私普、拜門口幾次、鹿港普度歌） | §3 →§4 | 同上 |
