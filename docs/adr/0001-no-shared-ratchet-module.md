# ADR-0001：不抽共用的 ratchet 模組

- **日期**：2026-08-20
- **狀態**：已決定（不做）
- **脈絡**：2026-08-20 架構巡檢

## 背景

巡檢提出一個候選：「ratchet（只能降不能升的基準）是重複出現的概念，卻沒有模組」，
並列出六個檔案（`check-source-refs`／`check-content`／`check-memory-numbers`／
`check-copy-voice`／`check-design`／`check-temple-demand-pages`），建議抽出
`scripts/lib/ratchet.mjs`，把基準值集中到 `docs/gate-baselines.json`。

## 實查結果：那個計數是錯的

逐檔查證後，**ratchet 語意全部只存在於一個檔案**：

```
grep -rn "只能降\|不可往上\|鎖住成果\|超過基準" scripts/*.mjs
→ 全部命中 scripts/check-source-refs.mjs
```

實際在用的數值基準只有一個：`check-source-refs.mjs` 的 `WIDE_NOTE_BASELINE`
（另有 `UNLICENSED`／`BASELINE` 一組框架，2026-08-19 起兩個列管站都已取得授權而
**刻意留空**——空的不代表機制沒用，新的「大量引用但授權未明」來源出現時加回去即生效）。

其餘五個檔案被列進來，是因為它們有 ALLOW 白名單或「只掃相對 origin/main 變動的檔」
這類 grandfather **範圍**控制。那與「數值只能降不能升」是不同的機制，
名字像而已。

## 決定

**不抽。**

判準是 codebase-design 的那條：**一個 adapter 只是假想的 seam，兩個才是真的。**
目前只有一個真正的使用者，抽出來不會讓複雜度集中（deletion test 不成立），
只會在單一使用者之上多一層抽象，以及多一個要維護的 `docs/gate-baselines.json`。

## 什麼情況下要重開這個題目

出現**第二個**真正的數值 ratchet 時——也就是有人在別的 gate 寫下
「現況已有 N 筆，硬擋等於擋工作，所以只擋增加」並填一個基準常數。
那時兩個使用者才構成真的 seam，屆時 `ratchet.mjs` 的 interface 應該是
`ratchet(id, currentCount)`，語意＝超過基準紅燈、低於基準自動寫回或至少 WARN。

## 未解決的部分（不因本 ADR 消失）

巡檢對 ratchet 現況的兩點批評**是對的**，只是不需要用抽模組來解：

- 基準值是手填的魔術數字。
- 「降下來了要記得調低」目前只有 WARN（`check-source-refs.mjs:262`、`:295`），
  沒有機械保證。

要處理的話，就地在 `check-source-refs.mjs` 讓它降了自動寫回即可，成本遠低於抽模組。
