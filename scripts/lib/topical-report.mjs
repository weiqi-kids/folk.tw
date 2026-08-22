// 時事祈福 · 階段間的 stdout 摘要協定（唯一產生端）。
//
// 三支腳本自身**不碰 git、不發 Slack**：它們把「這一輪做了什麼」用 tab 分隔的摘要行印到 stdout，
// 由 `topical-*-cron.sh` 抓來決定 commit 訊息、要不要 [skip ci]、以及發哪一則 Slack。
// 消費端（**改格式前一定要一起改**）：
//   scripts/topical-orchestrate-cron.sh:41  grep '^PUBLISHED' → IFS=$'\t' read _ id title url
//   scripts/topical-news-scan-cron.sh:18    同上
//   scripts/topical-followup-cron.sh:64     grep -qE '^(UPDATED|MEMORIAL|RENAMED)' 決定是否 [skip ci]
//   scripts/topical-followup-cron.sh:84,89,94  逐行切欄位發 Slack
//   scripts/topical-news-scan-cron.sh          grep '^SCAN_FAILED'／'^SCAN_RECOVERED' → 告警 Slack
//
// ── 為什麼只抽「產生端」，不改協定（2026-08-19）────────────────────────────────
// 協定本身沒有問題：它讓腳本與 git／Slack 解耦，換掉 cron 包裝不必動 node。有問題的是
// **格式散在六處字串模板裡**，沒有一個地方說得出「UPDATED 有幾欄、第幾欄是什麼」。
// 故這裡只收斂產生端；bash 那側原封不動。
//
// 🔴 欄位一律過 `field()`：標題或後續文字裡只要混進一個 tab（或換行），bash 的
//    `IFS=$'\t' read -r _ id title url` 就會整行錯位——Slack 會發出把祈福語當成網址的訊息，
//    而且**不會有任何錯誤**。LLM 產的文字進得了這裡，所以這不是理論風險。
//    處理方式是把 tab／換行換成空白（面向使用者的一句話不需要它們），**不改協定本身**。

/** 祈福頁網址（slug 永久承諾，見 CLAUDE.md 紅線 4）。 */
export const blessingUrl = (id) => `https://folk.tw/qiugian/blessing/${id}/`;

/** 單一欄位消毒：tab／CR／LF → 空白，避免弄壞 cron 那側的逐欄切分。 */
const field = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ');

/** 印一行摘要（kind ＋ 各欄，tab 分隔）。 */
const line = (kind, ...fields) => { console.log([kind, ...fields.map(field)].join('\t')); };

/**
 * 偵測器連續失敗（P2，2026-08-22 加）。cron：連續達門檻就發 Slack 告警。
 *
 * 🔴 為什麼需要它：`scanNews()` 抓到 claude 失敗時**回空陣列**，腳本照樣 exit 0，
 * cron 包裝看到沒有變更就印「無變更」結束——整條管線在**完全靜音**的狀態下停擺。
 * 實據：seo-ops/logs/folk.tw-topical-news.log 第 788–806 行是連續 10 次
 * 「claude 掃描失敗（status=1）」（全檔共 16 次），夾在 time=2026-08-11 與第一筆
 * time=2026-08-17 的候選之間（每 8 小時一輪 → 約 3.3 天），**沒有任何人發現**。
 * 那三天剛好涵蓋 2026-08-15 的越南航空 VN34，而我一度把「那幾天沒有航空事故候選」
 * 誤讀成「類型表漏了」——**沒有告警不只是漏事件，還會讓事後歸因指向錯的地方**。
 */
export const reportScanFailed = (consecutive, detail) => line('SCAN_FAILED', String(consecutive), detail);

/** 偵測器恢復正常（前一輪還在失敗狀態）。cron：發一則恢復通知，讓人知道洞補起來了。 */
export const reportScanRecovered = (afterFailures) => line('SCAN_RECOVERED', String(afterFailures));

/**
 * 同一個候選連續多輪過不了機器複驗。cron：發 ⚠️ Slack。
 *
 * 🔴 為什麼要有這一條（2026-08-22）：SCAN_FAILED 只管「掃描器整支掛掉」，
 *    但更常見的失敗是**掃描器好好的、候選也回報了，卻每一輪都被複驗丟掉**，
 *    而那一路上完全沒有訊號——log 實據：`fire@台中市中區（西北大飯店舊址）`
 *    連 3 輪被判「存活來源不足 2」，彰化旭光路氣爆、台南關廟、南投竹山同型，
 *    全部靜音。整份 log 137 次複驗有 85 次丟棄（62%），人為類通過率只有 25%
 *    （天災 41%）——「人為災害沒有入選」正是從這裡漏掉的，而不是類型表。
 * ⚠️ 門檻定 3 輪（≈24 小時）而不是 2：偵察員每輪未必回報同一個候選，
 *    連 3 輪都出現同一個地名才代表它是真事件而我們一直吃不下。
 */
export const reportCandidateStuck = (place, rounds, reason) =>
  line('CANDIDATE_STUCK', place, String(rounds), reason);

/** 新開祈福頁（P1／P2）。cron：commit＋push 觸發部署，並對每頁發 Slack。 */
export const reportPublished = (id, title) => line('PUBLISHED', id, title, blessingUrl(id));

/** 逾期 active 自動歸檔（P1）。cron 不對它發 Slack，只讓它算進「有變更」。 */
export const reportArchived = (id, title) => line('ARCHIVED', id, title);

/** 集氣排序未進前 N 而降級（P1 第 3 段）。 */
export const reportDemoted = (id, title, blessCount) => line('DEMOTED', id, title, `集氣 ${blessCount}`);

/** 在寬限期內、暫不佔配額也不降級的新頁（P1 第 3 段）。 */
export const reportGrace = (id, title, blessCount) => line('GRACE', id, title, `集氣 ${blessCount}`);

/** 掛上一筆有來源的後續發展（P4）。cron：發 Slack 且**不**加 [skip ci]。 */
export const reportUpdated = (id, title, text) => line('UPDATED', id, title, text, blessingUrl(id));

/** archived → memorial（P4）。 */
export const reportMemorial = (id, title) => line('MEMORIAL', id, title, blessingUrl(id));

/** 颱風事後補名（P4）：標題變動＝面向使用者的字變了，要讓人看得到並可回覆訂正。 */
export const reportRenamed = (id, before, after) => line('RENAMED', id, before, after, blessingUrl(id));
