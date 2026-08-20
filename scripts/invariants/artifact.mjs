// 民俗文物頁（/artifacts/<id>/）的不變量。
import { escText, escAttr } from '../lib/astro-escape.mjs';

/**
 * 2026-08-20 加：文物辭條逐條渲染，且**每一條的來源連結都要在同一頁**。
 * 🔴 與 deity/th-dict、practice/th-dict 同一條規則：辭典授權的條件是標示資料來源連結，
 *    逐條掛源，不是「這一頁掛過一個就好」。缺連結是不會有錯誤訊息的違反，所以要驗。
 */
export const artifactSourceLink = {
  id: 'artifact/source-link',
  title: '民俗文物分類頁逐條渲染且每條來源連結都在（授權條件）',
  source: 'artifacts',
  check(cat, page, _ctx, acc) {
    for (const t of cat.items) {
      if (!page.html.includes(escText(t.term))) {
        acc.violate(`文物頁 ${cat.id} 未列出「${t.term}」`);
        continue;
      }
      const url = String(t.source?.ref ?? '').match(/https?:\/\/\S+/)?.[0];
      if (!url) { acc.violate(`文物頁 ${cat.id}「${t.term}」沒有可掛的來源網址`); continue; }
      if (!page.html.includes(escAttr(url))) {
        acc.violate(`文物頁 ${cat.id}「${t.term}」缺來源連結（授權條件，缺了就是違反授權）`);
        continue;
      }
      acc.count('terms');
    }
  },
  summary: (acc) => `另民俗文物 ${acc.get('terms')} 條逐條列出且**每條的來源連結都在**（授權條件）`,
};

/**
 * 2026-08-20 加：文物辭條的**獨立頁**（試點，台帳＝src/data/artifact-pages.json）。
 * 驗三件事：
 *  ① 辭條定義逐字渲染在頁上（不是只有標題）——這是「頁有內容」的底線；
 *  ② 該辭條自己的原始網址渲染在同一頁（🔴 授權條件，缺了就是違反授權，同上一條規則）；
 *  ③ 台帳裡的 term 在 artifacts.json 真的找得到（台帳與辭典漂移時當場紅燈，
 *     而不是安靜產出一個空頁）。
 * ⚠️ 這是試點不是全量：**不要**把它改成「每一條辭條都要有頁」——那正是這批要先量測的事。
 */
export const artifactEntryPage = {
  id: 'artifact/entry-page',
  title: '文物辭條獨立頁逐字渲染定義且來源連結在（授權條件）',
  source: 'artifactPages',
  check(entry, page, ctx, acc) {
    const cat = ctx.data.artifacts.categories.find((c) => c.id === entry.category);
    const item = cat?.items.find((i) => i.term === entry.term);
    if (!item) {
      acc.violate(`文物辭條頁 ${entry.category}/${entry.slug}：台帳的「${entry.term}」在辭典裡找不到`);
      return;
    }
    if (!page.html.includes(escText(item.def ?? ''))) {
      acc.violate(`文物辭條頁 ${entry.slug} 未逐字渲染辭條定義`);
      return;
    }
    const url = String(item.source?.ref ?? '').match(/https?:\/\/\S+/)?.[0];
    if (!url) { acc.violate(`文物辭條頁 ${entry.slug} 沒有可掛的來源網址`); return; }
    if (!page.html.includes(escAttr(url))) {
      acc.violate(`文物辭條頁 ${entry.slug} 缺來源連結（授權條件，缺了就是違反授權）`);
      return;
    }
    acc.count('entryPages');
  },
  summary: (acc) => `文物辭條獨立頁 ${acc.get('entryPages')} 頁逐字渲染定義且掛源`,
};
