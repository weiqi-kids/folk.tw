# ADR-0002：不做「同名重新實作」偵測，改擋造成複製的條件

- **日期**：2026-08-20
- **狀態**：已決定
- **脈絡**：2026-08-20 架構巡檢；本 repo 的頭號病灶

## 背景

這個 repo 反覆出現「同一條規則兩份實作」，而且每次都是同一種後果：
兩份各自演化時**不會紅燈，只會安靜地放行錯的東西**。已知病例：

| 出貨模組 | 複製品 | 後果 |
|---|---|---|
| `src/lib/almanac/ganzhi.ts` 的 `dayPillar`／錨定常數 | `scripts/verify-almanac.ts` 的 `ourDayPillar` | 那支「驗證器」驗的是自己那份副本——出貨模組漂掉也照樣印 100% |
| `src/lib/text-width.ts` 的 `fullWidth` | `scripts/check-source-refs.mjs` 的 `fullWidthLen` | 字元類別不同（`[\x00-\xff]` vs `[\x00-\x7F]`），實測「café」一邊算 4 一邊算 5 |
| `src/lib/sources.ts` 的 `parseSourceRef` | `src/components/AlmanacDay.astro` 的 `sourceDisplay` | 缺 `cleanLabel`／`labelFromNote`／維基條目名增強 |

巡檢因此建議加一道 gate：
「`scripts/` 底下不得出現 `src/lib/*` 已匯出之符號的同名重新實作」。

## 為什麼不做：實測 0 真陽性、4 誤報

實作了偵測器並全量掃過（`src/lib` 具名匯出對 `scripts/` 的本地定義，扣掉有 import 的）：

```
src/lib 具名匯出 208 個｜scripts 掃 120 檔
同名本地重新定義 4 處：
  scripts/import-festivals.mjs:140          byName            ← src/lib/zodiac.ts
  scripts/import-knowledge-deities.mjs:178  byName            ← src/lib/zodiac.ts
  scripts/import-local-celebrations.mjs:131 byName            ← src/lib/zodiac.ts
  scripts/invariants/festival.mjs:233       festivalDateLabel ← src/lib/temple-festival.ts
```

逐個判讀，**四個全是誤報**：

- `byName` 在三支匯入器裡是「廟名 → 廟」的區域 Map，與 `zodiac.ts` 的「生肖名 → 生肖」
  只是撞名。這種泛用名字本來就會撞。
- `festivalDateLabel` 在 `invariants/festival.mjs` 是**不變量描述物件**（`{id, title, check}`），
  依它驗證的對象命名，而且它的 `check()` **正確地呼叫了 lib 的 `festivalNextSolar`**。

而上表三個真病例，函式名全部**不同**（`dayPillar`／`ourDayPillar`、
`fullWidth`／`fullWidthLen`、`parseSourceRef`／`sourceDisplay`）。
**正因為不同名，才沒有人發現。** 同名偵測恰好對真案例無效、對假案例敏感。

## 決定

**不做同名偵測**，改擋**造成複製的那個條件**。

三個真病例的直接原因是同一個：**gate 或匯入器載不進 `src/lib` 的模組**。
`scripts/invariants/zodiac.mjs` 的檔頭直接寫著
「`zodiac.ts` 用無副檔名 import，bare node 解析不到，只能複製正則」——
作者自己標註了這個因果。

載得進來，複製就沒有理由；載不進來，下一個人還是會複製。而「載不載得進來」
**是可以機械檢查的**。因此改為 `scripts/check-lib-loadable.mjs`（gate `check:lib-loadable`）：
逐支 `import()` `src/lib/**/*.ts`，失敗就紅燈並指出是哪一種原因與修法。

實作當天把可載入率從 33/46 拉到 43/46；剩下 3 支相依 `astro:content`
（Vite 虛擬模組，Node 永遠解析不到），具名豁免並寫明理由。

## 什麼情況下要重開這個題目

- 出現**不是**由「載不進來」造成的複製——也就是有人明明 import 得到卻仍自己寫一份。
  那時條件式的擋法就不夠，要另想辦法（但仍不建議用同名偵測，理由同上）。
- 有可靠的語意相似度工具可用時，可重新評估「偵測複製本身」。

## 順帶記下的判準

擋**條件**比擋**行為**可行，這條在本 repo 已經出現第二次：
`check:lib-loadable` 擋「載不進來」而不是擋「複製」；
`gate-corpus` 擋「宣告要掃卻掃到 0」而不是擋「gate 寫錯」。
兩者共同點是：**要擋的那件事本身難以機械判斷，但它的必要條件很好查。**
