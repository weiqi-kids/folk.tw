# folk.tw（神酷）— 路由與紅線

> 台灣民俗資料站，已上線 <https://folk.tw>（GitHub Pages）。
> **廟宇頁是唯一被驗證的流量引擎**（2026-08-06 基準：全站 12,451 頁、廟宇 7,891 間、佔 GSC 曝光 91%）。
> ⚠️ 這些會變動，**要現況跑 §1 的指令**，別引用這行的數字。
>
> **本檔是路由層，只放「進來 30 秒要知道的」。** 每個主題的決策脈絡與陷阱在
> [`docs/`](docs/README.md)，動手前照下方 §4 文件地圖對號入座。
> 2026-08-06 重整：原本 600 行（其中 308 行是已完成工作的決策紀錄）已按主題抽到
> `docs/decisions/`，**原文一字未改**。舊版備份在 `/root/.claude/backups/`。

> **三條工作守則**（每次都適用）：
> 1. **報現況／缺口／數量前一律用指令查證，不臆測。**
> 2. **部署後以 `curl` 線上實證**，不能只看 build 綠了。
> 3. **資料整合性欄位查無權威源就留空，絕不杜撰**（聖誕／宜忌／來源／官網／沿革）。
> 4. 🔴 **現況型文件不寫死會過期的數量**——留指令讓人自己查。
>    本檔、`docs/README.md`、`docs/taiwan-intake-status.md`、`docs/TODO-FOR-TAIWAN.md` 由
>    `pnpm check:doc-numbers` 硬擋。歷史量測要寫數字**必須帶日期**（gate 據此放行）。

---

## 1. 現在的狀態與待辦

**跑指令看，不要讀死值：**

```bash
node scripts/intake-status.mjs --brief   # 台灣端管道：待處理與抓取失敗
gh issue list --label weekly-report      # SEO 週報（每週一 09:30 台自動開）
node scripts/import-tourism.mjs          # 觀光署資料乾跑（不寫檔）
node -e "const t=require('./src/data/temples.json'),d=require('./src/data/divination-systems.json');\
console.log('廟',t.length,'｜有座標',t.filter(x=>x.lat).length,'｜沿革',t.filter(x=>x.history).length,\
'｜簡介',t.filter(x=>x.intro).length,'｜籤系',d.length)"   # 站台總覽
```

### 待辦（真的還沒做的）

