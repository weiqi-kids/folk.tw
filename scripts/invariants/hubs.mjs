// 單頁樞紐的不變量：首頁季節戰役卡、節日總覽主視覺、地方宗教慶典總覽。
// 這三條原本各自是一個裸 `{ }` 區塊，其中兩個的 readFileSync **沒有 existsSync 守衛**
// ——產物不存在會直接丟例外而不是回報違規。runner 的 singleton 載入器統一處理，那個坑消失。
import { escText, escAttr } from '../lib/astro-escape.mjs';

const FAQ_MARK = '"@type":"FAQPage"';

/**
 * 原不變量 5g（2026-08-09 加；🔴 舊編號與「節日頁 Discover 新鮮度」撞號，兩者毫無關聯）：
 * 首頁農曆七月戰役卡只能同時推一頁。建置當日的主題要正確，前端排程也必須含後續所有切換項。
 * ⚠️ 這條的結果**隨台北當日日期改變**，是最需要能用 --only 單獨跑的一條。
 */
export const homeSeasonalCampaign = {
  id: 'home/seasonal-campaign',
  legacyIds: ['5g'],
  title: '首頁季節戰役卡指向當日主題、有主視覺，且前端排程含全部切換項；戰役結束後自然退場',
  source: 'singleton',
  singletons: ['dist/index.html'],
  onMissing: (file, acc) => acc.violate(`首頁未建置：${file}`),
  check(_file, page, ctx, acc) {
    const home = page.html;
    const schedule = ctx.lib.seasonalCampaigns;
    const campaignEnd = schedule.at(-1)?.end ?? '';
    const current = schedule.find(({ start, end }) => start <= ctx.TODAY && ctx.TODAY <= end);
    if (current) {
      if (!home.includes('data-seasonal-campaign')) acc.violate('首頁在戰役期間缺少節日主卡');
      if (!home.includes(`href="${current.href}"`)) acc.violate(`首頁節日主卡未指向當日主題 ${current.href}`);
      if (!home.includes('data-campaign-image') || !home.includes('width="1200"') || !home.includes('height="630"')) {
        acc.violate('首頁節日主卡缺少 1200×630 主視覺');
      }
      for (const campaign of schedule) {
        if (!home.includes(campaign.href)) acc.violate(`首頁節日主卡的前端排程缺少 ${campaign.href}`);
        if (!home.includes(campaign.image)) {
          acc.violate(`首頁節日主卡的前端排程缺少 ${campaign.festivalSlug} 主視覺`);
        }
      }
    } else if (campaignEnd && ctx.TODAY > campaignEnd && home.includes('data-seasonal-campaign')) {
      acc.violate(`首頁節日主卡應於 ${campaignEnd} 後自然退場`);
    }
  },
  summary: false,
};

/** 原不變量 5h（2026-08-09 加）：節日總覽必須讓所有有分享卡的主題直接露出各自主視覺。 */
export const festivalIndexVisuals = {
  id: 'festival-index/og-visuals',
  legacyIds: ['5h'],
  title: '節日總覽必須直接露出每個有分享卡主題的主視覺',
  source: 'singleton',
  singletons: ['dist/festivals/index.html'],
  onMissing: (file, acc) => acc.violate(`節日總覽未建置：${file}`),
  check(_file, page, ctx, acc) {
    for (const slug of ctx.lib.FESTIVAL_OG_SLUGS) {
      const image = `/og/festivals/${slug}.png`;
      if (!page.html.includes(`src="${escAttr(image)}"`)) acc.violate(`節日總覽缺少 ${slug} 主視覺`);
    }
  },
  summary: false,
};

/**
 * 原不變量 7①（2026-08-06 加）：《/festivals/local/》必須列出**每一項**的名稱、
 * 項數敘述與資料相符，且回曆項刻意不換算國曆（換算就是杜撰）。
 * ⚠️ 不驗「該有幾筆 temple_ref」——消歧是寧缺勿假，留空是正確行為（見匯入器）。
 */
export const localCelebrationOverview = {
  id: 'local-celebration/overview',
  legacyIds: ['7'],
  title: '地方宗教慶典總覽逐項列出、項數敘述相符、回曆項不得被換算國曆',
  source: 'singleton',
  singletons: ['dist/festivals/local/index.html'],
  onMissing: (_file, acc) => acc.violate('地方宗教慶典頁未建置：/festivals/local/'),
  check(_file, page, ctx, acc) {
    const items = ctx.data.localCelebrations.items;
    if (!page.html.includes('class="lead"')) acc.violate('/festivals/local/ 缺 answer-first 摘要');
    if (!page.html.includes(FAQ_MARK)) acc.violate('/festivals/local/ 缺 FAQPage 結構化資料');
    for (const x of items) {
      // 依縣市與依月份兩份清單都渲染，故名稱至少出現一次即可（這裡驗的是「有沒有漏」）。
      if (!page.html.includes(escText(x.name))) acc.violate(`/festivals/local/ 未列出「${x.name}」（${x.county}）`);
      else acc.count('listed');
    }
    if (!new RegExp(`共\\s*${items.length}\\s*項`).test(page.html)) {
      acc.violate(`/festivals/local/ 項數敘述與資料不符（資料 ${items.length} 項）`);
    }
    // 回曆筆刻意不換算：頁面不得替它印出任何國曆日期，否則就是杜撰。
    for (const x of items.filter((i) => i.calendar === 'hijri')) {
      if (!page.html.includes('國曆日期逐年不同，本站不換算')) {
        acc.violate(`/festivals/local/ 回曆項「${x.name}」缺「不換算」說明（不得替它算國曆）`);
      }
    }
  },
  // 三層（總覽／廟頁／節日頁）原本就共用同一句摘要，故在這裡一起組。
  summary: (acc, ctx) =>
    `另地方宗教慶典 ${acc.get('listed')}/${ctx.data.localCelebrations.items.length} 項逐項在 /festivals/local/ 出現、`
    + `項數敘述相符、回曆項未被擅自換算，`
    + `${ctx.accOf('temple/local-celebration').get('sections')} 間廟頁與相關節日頁的名單皆雙向比對（該有的都在、不該有的都不在）`,
};
