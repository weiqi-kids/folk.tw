# 部署、驗證套件與各道 gate

> push main 即上線、無 staging。每一道 gate 都是拿事故換來的，移除前先讀它為什麼存在。

> 2026-08-06 自 `CLAUDE.md` 抽出並依主題重新分組，**原文一字未改**。
> ⚠️ **本檔是決策的歷史脈絡，不是現況規格。** 實作以程式碼與 gate 為準——
> 兩者不一致時**信程式碼**，並回頭在這裡標上更正。數字同理，一律跑指令查。
> 回索引：[`../README.md`](../README.md)｜總路由：[`../../CLAUDE.md`](../../CLAUDE.md)

## 目次

- **驗證套件與各 gate**
  - 驗證套件
  - `check:copy-voice` 補掃資料 JSON 的散文欄位
- **部署後通知搜尋引擎**
  - 主動通知搜尋引擎
- **部署驗證的陷阱**
  - 部署驗證坑

---

## 🔴 2026-08-19 更正：gate 清單已收斂成一份 manifest，本檔以下各節的**清單**已過期

> 本節以下（含「`check:anchor-text` 是部署擋門」「pre-push hook」「驗證套件」三節）
> 記的是**當時**的手抄清單。2026-08-19 起，「哪些 gate 要跑、什麼順序、吃什麼輸入」
> 的唯一真實來源是 **`scripts/lib/gates.mjs`**，`deploy.yml`／`.githooks/pre-push`／
> `scripts/check-changed.sh` 三個消費端都改成讀它，`CLAUDE.md` §3 也改成叫人跑
> `node scripts/lib/gates.mjs table` 查。**要知道現在跑哪幾道，跑那個指令，別讀下面的名單。**
>
> 收斂時一併修掉三個實測確認的缺陷（原因是四份清單各自手維護、沒有東西會發現矛盾）：
>
> 1. **`check:anchor-text` 排錯層**。它走訪 `htmlFiles('dist')`（`scripts/check-anchor-text.mjs:19-27`），
>    檔頭第 15 行寫明要在 `build:release` **之後**跑。`deploy.yml` 排對了，
>    但 `CLAUDE.md` 舊的 `&&` 鏈把它排在 build **之前**，下面「pre-push hook」那節也把它
>    列進「快、且純檔案掃描」那批。`dist/` 在 `.gitignore` → 本機等於掃一份舊 build 空過，
>    乾淨工作目錄則 `readdirSync` 直接拋錯。**已改為只在 `ci-post-build` 出現。**
> 2. **`check:festival-calendar` 是孤兒**：只存在於 `package.json`，全 repo 沒有任何東西跑它。
>    實測 0.85 秒、純讀 `src/`（檔頭自述「不需 build」）、當下就是綠的 → 納入 pre-push 與 CI。
> 3. **`verify:almanac` 沒有自動路徑**：只在本檔與 `RELEASE-CHECKLIST.md`，CI 沒接——
>    而下面「pre-push hook」那節還寫著「那些留給 CI」。實測 3.9 秒 → 納入 `ci-pre-build`。
>
> ⚠️ 因此**上一節那句「日後在 deploy.yml 新增任何 gate step，同一回合要補進 CLAUDE.md §3 與本檔」
> 已作廢**：新增 gate 只改 manifest 一處，四個消費端自動跟上，不必再手抄。

## 🔴 `check:anchor-text` 是部署擋門，但長期不在任何驗證清單裡

`.github/workflows/deploy.yml:60` 有獨立的 `run: pnpm check:anchor-text` step——**它會擋部署**。
但 2026-08-06 稽核前，`CLAUDE.md` 的驗證套件與本檔的 gate 清單**都沒列它**：
照文件跑完整套仍可能被 CI 擋下，而且看不出為什麼。已補進 CLAUDE.md §3。
⚠️ **日後在 deploy.yml 新增任何 gate step，同一回合要補進 CLAUDE.md §3 與本檔。**

## 🔴 `pnpm notify` 的高槓桿清單 CORE **有兩份，改一份等於沒改**

```
scripts/index-ping.mjs:33     const CORE = ['/', '/almanac/', …]
scripts/indexnow-ping.mjs:33  const CORE = ['/', '/almanac/', …]   ← byte-identical 的第二份
```

