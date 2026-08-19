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
// ⚠️ **殘留風險，寫在這裡以免下一個人以為已經全查證過**：65 筆都已逐筆對帳，
//    但其中相當一部分的 verdict 是 `no_case`（nchdb 民俗類查無此案，多為市府活動
//    包裝或未登錄民俗）。**那不是「已驗證每年」，是沒有反向證據**，所以維持照算。
//    把「查不到」當成「不是每年」會反過來製造另一種錯誤陳述，兩邊都不能亂推。
//    各 verdict 各幾筆別寫死在文件裡，跑 `nonAnnualCount()` 或直接數對帳檔。
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
  alt_cases?: unknown[];
  date_conflict?: string;
  date_override?: { calendar: string; date: string; basis: string };
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
  /**
   * 短版：只講週期這個事實，不帶「日期以主辦單位公告為準」那條尾巴。
   * 🔴 用在**下面接得到歷年紀錄**的項目：那句尾巴的用途是告訴讀者「去看主辦方公告」，
   *    但當我們自己就列出歷年紀錄時，它只是噪音，而且會讓一行擠兩個訊息。
   */
  shortNote: string | null;
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
  if (!row) return { annual: true, periodText: null, note: null, shortNote: null, caseId: null, basis: null };

  const periodText = row.case_id ? (periodByCaseId.get(row.case_id) ?? null) : null;

  if (row.verdict === 'annual') {
    // 🔴 對帳說「每年」但官方原文**明確說了別的週期**＝兩份記載矛盾 → 保守不算。
    //    ⚠️ 判準刻意收窄成「每逢…」「不定期…」這種**明確的週期陳述**：
    //    `hold_period` 還有一個值是「其他」，那代表**來源沒有分類**，不是來源說不是每年。
    //    第一版把「其他」也當矛盾，結果誤停 4 筆——而那 4 筆的對帳依據正是同一份 nchdb
    //    內文的逐字正面陳述（青山宮「雖曾中斷，現仍每年如期舉行」、龍山寺盂蘭盆
    //    「每年均有眾多民眾參與」）。**空白的欄位不能當成反向證據。**
    const contradicts =
      periodText !== null && /(每逢|不定期)/.test(periodText) && !ANNUAL_PERIOD.test(periodText);
    if (!contradicts) {
      return { annual: true, periodText, note: null, shortNote: null, caseId: row.case_id, basis: row.basis };
    }
    return {
      annual: false,
      periodText,
      note: `舉辦週期的登錄資料記為「${periodText}」，日期以主辦單位公告為準`,
      shortNote: `登錄資料記為「${periodText}」`,
      caseId: row.case_id,
      basis: `${row.basis}（⚠️ 與官方 hold_period 矛盾，已保守不換算）`,
    };
  }

  // 🔴 `no_case`＝nchdb 查無此案，**那不是「不是每年」，是還沒裁決**。
  //    這 30 筆沒有任何反向證據，維持既有算法（照來源月日算）——把「查不到」
  //    當成「不是每年」會反過來製造另一種錯誤陳述。
  if (row.verdict === 'no_case') {
    return { annual: true, periodText, note: null, shortNote: null, caseId: row.case_id, basis: row.basis };
  }

  // 措辭刻意分兩種，因為兩者的事實強度不同（本 repo 踩過「有這個殿」被寫成「有在辦」的坑）：
  //   n_year  ＝有權威記載說它不是每年 → 可以說「數年一科」
  //   unknown ＝來源記為不定期、或兩個來源互斥 → 只能說「未記為每年」，不可自己升級成數年一科
  //     ⚠️ 有對到個案才可以說「登錄資料記為…」；沒對到個案（如麻豆香，nchdb 查無此案、
  //     依據是廟方官網與市府新聞稿）卻那樣寫，就是替官方文件說了它沒說的話。
  //     另外「其他」這種值不是週期陳述，引它等於讓讀者以為官方說了什麼——所以只有
  //     真的是週期描述（含「年」或「不定期」）時才引原文。
  const quotable = periodText !== null && /(年|不定期)/.test(periodText);
  const note =
    row.verdict === 'n_year'
      ? quotable
        ? `數年一科（登錄資料記為「${periodText}」），下一科日期以主辦單位公告為準`
        : '數年一科，下一科日期以主辦單位公告為準'
      : quotable
        ? `舉辦週期的登錄資料記為「${periodText}」，日期以主辦單位公告為準`
        : '舉辦週期的登錄資料未記為每年，日期以主辦單位公告為準';

  const shortNote =
    row.verdict === 'n_year'
      ? quotable
        ? `數年一科（${periodText}）`
        : '數年一科'
      : quotable
        ? `登錄資料記為「${periodText}」`
        : '登錄資料未記為每年';

  return { annual: false, periodText, note, shortNote, caseId: row.case_id, basis: row.basis };
}

/**
 * 來源的月日被權威資料證實有誤時的修正值。沒有這個欄位就回 null，**頁面一律照來源**。
 *
 * 🔴 為什麼要有這一層：`local-celebrations.json` 由 import-local-celebrations.mjs 從內政部
 *    資料產生，直接改那個檔會在下次匯入時被蓋回去。修正值連同依據放在對帳檔裡，
 *    匯入器動不到，而且「為什麼改」跟「改成什麼」永遠在一起。
 * ⚠️ 加任何一筆之前，依據要寫到能被別人複驗的程度——這是在覆蓋官方來源，門檻要高。
 */
export function celebrationDateOverride(
  lcId: string,
): { calendar: string; date: string; basis: string } | null {
  return caseByLcId.get(lcId)?.date_override ?? null;
}

/**
 * 已判定為「不可算國曆日期」的項目數（給文件與 gate 用，不要在頁面寫死數字）。
 * ⚠️ `no_case` 不算在內——它是「查無個案、未裁決」，行為上與 `annual` 相同。
 */
export function nonAnnualCount(): number {
  return (cases.items as CaseRow[]).filter((x) => x.verdict === 'n_year' || x.verdict === 'unknown').length;
}
