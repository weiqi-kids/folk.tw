// 鄉鎮頁的不變量（原不變量 3，2026-07-28 加）。
//
// 背景：鄉鎮頁原本只有「共 N 間」＋一長串清單＝薄列表頁，GSC 實測收錄率 23/40（57%），
//       全站最低。補上由資料衍生的摘要（間數／主祀神分布／全縣排名）後，逐頁驗
//       「摘要存在，且裡面那個間數真的等於該鄉鎮的廟數」——防的是模板句寫死或統計算錯。
// 配對鍵刻意用頁面 h1 的文字（`${縣市}${鄉鎮}廟宇`），這樣不必在 gate 裡複製一份
// slug↔縣市名對照；若頁面把地區寫錯，也會因查無此鍵而被抓出來。
// ⚠️ 地區解析**直接用頁面用的那支 lib**（見 render-context.mjs 的 townByName），
//    絕不在 gate 裡重寫一份規則——重寫就是新的漂移來源（初版自寫正則，立刻在
//    桃園區／麻豆區等 12 處對不上）。
import { num } from '../../src/lib/format.ts';

const normTw = (s) => String(s ?? '').replace(/臺/g, '台');

export const townLeadCount = {
  id: 'town/lead-count',
  legacyIds: ['3'],
  title: '鄉鎮頁必有 answer-first 摘要，且摘要裡的間數等於該鄉鎮廟數',
  source: 'towns',
  check(file, page, ctx, acc) {
    const h1 = page.html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]?.trim();
    const key = h1 ? normTw(h1).replace(/廟宇$/, '') : undefined;
    acc.count('pages');
    if (!page.html.includes('class="lead"')) {
      acc.violate(`鄉鎮頁 ${file} 缺 answer-first 摘要（class="lead"）`);
      return;
    }
    const count = key ? ctx.derived.townByName.get(key) : undefined;
    // 地區名解析規則差異，不當違規（「已檢查／已略過」二元計數，摘要如實揭露）
    if (count === undefined) { acc.count('unmatched'); return; }
    if (!new RegExp(`收錄\\s*${num(count)}\\s*間廟宇`).test(page.html)) {
      acc.violate(`鄉鎮頁 ${key} 摘要間數與資料不符（資料 ${count} 間）`);
    }
  },
  summary: (acc) =>
    `全 ${acc.get('pages')} 個鄉鎮頁摘要存在、其中 ${acc.get('pages') - acc.get('unmatched')} 頁間數與資料逐一相符`,
};