| 項目 | 卡點／下一步 | 檢查點 |
|---|---|---|
| **內政部資料匯入（進行中，分批到貨）** | ✅ 授權已獲同意（範圍全開、**含照片**，條件＝標示資料來源連結；⚠️ 別再去要公文文號，見 [`docs/taiwan-intake-status.md`](docs/taiwan-intake-status.md) §2026-08-06）。**匯入器、渲染、gate 全部已就位，剩下純粹是等台灣端分批送檔**。<br>👉 **接手時照這個流程做**：① `node scripts/intake-status.mjs` 看**「待匯入」段**（2026-08-08 加：它會自己跑三支匯入器乾跑，直接告訴你「收到了但還沒進站」幾筆——不必再靠人記得手動乾跑）② 有待匯入就重跑對應匯入器（**都是乾跑預設、idempotent，可以一直重跑**）：`import-knowledge-deities.mjs --write --photos`／`import-temple-history.mjs --write --photos` ③ 跑驗證套件 ④ push ⑤ **確認該 SHA 的 build job conclusion 再回報**。<br>⚠️ **母體變動後清單要重產**（`gen-intake-urls-yange.mjs`，`--idx 2,4` 與 `--idx 3 --out docs/intake-urls-jianzhu.json` 各一次），否則新收的廟不會被抓。<br>⚠️ 參拜流程（IndexID=4）的 UploadFileID 偏大、排序後集中在清單尾端，**會在最後一兩輪才到**——中途看到它是 0 不是漏抓。 | 等台灣端 |
| **廟宇代表圖覆蓋率極低** | ⚠️ **不是「沒有來源」**（2026-08-08 更正我自己的錯誤敘述）：站上已有一批廟掛著 **Wikimedia Commons** 的 CC 授權圖（大甲鎮瀾宮／白沙屯拱天宮／北港朝天宮那些），`check:rendered` 每次都驗它們有渲染。問題是**覆蓋率**，不是有無——數量跑 `node scripts/intake-status.mjs` 或 `node -e "const t=require('./src/data/temples.json');console.log(t.filter(x=>x.image?.src).length+'/'+t.length)"`。<br>✅ 神明代表圖那半邊**已上線**（2026-08-07，`religion-photos` job，19 尊）。<br>⛔ 死掉的是**內政部這一條來源**：`GetUploadFile` 的 pic 附件，其 JSON 自報的 `URL` 是 `/ReligionSys/FileStore/<GUID>.<EXT>`，該路徑一族**來源本身 404**（台灣端兩次複驗）；那網址不是我們拼的，**沒有別的網址可以產**，已在 `gen-intake-urls-photos.mjs` 濾掉整族。要提高廟宇覆蓋率得另找來源（Commons 仍可繼續補，只是要逐間找、慢），**不是修抓取**。<br>🔴 **署名查不到就不採用那張圖**——寧可沒圖，也不能掛一張沒署名的別人的作品；圖說在條目頁是**在 `<img>` 之後**（曾掃錯方向導致署名全空、圖被安靜略過）。 | 無期限 |
| **生肖頁第三段「哪些廟辦安太歲」** | 2026-08-07 上線 `/zodiac/`＋12 生肖頁，前兩段（今年太歲關係、今日／近 30 天沖煞）已完成。⛔ 第三段只有 16 間廟有「安太歲」記載，撐不起名單。補法：等 `religion-yange` 的 **IndexID=4（參拜流程）** 到齊後從內容抽關鍵字——那批本來就在清單裡，不必請台灣端多做事。🔴 抽出來的是「廟方登記的參拜流程提到安太歲」，**不可寫成「本廟提供安太歲服務」**（同廟宇頁的措辭界線） | 等參拜流程 |
| **祈福頁「依真實集氣數決定去留」** | 導流已上線，**門檻數字未定**——現況量級下任何「N 小時沒人點就下架」都等於全刪。觀測一週後定 | **2026-08-12** |
| **降 GSC 權限** | 資安衛生、不緊急。共用服務帳號在 9 個網域是「擁有者」，只有用 Indexing API 的站才需要；降成「完整使用者」是十分鐘的事。背景見 `/root/CLAUDE.md` 紅線與 `/root/seo-ops/notes/identity-migration.md`（⚠️ 該檔開頭有 2026-07-31 的前提更正，**先讀那段**） | 無期限 |
| **節日頁曝光追蹤** | ✅ **8/8 收錄檢查點已到期並查證**：2026-08-08 逐頁 URL Inspection（非抽樣）——10 個節日頁中 7 個 `Submitted and indexed`，3 個（基隆中元祭／搶孤／清明）是 `Discovered - currently not indexed`＝Google 知道但還沒排到爬取，已 `pnpm notify` 推送。樞紐 `/festivals/` 已收錄。<br>🔴 **不要讀 `index-audit.json` 回答這種問題**：那是滾動掃描快照（一輪約 6 天），2026-08-08 它對這 12 頁全寫「unknown to Google」而實際已收錄 7 個——那筆是上線當天查的。要問「某幾頁現在收錄了沒」就對那幾頁重跑 URL Inspection。<br>✅ **8/16 這個檢查點 2026-08-09 提早查掉了，不必等**：節日類查詢曝光有數字了，但**問題不在曝光而在收錄與重複**——診斷與處置見 [`docs/decisions/festivals-and-intent.md`](docs/decisions/festivals-and-intent.md) 的「節日頁自我重複」條目。一句話：`pudu` 被 7 個節日頁共用、整組流程被複製 7 次，重疊最高的兩頁正是不被收錄的兩頁；已改成只在主場頁攤開並加 gate（不變量 5d）。<br>⚠️ **還沒做完**：去重後那幾頁變薄，且相關詞彙／相關神明／相關宮廟仍互相重複。要真的排上去還需要替各頁補「只有它有」的掛源內容——那是研究工作，尚未開始。<br>每日 collect（**台北 15:30**）自動出數並直接發 Slack，**不需人盯**——⚠️ 這裡原本寫「05:00」是 2026-08-01 改排程前的舊時刻，且 cron 裡**沒有獨立的 heartbeat 層**（已併進 collect）。看 Slack 或 `data/seo-daily/<date>.json` | 補內容無期限 |
| **鬼門開與地藏頁仍與中元節頁重複** | 2026-08-09 把 `pudu` 的完整流程收斂到主場頁、並替搶孤／雞籠／義民／清明補了獨有內容後，**這兩頁是唯一沒改善的**（當日實測與 `/festivals/zhongyuan/` 的 `<main>` 內文重疊：鬼門開 45.4%、地藏 49.9%；樣板底噪約 10%）。⛔ 卡點：**兩者都沒有自己的文化資產個案可引**——「鬼門開」與「地藏王菩薩聖誕」不是文資登錄項目，所以 2026-08-09 那條文化部授權（逐字引用＋掛個案網址）對它們沒有用。👉 下一步得另找權威源（國史館臺灣文獻館有〈七月半之緣起〉一文，但**那批文字的授權要另外查**，不在文化部這次範圍內）。<br>🔴 **不要用「再補內鏈」解**：2026-08-03 對同一批頁做過、無效（`jilong-zhongyuan` 曾有 191 頁連過去仍是 unknown to Google）。<br>重量測：`node -e "..."` 逐頁比 `<main>` 內文 8 字片段重疊率，作法見 [`docs/decisions/festivals-and-intent.md`](docs/decisions/festivals-and-intent.md) 的「節日頁自我重複」條目 | 無期限 |
| **`/festivals/local/` 上線後看曝光** | 2026-08-06 上線（65 項地方宗教慶典＋回灌節日頁與廟宇頁）。裡面是鹽水蜂炮、大甲媽祖遶境進香、頭城搶孤這類頭部詞，但**站上完全沒有它們的歷史曝光**，所以現在無從判斷值不值得再擴（縣市頁）。看兩週 GSC 再決定，別先擴 | **8/20** |
| **觀音「一百籤」尚未收錄** | ⚠️ 這**不是**「籤系只有 2 套」——站上實際有 5 套（六十甲子 60／關帝 100／月老 27／內門紫竹寺觀音 28／保生大帝藥籤 330）。缺的是坊間常說的**觀音一百籤**，卡在版本錨定：線上無權威全文，唯一線索是臺文館藏「觀音籤譜」`NMTL20060200544`（完整 100 首且錨定龍山寺，**但未數位化**，已送件申請閱覽） | 等館方回覆 |

