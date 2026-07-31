// C.7.2b 日相標記（day tokens）— 2026-07-31 新增
//
// 為什麼需要這一層：《欽定協紀辨方書》卷十一「用事」的宜忌清單裡，**有些條目不是神煞**，
// 而是「建除十二神的某一值」或「某個日干／日支」。例如：
//   嫁娶忌「…平日 收日 閉日 … 亥日」、剃頭忌「月建 … 丁日 每月十二日十五日」。
// 原本的投票表 votes.json 只認神煞 id，於是這些條目**完全落在判定之外**——實測後果：
// 2026-08-17 建除為「平」（協紀明列嫁娶忌平日），本站卻把它列為「宜嫁娶」。
//
// 解法刻意選「把它們包裝成與神煞同形的 token」而不是在 resolve.ts 開特例分支：
//   token 具備 id / class / sources / verified，直接併進 activeShenSha 集合，
//   於是 votes.json 的寫法、制化查表、verified 傳播鏈**一行都不用改**。
//   新增一個維度時只要在這裡多發一種 token，投票表照舊寫。
//
// ⚠️ 這裡**不做任何宜忌判斷**——只陳述「今天是平日」「今天日支為亥」這類事實。
//   哪個事項忌哪一種，一律寫在 votes.json 並逐條掛《協紀》原文（與神煞同一套規矩）。

import type { ActiveShenSha } from './shensha';

const JIANCHU_ID: Record<string, string> = {
  建: 'jianchu_jian', 除: 'jianchu_chu', 滿: 'jianchu_man', 平: 'jianchu_ping',
  定: 'jianchu_ding', 執: 'jianchu_zhi', 破: 'jianchu_po', 危: 'jianchu_wei',
  成: 'jianchu_cheng', 收: 'jianchu_shou', 開: 'jianchu_kai', 閉: 'jianchu_bi',
};

const BRANCH_ID: Record<string, string> = {
  子: 'daybranch_zi', 丑: 'daybranch_chou', 寅: 'daybranch_yin', 卯: 'daybranch_mao',
  辰: 'daybranch_chen', 巳: 'daybranch_si', 午: 'daybranch_wu', 未: 'daybranch_wei',
  申: 'daybranch_shen', 酉: 'daybranch_you', 戌: 'daybranch_xu', 亥: 'daybranch_hai',
};

const STEM_ID: Record<string, string> = {
  甲: 'daystem_jia', 乙: 'daystem_yi', 丙: 'daystem_bing', 丁: 'daystem_ding', 戊: 'daystem_wu',
  己: 'daystem_ji', 庚: 'daystem_geng', 辛: 'daystem_xin', 壬: 'daystem_ren', 癸: 'daystem_gui',
};

// 建除值由 jianchu.ts 依月建×日支推定（C.2 S5，已交叉驗證 lunar-javascript）；
// 日干支由 ganzhi.ts 的確定性公式推定（verify-almanac.ts 全掃 1901–2099 三方比對全中）。
// 兩者皆屬**曆算事實**而非考據推論，故 verified=true；來源記其推定依據。
const SRC_JIANCHU = [
  '建除十二神：本站 C.2 S5 建除義例（月建×日支），與 lunar-javascript（壽星天文曆）交叉驗證；' +
    '宜忌歸屬另見《欽定協紀辨方書》卷十一用事 https://zh.wikisource.org/wiki/欽定協紀辨方書_(四庫全書本)/卷11',
];
const SRC_GANZHI = [
  '日干支：本站 C.2 確定性公式，scripts/verify-almanac.ts 全掃 1901–2099 與 lunar-javascript、' +
    'solarlunar 三方比對一致；宜忌歸屬另見《欽定協紀辨方書》卷十一用事 ' +
    'https://zh.wikisource.org/wiki/欽定協紀辨方書_(四庫全書本)/卷11',
];

/**
 * 當日的「非神煞」日相標記，與 activeShenSha() 的輸出同形，供併入同一集合投票。
 * class 一律標中性意義的 '吉'／'凶' 沒有意義（平日本身不吉不凶，是「對某事項」才有宜忌），
 * 故統一給 '凶' 會誤導——這裡給 '吉' 亦然。改以 class 僅供顯示用途，判定完全交給 votes.json。
 */
export function dayTokens(jianchuShen: string | null, dayStem: string, dayBranch: string): ActiveShenSha[] {
  const out: ActiveShenSha[] = [];
  const jcId = jianchuShen ? JIANCHU_ID[jianchuShen] : undefined;
  if (jcId) {
    out.push({ id: jcId, name: `${jianchuShen}日`, class: '吉', sources: SRC_JIANCHU, verified: true });
  }
  const brId = BRANCH_ID[dayBranch];
  if (brId) out.push({ id: brId, name: `${dayBranch}日`, class: '吉', sources: SRC_GANZHI, verified: true });
  const stId = STEM_ID[dayStem];
  if (stId) out.push({ id: stId, name: `${dayStem}日`, class: '吉', sources: SRC_GANZHI, verified: true });
  return out;
}
