// 民俗活動「舉辦週期」的**唯一入口**：判定、造句、短標都在這裡。
//
// 🔴 為什麼要有這支（2026-08-20 建，成因是線上真的輸出了病句）：
//    `events/[id].astro` 原本在樣板裡直接串接
//        `${e.ke_rule}年一科`
//    而 `ke_rule` 這個欄位**同時裝著兩種不同的東西**——`content.config.ts` 的註解
//    寫著「三年一科：丑辰未戌」，意思是它該只放地支；但 10 筆有值的資料裡只有 2 筆
//    是純地支，其餘 8 筆塞的是自由文字。串接的結果就是線上這些句子：
//        /events/wanhegong_laoerma_xitun/  「…舉行，三年一科年一科。」
//        /events/nanguanxian_wangjiao/     「…非同步年一科」
//        /events/anding_zhenhugong_wangchuan/「…（首科1967年）年一科」
//    （2026-08-20 curl 實證，非推測。）
//
//    第二層病灶是**重複**：`date_note` 是人寫的完整敘述，本來就把週期講完了，
//    FAQ 還去接一次。安定真護宮那筆的 date_note 是「逢丑辰未戌年三年一科，約農曆3月上旬前後」，
//    後面再接一次，週期等於被講了三次。全量統計：非 annual 的事件裡 7 筆會重複、
//    4 筆接了才有價值；`date_resolution:'divined'` 的有 5 筆 date_note 已自己提了擲筊。
//
// ⚠️ 不自行推導週期年數。地支數量看起來可以算出「幾年一科」（4 個地支＝三年一科），
//    但民俗稱法不照算術走——馬鳴山「五年千歲」逢寅、午、戌年舉行，通行稱法是
//    「五年一科」而不是算出來的「四年一科」。**來源怎麼說就怎麼寫，沒說就不寫。**
//
// ⚠️ 這支必須能被 bare node 載入（gate 與測試共用），所以相對 import 一律帶 `.ts`。

/** 地支（科年用）。 */
export const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

export type EventCycle =
  /** 每年舉行 */
  | { kind: 'annual' }
  /** 逢特定地支年舉行的香科／醮典 */
  | { kind: 'ke'; branches: string[]; periodText: string | null }
  /** 不定期 */
  | { kind: 'irregular'; periodText: string | null };

/** events.json 一筆資料裡與週期有關的欄位（只取需要的，避免與 collection 型別耦合）。 */
export interface EventCycleFields {
  cycle: 'annual' | 'n_year_ke' | 'irregular';
  ke_branches?: string[] | null;
  ke_period_text?: string | null;
}

/** 由資料欄位判定週期。 */
export function eventCycle(e: EventCycleFields): EventCycle {
  const branches = (e.ke_branches ?? []).filter((b) => (EARTHLY_BRANCHES as readonly string[]).includes(b));
  const periodText = e.ke_period_text?.trim() || null;
  if (e.cycle === 'annual') return { kind: 'annual' };
  if (e.cycle === 'irregular') return { kind: 'irregular', periodText };
  return { kind: 'ke', branches, periodText };
}

/**
 * 完整週期措辭（用於 FAQ 句子）。
 * 🔴 只由結構化欄位組成，不吃自由文字拼接——這就是病句不可能再發生的原因。
 */
export function cyclePhrase(c: EventCycle): string {
  switch (c.kind) {
    case 'annual':
      return '每年一次';
    case 'irregular':
      return c.periodText ?? '不定期舉行';
    case 'ke': {
      const where = c.branches.length ? `逢${c.branches.join('、')}年` : '';
      if (c.periodText && where) return `${c.periodText}（${where}）`;
      if (c.periodText) return c.periodText;
      if (where) return `${where}一科`;
      return '數年一科';
    }
  }
}

/**
 * 詳情頁 `<dt>週期</dt>` 的標示，可以長（會吃 periodText 全文）。
 *
 * ⚠️ 與 cycleShort() 是兩支不是一支，這是刻意的：卡片版位塞不下
 * 「三大廟各約每 12 年一科慶成五朝王醮，非同步」這種長度。要改詳情頁措辭改這支，
 * 要改卡片措辭改 cycleShort()，**不要把其中一支改成呼叫另一支**。
 */
