# folk.tw（神酷）— 路由與紅線

> 台灣民俗資料站，已上線 <https://folk.tw>（GitHub Pages）。全站約 12,000 頁，
> 其中廟宇頁 7,891 間佔 GSC 曝光 **91%**，是唯一被驗證的流量引擎。
>
> **本檔是路由層，只放「進來 30 秒要知道的」。** 每個主題的決策脈絡與陷阱在
> [`docs/`](docs/README.md)，動手前照下方 §4 文件地圖對號入座。
> 2026-08-06 重整：原本 600 行（其中 308 行是已完成工作的決策紀錄）已按主題抽到
> `docs/decisions/`，**原文一字未改**。舊版備份在 `/root/.claude/backups/`。

> **三條工作守則**（每次都適用）：
> 1. **報現況／缺口／數量前一律用指令查證，不臆測。**
> 2. **部署後以 `curl` 線上實證**，不能只看 build 綠了。
> 3. **資料整合性欄位查無權威源就留空，絕不杜撰**（聖誕／宜忌／來源／官網／沿革）。

---

## 1. 現在的狀態與待辦

**跑指令看，不要讀死值：**

```bash
node scripts/intake-status.mjs --brief   # 台灣端管道：待處理與抓取失敗
gh issue list --label weekly-report      # SEO 週報（每週一 09:30 台自動開）
node scripts/import-tourism.mjs          # 觀光署資料乾跑（不寫檔）
```

### 待辦（真的還沒做的）

| 項目 | 卡點／下一步 | 檢查點 |
|---|---|---|
| **內政部沿革授權** | 2026-08-05 已寄洽詢函等回覆。獲准後沿革 4,325＋參拜流程 828＋`Knowledge/*` 的 iconography **一批處理**（同一份授權、同一支匯入器）；不准就一起結案 | 等回覆 |
| **祈福頁「依真實集氣數決定去留」** | 導流已上線，**門檻數字未定**——現況量級下任何「N 小時沒人點就下架」都等於全刪。觀測一週後定 | **2026-08-12** |
| **降 GSC 權限** | 資安衛生、不緊急。共用服務帳號在 9 個網域是「擁有者」，只有用 Indexing API 的站才需要；降成「完整使用者」是十分鐘的事。背景見 `/root/CLAUDE.md` 紅線與 `/root/seo-ops/notes/identity-migration.md`（⚠️ 該檔開頭有 2026-07-31 的前提更正，**先讀那段**） | 無期限 |
| **`local-celebration` 用途未定** | 台灣端已投遞，但我們還沒決定要拿它做什麼。決定前不要動手 | — |
| **籤系只有 2 套** | 觀音靈籤卡在**版本錨定**——唯一線索是臺文館藏「觀音籤譜」`NMTL20060200544`（完整且錨定龍山寺，**但未數位化**）；月老靈籤連來源都還沒查 | — |

🅤 **已裁示不做的，別再列進待辦**：appi.news 撞題（2026-08-02「不用理他」）、店家名錄、
索引長尾那三類（見 [`docs/decisions/seo-calls.md`](docs/decisions/seo-calls.md)）。

---

## 2. 🔴 紅線（不可破壞）

1. **絕不杜撰。** 查無權威源就留空。所有事實逐筆掛源，來源要能被機器複驗。
2. **push main 即上線，無 staging。** 且 **push 後絕不可手動補跑 `deploy.yml`**——
   同 SHA 兩個 run 搶 Pages 佇列會毒化該 SHA，之後同 SHA 部署全部秒失敗。
   唯一例外：確認「本 SHA 的 run 數為 0」才補觸發一次。**完整事故經過→[`docs/decisions/deploy-and-gates.md`](docs/decisions/deploy-and-gates.md)。**
3. **`git push` 回「Everything up-to-date」不等於已部署。** 本 repo 有多支會 push 的 cron，
   你留在本地的 commit 會被別人的 CI 略過標記 head 帶上去 → 整個 push 不觸發 workflow、
   線上停在舊版且無告警。**手動 commit 後立刻自己 push，並查本 SHA 有沒有 run。**
   （含「commit 訊息提到那個標記也會觸發它」的連帶陷阱，同上檔。）
4. **slug 是永久承諾。** `/festivals/`、`/good-days/`、`/trades/`、`/scenarios/`、`/compare/`、
   `/qiugian/blessing/<id>/` 一旦上線就不可改、不可 404。
5. **措辭界線：陳述「神明的」事實，不替廟方宣稱活動。** 可以說「該廟登記了這個祭典」「這位神明的
   聖誕是某日」；不可說「這些廟在過中元節」「本廟那天有辦活動」。
6. **時事祈福只做正向集氣**，面向使用者文案**絕不出現具體傷亡／災損數字**
   （硬 gate `scripts/lib/topical-guard.mjs`，非靠 LLM 自律）。
7. **個資不進 repo。** 本 repo 為 public：廟方電話與負責人只存 `/root/.config/folk-tw/`，
   比對時只在記憶體中用。