只改一支 → Google 送新清單、IndexNow 送舊清單，而 `pnpm notify` 畫面照樣顯示「完成 2/2」。
**這正是本檔已記錄過兩次的同一種失敗模式**（`--from` 只實作在一支、`index-ping` 靜默吞第一個網址）：
**參數／清單解析出錯，而輸出看起來完全正常。**
🔴 **改 CORE 一律兩支一起改，改完實際比對兩支的送出筆數。**
（`check:outbound-urls` 會掃兩支的網址尾斜線，但**不會**檢查兩份清單內容一致。）

## 🔴 部署觸發規則：**兩個**例外，不是一個

`git push origin main` 會自動觸發 `deploy.yml`（`on: push`，2026-07-02 實測確認）。
**push 後絕不可手動補跑**——⚠️ 但「絕不可」有**兩個**明確例外，兩者條件不同，別搞混。
（2026-08-06 稽核發現：原本這兩個例外分散在 `CLAUDE.md` 與 `docs/seo-automation.md`，
**各自被稱為「唯一例外」**，互相打臉。故統一收在這裡，其他檔一律指向本節。）

**為什麼預設不可補跑**：同 SHA 兩個 run 搶 Pages 佇列 → 先到者逾時取消部署時，
會把該 SHA 的 build version 標成 `cancelled` → **後續同 SHA 部署全部秒失敗**，
只能推新 commit 換 SHA 解。（2026-07-02 實例：`d7ef155` 三連敗。）

| 例外 | 條件 | 動作 | 為什麼安全 |
|---|---|---|---|
| **A. 補觸發** | 等約 2 分鐘後，**本 SHA 的 run 數為 0** | `gh workflow run deploy.yml --ref main` | 沒有既有 run，不存在同 SHA 雙 run |
| **B. 重跑** | 本 SHA **有** run，但 `deploy` job 因 Pages 服務端暫時性錯誤失敗（**`build` job 成功**） | `gh run rerun <run-id> --failed` 重跑**同一個 run** 一次 | 不另開 run，無毒化風險（2026-07-04 實證）。再失敗交人工 |

🔴 **兩個例外都只准做一次。** 若已有本 SHA 的 run 而你想「再開一個」，一律不可以。

### 🔴 `[skip ci]` 會連別人的 commit 一起吃掉（2026-08-08 做成機制）

`[skip ci]` 是**看 push 的 head commit 訊息**決定跑不跑 workflow，不是看單一 commit。
所以當本機還有未推送的 commit 時，一支 cron 推上來就變成：

```
origin/main ← [某人手動的 feature commit] ← [cron commit「… [skip ci]」] ＝ head
```

**整個 push 一個 run 都不會產生**——前面那顆 feature commit 被順手帶上去、卻永遠不會被部署，
線上停在舊版而且沒有任何告警。這就是 `CLAUDE.md` 紅線 #3 描述的情形。

2026-08-08 差一點就這樣：`4d22b8e chore(qiugian): … [skip ci]` 插在兩個手動 commit 中間，
當時是因為「commit 完立刻自己 push」才沒事——**那是運氣，不是機制**。

**現在的機制**：`scripts/lib/skip-ci-suffix.sh` 是 `[skip ci]` 的唯一判定入口。
判準是 `origin/main..HEAD` 只要有任何 commit，就**不加** `[skip ci]`，讓 CI 正常跑、
把那些 commit 部署出去（代價只是多一次 build）。
⚠️ 之後**新增任何會 commit 的自動化，一律 source 那支 lib，不要自己寫死 `[skip ci]`**。

