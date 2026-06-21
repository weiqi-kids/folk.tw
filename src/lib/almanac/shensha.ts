// C.2 S8 — 神煞集合：依 rules/shensha.json 定位規則，推當日生效之神煞。
import shenshaData from './rules/shensha.json';
import { BRANCHES } from './ganzhi';

interface ShenSha {
  id: string;
  name: string;
  class: '吉' | '凶';
  locate_by: string;
  locate_table: unknown;
  sources: string[];
  verified: boolean;
}
const SHENSHA = (shenshaData as { shensha: ShenSha[] }).shensha;

export interface DayContext {
  monthBranch: string; // 月建支（節分月）
  dayStem: string;
  dayBranch: string;
  dayGanZhi: string; // 日干支二字
}

// ── 推導輔助 ──────────────────────────────────────────────
/** 月建支 → 農曆月數（寅=正月1 … 丑=12） */
function monthNum(monthBranch: string): number {
  const order = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
  const i = order.indexOf(monthBranch);
  return i < 0 ? 0 : i + 1;
}
/** 月數 → 季（春/夏/秋/冬） */
function season(mn: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  if (mn <= 3) return 'spring';
  if (mn <= 6) return 'summer';
  if (mn <= 9) return 'autumn';
  return 'winter';
}
/** 月數 → 孟仲季 */
function monthType(mn: number): 'meng' | 'zhong' | 'ji' {
  const r = mn % 3;
  return r === 1 ? 'meng' : r === 2 ? 'zhong' : 'ji';
}
/** 地支對沖 */
function opposite(branch: string): string {
  const i = BRANCHES.indexOf(branch as (typeof BRANCHES)[number]);
  return BRANCHES[(i + 6) % 12];
}
/** 三合局：日支與月建是否同三合局 */
const TRIADS = [
  ['申', '子', '辰'],
  ['寅', '午', '戌'],
  ['亥', '卯', '未'],
  ['巳', '酉', '丑'],
];
function sameTriad(a: string, b: string): boolean {
  return TRIADS.some((t) => t.includes(a) && t.includes(b));
}

export interface ActiveShenSha {
  id: string;
  name: string;
  class: '吉' | '凶';
  sources: string[];
  verified: boolean;
}

/** 當日生效之神煞集合（C.2 S8）。只回能由現有 locate_table 判定者；月刑等無表者略過。 */
export function activeShenSha(ctx: DayContext): ActiveShenSha[] {
  const mn = monthNum(ctx.monthBranch);
  const ss = season(mn);
  const seasonKey = `season_${ss}` as const;
  const mt = monthType(mn);
  const out: ActiveShenSha[] = [];

  for (const s of SHENSHA) {
    const t = s.locate_table as Record<string, unknown> | null;
    let active = false;
    switch (s.locate_by) {
      case 'day_branch_vs_month_branch': // 月破：日支 = 月建對沖
        active = ctx.dayBranch === opposite(ctx.monthBranch);
        break;
      case 'month->stem':
      case 'month->stem_or_trigram': {
        const v = t?.[String(mn)];
        // 卦（坤/乾/艮/巽）為方位非日干，不作日級生效；天干則比日干
        active = typeof v === 'string' && '甲乙丙丁戊己庚辛壬癸'.includes(v) && v === ctx.dayStem;
        break;
      }
      case 'month->branch': {
        const v = t?.[String(mn)];
        active = typeof v === 'string' && v === ctx.dayBranch;
        break;
      }
      case 'month+day->branch_combo': // 三合
        active = sameTriad(ctx.monthBranch, ctx.dayBranch);
        break;
      case 'season->branch_set': {
        const set = (t?.[seasonKey] as string[]) ?? [];
        active = set.includes(ctx.dayBranch);
        break;
      }
      case 'season->stem_set': {
        const set = (t?.[seasonKey] as string[]) ?? [];
        active = set.includes(ctx.dayStem);
        break;
      }
      case 'season->branch':
        active = t?.[seasonKey] === ctx.dayBranch;
        break;
      case 'season->stem_branch_set': {
        const set = (t?.[seasonKey] as string[]) ?? [];
        active = set.includes(ctx.dayGanZhi);
        break;
      }
      case 'month_type->branch': {
        const key = `${mt}_months`;
        active = t?.[key] === ctx.dayBranch;
        break;
      }
      default:
        active = false; // 無表／未支援之定位（如月刑 locate_table=null）
    }
    if (active) out.push({ id: s.id, name: s.name, class: s.class, sources: s.sources, verified: s.verified });
  }
  return out;
}