🅤 **已裁示不做的，別再列進待辦**：appi.news 撞題（2026-08-02「不用理他」）、店家名錄、
索引長尾那三類（見 [`docs/decisions/seo-calls.md`](docs/decisions/seo-calls.md)）。

---

## 2. 🔴 紅線（不可破壞）

> **這裡只放「不知道自己碰到它時也可能違反」的規則**——因為本檔每次都自動載入，
> 放太多會稀釋掉真正該一直記著的那幾條。
> **場景限定的紅線**（措辭界線／祈福禁傷亡數字／授權判準／宜忌無源不發佈…）
> 寫在對應的 `docs/` 檔裡，**進那個場景時才載入**，由下方 §4 文件地圖負責把你導過去。
> ⚠️ 所以 §4 不是「參考資料」，是**動手前的強制步驟**。


1. **絕不杜撰。** 查無權威源就留空。所有事實逐筆掛源，來源要能被機器複驗。
2. **push main 即上線，無 staging。** 且 **push 後絕不可手動補跑 `deploy.yml`**——
   同 SHA 兩個 run 搶 Pages 佇列會毒化該 SHA，之後同 SHA 部署全部秒失敗。
   ⚠️ 例外有**兩個**（本 SHA 0 run 才補觸發／deploy job 因 Pages 暫時性錯誤才 `rerun --failed`），
   條件不同且各只准做一次——**動手前必讀 [`docs/decisions/deploy-and-gates.md`](docs/decisions/deploy-and-gates.md) 的「🔴 部署觸發規則」。**
