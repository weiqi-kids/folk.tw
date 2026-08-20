// 習俗頁（/practices/<id>/）的不變量。
import { escText, escAttr } from '../lib/astro-escape.mjs';

/**
 * 2026-08-20 加：《臺灣民俗文物辭典》辭條引文。
 * 🔴 與 deity/th-dict **同一條規則**：逐字渲染、且**每一條辭條各自的來源連結都要在**。
 *    授權條件是逐筆掛源（2026-08-19 站主確認＝標示資料來源連結），
 *    「這一頁有掛過一個連結就好」不算數。缺連結是不會有任何錯誤訊息的違反，所以要驗。
 */
export const practiceThDict = {
  id: 'practice/th-dict',
  title: '習俗頁辭典引文逐字渲染且每條來源連結都在（授權條件），無資料不得渲染',
  source: 'practices',
  check(p, page, _ctx, acc) {
    const td = p.th_dict ?? [];
    const has = page.html.includes('class="th-dict"');
    if (td.length === 0) {
      if (has) acc.violate(`習俗頁 ${p.id} 不該有辭典引文區塊（資料為空）`);
      return;
    }
    if (!has) { acc.violate(`習俗頁 ${p.id} 缺辭典引文區塊（資料有 ${td.length} 條辭條）`); return; }
    for (const q of td) {
      acc.count('withDict');
      for (const t of q.excerpt) {
        if (!page.html.includes(escText(t))) {
          acc.violate(`習俗頁 ${p.id} 辭典引文未逐字出現（辭條「${q.title}」段落開頭：${t.slice(0, 20)}…）`);
        }
      }
      if (!page.html.includes(escAttr(q.url))) {
        acc.violate(`習俗頁 ${p.id} 辭條「${q.title}」缺來源連結 ${q.url}（授權條件，缺了就是違反授權）`);
      }
    }
  },
  summary: (acc) => `另習俗頁辭典引文 ${acc.get('withDict')} 條逐字相符且**每條的來源連結都在**（授權條件）`,
};