🔴 **2026-08-09：這道機制當時只蓋到 repo 內的 cron，漏了真正在跑的那兩支——當天就被咬。**
本節原本寫「三個會 push 的 cron 都接上了：`qiugian-aggregate-cron.sh`、`seo-collect-cron.sh`、
`seo-brain-cron.sh`」。實際查證：**collect 與 brain 的 cron 進入點根本不是那兩支**——
`/etc/cron.d/seo-ops` 呼叫的是 `/root/seo-ops/bin/seo-collect.mjs` 與 `seo-brain.sh`，
而 `scripts/seo-brain-cron.sh` 檔頭自己就寫著「2026-07-02 已退役，僅留查考」。
於是 `[skip ci]` 在 seo-ops 那邊是寫死的（`lib/config.mjs` 的 `commitMessage`＋
`bin/brain-prompt.mjs` 的 no-op 指示），繞過本機制。
**當天實害**：brain 推 `a400c1b`（no-op，帶標記）把手動 commit `043cc0c`
（廟宇頁 title／簡介／地址改動）一起帶上 main，**兩個 SHA 都 0 run**，改動躺在 main 上沒部署。
已修在來源端：`seo-collect.mjs` 於 commit **前**查 `git rev-list --count origin/main..HEAD`，
大於 0 就把標記整段拿掉並印警告；`brain-prompt.mjs` 對 headless Claude 下同一條指示。
⚠️ **教訓不是「再補一支 cron」**：是「機制寫在 repo 裡，但執行者在 repo 外」——
`git remote get-url origin` 查得到服務對應哪個 repo，**cron 呼叫的是哪支檔案要去 `/etc/cron.d/` 查**，
別照文件裡的檔名推論。
（`topical` 三支不受影響：它們跑在每輪 reset 到 `origin/main` 的隔離 worktree，看不到本機 commit。）

### 🔴 在 commit 訊息裡「討論」CI 略過標記，等於真的觸發它（2026-08-08 當場踩到）

GitHub 判斷要不要略過，看的是 head commit 的**整段訊息，不只是標題**。
所以寫一則「說明該標記為什麼危險」的 commit message，就會**真的**略過那次 push 的所有 workflow。

2026-08-08 實例：`bb08b99`（訊息內文出現 5 次）與 `e0ea900`（1 次）**各 0 個 run**。
諷刺的是那兩個 commit 正是在修同一類問題，而 `CLAUDE.md` 紅線 #3 早就用括號提過這個
「連帶陷阱」——**光寫在文件裡不夠，得擋在路徑上**。

機制：`.githooks/commit-msg`。規則是該標記**只准出現在標題行結尾**（自動化就是那樣用的），
出現在內文任何位置一律擋下並要求改寫。四種情形都實測過（內文提到／標題中間／
cron 正常用法／用全形括號談論）。要在訊息裡談論它，寫「該標記」「CI 略過標記」
或用全形括號「［skip ci］」。

⚠️ 補救：這種 commit 已經推出去時，**別急著補跑 workflow**——先確認站上內容有沒有真的變。
若後續還會有 push，下一次 push 自然會把它們一起帶進 CI（本節這三道機制就是這樣收尾的）。
真的需要單獨補觸發，才走上面「部署觸發規則」的例外 A，且只准一次。

### 🔴 pre-push hook：驗證必須涵蓋「真的要送出去的那個狀態」（2026-08-08 建）

2026-08-08 實際發生：順序是「跑 `check:doc-numbers` ✓ → 又編輯了一份 docs → commit → push」，
於是回報的「本機 gate 全綠」涵蓋的是**上一版**，CI 用最終版跑就紅了。
**驗證的效力綁在檔案內容上，不綁在「我今天跑過了」這件事上**——
跑完 gate 之後只要再動過任何檔，那次驗證就作廢。

`.githooks/pre-push` 在 push 這條必經路徑上跑九道快速 gate（實測合計約 7 秒）：
`doc-numbers`／`design`／`design-tokens`／`copy-voice`／`scoped-styles`／`anchor-text`／
`integrity`／`content`／`outbound-urls`。
刻意**不**跑 `astro check`（約 40 秒）、`verify:almanac`、`build`（約 20 分）——那些留給 CI；
這支的目的是「不要讓明顯的東西溜過去」，不是取代 CI。

- 安裝方式是 `git config core.hooksPath .githooks`（hook 放版控目錄，`.git/hooks` 不進 repo，
  換機器或重新 clone 會沒有——**重新 clone 後要再跑一次那行**）。
- ⚠️ **限制**：gate 掃的是工作樹，不是即將推送的 commit。工作樹乾淨時兩者相同；
  髒的時候只警告不擋——因為髒工作樹對 cron 是正常的
  （`qiugian-aggregate-cron` 會刻意留著 `topical.json` 的 WIP 不動它）。
- 要跳過得打 `git push --no-verify`，是刻意動作，不會不小心發生。

