# 交接：2026-08-19 這一輪停在哪裡

> 這份是給**接手的 session** 看的。做完就把這個檔刪掉。
> 🔴 背景任務與 `/tmp` 暫存不會活過 `/clear`，所以要做的事全部寫在這裡，不要去找它們。

## 一、現在的狀態

所有 commit 都已 push（`git log --oneline origin/main..HEAD` 應為空）。
剩下的只有**驗證 CI 綠燈 → 推送收錄**這一件，其餘都完成了。

```bash
gh run list --workflow deploy.yml --limit 3 \
  --json headSha,status,conclusion -q '.[]|"\(.headSha[0:7]) \(.status) \(.conclusion)"'
```

## 二、接手要做的事（照順序）

### 1. 確認 CI 綠燈

CI 若**紅燈**，先看是哪一道：

```bash
RID=$(gh run list --workflow deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run view $RID --log-failed | grep -E '##\[error\]|✗' | head
```

🔴 **不要直接補跑或重跑**——例外只有兩個且條件不同，動手前讀
`docs/decisions/deploy-and-gates.md` 的「🔴 部署觸發規則」。這一輪連續踩過三種紅燈，
成因與修法都已寫進對應 commit：

| 紅燈 | 成因 | 已修 |
|---|---|---|
| `check:anchor-text` | 來源 `note` 裡寫了「（實測 HTTP 200）」，gate 判準是 `/\bhttp/i` | `check:source-refs` 規則⑤在來源層擋（秒級） |
| 安裝中文字型 | runner 連不上 Ubuntu mirror，apt 每次跑滿逾時 | `deploy.yml` 改三段式：先檢查→apt→GitHub 直取字型 |
| `check:rendered` | build 跨台北午夜，gate 用新日期重算「下一次國曆日期」 | `dist/.build-date` 戳記＋`render-context.mjs` 改讀它 |

### 2. CI 綠了就推送收錄

```bash
cd /root/folk.tw
pnpm notify $(grep -v '^#' docs/pending-notify-urls.txt | tr '\n' ' ')
```

推完刪掉 `docs/pending-notify-urls.txt`。

### 3. 收尾

- 刪掉本檔與 `docs/pending-notify-urls.txt`
- 若還沒跑過本機完整驗證，發佈前的正確作法是：
  `node scripts/lib/gates.mjs run ci-pre-build && pnpm build:release && node scripts/lib/gates.mjs run ci-post-build`
  🔴 **不要用 CI 當驗證步驟**——產物層那三道 gate 只能在 build 後跑，本機跑一次 20 分鐘，
  比推上去等 20 分鐘再看紅燈划算得多。這一輪就是因為省這 20 分鐘而反覆紅燈。

## 三、這一輪完成了什麼（避免重做）

- **25 個新活動頁**：地方宗教慶典清單裡「還沒有專屬頁」的項目全部處理完
  （逐項結果見 `docs/writing-queue.md`，該檔**不寫死數量**、只給查法）。
- **歷年舉辦紀錄時間軸**：`src/data/celebration-occurrences.json` ＋
  `src/components/OccurrenceTimeline.astro` ＋ `src/lib/celebration-occurrences.ts`。
  🔴 用途是「檔期查不到時不要停在免責，改列實際辦過哪幾次」。
- **掛源修復**：三頁掛了不存在的 nchdb caseId（撐了約四個月）、23 處掛到不相干頁面的引用。
- **taiwangods 授權更新**：站主 2026-08-19 回報內政部已確認同意，gate 與 `/about/` 已同步。
- **GSC「未編入索引的原因」七類逐項查證**：結論寫在
  `docs/decisions/seo-calls.md` 最後一節，**不要再從頭查一次**。
- **六道新／修的 gate**：`check:source-refs`（四條規則→五條）、`check:copy-voice` 的
  維護註記外洩、`check:outbound-urls` 擴到 `public/*.txt`、索引稽核的滾動重查、
  `check:rendered` 的基準日、`deploy.yml` 的字型備援。

## 四、還沒做、要站主決定的

見 `docs/writing-queue.md` 的 D／E／F 三段。其中 F 段兩件仍待追認：
`speakable` 的兩個 selector（判定不收斂）、description 的兩個單位（判定不修）。
