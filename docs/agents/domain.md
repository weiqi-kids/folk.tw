# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## 🔴 本 repo 特有的前提（先讀這段）

- **本站的 domain 脈絡目前不在 `CONTEXT.md`**，而在兩個地方：
  `docs/decisions/*.md`（決策的歷史脈絡，原文保留當時判斷）與 **`src/` 各檔的檔頭註解**（現況）。
  **兩者不一致時信程式碼**，並回頭在 docs 標上更正。見 CLAUDE.md §4 檔尾那段警語。
- **改任何 `src/` 檔案前，先讀那個檔自己的檔頭註解**——場景限定的紅線刻意寫在那裡，不在總紅線區。
- 動手前先照 **CLAUDE.md §4 文件地圖**對號入座：那不是參考資料，是動手前的強制步驟。
- `CONTEXT.md` 目前不存在，**這是預期狀態**，不要預先建空殼——等真的解決了某個詞彙時再 lazily 建。
- `docs/adr/` **已經有內容**（2026-08-20 起）。它只記「為什麼不做」與「為什麼這樣做」，
  用途是讓下一次架構審查不必重新推導同一件事。動某塊之前先看那裡有沒有相關的 ADR；
  🔴 **要推翻某份 ADR 是可以的，但要在該檔加一段說明是什麼新證據推翻了它**，
  不要當它不存在。

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

本 repo 為 **single-context**（無 monorepo：無 `pnpm-workspace.yaml`、無 `workspaces`、無 `packages/`）。

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

⚠️ 在本站，**民俗詞彙的措辭界線本身就是紅線**（例：「有在辦安太歲」vs「有太歲殿」不可混用；
判定唯一入口 `src/lib/zodiac.ts`）。改用詞前先看該領域對應的 `docs/decisions/` 檔。

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
