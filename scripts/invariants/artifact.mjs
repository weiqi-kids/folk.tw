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
