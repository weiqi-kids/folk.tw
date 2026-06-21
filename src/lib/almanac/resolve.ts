// C.7.6 宜忌從違裁決（Resolve）
import votesData from './rules/votes.json';
import restrainData from './rules/restrain.json';
import { jianchuTone } from './jianchu';
import type { DayVerdict } from './types';

interface Vote {
  shensha: string;
  affair: string;
  verdict: '宜' | '忌';
  weight?: string;
  sources: string[];
  verified: boolean;
}
const VOTES = votesData.votes as Vote[];
const RESTRAIN = restrainData.restrain as {
  auspicious: string;
  restrains: string;
  sources: string[];
  verified: boolean;
}[];

/**
 * 對某事項，依當日生效神煞集合裁決宜/忌（C.7.6）。
 * @param affair 事項 id
 * @param activeShenSha 當日生效之神煞 id 集合（由 S8 依規則表推定）
 * @param jianchuShen 當日建除值神（俱無宜忌票時的基調 fallback）
 */
export function resolveAffair(
  affair: string,
  activeShenSha: Set<string>,
  jianchuShen: string | null,
  verifiedShenSha: Set<string> = new Set(),
): DayVerdict | null {
  // 蒐集適用投票（含通配 '*'）
  const applicable = VOTES.filter(
    (v) => activeShenSha.has(v.shensha) && (v.affair === affair || v.affair === '*'),
  );
  const yiVotes = applicable.filter((v) => v.verdict === '宜');
  const jiVotes = applicable.filter((v) => v.verdict === '忌');

  const mkDerivation = (vs: Vote[]) =>
    vs.map((v) => ({ shensha: v.shensha, verdict: v.verdict, weight: v.weight }));
  const allSources = (vs: Vote[]) => [...new Set(vs.flatMap((v) => v.sources))];
  // 考據化驗證：投票本身 verified 且其神煞定位亦 verified（C.6 每條 derivation+sources 可回溯）
  const allVerified = (vs: Vote[]) =>
    vs.length > 0 && vs.every((v) => v.verified && verifiedShenSha.has(v.shensha));

  // 1. 僅宜票 → 宜
  if (yiVotes.length && !jiVotes.length) {
    return {
      affair, judgement: '宜', derivation: mkDerivation(yiVotes),
      resolvedBy: '僅宜票', sources: allSources(yiVotes), verified: allVerified(yiVotes),
    };
  }
  // 2. 僅忌票 → 忌
  if (jiVotes.length && !yiVotes.length) {
    return {
      affair, judgement: '忌', derivation: mkDerivation(jiVotes),
      resolvedBy: '僅忌票', sources: allSources(jiVotes), verified: allVerified(jiVotes),
    };
  }
  // 3. 宜忌俱有 → 查制化：吉神可制該凶神者從宜，否則從忌
  if (yiVotes.length && jiVotes.length) {
    const auspiciousActive = yiVotes.map((v) => v.shensha);
    const restrainable = jiVotes.every((jv) =>
      RESTRAIN.some((r) => auspiciousActive.includes(r.auspicious) && r.restrains === jv.shensha),
    );
    const all = [...yiVotes, ...jiVotes];
    return {
      affair,
      judgement: restrainable ? '宜' : '忌',
      derivation: mkDerivation(all),
      resolvedBy: restrainable ? '宜忌俱有 → 吉神可制 → 從宜' : '宜忌俱有 → 不可制 → 從忌',
      sources: [...allSources(all), ...RESTRAIN.flatMap((r) => r.sources)],
      verified: false, // 制化裁決涉多表，全表校準前一律未驗證
    };
  }
  // 4. 俱無 → 依建除值神基調（C.7.6 第4步）
  if (jianchuShen) {
    const tone = jianchuTone(jianchuShen);
    if (tone === '中性') return null;
    return {
      affair,
      judgement: tone === '偏宜' ? '宜' : '忌',
      derivation: [],
      resolvedBy: `無神煞票 → 依建除「${jianchuShen}」基調（${tone}）`,
      sources: ['協紀辨方書·建除義例'],
      verified: false,
    };
  }
  return null;
}
