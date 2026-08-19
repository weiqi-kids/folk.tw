// 時事祈福後續發展的 render 不變量（原 scripts/check-topical-followup-render.mjs，
// 2026-08-19 併進同一張登錄表）。
//
// 為何存在：topical-followup.mjs 會在事件仍為 active 時直接寫入 updates 並發 Slack；
// 因此不能只驗 memorial 頁。這裡對全部未併頁條目進行資料↔HTML 雙向比對，
// 防止「通知已發，頁面卻看不到」再發生。
//
// 🔴 為什麼要併進來：原本它是 package.json 裡 `check:rendered` 的第二個行程
//    （`A && B`），那個 `&&` 很容易被忽略；而且它自己複製了一份 Astro 跳脫規則的對照表，
//    主檔那 10 行「逐字元補是錯的做法」的紅字警語**根本沒涵蓋到它**。
//    跳脫規則已在 2026-08-19 收成 scripts/lib/astro-escape.mjs；現在連走訪也回到同一個 runner。
import { escText } from '../lib/astro-escape.mjs';

export const topicalFollowupTimeline = {
  id: 'topical/followup-timeline',
  legacyIds: ['followup'],
  title: '時事祈福頁的後續發展時間軸與 updates 資料雙向相符（archived 態不得渲染）',
  source: 'topical',
  summaryGroup: 'topical-followup',
  check(item, page, _ctx, acc) {
    acc.count('checked');
    const updates = (Array.isArray(item.updates) ? item.updates : [])
      .filter((update) => String(update?.text ?? '').trim());
    const timelineCount = (page.html.match(/aria-label="後續發展"/g) ?? []).length;
    const status = item.status ?? 'active';
    const shouldRenderTimeline = updates.length > 0 && status !== 'archived';

    if (!shouldRenderTimeline) {
      if (timelineCount !== 0) acc.violate(`${item.id}：${status} 態不該渲染後續發展時間軸`);
      return;
    }

    acc.count('withTimeline');
    if (status === 'active') acc.count('activeWithUpdates');
    if (timelineCount !== 1) {
      acc.violate(`${item.id}：有 ${updates.length} 筆 updates，但後續發展時間軸數量為 ${timelineCount}`);
    }
    if (!/<h2[^>]*>\s*後續發展\s*<\/h2>/.test(page.html)) {
      acc.violate(`${item.id}：時間軸缺「後續發展」標題`);
    }

    for (const [index, update] of updates.entries()) {
      if (!page.html.includes(escText(update.text))) acc.violate(`${item.id}：未渲染 updates[${index}].text`);
      for (const source of (Array.isArray(update.sources) ? update.sources : [])) {
        if (source?.url && !page.html.includes(`href="${escText(source.url)}"`)) {
          acc.violate(`${item.id}：updates[${index}] 未渲染來源 ${source.url}`);
        }
      }
    }

    if (status === 'active' && !page.html.includes('id="qifuBtn"')) {
      acc.violate(`${item.id}：active 頁顯示後續時遺失集氣入口`);
    }
  },
  summary: (acc) =>
    `${acc.get('checked')} 頁，${acc.get('withTimeline')} 頁應有時間軸（含 ${acc.get('activeWithUpdates')} 頁 active）`,
};
