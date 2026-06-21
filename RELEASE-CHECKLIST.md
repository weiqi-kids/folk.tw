# 發佈檢查清單與交接文件 — 眾神解析 folk.tw

> 本文供發佈前最後檢查與後續維護交接。專案規格見上傳之 SPEC.md；技術概覽見 README.md。

## 一、現況快照

- **狀態**：本機 `main` 分支，多次 commit，乾淨可 build；尚未建立 GitHub remote、尚未設 DNS。
- **規模**：prod build **1153 頁**（含農民曆可瀏覽日期頁 730＝以今日為中心 ±1 年）、TypeScript strict **0 錯誤**、全站**零斷鏈**。
- **內容**：籤詩 160（六十甲子 60＋關帝百首 100，皆含白話故事＋賞析＋8 項分項解）、典故 137、神明 76、廟宇 28、活動 11、習俗 12。
- **對映**：關係邊端點／活動主神／習俗神明／廟宇主祀 四項皆 100%；神明 draft 僅 1 尊（使者公，聖誕查無權威源）。
- **驗證**：M3 校準測試 46/46、農民曆對官方比對 100%（見下）。

## 二、發佈前驗證（每次發佈前跑一遍，全綠才發）

```bash
pnpm install --frozen-lockfile
pnpm check:integrity      # 參照完整性＋對映率報表（硬錯誤須為 0）
pnpm exec astro check     # 型別檢查（須 0 errors）
node --experimental-strip-types src/lib/almanac/calibration.test.mjs   # M3 校準（46/46）
pnpm verify:almanac       # 農民曆全範圍交叉驗證＋官方錨點（官方須 100%）
pnpm build                # 靜態建置＋Pagefind 索引（postbuild）
```

預期：硬性完整性通過、0 型別錯誤、校準 46/46、官方錨點 163/163、build 完成。

## 三、§12.6 單一發佈門檻 — 達成情形

| 門檻項 | 狀態 |
|---|---|
| 五模組功能完成＋各自驗收（§9 PoC 1–6） | ✅ |
| §5 無源不發佈全站清空 | ✅（draft/verified gate；pojie/sheshen 聖誕誠實待查、隱藏） |
| M3 核心層＋進階層全表考據化（C.6） | ✅ 核心層接 lunar-javascript；進階層宜忌依《協紀辨方書》逐條核校上線 |
| C.4-4 ≥20 日比對官方農民曆 | ✅ 官方 28 日 100%＋全掃 1901–2099（7.2 萬日）交叉驗證 |
| §13 倫理檢核（免責/凶向/範圍/勘誤） | ✅ 免責已定稿（法務確認通過） |

> 結論：規格要求由程式、資料、考據可達成者皆已完成。

## 四、發佈步驟（GitHub Pages＋自訂網域 folk.tw）

1. **建立 public repo**（需 gh 已登入有 repo 權限）：
   ```bash
   gh repo create weiqi-kids/folk.tw --public --source=. --remote=origin --push
   ```
2. **啟用 GitHub Pages**：repo Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。
   部署 workflow 已備於 `.github/workflows/deploy.yml`（push main 時部署；每日 16:00 UTC cron 重建以推進「今日選讀」）。
3. **自訂網域 DNS**（folk.tw）：
   - DNS 商處設 `folk.tw` 的 A/AAAA 記錄指向 GitHub Pages（185.199.108–111.153 / IPv6），或 CNAME `weiqi-kids.github.io`（apex 用 ALIAS/ANAME）。
   - repo 已含 `public/CNAME`（內容 `folk.tw`），build 會帶入 dist。
   - Pages 設定頁填入 Custom domain `folk.tw`、勾選 Enforce HTTPS。
4. 等 Actions 綠 → 訪問 https://folk.tw 驗收。

> 若先不設 DNS：完成 1、2 後即可在 `https://weiqi-kids.github.io/folk.tw` 預覽（注意子路徑；自訂網域上線後恢復根路徑）。

