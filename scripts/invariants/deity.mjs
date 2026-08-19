// 神明頁的不變量。全部共用同一趟走訪（dist/deities/*/index.html）。
// draft（如 sheshen：聖誕待查）在 prod 不發佈頁，正確地不驗——由 runner 的 source 過濾。
import { escText, escAttr } from '../lib/astro-escape.mjs';
import { fullWidth, SERP_TITLE_MAX_WIDTH } from '../../src/lib/text-width.ts';
import { checkEntityPhoto } from './entity-photo.mjs';

/**
 * 原不變量 4（2026-07-30 加）：神明頁 title 的聖誕日期（往返驗證）。
 * 背景：GSC 實測神明頁 CTR 僅 1.13%，主流意圖是「○○生日／聖誕」＝一個日期就滿足，
 *       但 title 原本只有農曆、且用阿拉伯數字，從未命中查詢用的「農曆三月廿三」形式。
 * ⚠️ 不用「今天」去算期望值（build 與 gate 若跨越台灣午夜就會差一天而誤報）。
 *    改做**往返驗證**：把 title 上印的國曆 M/D 轉回農曆，必須等於該尊的聖誕 MM-DD
 *    （短月順延：卅日聖誕落在僅廿九日之農曆月底亦算相符）。年份未印在 title，故容許今明後年。
 */
export const deityShengdanTitle = {
  id: 'deity/shengdan-title',
  legacyIds: ['4'],
  title: '神明頁 title 的聖誕農曆標籤與國曆日期往返驗證（雙向：無聖誕者不得帶日期後綴）',
  source: 'deities',
  check(d, page, ctx, acc) {
    const title = page.title();
    const description = page.description();
    // 連續右括號可能是合法巢狀括號（如「出典（原典（補註））」）；只擋雙開括號。
    if (/（（|，，|。。/.test(description)) {
      acc.violate(`神明頁 ${d.id} description 含重複括號或標點：${description}`);
    }
    acc.count('checked');

    const real = (d.birthday_lunar ?? []).filter(
      (b) => b.date && !['無定', '待查', '未定'].includes(b.date),
    );
    const shengdan = real.find((b) => b.kind === '聖誕') ?? null;
    if (!shengdan) {
      // 雙向反例：無聖誕者（如好兄弟／城隍／太歲）不得出現聖誕後綴，
      // 也不得因舊的 `?? realBdays[0]` 回退而漏出「・飛昇…」這類非聖誕字樣。
      if (/｜聖誕/.test(title)) acc.violate(`${d.id} 無聖誕資料，title 卻出現「｜聖誕」：${title}`);
      if (/・(飛昇|得道|成道|其他)/.test(title)) {
        acc.violate(`${d.id} title 出現非聖誕的日期後綴（應只用 kind==='聖誕'）：${title}`);
      }
      return;
    }

    acc.count('withShengdan');
    // 9 尊神有多筆聖誕（七爺八爺／三官大帝…），頁面挑「下一次最近」的那筆。
    // gate 刻意**不假設挑中哪一筆**（也就不依賴「今天」），只驗真正在意的不變量：
    //   (a) title 印的農曆標籤必須是該尊「某一筆真實聖誕」；
    //   (b) title 印的國曆 M/D 轉回農曆必須等於**同一筆**（短月順延亦算相符）。
    const shengdanDates = real.filter((b) => b.kind === '聖誕').map((b) => b.date);
    if (!title.startsWith(`${d.name}生日｜聖誕`)) {
      acc.violate(`${d.id} title 未以「${d.name}生日｜聖誕」自然涵蓋兩種查詢用語：${title}`);
      return;
    }
    // 日期是這個 cohort 的核心答案，故標題不帶別名，並限制品牌前內容不超過 30 全形字。
    const seoTitle = title.replace(/｜神酷$/, '');
    const titleWide = fullWidth(seoTitle);
    if (titleWide > SERP_TITLE_MAX_WIDTH) {
      acc.violate(`${d.id} 生日 title 超過 ${SERP_TITLE_MAX_WIDTH} 全形字（${titleWide}）：${title}`);
    }
    const alias = (d.aliases ?? [])[0];
    if (alias && alias !== d.name && seoTitle.includes(`（${alias}）`)) {
      acc.violate(`${d.id} 生日 title 不應塞入首別名「${alias}」（會擠掉日期）：${title}`);
    }
    const shown = title.match(/｜聖誕(農曆[^（|]+)/);
    if (!shown) { acc.violate(`${d.id} title 缺「｜聖誕農曆…」（實際：${title}）`); return; }
    const shownLabel = shown[1].trim();
    const md = title.match(/（國曆\s*(\d{1,2})\/(\d{1,2})）/);
    if (!md) { acc.violate(`${d.id} title 缺國曆日期「（國曆 M/D）」：${title}`); return; }
    const mo = Number(md[1]);
    const day = Number(md[2]);
    // 以頁面同一支 occurrence 同時驗農曆標籤與國曆 M/D。
    // 原始登錄 07-30 遇短月時，正確組合是「農曆七月廿九／國曆 9/10」；
    // 不能僅允許 29 日順延，卻繼續把標籤驗成資料的 30 日。
    const nowYear = new Date().getUTCFullYear();
    const pairMatches = shengdanDates.some((dt) =>
      [nowYear, nowYear + 1, nowYear + 2].some((y) => {
        const occurrence = ctx.lib.lunarToNextOccurrence(dt, `${y}-01-01`);
        return occurrence?.label === shownLabel
          && Number(occurrence.iso.slice(5, 7)) === mo
          && Number(occurrence.iso.slice(8, 10)) === day;
      }),
    );
    if (!pairMatches) {
      acc.violate(
        `${d.id} title 的聖誕組合「${shownLabel}／國曆 ${mo}/${day}」不對應任何一筆資料`
        + `（資料：${shengdanDates.map((x) => ctx.lib.lunarDateLabel(x)).join('、')}）`,
      );
    }
  },
  summary: (acc) =>
    `全 ${acc.get('checked')} 尊神明頁其中 ${acc.get('withShengdan')} 尊生日 title 同時含「生日／聖誕」、`
    + `全形寬未超過 ${SERP_TITLE_MAX_WIDTH}，且農曆標籤／國曆往返驗證相符，其餘正確不帶日期後綴`,
};