8. **授權判準是「這份資料在不在 data.gov.tw 上」，不是「從哪個網址抓的」**——
   `religion.moi.gov.tw` 同時供應 OGDL 開放資料與受版權宣告保護的網站內容。
   **完整對照表（唯一權威處）→[`docs/taiwan-intake-status.md`](docs/taiwan-intake-status.md) 的「🔴 判準」一節。**
9. **自己起的背景 server 一定要收**（`pnpm preview` 等），收尾必須 kill。
10. **改變系統狀態的操作（cron／設定／排程），同一回合必須更新對應文件。**
11. **要台灣端做事，同一則回覆必須附上可直接複製貼上的完整 prompt。** 那台是單向的
    （只能 rsync 寫進我們的 inbox、讀不到我們），用戶是唯一傳話人；
    「我寫進 docs 了」不會送達。骨架見 [`docs/TODO-FOR-TAIWAN.md`](docs/TODO-FOR-TAIWAN.md)。

---

## 3. 指令入口

```bash
# 部署（~75s，無 PR）
git push origin main            # 之後查：gh run list --workflow deploy.yml --json headSha
pnpm notify [url...|--all]      # 部署後推 Google Indexing API ＋ IndexNow

# 驗證套件（push 前跑；🔴 pnpm check 是 CI 擋門但不在 pnpm build 裡）
pnpm check:integrity && pnpm check && pnpm check:scoped-styles && pnpm check:design \
  && pnpm check:design-tokens && pnpm check:copy-voice && pnpm check:content \
  && pnpm check:outbound-urls && pnpm verify:almanac && pnpm build
pnpm check:canonical && pnpm check:rendered      # build 後另跑

# 資料
node scripts/intake-status.mjs                   # 台灣端管道現況（四段）
node scripts/import-festivals.mjs                # 慶典（乾跑預設）
node scripts/import-tourism.mjs                  # 觀光署簡介／開放時間（乾跑預設）
pnpm data:temple-coords <temple.xml>             # 座標回填（乾跑預設）
pnpm data:weekly                                 # 週報乾跑預覽
```

⚠️ **完整 build ≈ 20 分鐘**（含 7,891 張 OG 卡）。先定版再開 build，`astro build` 會清空 dist。

---

## 4. 📁 文件地圖：要改什麼，先讀哪一份

| 你要動的東西 | 先讀 |
|---|---|
| **廟宇頁**（meta／title／區塊／OG 卡／座標／外撥名單） | [`docs/decisions/temples.md`](docs/decisions/temples.md) |
| **神明／籤詩／籤系／藥籤** | [`docs/decisions/deities-and-qian.md`](docs/decisions/deities-and-qian.md) |
| **農民曆／宜忌／擇日** | [`docs/decisions/almanac.md`](docs/decisions/almanac.md) |
| **節日／民俗活動／情境・比較・行業** | [`docs/decisions/festivals-and-intent.md`](docs/decisions/festivals-and-intent.md) |
| **nav／版位／卡片規範** | [`docs/decisions/nav-and-ui.md`](docs/decisions/nav-and-ui.md) |
| **部署流程／驗證套件／任何一道 gate／`pnpm notify`** | [`docs/decisions/deploy-and-gates.md`](docs/decisions/deploy-and-gates.md) |
| **SEO 的「做／不做」裁示**（sitemap／稀釋／索引長尾） | [`docs/decisions/seo-calls.md`](docs/decisions/seo-calls.md) |
| **慶(祭)典資料**（曆別陷阱／對映規則／來源矛盾） | [`docs/festival-data-import.md`](docs/festival-data-import.md) |
| **時事集氣祈福管線**（P1–P4） | [`docs/topical-blessing.md`](docs/topical-blessing.md) |
| **台灣端投遞管道**（現況／授權／每份資料去向） | [`docs/taiwan-intake-status.md`](docs/taiwan-intake-status.md) |
| **台灣端怎麼運作**（金鑰／manifest 欄位契約／rsync） | [`docs/taiwan-host-handoff.md`](docs/taiwan-host-handoff.md) |
| **要台灣端做事**（prompt 骨架／追蹤清單／不要再問的事） | [`docs/TODO-FOR-TAIWAN.md`](docs/TODO-FOR-TAIWAN.md) |
| **SEO 自動化閉環**（收集／反思／大腦／週報） | [`docs/seo-automation.md`](docs/seo-automation.md)、`/seo` skill |
| **藥籤產製規格** | [`docs/yaoqian-physician-spec.md`](docs/yaoqian-physician-spec.md) |
| 全部文件一覽 | [`docs/README.md`](docs/README.md) |

**專案脈絡與用戶偏好** → 自動記憶 `/root/.claude/projects/-root-folk-tw/memory/`（`MEMORY.md` 為索引）。
**主機維運與工作方法** → `/root/CLAUDE.md` 與 `/root/.claude/doctrine/`。
