#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// gate manifest：「哪些 gate 要跑、什麼順序、吃什麼輸入」的**唯一真實來源**。
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 為什麼要有這支（2026-08-19 建）：同一件事實原本手抄在四個地方，
//    而四份互相矛盾、沒有任何東西會發現矛盾：
//      .github/workflows/deploy.yml（CI 實際跑的）
//      .githooks/pre-push（push 前跑的快速 gate）
//      CLAUDE.md §3（人照著跑的清單）
//      scripts/check-changed.sh（依變更路由的日常 gate）
//    實際造成的三個缺陷（皆已實測確認，見下方各 gate 的註解）：
//      ① check:anchor-text 吃 dist，卻被 CLAUDE.md 排在 build **之前**、
//         又被 pre-push 當成「純檔案掃描」跑 → dist/ 在 .gitignore，
//         本機等於掃一份舊 build 空過，乾淨工作目錄則 readdirSync 直接拋錯。
//      ② check:festival-calendar 只存在於 package.json，全 repo 沒有任何東西跑它。
//      ③ verify:almanac 在 CLAUDE.md 與 RELEASE-CHECKLIST.md 裡，但 CI 沒有
//         （pre-push 檔頭還寫著「留給 CI」——CI 其實沒接）。
//
// **為什麼是 .mjs 而不是 .json**：
//   1. 本 repo 的慣例是把「為什麼」寫在檔頭與行內註解裡，JSON 放不下註解，
//      而每一道 gate 都是拿事故換來的，理由跟清單分家就會再次漂移。
//   2. 這支可以自我驗證不變量（fast ⇒ needs:'source'），JSON 只能靠另寫一支去驗。
//   3. 消費端要的是「印出一串 id」，bash 與 GitHub Actions 呼叫 node 一樣方便。
//
// ── 消費端（改清單只改這支，四個地方自動跟上）──────────────────────────
//   node scripts/lib/gates.mjs list pre-push        → .githooks/pre-push
//   node scripts/lib/gates.mjs list ci-pre-build    → deploy.yml（build:release 之前）
//   node scripts/lib/gates.mjs list ci-post-build   → deploy.yml（build:release 之後）
//   node scripts/lib/gates.mjs for-changed          → scripts/check-changed.sh（stdin 讀檔案清單）
//   node scripts/lib/gates.mjs table                → 人看的總覽（CLAUDE.md §3 叫人跑這個）
//
// ── 欄位契約 ────────────────────────────────────────────────────────────
//   id      package.json 的 script 名（消費端一律 `pnpm <id>`）
//   label   中文短標，給 log 用
//   needs   'source' 吃原始碼｜'dist' 吃 build 產物（**決定它只能排在 build 之後**）
//   tier    'fast' pre-push 等級（秒級、純檔案掃描）｜'full' CI／發佈等級
//   stages  消費端會**明確**呼叫它的階段；空陣列＝沒有自動路徑（viaBuild 或人工）
//           'pre-push' | 'ci-pre-build' | 'ci-post-build'
//   viaBuild `pnpm build`／`postbuild` 的指令鏈裡已經串了它 → 消費端**不可**再跑一次
//           （這欄是為了讓清單完整、看得出它沒被弄丟，不是要人再跑）
//   changed  build:changed 的路由分類（見下方 CHANGED_RULES），空＝不參與路由
//   why     一行用途
//
// 🔴 不變量（本檔載入時自動驗，違反直接拋）：
//   - needs:'dist' 的 gate 不得出現在 pre-push 或 ci-pre-build。
//   - tier:'fast' 的 gate 必須 needs:'source'（pre-push 沒有 dist 可掃）。
//   ⚠️ 這裡原本還列了一條「viaBuild 的 gate 不得同時出現在 ci-pre-build／ci-post-build
//      （會跑兩次）」——2026-08-20 查證後**刪除**，因為它是個沒人查的假宣稱：
//      ① 整個不變量區塊從來沒有實作過它；
//      ② 照字面補上去會立刻紅——check:doc-numbers 就是 viaBuild:true ＋
//         stages:['pre-push','ci-pre-build']，而它旁邊的註解寫明那是刻意的
//         （CI 仍明確跑，讓它在 20 分鐘 build 之前就擋下）。
//      也就是說「跑兩次」在這裡不是缺陷而是設計。宣稱與資料矛盾時該修的是宣稱。
//      這正是本檔存在的理由在自己身上的又一個實例：**沒有人查的宣稱會漂走。**
//   - 每個 id 必須存在於 package.json 的 scripts。
//   - viaBuild:true 必須在 package.json 的 build／postbuild 鏈裡找得到對應的腳本檔；
//     反向：沒標 viaBuild 的 gate，其指令不得原封不動出現在該鏈裡。
//
// ⚠️ 新增／移除任何 gate：只改這支，然後跑 `node scripts/lib/gates.mjs table`
//    確認四個消費端拿到的清單是你要的。deploy.yml 與 pre-push **不要再手抄**。