3. **`git push` 回「Everything up-to-date」不等於已部署。** 本 repo 有多支會 push 的 cron，
   你留在本地的 commit 會被別人的 CI 略過標記 head 帶上去 → 整個 push 不觸發 workflow、
   線上停在舊版且無告警。**手動 commit 後立刻自己 push，並查本 SHA 有沒有 run。**
   （含「commit 訊息提到那個標記也會觸發它」的連帶陷阱，同上檔。）
   ✅ 2026-08-08 起有機制擋這件事：`scripts/lib/skip-ci-suffix.sh` 是該標記的唯一判定入口，
   本機有未推送 commit 時自動不加它。**新增任何會 commit 的自動化一律 source 它，不要自己寫死。**
   ⚠️ 機制擋的是「被別人吃掉」，不擋「你根本沒 push」——那條仍要自己顧。
   另有 `.githooks/pre-push`（九道快速 gate，約 7 秒）擋「跑完 gate 之後又改檔才 push」：
   **驗證的效力綁在檔案內容上，不綁在「我跑過了」**。重新 clone 後要跑 `git config core.hooksPath .githooks`。
4. **slug 是永久承諾。** `/festivals/`、`/festivals/local/`、`/good-days/`、`/trades/`、`/scenarios/`、
   `/compare/`、`/qiugian/blessing/<id>/` 一旦上線就不可改、不可 404。
5. **個資不進 repo。** 本 repo 為 public：廟方電話與負責人只存 `/root/.config/folk-tw/`，
   比對時只在記憶體中用。
6. **自己起的背景 server 一定要收**（`pnpm preview` 等），收尾必須 kill。
7. **改變系統狀態的操作（cron／設定／排程），同一回合必須更新對應文件。**
8. **要台灣端做事，同一則回覆必須附上可直接複製貼上的完整 prompt。** 那台是單向的
    （只能 rsync 寫進我們的 inbox、讀不到我們），用戶是唯一傳話人；
    「我寫進 docs 了」不會送達。骨架見 [`docs/TODO-FOR-TAIWAN.md`](docs/TODO-FOR-TAIWAN.md)。

---

## 3. 指令入口

```bash
# 部署（~75s，無 PR）
git push origin main            # 之後查：gh run list --workflow deploy.yml --json headSha
pnpm notify [url...|--all]      # 部署後推 Google Indexing API ＋ IndexNow

# 驗證套件（push 前跑；🔴 pnpm check 是 CI 擋門但不在 pnpm build 裡）
pnpm check:integrity && pnpm check && pnpm check:doc-numbers && pnpm check:scoped-styles && pnpm check:design \
  && pnpm check:design-tokens && pnpm check:copy-voice && pnpm check:content \
  && pnpm check:outbound-urls && pnpm check:anchor-text && pnpm verify:almanac && pnpm build
pnpm check:canonical && pnpm check:rendered      # build 後另跑

# 資料
node scripts/intake-status.mjs                   # 台灣端管道現況（四段）
node scripts/import-festivals.mjs                # 慶典（乾跑預設）
node scripts/import-tourism.mjs                  # 觀光署簡介／開放時間（乾跑預設）
pnpm data:temple-coords <temple.xml>             # 座標回填（乾跑預設）
pnpm data:weekly                                 # 週報乾跑預覽
```