### ⚠️ `deploy` 報 failure ≠ 沒有部署（2026-08-06 實證，同日連三次）

`actions/deploy-pages` 會在等待 Pages 確認時逾時（log 是 `error_count: 10` → `Timeout reached, aborting!`），
**但站上內容其實已經更新**。同日三個 run（`30a74c7`／`016d41c`／`7765bda`）都是這個形態：
`build` job 全綠、`deploy` job 逾時失敗，而 curl 線上實測**新內容都在**。

所以看到 deploy 失敗時，**先 curl 線上確認，不要反射性套用例外 B 去重跑**——
重跑一個其實已經成功的部署，就是自己製造「同 SHA 兩個 run」的毒化風險（本節開頭那條）。

**但它有一個真實副作用**：`indexnow` job 的條件是 `needs: [deploy]`，deploy 記為 failure 時
**它會被 skip**＝那次部署沒有送出索引通知。確認內容已上線後，手動補一次：
`pnpm notify <改動的網址…>`（別用 `--all`，那會把上萬個網址丟給 Indexing API）。
`notify-failure` 那則 Slack 告警同理，是「假警報但有用的提醒」，不要拿掉。


## 驗證套件與各 gate

- 日常變更先跑 `pnpm build:changed`：它依相對 `origin/main` 的變更檔案，只選擇型別／資料／文案／外連等來源 gate，不產生 `dist`。
- 正式驗證套件（push 前跑）：`pnpm check:integrity` / `pnpm check`(astro) / `pnpm check:scoped-styles` / `pnpm check:design` / `pnpm check:design-tokens` / `pnpm check:copy-voice` / `pnpm check:content` / `pnpm check:outbound-urls` / **`pnpm check:anchor-text`** / `pnpm verify:almanac` / `pnpm build:release`（build 後另有 `check:canonical`／`check:rendered`／`check:discover`）
  - 🔴 **`pnpm check`（astro check）是 CI 擋門、但不在 `pnpm build:release` 裡**（2026-08-03 立）：
    deploy.yml 的 build job 有獨立的「型別檢查」step 跑它，型別錯誤會讓 **build failure、deploy skipped**。
    而 `pnpm build:release` ＝ `check-design && check-content && check-outbound-urls && astro build`，**不含型別檢查**；
    大腦／反思層的 gate 是 `check:integrity + build`，**同樣不含**。
    後果實例：今早 `[auto-claude-reflect] 194e665` 加了 `/events/[id] → /festivals/[slug]` 反向連結，
    `festivals.json` 部分條目的 `event_refs` 是空陣列字面量 → TS 推成 `never[]`、`.includes(string)` 報
    `ts(2345)`，**從 08:24 起兩次部署全部卡住、線上內容停在 `63c20e2`，且無任何告警**
    （自動化層自己不跑型別檢查，所以它不知道自己推壞了）。修法＝顯式標型別（commit `cbff645`）。
    ⚠️ **從 JSON 衍生欄位時一律顯式標型別**（`(f as { xxx?: string[] }).xxx ?? []`），別靠 TS 推斷。
    ⚠️ 手動 push 前 `pnpm check` 要跑；**自動化層目前沒有這道 gate，是已知缺口**。
  - **尾斜線兩道 gate，守的是兩個不同表面，別搞混**（2026-07-28 立；此根因已復發三次）：
    `check:canonical`（build 後）掃 **dist 產物**的內部網址（nav/canonical/og:url/JSON-LD/sitemap）；
    `check:outbound-urls`（已內建進 `pnpm build:release` 最前段）掃 **`scripts/` 裡會被主動送出去的網址**
    （`pnpm notify` 的 CORE 清單、各報表腳本的追蹤網址）。**後者是前者長期的盲區**——站台輸出乾淨，
    但 `pnpm notify` 的 9 個高槓桿網址裡有 8 個不帶尾斜線，每次部署後都在對 Google Indexing API 與
    IndexNow 送 301 網址，GSC 因此累積「頁面會重新導向」且來源標成**網站**（＝我們自己提交的）。
    另有第三層 runtime 保底：`index-ping.mjs`／`indexnow-ping.mjs` 送出前 `normalizeUrl()` 補斜線並印警告
    （gate 擋靜態寫死的、normalize 擋命令列參數這類動態來的）。
  - **`check:discover`（2026-08-12 新增）**：掃描 `dist` 每一個 `index.html`，不只文章候選頁；所有 indexable 頁都驗 title、description、self-canonical、單一 `main` h1、`max-image-preview:large`、可取得的 `og:image`，並對照 sitemap 是否誤收 noindex。內容型候選頁另外提示正文偏薄、共用品牌圖或非 1200×630／1200×675 主圖。這是 Discover 的「有資格被系統考慮」前置檢查，不宣稱 Google 必然推薦；FAQ／Q&A 頁也會先經過同一套 indexable 檢查。
  - `check:design`（2026-07-20 新增，**團隊統一設計規範守門 v2**，已內建進 `pnpm build:release` 最前段＝本機/CI/seo-ops gate 全繼承）：掃 `src/**/*.{css,astro,svelte}` **六條**規則（原文寫五條，漏了第 6 條「`--text-*` 階梯下限 ≥18px／1.125rem，clamp() 以最小值計」；以 `scripts/check-design.mjs` 檔頭為準）——①font-size 禁 px（一律 `var(--text-*)`）②顏色（hex/rgb/hsl）只准 `src/styles/variables.css`（token 唯一來源；oklch/color-mix/var 合規）③禁 `!important` ④禁外部 CDN（fonts.googleapis/cdnjs/unpkg/jsdelivr）⑤src/ 下 .css 白名單只准 `src/styles/{variables,global}.css`（元件樣式寫 scoped `<style>`）。本站唯一例外＝`<meta name="theme-color">`（HTML 規格只能字面色，腳本內註明）。token 已於 2026-07-20 自 global.css 拆出 `variables.css`（global.css 首行 `@import` 保持載入順序）。見 `scripts/check-design.mjs` 檔頭。
  - `check:copy-voice`（2026-07-18 新增，deploy.yml build gate＋大腦 headless 自驗）：攔「面向使用者的產品文案出現 AI 療癒腔／假掰詩意」（源自用戶反覆要求去 AI 味、人眼仍漏，如 /qiugian「…回來說一聲——你可能是第一個」）。只掃 `src/**/*.astro`（資料 json 含公有領域古文不掃），禁語清單**逐次養、只收嚴不放寬**（種子＝記憶 copy-voice-no-ai-speak 的地雷＋歷來被抓到的句子）。命中即擋部署。新增禁語直接在 `scripts/check-copy-voice.mjs` 的 `BANNED` 加一列。
  - `check:content`（2026-07-21 新增，跨站統一去 AI 味引擎，已內建進 `pnpm build:release`：`check:design && check:content && astro build`）：掃**文章正文** `src/**/*.md(x)`——典故 137＋籤解 215，2026-08-06 實查；原寫 160，是籤系仍 2 套時的數字——，與 `check:copy-voice` 掃 UI `.astro` 是**不同表面、互補不替換**。引擎＝`/root/.claude/skills/new-astro-site/templates/check-content.mjs` 統一版（強指紋單命中即 ERROR＋詞彙/句式/結構/語氣四層軟訊號跨 ≥3 層升 ERROR），另把 folk 療癒腔黑名單 port 進 `SITE_ERROR_TELLS`（`放下了`/`釋懷了`/`(添|多)了一分暖`/`不是一個人走過`/`照亮彼此`/`你的消息會陪`/`你(可能|可以…)是第一個`），與 UI gate 規則同源。**grandfather**：預設只掃相對 origin/main 變動的 md（既有 297 篇存量不回溯擋，全站盤點 `pnpm check:content:all` 永遠 exit 0）；CI 淺 checkout 抓不到 base 時掃 0 檔安全放行。新增禁語時 UI 補 `check-copy-voice.mjs`、文章補 `check-content.mjs`，兩處同步。首次全站盤點：298 檔 0 ERROR、178 WARN（172 為破折號單層軟訊號，未達門檻不擋）。
  - `check:scoped-styles`（2026-07-17 新增，deploy.yml build gate）：全站攔「Astro scoped `<style>` 套不到 client JS 注入 DOM」的 bug 類別（源自 /qiugian 抽籤結果卡四句擠一行事故）。命中即擋部署；修法＝該規則移 `<style is:global>`＋容器 id 命名空間。見 `scripts/check-scoped-styles.mjs` 檔頭。
  - `check:design-tokens`（2026-07-17 新增、2026-07-18 收嚴，deploy.yml build gate；**2026-07-20 起與 v2 `check:design` 並存保留**——它的 font-size 規則比 v2 嚴：`<style>` 內任何硬編數值（含 rem/em）皆擋，v2 只擋 px，移除即放水故不撤）：守設計系統房規（見 memory design-system-tokens）。兩層皆**硬 gate 零容忍**：**顏色**＝`<style>` 內禁 hex/rgb/hsl（改 `var(--…)`／`oklch`／`color-mix`；`<meta theme-color>` 屬 HTML 合法例外不掃）；**font-size**＝必須 `var(--text-*)`，任何硬編數值皆擋。（原 69 處非階梯值已於 7/18 全數語意對映到 token、基線機制已移除，不再有「暫時放行」。）
    **2026-08-08 加第三層｜token 必須存在**：`<style>` 內的 `var(--x)` 若沒有在
    `variables.css`／`global.css`／同檔區域宣告過即擋。理由是這種錯**不會報錯也不會變色，
    是整條宣告安靜失效**——當天全站掃出 8 處（`--muted` 5 處應為 `--ink-soft`、
    `--rule` 2 處應為 `--line`、`--surface-soft` 1 處應為 `--paper-2`），
    後果是 `/zodiac/` 那十二格的 `border: 1px solid var(--rule)` 整條無效、
    **完全沒有邊框**，使用者看不出可以點；前兩層完全掃不到，因為它形式上合規。
    註解裡提到的 token 名稱會先被剝掉再掃，不算引用。
    見 `scripts/check-design-tokens.mjs` 檔頭。

