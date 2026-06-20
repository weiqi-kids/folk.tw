// C.2 S5 — 建除十二神（確定，依月建支 + 日支 + 交節重值）
import { BRANCHES } from './ganzhi';

export const JIANCHU = [
  '建', '除', '滿', '平', '定', '執', '破', '危', '成', '收', '開', '閉',
] as const;

/**
 * 建除十二神（C.2 S5）。
 * 規則：該月「月建地支」之日為「建」，其後按日支順行循環。
 * @param monthBranch 月建支（正月建寅…，需節氣分月，故 verified 依節氣資料）
 * @param dayBranch 日支
 *
 * 注意：交節之日值神重複前一日一次（交節前後兩日同神）。此函式回基準值，
 * 交節重值由 index.ts 在已知「是否交節」時套用（需節氣資料）。
 */
export function jianchu(monthBranch: string, dayBranch: string): string {
  const m = BRANCHES.indexOf(monthBranch as (typeof BRANCHES)[number]);
  const d = BRANCHES.indexOf(dayBranch as (typeof BRANCHES)[number]);
  if (m < 0 || d < 0) throw new Error(`未知地支：${monthBranch}/${dayBranch}`);
  // 月建支之日 = 建（序0）
  const idx = ((d - m) % 12 + 12) % 12;
  return JIANCHU[idx];
}

/** 建除值神的宜忌基調（C.7.6 裁決第4步 fallback：俱無宜忌票時用） */
export function jianchuTone(shen: string): '偏宜' | '偏忌' | '中性' {
  if (['建', '滿', '成', '開'].includes(shen)) return '偏宜';
  if (['破', '平', '收', '閉'].includes(shen)) return '偏忌';
  return '中性'; // 除/定/執/危
}
