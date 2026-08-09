// 農曆七月站內戰役的唯一資料源。
// 首頁主卡與相關內容頁 CTA 都從這裡讀取，日期、文案、目標頁不在各模板另抄一份。
export type SeasonalCampaign = {
  festivalSlug: string;
  start: string;
  end: string;
  target: string;
  href: string;
  image: string;
  imageAlt: string;
  eyebrow: string;
  title: string;
  prompt: string;
  dateLabel: string;
  cta: string;
};

export const seasonalCampaigns: SeasonalCampaign[] = [
  {
    festivalSlug: 'guimenkai',
    start: '2026-08-09', end: '2026-08-13', target: '2026-08-13', href: '/festivals/guimenkai/',
    image: '/og/festivals/guimenkai.png', imageAlt: '鬼門開日期與節俗主視覺',
    eyebrow: '農曆七月・本週重點', title: '2026 鬼門開是 8/13',
    prompt: '農曆七月初一要做什麼？看開龕門、起燈腳與雞籠中元祭的起點。',
    dateLabel: '8/13・農曆七月初一', cta: '查鬼門開日期與節俗 →',
  },
  {
    festivalSlug: 'qixi',
    start: '2026-08-14', end: '2026-08-19', target: '2026-08-19', href: '/festivals/qixi/',
    image: '/og/festivals/qixi.png', imageAlt: '七夕七娘媽生日期與節俗主視覺',
    eyebrow: '農曆七月・本週重點', title: '2026 七夕是 8/19',
    prompt: '台灣七夕不只是情人節：看七娘媽生、做十六歲與開隆宮。',
    dateLabel: '8/19・農曆七月初七', cta: '查七娘媽生與做十六歲 →',
  },
  {
    festivalSlug: 'fangshuideng',
    start: '2026-08-20', end: '2026-08-26', target: '2026-08-26', href: '/festivals/fangshuideng/',
    image: '/og/festivals/fangshuideng.png', imageAlt: '放水燈日期與節俗主視覺',
    eyebrow: '農曆七月・本週重點', title: '2026 放水燈是 8/26',
    prompt: '為什麼普渡前要放水燈？看「普照陰光」、祭祀對象與基隆海港脈絡。',
    dateLabel: '8/26・農曆七月十四', cta: '查放水燈由來與儀式 →',
  },
  {
    festivalSlug: 'zhongyuan',
    start: '2026-08-27', end: '2026-08-27', target: '2026-08-27', href: '/festivals/zhongyuan/',
    image: '/og/festivals/zhongyuan.png', imageAlt: '中元節普渡日期與節俗主視覺',
    eyebrow: '農曆七月・今日重點', title: '2026 中元節是 8/27',
    prompt: '中元普渡怎麼拜？一次查祭拜順序、供品、金紙與禁忌。',
    dateLabel: '8/27・農曆七月十五', cta: '查中元普渡完整整理 →',
  },
  {
    festivalSlug: 'dizang',
    start: '2026-08-28', end: '2026-09-10', target: '2026-09-10', href: '/festivals/dizang/',
    image: '/og/festivals/dizang.png', imageAlt: '地藏王菩薩聖誕與鬼門關主視覺',
    eyebrow: '農曆七月・月底重點', title: '2026 鬼門關是 9/10',
    prompt: '為什麼和地藏王菩薩聖誕同天？看關龕門、燒掛燈與撤燈篙。',
    dateLabel: '9/10・農曆七月廿九', cta: '查鬼門關與地藏王聖誕 →',
  },
];

export const activeSeasonalCampaign = (
  iso: string,
  campaigns: SeasonalCampaign[] = seasonalCampaigns,
): SeasonalCampaign | undefined => campaigns.find((x) => x.start <= iso && iso <= x.end);
