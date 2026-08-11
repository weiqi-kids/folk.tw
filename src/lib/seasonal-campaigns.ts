// 首頁節慶檔期與站內相關頁 CTA 的唯一資料源。
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
  {
    festivalSlug: 'september-solar-terms',
    start: '2026-09-11', end: '2026-09-12', target: '2026-09-23', href: '/festivals/september-solar-terms/',
    image: '/og/festivals/september-solar-terms.png', imageAlt: '白露與秋分日期及農漁產主視覺',
    eyebrow: '九月節氣・秋意漸深', title: '2026 秋分是 9/23',
    prompt: '白露與秋分差在哪？看露水、晝夜均分、稻作、柚子與秋季漁產。',
    dateLabel: '白露 9/7・秋分 9/23', cta: '查九月兩個節氣 →',
  },
  {
    festivalSlug: 'kinmen-bo-bing',
    start: '2026-09-13', end: '2026-09-14', target: '2026-09-25', href: '/festivals/kinmen-bo-bing/',
    image: '/og/festivals/kinmen-bo-bing.png', imageAlt: '金門中秋博狀元餅六骰規則主視覺',
    eyebrow: '金門中秋・地方節俗', title: '六顆骰子怎麼博狀元？',
    prompt: '一次看懂一秀、二舉、四進、三紅、對堂與狀元的傳統彩名。',
    dateLabel: '2026 活動檔期 9/1–9/25', cta: '查博餅由來與規則 →',
  },
  {
    festivalSlug: 'zhongqiu',
    start: '2026-09-15', end: '2026-09-25', target: '2026-09-25', href: '/festivals/zhongqiu/',
    image: '/og/festivals/zhongqiu.png', imageAlt: '中秋節拜月娘與土地公供品主視覺',
    eyebrow: '農曆八月・本月重點', title: '2026 中秋節是 9/25',
    prompt: '拜月娘與拜土地公有何不同？看供品、準備清單與四天連假。',
    dateLabel: '9/25・農曆八月十五', cta: '查中秋拜拜與供品 →',
  },
  {
    festivalSlug: 'kongzi-birthday',
    start: '2026-09-26', end: '2026-09-28', target: '2026-09-28', href: '/festivals/kongzi-birthday/',
    image: '/og/festivals/kongzi-birthday.png', imageAlt: '孔子誕辰教師節與祭孔釋奠主視覺',
    eyebrow: '教師節・祭孔', title: '9/28 為什麼要祭孔？',
    prompt: '看釋奠典禮、初獻亞獻終獻與六佾舞，也分清國曆紀念日與農曆聖誕。',
    dateLabel: '9/28・孔子誕辰紀念日／教師節', cta: '查祭孔釋奠典禮 →',
  },
];

export const activeSeasonalCampaign = (
  iso: string,
  campaigns: SeasonalCampaign[] = seasonalCampaigns,
): SeasonalCampaign | undefined => campaigns.find((x) => x.start <= iso && iso <= x.end);