## 五、發佈後增補（規格明訂非發佈門檻，不阻擋上線）

- 即時追蹤（白沙屯/大甲 GPS live）— §12.4；目前僅存駐駕節點＋即時源指標。
- 第三套以上籤詩系統（觀音籤等）。
- 神明關係圖視覺化大圖（v1 為列表，§8）。
- UGC／wiki 協作（§8 v2+）。
- M3 真太陽時精校（時柱／時辰宜忌，C.6）。
- 六十甲子太歲補齊 60 位具名實例（現 3 位）。

## 六、持續維護／田調（不阻擋發佈，但宜逐步補實）

- **神明聖誕待查**：`sheshen`（使者公）查無權威聖誕來源，現標 draft 隱藏；查到再補並 flip draft。（`pojie` 婆姐已補國立臺灣歷史博物館神格源、脫離 draft；其為集體從神無單一聖誕，birthday 留空。）
- **§9.5 來源升級**：73/76 尊已具權威來源（gov／古籍／廟方官網，多為 2–3 源）；仍 web-only 者 3 尊（妙應仙妃及好兄弟、祖神二集體類別，其權威古籍／官方源本即闕如）；單一來源者 11 尊（皆具一筆權威 seed，達門檻），可續田調加源。
- **M3 進階層宜忌**：黃黑道／胎神全顯（verified）；宜忌依《協紀辨方書》制化裁決，**僅顯示全鏈已驗證者**（單神煞票、或從宜且所用制化關係皆 verified），約 86% 日有宜忌；從忌（依制化表「無可制」之推定）與建除基調 fallback 因依賴制化表完備性，一律不宣稱驗證、不顯示（`resolve.ts`）。
- **M3 制化表 5 條 verified:false**：經《協紀辨方書》卷十原文＋他源類書核校確認**原文不支持**（非缺口，note 已記原文），屬諸說並陳/待考；如改採機械推導為準須策展者拍板。
- **M4 文資 authority_ref**：11 筆已掛文資網案號；新案或重新登錄時更新。
- **農民曆**：發佈前曾以 lunar-javascript（對齊香港天文台）＋官方 28 日比對 100%；如需逐年對中央氣象署官方農民曆抽查，跑 `pnpm verify:almanac` 並擴充 `scripts/almanac-reference.json`。

## 七、資料維護工作流

- **內容資料**：`src/data/*.json`（結構化）、`src/content/allusions|interpretations/*.md`（散文）。改後務必 `pnpm check:integrity`。
- **新增廟宇（內政部開放資料）**：`pnpm import:temples`（fetch MOI XML→對映 deity→對映率報表；產出 `temples.import.json` 供人工審後併入）。
- **provenance 鐵律**：每筆事實掛 `sources[]`；無源標 draft／待查，不對外發佈。爭議欄諸說並陳、不裁定。
- **draft/verified gate**：`pnpm dev` 顯示全部（含 draft）；`pnpm build`（prod）自動隱藏 draft 與未驗證進階層。

## 八、關鍵檔案索引

- 部署：`.github/workflows/deploy.yml`、`public/CNAME`
- Schema：`src/content.config.ts`
- 跨文本追蹤：`src/lib/queries.ts`
- 農民曆引擎：`src/lib/almanac/`（`provider.ts` 接天文資料；`rules/*.json` 規則表；`calibration.test.mjs`）
- 農民曆日期瀏覽：`src/components/AlmanacDay.astro`（單日視圖＋日期導覽）、`src/pages/almanac/[date].astro`（±1 年日期頁，每日 cron 滾動）、`src/lib/almanac/dates.ts`（視窗與日期工具）
- 校驗工具：`scripts/check-integrity.ts`、`scripts/verify-almanac.ts`、`scripts/import-temples.ts`
- 授權：`LICENSE`（程式 MIT；內容資料逐條標源）