⚠️ **完整 build ≈ 20 分鐘**（每間廟一張 OG 卡，數量隨廟數變）。先定版再開 build，`astro build` 會清空 dist。

---

## 4. 📁 文件地圖：要改什麼，先讀哪一份

| 你要動的東西 | 先讀 |
|---|---|
| **廟宇頁**（meta／title／區塊／OG 卡／座標／外撥名單） | [`docs/decisions/temples.md`](docs/decisions/temples.md) 🔴 |
| **神明／籤詩／籤系／藥籤** | [`docs/decisions/deities-and-qian.md`](docs/decisions/deities-and-qian.md) |
| **農民曆／宜忌／擇日** | [`docs/decisions/almanac.md`](docs/decisions/almanac.md) 🔴 |
| **節日／地方宗教慶典／民俗活動／情境・比較・行業** | [`docs/decisions/festivals-and-intent.md`](docs/decisions/festivals-and-intent.md) 🔴 |
| **nav／版位** | [`docs/decisions/nav-and-ui.md`](docs/decisions/nav-and-ui.md) |
| **部署流程／驗證套件／任何一道 gate／`pnpm notify`** | [`docs/decisions/deploy-and-gates.md`](docs/decisions/deploy-and-gates.md) |
| **SEO 的「做／不做」裁示**（sitemap／稀釋／索引長尾） | [`docs/decisions/seo-calls.md`](docs/decisions/seo-calls.md) |
| **慶(祭)典資料**（曆別陷阱／對映規則／來源矛盾） | [`docs/festival-data-import.md`](docs/festival-data-import.md) |
| **時事集氣祈福管線**（P1／P2／P4（無 P3）） | [`docs/topical-blessing.md`](docs/topical-blessing.md) 🔴 |
| **台灣端投遞管道**（現況／授權／每份資料去向） | [`docs/taiwan-intake-status.md`](docs/taiwan-intake-status.md) 🔴 |
| **台灣端怎麼運作**（金鑰／manifest 欄位契約／rsync） | [`docs/taiwan-host-handoff.md`](docs/taiwan-host-handoff.md) |
| **要台灣端做事**（prompt 骨架／追蹤清單／不要再問的事） | [`docs/TODO-FOR-TAIWAN.md`](docs/TODO-FOR-TAIWAN.md) |
| **SEO 自動化閉環**（收集／反思／大腦／週報） | [`docs/seo-automation.md`](docs/seo-automation.md)、`/seo` skill |
| **藥籤產製規格** | [`docs/yaoqian-physician-spec.md`](docs/yaoqian-physician-spec.md) |
| 全部文件一覽 | [`docs/README.md`](docs/README.md) |

🔴 ＝**該檔內含場景限定的紅線**，動那塊之前必須讀。

> 🔴 **最新的決策常常在程式碼註解裡，不在 `docs/`。**
> `docs/decisions/` 是**決策的歷史脈絡**（原文一字未改，刻意保留當時的判斷）；
> 而 `src/pages/temples/[id].astro`、`scripts/check-rendered.mjs` 這類檔案的檔頭與行內註解
> 記的是**現況**，且往往比 docs 新。**兩者不一致時信程式碼**，並回頭在 docs 標上更正
> （2026-08-06 稽核實例：`temples.md` 的 meta description 排序停在 7/30，
> 而 8/3 有一次量測過的對調只寫在程式碼註解裡——照 docs 動手會把修正改回去）。
> ⚠️ **改任何 `src/` 檔案前，先讀那個檔自己的檔頭註解。**它們刻意不放在上面的總紅線區——
本檔每次都自動載入，把場景警語全塞進來會稀釋掉真正該一直記著的那八條。

**專案脈絡與用戶偏好** → 自動記憶 `/root/.claude/projects/-root-folk-tw/memory/`（`MEMORY.md` 為索引）。
**主機維運與工作方法** → `/root/CLAUDE.md` 與 `/root/.claude/doctrine/`。
