// ═══════════════════════════════════════════════════════════════════════════
// 「這個地方慶典是不是每年舉辦」的**判定唯一入口**。
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 為什麼要有這支（2026-08-19，修一個已上線的錯誤陳述）：
//    `/festivals/local/` 拿 `local-celebrations.json`（內政部「地方宗教慶典」）的
//    `calendar`＋`date` 算「下一次國曆日期」。但**那份來源只給月日、沒有給舉辦週期**，
//    所以對「數年一科」的慶典，頁面會算出一個根本不會發生的日期。線上實測三筆全錯：
//      ・蕭壟香 顯示「國曆 2/20」→ 每三年一科，2026 丙午科已辦畢，**2027 不辦**
//      ・土城香 顯示「國曆 4/25」→ 每三年一科
//      ・西港香 顯示「國曆 5/6」→ 每三年一科
//    那是替主辦廟宣稱一個他們沒有公告過的日期＝杜撰（總紅線第 1 條）。
//    這與同頁「回曆 2 筆刻意不換算」是**同一條原則**：沒有可信依據就不要算。
//
// ── 判定怎麼來 ─────────────────────────────────────────────────────────
//   權威依據＝國家文化資產網的 `holdPeriod` 欄位，快照在
//   `src/data/nchdb-folklore-index.json`（`hold_period`，逐字照抄官方原文，
//   實際值有「每年」「每逢(隔)3年舉行一次」「其他」「不定期 平均約每十年舉行一科王船醮典」…）。
//   而「哪一項 lc 對到哪一個個案」需要人工判斷（官方名與俗名常不同），
//   那份對帳在 `src/data/local-celebration-cases.json`。
//   **本支只做 join 與分類，不自己認定週期、也不猜對映。**
//
// ⚠️ **殘留風險，寫在這裡以免下一個人以為已經全對過**：對帳檔目前只涵蓋已查證的那幾筆，
//    **未對帳的項目一律沿用來源的月日照算（＝維持既有行為）**。理由是內政部那份清單
//    本身是以「年度慶典」的形式登錄月日，多數項目確實每年舉辦，全部停算會讓頁面
//    失去用途；但這也意味著**未對帳項目的年度性沒有經過驗證**。對帳補齊到哪裡，
//    看 `local-celebration-cases.json` 的 items 數。
//
// 🔴 改這支之前先想清楚：任何「顯示一個算出來的日期」的決定，都是在替主辦方
//    宣稱那天有活動。寧可顯示「日期以主辦廟公告為準」，也不要顯示一個好看的錯日期。

import cases from '../data/local-celebration-cases.json';
import nchdb from '../data/nchdb-folklore-index.json';

/** 官方 `holdPeriod` 判為「每年」的寫法。其餘一律不視為每年。 */
const ANNUAL_PERIOD = /^每年(舉辦\d+次)?$/;

type CaseRow = {
  lc_id: string;
  name: string;
  case_id: string | null;
  case_name: string | null;
  verdict: string;
  basis: string;
  next_known?: string | null;
  alt_cases?: string[];
};

const caseByLcId = new Map<string, CaseRow>((cases.items as CaseRow[]).map((x) => [x.lc_id, x]));
const periodByCaseId = new Map<string, string>(nchdb.items.map((x) => [x.case_id, x.hold_period]));

export type CelebrationCycle = {
  /** true＝可以算「下一次國曆日期」；false＝不可以，改顯示 `note`。 */
  annual: boolean;
  /** 官方 `holdPeriod` 原文（有對到個案時）。 */
  periodText: string | null;
  /** 頁面要顯示的一句話（僅 `annual === false` 時有值）。 */
  note: string | null;
  /** 對到的 nchdb 個案編號，供掛源用。 */
  caseId: string | null;
  /** 判定依據，寫給人看的（不渲染到頁面，供維護時追溯）。 */
  basis: string | null;
};

/**
 * 某一項地方慶典能不能算「下一次國曆日期」。
 *
 * 未對帳的項目回 `annual: true`（沿用來源月日，維持既有行為）——**那不是「已驗證每年」**，
 * 只是還沒對帳。已對帳且非每年的，回 `annual: false` 並附要顯示的那句話。
 */
export function celebrationCycle(lcId: string): CelebrationCycle {
  const row = caseByLcId.get(lcId);
  if (!row) return { annual: true, periodText: null, note: null, caseId: null, basis: null };

  const periodText = row.case_id ? (periodByCaseId.get(row.case_id) ?? null) : null;

  if (row.verdict === 'annual') {
    // 🔴 對帳說「每年」但官方原文不是「每年」＝兩份記載矛盾 → **保守不算**。
    //    對帳是人工判斷、會出錯；`hold_period` 是官方原文。矛盾時信官方，
    //    而且寧可少顯示一個日期，也不要顯示一個錯的。（沒對到個案就沒得比，照對帳走。）
    const contradicts = periodText !== null && !ANNUAL_PERIOD.test(periodText);
    if (!contradicts) {
      return { annual: true, periodText, note: null, caseId: row.case_id, basis: row.basis };
    }
    return {
      annual: false,
      periodText,
      note: `舉辦週期的登錄資料記為「${periodText}」，日期以主辦廟公告為準`,
      caseId: row.case_id,
      basis: `${row.basis}（⚠️ 與官方 hold_period 矛盾，已保守不換算）`,
    };
  }

  // 措辭刻意分兩種，因為兩者的事實強度不同（本 repo 踩過「有這個殿」被寫成「有在辦」的坑）：
  //   n_year  ＝有權威記載說它不是每年 → 可以說「數年一科」
  //   unknown ＝來源沒說或兩筆記載矛盾 → 只能說「未記為每年」，不可自己說成數年一科
  //     ⚠️ 有對到個案才可以說「登錄資料記為…」；沒對到個案（如麻豆香，nchdb 查無此案、
  //     依據是廟方官網與市府新聞稿）卻那樣寫，就是替官方文件說了它沒說的話。
  const note =
    row.verdict === 'n_year'
      ? periodText
        ? `數年一科（登錄資料記為「${periodText}」），下一科日期以主辦廟公告為準`
        : '數年一科，下一科日期以主辦廟公告為準'
      : '舉辦週期的登錄資料未記為每年，日期以主辦廟公告為準';

  return { annual: false, periodText, note, caseId: row.case_id, basis: row.basis };
}

/** 已對帳、且判定為非每年的項目數（給文件與 gate 用，不要在頁面寫死數字）。 */
export function nonAnnualCount(): number {
  return (cases.items as CaseRow[]).filter((x) => x.verdict !== 'annual').length;
}