- [x] **`check:copy-voice` 補掃資料 JSON 的散文欄位（2026-07-31）**：原本 `check:copy-voice` 只掃
      `.astro`、`check:content` 只掃 `.md(x)` → **由 AI 產製、存在資料 JSON 裡的散文兩道 gate 都不掃**
      （藥籤醫師解說 330 首 × 4 段就是這種）。當初排除 JSON 的理由是「含公有領域古文會誤判」，
      故改為**白名單**（`PROSE_JSON`）：只列確定全部是現代散文的檔與欄位，不整批放行 JSON。
      新增 `AI_TELLS` 通用套語表（總的來說／值得注意的是／讓我們／首先…其次…）。反例已實測會擋。

## 部署後通知搜尋引擎

- **主動通知搜尋引擎（部署後跑這支）**：`pnpm notify [url...|--all]`＝一鍵雙推，
  同一組網址同時送 Google＋IndexNow，涵蓋互補（Google 不參與 IndexNow）。
  - 無參數＝高槓桿集（各模組首頁＋封存＋月份樞紐）；帶 url＝只送指定頁；`--all`＝整份 sitemap；
    `--from <檔>`＝從檔案逐行讀網址（大批量用）。
  - **待送佇列（2026-07-28）**：Google Indexing API 每日配額 200，一次要送幾百頁必然撞 429。
    撞到（或超出單次上限）就把剩下的存進 `/root/.config/folk-tw/index-ping-queue.json`，
    **下次執行優先送、成功即移除**，跨天自動續完，不必人記得補送。佇列刻意放 repo 外——
    放進 repo 會被每日 cron 一起 commit 並觸發部署。
  - ⚠️ **`--from` 兩支子腳本都要支援**（2026-07-30 修，commit `5ea5dcc`）：`notify.mjs` 把同一組參數
    轉給兩支，但 `indexnow-ping.mjs` 原本沒實作 `--from` → 會把「--from」本身當路徑組成網址送出
    （實測送出 `https://folk.tw/--from`），**真正的 30 筆清單完全沒送到 Bing/Yandex/Seznam/Naver**，
    而畫面只顯示「完成 2/2」看起來像成功。加子腳本參數時**兩支要對齊**。
  - ⚠️ **`index-ping.mjs` 曾靜默吞掉第一個網址**（2026-08-03 修，commit `a030482`）：
    `resolveUrls()` 用 `args[fromIdx + 1]` 排除 `--from` 的值，但**沒帶 `--from` 時 `fromIdx = -1`**，
    `args[fromIdx + 1]` 就是 `args[0]`＝第一個網址 → 每次 `pnpm notify <url...>` 都少送一筆給 Google，
    畫面仍顯示「送 N 筆」像成功（IndexNow 那支沒這問題，所以兩邊筆數會差 1，但沒人會去對）。
    實測代價：送節日頁那次被吞的正是 `/festivals/qianggu/`——GSC 實查唯一「URL is unknown to Google」的頁。
    **與上一條同一類：參數解析出錯，而輸出看起來完全正常。** 改參數解析後請實際比對兩支的送出筆數。
  - 內部分別呼叫：`pnpm index:ping`（Google Indexing API，每日配額 200，SA 須為 GSC 擁有者）
    與 `pnpm indexnow:ping`（IndexNow → Bing/Yandex/Seznam/Naver；金鑰檔 `public/<key>.txt`，
    內容＝檔名 stem，須先部署上線供驗證；回 HTTP 202＝已受理待驗證屬正常）。
  - 慣用流程：**改內容 → `git push origin main` 部署 → `pnpm notify`（或帶改動頁 url）**。

