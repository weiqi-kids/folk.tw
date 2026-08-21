// 原不變量 6（2026-07-31 加；⚠️ 原本誤編為「5」，與節日頁的不變量 5 撞號，
// 2026-08-06 稽核發現後改號。docs/decisions/almanac.md 引用的「不變量 5」指的是本條）。
//
// 背景：《協紀辨方書》卷十一用事的宜忌清單裡，有「平日 收日 閉日 亥日 丁日」這類**非神煞**
//       條目，原本的投票表只認神煞 id，這些條目完全落在判定之外——實測 2026-08-17 建除為
//       「平」（協紀明列嫁娶忌平日），站上卻列為「宜嫁娶」。修法見 src/lib/almanac/daytokens.ts。
// 這道 gate 守的是**上線後的產物**：把 /almanac/yiji/<事項>/ 列出的每個宜日，
//       翻到該日的 /almanac/<date>/ 頁去讀它自己印出的建除與日干支，兩邊對照。
// ⚠️ 禁忌清單**不在 gate 硬編**，而是從 votes.json 讀 `jianchu_*`／`daybranch_*`／`daystem_*`
//    的忌票反推——日後為別的事項（如剃頭）加同類禁忌，這道檢查會自動涵蓋，不必改 gate。
// 🔴 這是全檔唯一「跨頁反查」型的不變量（頁 A 列出的日期 → 讀頁 B 驗證），
//    自帶 dayCache；拿掉快取會退化成 N×M 次讀檔。

const JC_NAME = { jian: '建', chu: '除', man: '滿', ping: '平', ding: '定', zhi: '執',
  po: '破', wei: '危', cheng: '成', shou: '收', kai: '開', bi: '閉' };
const BR_NAME = { zi: '子', chou: '丑', yin: '寅', mao: '卯', chen: '辰', si: '巳',
  wu: '午', wei: '未', shen: '申', you: '酉', xu: '戌', hai: '亥' };
const ST_NAME = { jia: '甲', yi: '乙', bing: '丙', ding: '丁', wu: '戊',
  ji: '己', geng: '庚', xin: '辛', ren: '壬', gui: '癸' };

export const almanacGoodDays = {
  id: 'almanac/good-days-taboo',
  legacyIds: ['6'],
  title: '擇日頁列出的每個「宜」日，翻查該日農民曆頁的建除／日干／日支皆非投票表明列所忌',
  source: 'none',
  run(ctx, acc) {
    const votes = ctx.data.votes.votes.filter((v) => v.shensha);
    // affair → { jianchu:Set, branch:Set, stem:Set }
    const banned = new Map();
    for (const v of votes) {
      if (v.verdict !== '忌' || v.affair === '*') continue;
      const b = banned.get(v.affair) ?? { jianchu: new Set(), branch: new Set(), stem: new Set() };
      let m;
      if ((m = /^jianchu_(\w+)$/.exec(v.shensha)) && JC_NAME[m[1]]) b.jianchu.add(JC_NAME[m[1]]);
      else if ((m = /^daybranch_(\w+)$/.exec(v.shensha)) && BR_NAME[m[1]]) b.branch.add(BR_NAME[m[1]]);
      else if ((m = /^daystem_(\w+)$/.exec(v.shensha)) && ST_NAME[m[1]]) b.stem.add(ST_NAME[m[1]]);
      else continue;
      banned.set(v.affair, b);
    }
    const dayCache = new Map();
    const readDay = (iso) => {
      if (dayCache.has(iso)) return dayCache.get(iso);
      const f = ctx.join(ctx.DIST, 'almanac', iso, 'index.html');
      let r = null;
      if (ctx.exists(f)) {
        const h = ctx.read(f);
        r = {
          jianchu: /建除<\/dt><dd[^>]*>([建除滿平定執破危成收開閉])/.exec(h)?.[1] ?? null,
          // 干支列印為「丙午年 丙申月 癸亥日」，取「…日」那一柱
          ganzhi: /干支<\/dt><dd[^>]*>[^<]*?([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])日/.exec(h)?.slice(1) ?? null,
        };
      }
      dayCache.set(iso, r);
      return r;
    };
    // 檢查一個擇日露出面：把頁上列出的每個日期翻到該日農民曆頁，比對建除／日干／日支。
    // ⚠️ 合併多個用事的頁（/good-days/worship/＝祭祀＋祈福）取各用事禁忌的**聯集**——
    //    只要該日被其中任一用事明文所忌，就不該出現在這一頁上。
    const checkPage = (pageFile, label, affairs) => {
      if (!ctx.exists(pageFile)) { acc.violate(`擇日檢查：找不到 ${label} 產物`); return; }
      const b = { jianchu: new Set(), branch: new Set(), stem: new Set() };
      for (const a of affairs) {
        const x = banned.get(a);
        if (!x) continue;
        for (const k of ['jianchu', 'branch', 'stem']) for (const v of x[k]) b[k].add(v);
      }
      if (!b.jianchu.size && !b.branch.size && !b.stem.size) return;
      acc.count('pages');
      const html = ctx.read(pageFile);
      const dates = [...new Set([...html.matchAll(/href="\/almanac\/(\d{4}-\d{2}-\d{2})\/"/g)].map((m) => m[1]))];
      for (const iso of dates) {
        const day = readDay(iso);
        if (!day) { acc.violate(`擇日檢查：${label} 列出 ${iso}，但找不到該日產物`); continue; }
        acc.count('days');
        if (day.jianchu && b.jianchu.has(day.jianchu)) {
          acc.violate(`擇日：${label} 列出 ${iso} 為宜，但該日建除為「${day.jianchu}」＝投票表明列所忌`);
        }
        if (day.ganzhi) {
          const [stem, branch] = day.ganzhi;
          if (b.branch.has(branch)) acc.violate(`擇日：${label} 列出 ${iso} 為宜，但該日日支為「${branch}」＝投票表明列所忌`);
          if (b.stem.has(stem)) acc.violate(`擇日：${label} 列出 ${iso} 為宜，但該日日干為「${stem}」＝投票表明列所忌`);
        }
      }
    };

    // ① 宜忌詞義頁（每頁一個用事）
    for (const [affair, b] of banned) {
      if (!b.jianchu.size && !b.branch.size && !b.stem.size) continue;
      checkPage(ctx.join(ctx.DIST, 'almanac', 'yiji', affair, 'index.html'), `/almanac/yiji/${affair}/`, [affair]);
    }
    // ② 擇日專區（一頁可對多個用事；slug→affairs 讀 good-days.json，不在此重寫對映）
    for (const it of ctx.data.goodDays.items) {
      checkPage(ctx.join(ctx.DIST, 'good-days', it.slug, 'index.html'), `/good-days/${it.slug}/`, it.affairs);
    }
  },
  summary: (acc) =>
    `另 ${acc.get('pages')} 個擇日頁共 ${acc.get('days')} 個「宜」日逐日翻查該日農民曆頁，`
    + `建除／日干／日支皆非投票表明列所忌`,
};
