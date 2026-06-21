// C.2 S7 — 黃黑道十二神（依 rules/huanghei.json：月支→青龍起神，順行十二辰）
import huanghei from './rules/huanghei.json';
import { BRANCHES } from './ganzhi';

interface MonthTable {
  month_branch: string;
  qinglong_day_branch: string;
  sources: string[];
  verified: boolean;
}
interface God {
  pos: number;
  name: string;
  class: string;
  auspicious: boolean;
}

const MONTH_TABLES = (huanghei as { month_tables: MonthTable[] }).month_tables;
const SEQ = (huanghei as { twelve_gods_sequence: { sequence: God[] } }).twelve_gods_sequence.sequence;

/**
 * 黃黑道值神（C.2 S7）。月建支 → 青龍所在日支 → 順行十二辰定值神。
 * 回 null 表查無起神表。verified 取該月起神表列之 verified。
 */
export function huangHeiDao(
  monthBranch: string,
  dayBranch: string,
): { name: string; auspicious: boolean; sources: string[]; verified: boolean } | null {
  const row = MONTH_TABLES.find((r) => r.month_branch === monthBranch);
  if (!row) return null;
  const start = BRANCHES.indexOf(row.qinglong_day_branch as (typeof BRANCHES)[number]);
  const d = BRANCHES.indexOf(dayBranch as (typeof BRANCHES)[number]);
  if (start < 0 || d < 0) return null;
  const offset = ((d - start) % 12 + 12) % 12; // 順行十二辰
  const god = SEQ[offset % SEQ.length];
  return { name: god.name, auspicious: god.auspicious, sources: row.sources, verified: row.verified };
}