export function cycleLabel(c: EventCycle): string {
  switch (c.kind) {
    case 'annual':
      return '每年';
    case 'irregular':
      return c.periodText ?? '不定期';
    case 'ke':
      return c.periodText ?? (c.branches.length ? `逢${c.branches.join('、')}年一科` : '數年一科');
  }
}

/**
 * 卡片用的固定短語（不吃 periodText，長度可預期）。
 *
 * 🔴 2026-08-20 之前 events/index.astro 與 events/[id].astro 各有一份 CYCLE 對照表，
 *    而且用詞不同（'每年' vs '年度'、'不定期' vs '不定'）——同一個事實在兩頁講不同的話。
 *    兩份都收進這裡之後，措辭差異變成「兩個具名函式」而不是「兩份會各自漂移的表」。
 */
export function cycleShort(c: EventCycle): string {
  switch (c.kind) {
    case 'annual':
      return '每年';
    case 'irregular':
      return '不定期';
    case 'ke':
      return '數年一科';
  }
}

// ── FAQ「什麼時候舉行」的造句 ────────────────────────────────────────────
//
// date_note 是人寫的、最完整的一句，所以它是主體；結構化欄位只補它沒講到的部分。
// 判斷「講了沒」用下面兩個述詞，**它們的每一筆判定都被 event-cycle.test.ts 的
// golden table 釘住（全量 67 筆逐筆列出）**——不是靠正規式寫得漂亮，是靠輸出被人看過。

/** date_note 是否已經自己交代了週期。 */
export function noteStatesCycle(dateNote: string): boolean {
  return /科|不定期|每年|每[一二三四五六七八九十]+年|每\s?\d+\s?年|逢[^，。；]{1,12}年/.test(dateNote);
}

/** date_note 是否已經自己交代了「日期由擲筊決定」。 */
export function noteStatesDivination(dateNote: string): boolean {
  return /擲筊|請示|擇定|擇日/.test(dateNote);
}

/**
 * date_note 是不是「整段散文」而不是短片語。
 *
 * 🔴 這個判斷必須存在，因為 date_note 跟 ke_rule 犯的是同一個毛病——它同時裝著兩種東西：
 *    短片語（「九月」「四月」）與完整敘述（蕭壠香那筆是三個句子、還自己講了擲筊）。
 *    把「◯◯約於 X 舉行」硬套在散文上會生出「…不是固定的農曆日。舉行。」這種尾巴，
 *    那正是本次要修掉的病句的另一種型態。判準是三選一：含句號、已自帶「舉行/舉辦」、或超過 24 字。
 */
export function noteIsProse(dateNote: string): boolean {
  return /。/.test(dateNote) || /舉行|舉辦/.test(dateNote) || [...dateNote].length > 24;
}

/**
 * FAQ「◯◯什麼時候舉行？」的答句。
 *
 * 散文型的 date_note 原文照登（它本來就是完整答案）；短片語型才套「約於…舉行」。
 * 週期與擲筊子句只在 date_note 沒講過時才補——判定見 noteStatesCycle／noteStatesDivination。
 *
 * @param name 活動名稱
 * @param dateNote 人寫的日期敘述（events.json 的 date_note）
 * @param cycle 由 eventCycle() 得到的週期
 * @param divined date_resolution === 'divined'
 */
export function scheduleSentence(
  name: string,
  dateNote: string | undefined,
  cycle: EventCycle,
  divined: boolean,
): string {
  if (!dateNote?.trim()) return '';
  const note = dateNote.trim();
  const clauses: string[] = [];
  if (!noteStatesCycle(note)) clauses.push(cycle.kind === 'annual' ? '每年一次' : cyclePhrase(cycle));
  if (divined && !noteStatesDivination(note)) clauses.push('確切日期由廟方擲筊擇定');

  if (noteIsProse(note)) {
    const base = /[。！？]$/.test(note) ? note : `${note}。`;
    return clauses.length ? `${base}${clauses.join('；')}。` : base;
  }
  return `${name}約於${note}舉行${clauses.length ? `，${clauses.join('；')}` : ''}。`;
}