import { readFileSync } from 'node:fs';

/** @type {{id:string,label:string,needs:'source'|'dist',tier:'fast'|'full',stages:string[],viaBuild?:boolean,changed?:string[],why:string}[]} */
export const GATES = [
  // ── 秒級、純檔案掃描：pre-push 與 CI 都跑 ──────────────────────────────
  {
    id: 'check:doc-numbers',
    label: '文件數字守門',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    viaBuild: true, // `pnpm build` 鏈首也有一份；CI 仍明確跑，讓它在 20 分鐘 build 之前就擋下
    changed: ['docs'],
    why: '現況型文件不得寫死會過期的數量（CLAUDE.md／docs/README.md／intake-status／TODO-FOR-TAIWAN）',
  },
  {
    id: 'test:dataset-commit',
    label: '資料集寫入 fixture 測試',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['data'],
    why: 'dataset-commit 的合併/差異量/原子寫入/去重/正規化 21 項；🔴 含「缺 path 直接丟錯」——寫入落點錯必須炸，不能安靜成功',
  },
  {
    id: 'test:text',
    label: '文字工具單元測試',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['text-lib'],
    // 這三條原本住在 check:rendered 裡（needs:'dist'），要跑三行 assert 得先跑完 20 分鐘的
    // build:release。它們不讀 dist 也不讀資料，是純函式的 regression，2026-08-19 搬到
    // src/lib/text.test.ts，回饋週期從分鐘變毫秒。
    why: 'excerptAtBoundary／stripOuterParens／withoutTerminalPunctuation 的三個已知事故樣本',
  },
  {
    id: 'test:event-cycle',
    label: '民俗活動週期造句 golden',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['event-cycle'],
    // 2026-08-20 新增，成因是**線上真的輸出了病句**（curl 實證）：
    //   /events/wanhegong_laoerma_xitun/「…舉行，三年一科年一科。」
    //   /events/nanguanxian_wangjiao/「…非同步年一科」
    // 病灶是 events.json 的 ke_rule 一個欄位同時裝地支與自由文字，而頁面樣板直接串接。
    // 已拆成 ke_branches／ke_period_text／ke_note，造句收進 src/lib/event-cycle.ts。
    // 🔴 這道 gate 釘的是**產出的句子**（golden table 逐字），不是實作細節——
    //    因為判準是對人寫的散文做正規式判定，正規式漂不漂亮無意義，句子對不對才有意義。
    why: '週期造句 golden 9 筆逐字＋全量 67 筆掃 7 種病句型態＋ke_rule 不得復活',
  },
  {
    id: 'test:calendar-date',
    label: '曆別日期換算 golden',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['calendar-date'],
    // 2026-08-20 新增，**預防性**（與 test:event-cycle 不同，這一次沒有已發生的線上錯值：
    // 建立當日全量比對 8,610 筆推導值，改前改後逐一相同）。它擋的是這個病灶：
    //   lunarToNextSolar(mmdd, fromIso) 與 solarMdToNext(mmdd, fromIso) 簽章完全相同，
    //   把農曆月日傳給國曆那一支會通過 astro check、回一個看起來合理的**錯日期**。
    // 已收斂成 CalendarDate discriminated union ＋ nextOccurrence() 單一入口。
    // 🔴 這道 gate 釘的是**算出來的日期與標籤**（golden 逐字），不是實作細節——
    //    每一個值都是頁面上印給讀者看的日子，算錯不紅燈、只會安靜地宣稱一個沒發生的日期。
    why: 'nextOccurrence 日期/標籤 golden 17 組＋回曆一律不換算＋地方慶典與節日全量逐筆（含 zod enum 與 union 的一致性）',
  },
  {
    id: 'test:page',
    label: 'Page（HTML 讀解層）迴歸',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['page-lib'],
    // 2026-08-20 新增。Page 原本是 invariant-runner 的私有類別，「把重複走訪合併成一次」
    // 的好處停在它自己的模組邊界上——邊界外有四支吃 dist 的 gate 各自剖析 HTML。
    // 抽成 scripts/lib/page.mjs 之後，五支消費端共用同一份讀法。
    // 🔴 這道 gate 是 source 層、秒級：Page 吃字串吐結構，測它不需要 dist，
    //    而它的四個消費端全部要等 20 分鐘的 build:release 才跑得到。
    //    讀法壞掉在這裡就會紅，不必等產物層。
    why: 'Page 的 40 項讀法迴歸（title／meta／section／anchors／entity／JSON-LD），純字串輸入',
  },
  {
    id: 'check:lib-loadable',
    label: 'src/lib 可被 gate 載入',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['lib-loadable'],
    // 2026-08-20 新增。這支擋的是**造成「同一條規則兩份實作」的那個條件**：
    // gate 或匯入器載不進 src/lib 的模組，就會自己複製一份。已知病例三個，
    // 其中 invariants/zodiac.mjs 的檔頭直接寫著「zodiac.ts 用無副檔名 import，
    // bare node 解析不到，只能複製正則」——作者自己標註了這個因果。
    // 🔴 為什麼不是去偵測「複製」本身：實際發生的複製**函式都是不同名的**
    //    （fullWidth vs fullWidthLen、dayPillar vs ourDayPillar、
    //    parseSourceRef vs sourceDisplay），同名偵測 0 真陽性、4 誤報（見 docs/adr/0002）。
    //    擋條件比擋行為可行。
    why: 'src/lib/*.ts 必須能被 bare node import（少副檔名／JSON 少 import attributes 都會擋）',
  },
  {
    id: 'test:render-context',
    label: 'render context 與不變量 adapter 的 fixture 測試',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['render-context'],
    // 2026-08-21 新增。理由與 test:page 同一類、但擋的東西不同：
    // Page 測的是「怎麼讀 HTML」，這支測的是「**不變量本身判得對不對**」。
    // 在 buildContext() 可注入資料來源之前，那 42 條 adapter 一條都測不到——資料是硬讀
    // src/data/*.json 的，要驗一條斷言抓不抓得到某種壞資料，得先把壞資料寫進正式資料檔
    // 再跑 20 分鐘 build:release。代價太高於是沒人做，於是「gate 自己壞掉」只能靠 runner
    // 的 section 命中率去猜（見 invariant-runner.mjs 檔頭記的兩次靜默失效事故）。
    // 🔴 每條不變量都同時餵**該紅的**與**該綠的**輸入：只驗正例的話，一條永遠回 true
    //    的斷言可以通過測試——那正是這道 gate 要擋的失效模式。
    why: 'buildContext 契約（TODAY／derived／無 ctx.lib）＋ temple/lingqian 與 temple/town-context 的雙向 fixture，20 項',
  },
  {
    id: 'check:design',
    label: '設計規範 v2',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push'],
    viaBuild: true, // `pnpm build` 鏈首已跑，CI 不重複
    changed: ['ui'],
    why: 'font-size 禁 px／顏色 token 唯一來源／禁 !important／禁外部 CDN／.css 白名單／--text-* 下限',
  },
  {
    id: 'check:design-tokens',
    label: '設計 token',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['ui'],
    why: '<style> 內禁硬編顏色與 font-size，且 var(--x) 必須真的宣告過（否則整條宣告安靜失效）',
  },
  {
    id: 'check:copy-voice',
    label: '文案 AI 味',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['ui'],
    why: '面向使用者的 .astro 文案禁療癒腔／假掰詩意／後設免責與單一來源宣稱',
  },
  {
    id: 'check:scoped-styles',
    label: 'scoped 樣式',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['ui'],
    why: 'Astro scoped <style> 套不到 client JS 注入的 DOM，會靜默失樣',
  },
  {
    id: 'check:integrity',
    label: '資料完整性',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['data'],
    why: 'dangling ref 與對映率報表；硬錯誤阻擋部署',
  },
  {
    id: 'check:content',
    label: '文章去 AI 味',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push'],
    viaBuild: true, // `pnpm build` 鏈已跑
    changed: ['article'],
    why: 'src/**/*.md(x) 正文去 AI 味（grandfather：只掃相對 origin/main 變動的檔）',
  },
  {
    id: 'check:outbound-urls',
    label: '外送網址',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push'],
    viaBuild: true, // `pnpm build` 鏈已跑
    changed: ['script'],
    why: 'scripts/ 裡會主動送給 Google／IndexNow 的網址必須帶尾斜線（check:canonical 的長期盲區）',
  },
  {
    // 🔴 缺陷②（2026-08-19 修）：本 gate 原本只存在於 package.json，
    //    全 repo 沒有任何東西跑它。實測 0.85 秒、純讀 src/（檔頭自述「不需 build」），
    //    且當下就是綠的，故同時納入 pre-push 與 CI。
    id: 'check:festival-calendar',
    label: '節日行事曆',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['festival'],
    why: '節日的 Google Calendar URL 與 ICS 必須與 festivalNextSolar 同源（含短月退日的農曆標籤）',
  },
  {
    // 2026-08-20 新增，起因是同日的自造事故：manifest v18 的 14 個 knowledge-list job
    // 把 expect.contains 寫成未跳脫的 `?ci=2&cid=`，而來源 HTML 輸出 `?ci=2&amp;cid=`
    // → 台灣端抓到檔卻一個 byte 都不落地，還因為「連續 5 次失敗提前收工」每天餓死後面的 job。
    // 而基準檔就在本機 inbox 裡，那條規則從發出去到被對方指出，**從沒被任何東西跑過**。
    id: 'check:manifest-expect',
    label: 'manifest expect 回測',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['manifest-expect'],
    why: 'manifest 的每條 expect 都要拿本機真的有的樣本（自身或結構同型者）實跑一次，不准送出沒驗過的規則',
  },
  {
    id: 'check:source-refs',
    label: '來源可複驗',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push', 'ci-pre-build'],
    changed: ['source-refs'],
    // 2026-08-19 新增，起因是一個撐了約四個月的事故：festivals.json 三頁掛了四個
    // **不存在的** nchdb caseId。沒被擋下是因為 nchdb 前台是 SPA、不同 id 回傳相同
    // 位元組數、robots.txt 404 → HTTP 層驗不出來。同一個 repo 別處（temples/events/
    // topic-articles/evidence）其實都掛對，但沒有東西比對這兩組。
    why: 'nchdb caseId 須存在於官方名錄快照／逐字引用只准掛已授權網域／未授權來源引用數只能降不能升',
  },

  // ── CI／發佈等級、吃原始碼：build 之前跑 ───────────────────────────────
  {
    id: 'check',
    label: '型別檢查（astro check）',
    needs: 'source',
    tier: 'full',
    stages: ['ci-pre-build'],
    changed: ['site-source'],
    why: '🔴 CI 擋門但**不在** pnpm build:release 裡；型別錯誤會讓 build failure、deploy skipped',
  },
  {
    // 🔴 缺陷③（2026-08-19 修）：原本只在 CLAUDE.md 與 RELEASE-CHECKLIST.md，
    //    CI 沒接——而 pre-push 檔頭寫著「verify:almanac 留給 CI」。實測 3.9 秒。
    //    仍**不**進 pre-push：pre-push 刻意只留秒級純檔案掃描（見該檔檔頭）。
    id: 'verify:almanac',
    label: '農民曆交叉驗證',
    needs: 'source',
    tier: 'full',
    stages: ['ci-pre-build'],
    why: '農民曆全範圍三方交叉驗證＋官方 28 日錨點抽查（官方符合率須 100%）',
  },

  // ── CI／發佈等級、吃 dist：build 之後跑 ────────────────────────────────
  {
    id: 'check:canonical',
    label: 'canonical 連結',
    needs: 'dist',
    tier: 'full',
    stages: ['ci-post-build'],
    why: 'dist 內部網址皆須為帶斜線 canonical（nav／canonical／og:url／JSON-LD／sitemap）',
  },
  {
    // 🔴 缺陷①（2026-08-19 修）：本 gate 走訪 htmlFiles('dist')，檔頭第 15 行寫明
    //    「pnpm build:release 後跑」。deploy.yml 排對了，但 CLAUDE.md 把它排在
    //    && 鏈裡 build **之前**，pre-push 也把它列進「快、且純檔案掃描」那批。
    //    dist/ 在 .gitignore → 本機掃舊 build 空過，乾淨工作目錄則 readdirSync 拋錯。
    //    **它只能是 ci-post-build。**
    id: 'check:anchor-text',
    label: '錨文字',
    needs: 'dist',
    tier: 'full',
    stages: ['ci-post-build'],
    why: '<a> 的可見文字不得是裸露網址、括號須成對',
  },
  {
    id: 'check:rendered',
    label: 'render 不變量',
    needs: 'dist',
    tier: 'full',
    stages: ['ci-post-build'],
    why: '廟頁求籤區塊＋鄉鎮頁摘要＋時事追蹤，全量比對資料與實際渲染輸出',
  },

  // ── `pnpm build` / `postbuild` 指令鏈內建：列在這裡是為了看得出沒被弄丟 ──
  // ⚠️ 這些 stages 一律空陣列。消費端跑 build:release 就等於跑了它們；
  //    再拉出來跑一次只是多花時間，不會多守到任何東西。
  {
    id: 'check:discover',
    label: 'Discover 前置條件',
    needs: 'dist',
    tier: 'full',
    stages: [],
    viaBuild: true, // postbuild：check-discover-coverage.mjs --strict
    why: 'dist 每個 index.html 驗 title／description／self-canonical／單一 h1／og:image，並對照 sitemap 誤收 noindex',
  },
  {
    id: 'check:quality',
    label: '內容品質',
    needs: 'source',
    tier: 'full',
    stages: [],
    viaBuild: true, // build 鏈＋postbuild 的 --dist dist
    why: '內容存量與品質門檻（ERROR 擋 build、WARN 供逐月補齊）',
  },
  {
    id: 'check:seo-articles',
    label: 'SEO 主題文章',
    needs: 'source',
    tier: 'full',
    stages: [],
    viaBuild: true,
    why: '主題文章正文 8-gram 重複率門檻，擋「換標題重發」',
  },
  {
    id: 'check:release',
    label: '釋出排程',
    needs: 'source',
    tier: 'full',
    stages: [],
    viaBuild: true, // build 鏈（來源層）＋ postbuild 的 --require-dist（產物層）
    changed: ['release-data'],
    why: '未釋出的節日不得出現在 dist 的網址或產出檔',
  },
  {
    id: 'check:annual-release',
    label: '年度釋出',
    needs: 'source',
    tier: 'full',
    stages: [],
    viaBuild: true,
    changed: ['release-data'],
    why: '年度釋出 manifest 與核對證據的一致性',
  },
  {
    id: 'check:seasonal',
    label: '季節檔期',
    needs: 'source',
    tier: 'full',
    stages: [],
    viaBuild: true,
    why: '季節性活動頁的檔期設定與資料一致',
  },
  {
    // 🔴 2026-08-21 改分類：原本是 `tier: 'full'` ＋ `stages: []`，等於**只有 CI build 會跑**。
    //    實測 0.29／0.30 秒——比多數 fast gate 還快，那個 full 是誤分類。
    //    代價已經付過一次：改需求頁模板的那句措辭界線時，本機 18 道 gate 全綠、
    //    push 之後 CI build 才紅（`需求頁模板缺必要不變量`），白等一輪 build。
    //    ⚠️ 它守的是**措辭界線**（「宮廟資料裡有這筆登記」≠「這間廟今年有在辦」），
    //       這種 gate 特別需要在本機就擋——改文案的人通常不知道有一道 gate 綁著那句話。
    //    viaBuild 維持 true：`pnpm build` 鏈裡已經有一份，CI 端不重複掛。
    id: 'check:temple-demand',
    label: '廟宇需求頁',
    needs: 'source',
    tier: 'fast',
    stages: ['pre-push'],
    viaBuild: true,
    changed: ['ui', 'data'],
    why: '需求頁模板的措辭界線不變量（登記在案／以廟方公告為準）＋回讀 GSC 快照、宮廟數與精確主祀對映硬驗',
  },
  {
    id: 'check:temple-ctr',
    label: '廟宇 CTR 分群',
    needs: 'source',
    tier: 'full',
    stages: [],
    viaBuild: true,
    why: 'CTR 分群產出與來源快照一致',
  },
  {
    id: 'check:growth-actions',
    label: '成長行動',
    needs: 'source',
    tier: 'full',
    stages: [],
    viaBuild: true,
    why: '成長行動清單與證據檔一致',
  },
  {
    id: 'check:poem-shelf',
    label: '籤詩書架',
    needs: 'source',
    tier: 'full',
    stages: [],
    viaBuild: true,
    why: '籤詩書架的籤系／首數與資料一致',
  },
  {
    id: 'check:search-demand',
    label: '搜尋需求',
    needs: 'source',
    tier: 'full',
    stages: [],
    viaBuild: true,
    why: '搜尋需求頁的候選與 GSC 快照一致',
  },
  {
    id: 'check:rss',
    label: 'RSS',
    needs: 'source',
    tier: 'full',
    stages: [],
    viaBuild: true,
    why: 'RSS 輸出欄位與網址格式',
  },

  // ── 人工普查用，刻意沒有自動路徑 ───────────────────────────────────────
  // ⚠️ check:content:all **永遠 exit 0**（grandfather 存量不回溯擋），
  //    做成 gate 沒有意義；它的用途是人工普查，故 stages 空。這是刻意的，不是漏接。
  {
    id: 'check:content:all',
    label: '文章去 AI 味（全站普查）',
    needs: 'source',
    tier: 'full',
    stages: [],
    why: '全站 .md(x) 盤點；永遠 exit 0，供人工普查存量，不是擋門',
  },
  {
    id: 'check:topic-drafts',
    label: '主題草稿',
    needs: 'source',
    tier: 'full',
    stages: [],
    why: 'docs/topic-drafts 週稿結構檢查；草稿階段人工跑',
  },
  {
    id: 'check:topic-articles',
    label: '主題文章收錄',
    needs: 'source',
    tier: 'full',
    stages: [],
    why: 'docs/topic-articles 收錄前硬 gate；帶 --require-dist 才驗產物層。發布流程人工跑',
  },
];