## 部署驗證的陷阱


- 部署驗證坑：`gh run list` 要**比對 headSha 是否為本次 commit**，否則會抓到上一次 run 誤判成功。
  - **2026-07-30 實遇「push 沒觸發 run」**：commit `279c351` push 成功（`git ls-remote` 確認遠端 main
    已是該 SHA）、`deploy.yml` 為 `on: push` 無 paths 過濾、commit 訊息無 `[skip ci]`，但**等 8 分鐘完全沒有
    該 SHA 的 run**＝GitHub 端自動觸發失靈。依 playbook 例外條款以 `gh workflow run deploy.yml --ref main`
    **補觸發一次**（此時該 SHA 的 run 數為 0，不存在同 SHA 雙 run 毒化風險），build/deploy/indexnow 三 job 全綠。
    **緊接的下一次 push（`5ea5dcc`）就正常自動觸發**＝屬偶發，不是設定問題。判斷準則不變：
    先等約 2 分鐘、確認「本 SHA 的 run 數為 0」才補觸發；**若已有本 SHA 的 run，絕不再開第二個**。
  - 🔴 **2026-08-05 新病灶：cron 的 `[skip ci]` commit 會把「人剛 commit 但還沒 push」的改動一起吞掉不部署。**
    經過：手動 commit `121970d`＋`ee3053b`（撤 13 頁祈福頁）後**還沒 push**，就先跑 build 驗證；
    這期間 seo cron 在主工作樹 `git rebase --autostash origin/main` → 自己 commit
    `4acd1b7 chore(seo): … [skip ci]` → `git push origin main`，**連我那兩個一起推上去**。
    GitHub 只看 **head commit** 的訊息 → 見到 `[skip ci]` → **整個 push 不觸發 workflow**。
    結果：改動在 repo 裡、`git push` 回「Everything up-to-date」看起來一切正常，
    但**線上內容仍是舊版，且沒有任何告警**（與 2026-08-03 型別檢查那次同一類：靜默停在舊版）。
    - **判準**：`git push` 回 up-to-date **不等於已部署**。一律再查一次
      `gh run list --workflow deploy.yml --json headSha` 有沒有「本 SHA」的 run。
    - **修法**：本 SHA run 數為 0 → `gh workflow run deploy.yml --ref main` 補觸發（同上例外條款，無毒化風險）。
    - **預防**：**手動 commit 後立刻自己 `git push`**，不要留在本地等 build 或等驗證跑完。
      本 repo 有多支會 push 的 cron（seo-ops 三層／qiugian-aggregate／topical P1·P2·P4），
      留在本地的 commit 隨時會被別人的 `[skip ci]` head 帶上去。
    - 🔴 **連帶陷阱：commit 訊息裡「提到」那個標記，也會觸發它**。GitHub 比對的是 head commit
      訊息裡有沒有那個字串，**不管你是在下指令還是在描述問題**。實例：記錄上面這條病灶的
      commit `b5d3de2`，訊息中為了說明而寫了該標記的字面形式 → **自己被跳過、run 數 0**
      （該次只改 CLAUDE.md、不影響站台，故未補觸發）。
      **要在 commit 訊息裡談這個標記，就用「那個標記」之類的說法帶過，不要寫出字面形式。**