/**
 * 原不變量 4b（2026-08-06 加）：造型・法器區塊**雙向**。
 * 這條守的是一個具體病灶：`iconography` 在 schema 裡躺著、16 尊有值，
 * 卻**沒有任何一頁渲染它**＝死資料，而且沒有任何檢查會發現。
 */
export const deityIconography = {
  id: 'deity/iconography',
  legacyIds: ['4b'],
  title: '造型・法器區塊雙向：有值必渲染且逐項出現、無值不得渲染',
  source: 'deities',
  check(d, page, _ctx, acc) {
    const want = d.iconography ?? [];
    const has = page.html.includes('class="iconography"');
    if (want.length === 0) {
      if (has) acc.violate(`神明頁 ${d.id} 不該有造型・法器區塊（資料為空）`);
      return;
    }
    if (!has) { acc.violate(`神明頁 ${d.id} 缺造型・法器區塊（資料有 ${want.length} 項）`); return; }
    acc.count('withIcon');
    for (const x of want) {
      if (!page.html.includes(escText(x))) acc.violate(`神明頁 ${d.id} 造型・法器未列出「${x}」`);
    }
  },
  summarySep: '，',
  summary: (acc) => `另 ${acc.get('withIcon')} 尊造型・法器逐項相符`,
};

/**
 * 原不變量 4c（2026-08-06 加）：內政部「宗教知識+」條目引文。
 * 🔴 授權條件是「標示資料來源連結」——**沒有那個連結就等於違反授權**，
 *    所以這裡不只驗引文在不在，更要驗連結在不在。這條是法律義務，不是排版偏好。
 * 引文必須**逐字**出現（我們的規則是一個字都不改寫），故逐段比對。
 */
export const deityMoiKnowledge = {
  id: 'deity/moi-knowledge',
  legacyIds: ['4c'],
  title: '宗教知識+ 引文逐字渲染且來源連結在（授權條件），無資料不得渲染',
  source: 'deities',
  check(d, page, _ctx, acc) {
    const mk = d.moi_knowledge;
    const has = page.html.includes('class="moi-knowledge"');
    if (!mk) {
      if (has) acc.violate(`神明頁 ${d.id} 不該有宗教知識+ 引文區塊（資料為空）`);
      return;
    }
    if (!has) { acc.violate(`神明頁 ${d.id} 缺宗教知識+ 引文區塊（資料有 ${mk.excerpt.length} 段）`); return; }
    acc.count('withMoi');
    for (const p of mk.excerpt) {
      if (!page.html.includes(escText(p))) {
        acc.violate(`神明頁 ${d.id} 引文未逐字出現（段落開頭：${p.slice(0, 20)}…）`);
      }
    }
    if (!page.html.includes(escAttr(mk.url))) {
      acc.violate(`神明頁 ${d.id} 引文缺來源連結 ${mk.url}（授權條件，缺了就是違反授權）`);
    }
  },
  summarySep: '、',
  summary: (acc) =>
    `${acc.get('withMoi')} 尊宗教知識+ 引文逐字相符且**來源連結在**（授權條件），兩者其餘皆正確不渲染`,
};

/** 原不變量 4d（2026-08-06 加）：神明代表圖與出處標示（規則與廟頁那條**同一支實作**）。 */
export const deityPhotoCredit = {
  id: 'deity/photo-credit',
  legacyIds: ['4d'],
  title: '神明頁代表圖已渲染、檔案存在，內政部來源者攝影者與來源連結都在',
  source: 'deities',
  check(d, page, ctx, acc) { checkEntityPhoto(d, page, ctx, acc, '神明頁 '); },
  summary: false, // 併在 temple/photo-credit 那一句裡（原本就是同一句）
};

/** 原不變量 11 的神明頁那一段（2026-08-08 加）：專屬分享卡與分享列。 */
export const deityShareCard = {
  id: 'deity/share-card',
  legacyIds: ['11'],
  title: '神明頁 og:image 是自己的卡且檔案存在、且有分享列',
  source: 'deities',
  check(d, page, ctx, acc) {
    const want = `/og/deities/${d.id}.png`;
    if (!page.html.includes(escAttr(want))) {
      acc.violate(`神明頁 ${d.id} 的 og:image 不是自己的分享卡（應為 ${want}）`);
    } else if (!ctx.exists(`${ctx.DIST}${want}`)) {
      acc.violate(`神明頁 ${d.id} 的分享卡檔不存在：dist${want}`);
    } else acc.count('cards');
    if (!page.html.includes('aria-label="分享這一頁"')) acc.violate(`神明頁 ${d.id} 缺分享列`);
    else acc.count('rows');
  },
  summary: false, // 併在 poem/share-card 那一句裡
};