// ── build:changed 的路由規則 ────────────────────────────────────────────
// 分類 → 判定該分類是否被觸發的 regex（比對 repo 相對路徑）。
// ⚠️ 原本寫在 check-changed.sh 的 bash `case` 裡，`src/*.astro` 這種 pattern 在
//    bash case 中 `*` 會跨 `/`，所以等價的 regex 是 `^src/.*\.astro$`（非 `[^/]*`）。
export const CHANGED_RULES = {
  'site-source': [/^src\//, /^astro\.config\.mjs$/, /^package\.json$/, /^pnpm-lock\.yaml$/, /^public\//],
  ui: [/^src\/.*\.astro$/, /^src\/.*\.svelte$/, /^src\/.*\.css$/],
  article: [/^src\/.*\.mdx?$/],
  data: [/^src\/data\//, /^src\/content\//, /^src\/content\.config\.ts$/],
  'release-data': [/^src\/data\/festivals\.json$/, /^docs\/annual-release-manifest\.json$/],
  script: [/^scripts\//, /^astro\.config\.mjs$/, /^package\.json$/],
  // 2026-08-19 新增：check:festival-calendar 的實際輸入（它自己讀的那幾支）
  festival: [
    /^src\/data\/festivals\.json$/,
    /^src\/lib\/festival-.*\.ts$/,
    /^src\/lib\/lunar-date\.ts$/,
    /^src\/pages\/festivals\//,
  ],
  // 2026-08-19 新增：test:text 的實際輸入（`ui` 只認 .astro/.svelte/.css，吃不到這支 .ts）
  'text-lib': [/^src\/lib\/text\.ts$/, /^src\/lib\/text\.test\.ts$/],
  // 2026-08-20 新增：check:lib-loadable 的輸入就是整個 src/lib
  'lib-loadable': [/^src\/lib\//],
  // 2026-08-20 新增：test:page 的實際輸入（模組、測試，以及五個消費端）
  'page-lib': [
    /^scripts\/lib\/page\.mjs$/,
    /^scripts\/lib\/page\.test\.mjs$/,
    /^scripts\/lib\/invariant-runner\.mjs$/,
    /^scripts\/check-(canonical-links|anchor-text|discover-coverage|content-quality)\.mjs$/,
  ],
  // 2026-08-20 新增：test:calendar-date 的實際輸入。
  // ⚠️ 含 `lunar-date.ts`（更名後留下的純轉出）與 `content-schemas.ts`
  //    （地方慶典的 zod enum 住在那裡，測試會驗它與 union 沒有各自漂走）。
  'calendar-date': [
    /^src\/lib\/calendar-date\.ts$/,
    /^src\/lib\/calendar-date\.test\.ts$/,
    /^src\/lib\/lunar-date\.ts$/,
    /^src\/content-schemas\.ts$/,
    /^src\/data\/(festivals|local-celebrations)\.json$/,
  ],
  // 2026-08-20 新增：test:event-cycle 的實際輸入（模組、測試、以及它讀的資料與 schema）
  'event-cycle': [
    /^src\/lib\/event-cycle\.ts$/,
    /^src\/lib\/event-cycle\.test\.ts$/,
    /^src\/data\/events\.json$/,
    /^src\/content\.config\.ts$/,
    /^src\/pages\/events\//,
  ],
  // 2026-08-19 新增：原本 docs-only 改動在 build:changed 完全沒 gate，
  // 但 CI 會用 check:doc-numbers 擋 → 本機顯示 ✓ 而 CI 紅。補上這條把洞補起來。
  docs: [/^CLAUDE\.md$/, /^docs\/.*\.md$/, /^README\.md$/],
  // 2026-08-19 新增：check:source-refs 的輸入範圍比既有任何一類都寬——它掃 git 追蹤中
  // 的 src/、docs/、scripts/ 與 CLAUDE.md。刻意不併進 `docs`（那類只認 .md，吃不到
  // docs/annual-release-evidence/*.json，而那裡正是掛 nchdb 個案網址的地方）。
  'source-refs': [/^src\/data\//, /^docs\//, /^CLAUDE\.md$/, /^scripts\//],
  // 2026-08-21 新增：test:render-context 的實際輸入（共享 context、它測的 adapter、
  // 以及基準日那支——ctx.TODAY 就是從它來的）。
  'render-context': [
    /^scripts\/lib\/render-context(\.test)?\.mjs$/,
    /^scripts\/invariants\//,
    /^src\/lib\/build-date\.ts$/,
    /^src\/lib\/daily\.ts$/,
  ],
  // manifest 與 expect 判定本身（含抽出來的共用模組與這道 gate 自己）。
  'manifest-expect': [/^docs\/intake-manifest\.json$/, /^scripts\/lib\/intake-expect\.mjs$/, /^scripts\/check-manifest-expect\.mjs$/],
};

// ── 不變量自我驗證 ──────────────────────────────────────────────────────
const PRE_BUILD_STAGES = new Set(['pre-push', 'ci-pre-build']);
{
  const problems = [];
  const seen = new Set();
  let pkgScripts = null;
  try {
    pkgScripts = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts;
  } catch {
    /* package.json 讀不到就跳過該項驗證，不讓 manifest 本身變成新的失敗點 */
  }

  // ── viaBuild 宣稱的機器複驗（2026-08-20 補）───────────────────────────
  // 🔴 為什麼要有這條：viaBuild 是**四個消費端據以「不跑」的唯一依據**（見欄位契約），
  //    但在此之前它是一句沒有人查的話。上面那條「id 必須存在於 package.json」擋不到它——
  //    檔頭缺陷②（check:festival-calendar）正是「script 存在、卻沒有任何東西跑它」，
  //    亦即 package.json 有登記完全不代表指令鏈裡真的串了。viaBuild 標錯的後果是
  //    **靜默漏跑**：manifest 說「build 會跑」，build 其實沒跑，而 CI 因為相信 manifest
  //    也不跑，全綠。這正是本檔存在的理由（同一件事實手抄兩份、沒人比對）換一個形狀重演。
  //    2026-08-20 首次跑這條時 16 道 viaBuild 全部屬實，所以它是防線不是修補。
  //
  // 兩邊沒有共用識別字（manifest 用 pnpm script id `check:discover`，build 鏈用檔案路徑
  // `node scripts/check-discover-coverage.mjs`），所以只能靠 package.json 當翻譯層：
  //   id → pkgScripts[id] → 抽出 scripts/*.{mjs,ts} 檔名 → 看它在不在 build+postbuild 串裡。
  //
  // ⚠️ 兩個方向刻意用**不同**的比對強度，不是筆誤：
  //   正向（viaBuild ⇒ 在鏈裡）比**檔名**。build 鏈常帶不同旗標（check:release 在
  //     postbuild 是 `--require-dist`、check:quality 是 `--dist dist`），比整串會誤判成漏接。
  //   反向（沒標 viaBuild ⇒ 不在鏈裡）比**整串指令**（正規化空白後逐段比）。
  //     這裡不能比檔名，否則 check:content:all（`node scripts/check-content.mjs --all`）
  //     會被 build 鏈裡的 check:content（`node scripts/check-content.mjs`，無 --all）打中而誤報：
  //     同一支腳本、不同旗標、不同 gate，鏈裡跑的那次並不涵蓋 --all。目前 repo 內就這一個
  //     反例，但它證明檔名層級的反向比對必然誤報。代價是「鏈裡多帶一個旗標跑同一支」的
  //     重複跑法抓不到——那是刻意讓步，寧可漏抓也不要製造假警報逼人加豁免清單。
  const normCmd = (cmd) => cmd.trim().replace(/\s+/g, ' ');
  const SCRIPT_FILE_RE = /scripts\/[\w./-]+\.(?:mjs|ts)/g;
  // package.json 讀不到就整段跳過，理由同上面的 catch：manifest 不當新的失敗點。
  const buildChain = pkgScripts ? [pkgScripts.build, pkgScripts.postbuild].filter(Boolean).join(' && ') : null;
  const buildSegments = buildChain === null ? null : new Set(buildChain.split('&&').map(normCmd));

  for (const g of GATES) {
    if (seen.has(g.id)) problems.push(`重複的 gate id：${g.id}`);
    seen.add(g.id);
    if (pkgScripts && !(g.id in pkgScripts)) problems.push(`${g.id} 不存在於 package.json 的 scripts`);
    if (g.tier === 'fast' && g.needs !== 'source') {
      problems.push(`${g.id} tier=fast 但 needs=${g.needs}；pre-push 沒有 dist 可掃`);
    }
    for (const s of g.stages) {
      if (g.needs === 'dist' && PRE_BUILD_STAGES.has(s)) {
        problems.push(`${g.id} 吃 dist，不得排在 ${s}（只能 ci-post-build）`);
      }
    }
    if (g.stages.includes('pre-push') && g.tier !== 'fast') {
      problems.push(`${g.id} 排進 pre-push 但 tier=${g.tier}`);
    }
    if (buildChain !== null) {
      const cmd = pkgScripts[g.id] ?? '';
      const files = [...new Set(cmd.match(SCRIPT_FILE_RE) ?? [])];
      if (g.viaBuild) {
        if (!files.length) {
          // 抽不出檔名就無從複驗；不可「查不出來就放行」，否則這條不變量等於自己關掉。
          problems.push(`${g.id} 宣稱 viaBuild，但它的 npm script 抽不出 scripts/*.{mjs,ts} 檔名，無從複驗`);
        } else if (!files.some((f) => buildChain.includes(f))) {
          problems.push(`${g.id} 宣稱 viaBuild，但 build/postbuild 鏈裡沒有 ${files.join('／')}；消費端會因此漏跑它`);
        }
      } else if (cmd && buildSegments.has(normCmd(cmd))) {
        problems.push(`${g.id} 沒標 viaBuild，但 build/postbuild 鏈裡有一模一樣的 \`${normCmd(cmd)}\`；不是漏標就是會跑兩次`);
      }
    }
  }
  if (problems.length) {
    throw new Error(`gate manifest 不變量違反：\n  - ${problems.join('\n  - ')}`);
  }
}

/** 某階段要跑的 gate（依 GATES 宣告順序）。 */
export function gatesForStage(stage) {
  return GATES.filter((g) => g.stages.includes(stage));
}

/** 依變更檔案清單決定要跑哪些 gate（只回 needs:'source' 的，本函式不產 dist）。 */
export function gatesForChangedFiles(files) {
  const hit = new Set();
  for (const [cat, patterns] of Object.entries(CHANGED_RULES)) {
    if (files.some((f) => patterns.some((re) => re.test(f)))) hit.add(cat);
  }
  return {
    categories: [...hit],
    gates: GATES.filter((g) => g.needs === 'source' && (g.changed ?? []).some((c) => hit.has(c))),
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, arg] = process.argv.slice(2);
  const die = (msg) => {
    console.error(msg);
    process.exit(2);
  };

  if (cmd === 'list') {
    const stages = ['pre-push', 'ci-pre-build', 'ci-post-build'];
    if (!stages.includes(arg)) die(`用法：gates.mjs list <${stages.join('|')}>`);
    for (const g of gatesForStage(arg)) console.log(g.id);
  } else if (cmd === 'labels') {
    const stages = ['pre-push', 'ci-pre-build', 'ci-post-build'];
    if (!stages.includes(arg)) die(`用法：gates.mjs labels <${stages.join('|')}>`);
    for (const g of gatesForStage(arg)) console.log(`${g.id}\t${g.label}`);
  } else if (cmd === 'run') {
    // 人工跑整個階段用。逐道 spawn，**第一道失敗就停**並原樣回傳它的 exit code。
    // 刻意不接任何 pipe（`cmd | tail && …` 會吃掉 exit code，本 repo 明列的坑）。
    const stages = ['pre-push', 'ci-pre-build', 'ci-post-build'];
    if (!stages.includes(arg)) die(`用法：gates.mjs run <${stages.join('|')}>`);
    const { spawnSync } = await import('node:child_process');
    const list = gatesForStage(arg);
    for (const g of list) {
      console.log(`\n▶ ${g.label}: pnpm ${g.id}`);
      const r = spawnSync('pnpm', [g.id], { stdio: 'inherit' });
      const code = r.status === null ? 1 : r.status;
      if (code !== 0) {
        console.error(`✗ ${g.id} 沒過（exit ${code}），${arg} 階段中止。`);
        process.exit(code);
      }
    }
    console.log(`\n✓ ${arg} 階段全部通過（${list.map((g) => g.id).join(' ')}）`);
  } else if (cmd === 'for-changed') {
    const stdin = readFileSync(0, 'utf8');
    const files = stdin.split('\n').map((s) => s.trim()).filter(Boolean);
    const { gates } = gatesForChangedFiles(files);
    for (const g of gates) console.log(`${g.id}\t${g.label}`);
  } else if (cmd === 'table' || cmd === undefined) {
    const rows = GATES.map((g) => ({
      id: g.id,
      needs: g.needs,
      tier: g.tier,
      跑在: g.stages.length ? g.stages.join(',') : g.viaBuild ? '（build 鏈內建）' : '（人工）',
      用途: g.why,
    }));
    const stage = (s) => gatesForStage(s).map((g) => g.id);
    console.log('gate manifest（唯一真實來源：scripts/lib/gates.mjs）\n');
    for (const r of rows) {
      console.log(`${r.id.padEnd(24)} ${r.needs.padEnd(7)} ${r.tier.padEnd(5)} ${r.跑在}`);
      console.log(`${''.padEnd(24)} └ ${r.用途}`);
    }
    console.log('\n── 各階段實際清單 ──');
    for (const s of ['pre-push', 'ci-pre-build', 'ci-post-build']) {
      console.log(`${s.padEnd(15)} ${stage(s).join(' ') || '（無）'}`);
    }
  } else {
    die('用法：gates.mjs [list <stage>|labels <stage>|for-changed|table]');
  }
}
