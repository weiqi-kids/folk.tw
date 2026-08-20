// 原不變量 13（2026-08-08 加）：「附近的廟」的頁面骨架與格網索引。
//
// 🔴 這條擋的是一整類「不會有紅燈的壞掉」：格檔沒產出、產錯格、欄位順序被改、
//    或有人把結果槽刪了——症狀全都是「按下去查不到廟」，build 照樣全綠、頁面照樣渲染，
//    只有真的拿手機站在廟前面的人才會發現。所以這裡驗到底，不抽樣。
//
// ⚠️ 這是全檔唯一驗**非 HTML 產物**的不變量（cells/*.json），
//    所以 runner 的「產物」抽象不能寫死成「頁面 HTML」。
// ⚠️ 切格與欄位規則一律用頁面用的那支 lib（下面直接 import），gate 不重寫（重寫＝新的漂移源）。
import { buildCells, cellKey } from '../../src/lib/nearby-grid.ts';

export const nearbyPageSkeleton = {
  id: 'nearby/page-skeleton',
  legacyIds: ['13'],
  title: '「附近的廟」頁必須有定位鈕、結果清單、預渲染結果槽與無 JS 退路的縣市清單',
  source: 'singleton',
  singletons: ['dist/temples/nearby/index.html'],
  onMissing: (_file, acc) => acc.violate('/temples/nearby/ 未建置'),
  check(_file, page, _ctx, acc) {
    if (!page.html.includes('id="nb-go"')) acc.violate('/temples/nearby/ 缺定位按鈕（id="nb-go"）');
    if (!page.html.includes('id="nb-list"')) acc.violate('/temples/nearby/ 缺結果清單（id="nb-list"）');
    // 槽是這個功能的房規（不注入 DOM，見該頁檔頭），槽沒了 JS 就沒有地方寫。
    const slots = (page.html.match(/class="nb-item"/g) ?? []).length;
    if (slots === 0) {
      acc.violate('/temples/nearby/ 沒有任何預先渲染的結果槽（class="nb-item"）＝JS 無處可寫');
    }
    acc.count('slots', slots);
    // 靜態退路：不給位置／無 JS 的人要有東西可用，同時這也是這頁對爬蟲的實際內容。
    if (!page.html.includes('class="county-wall"')) {
      acc.violate('/temples/nearby/ 缺縣市清單（無 JS／不給權限時的唯一退路）');
    }
  },
  summary: (acc, ctx) => {
    const cells = ctx.accOf('nearby/grid-cells');
    return `另「附近的廟」頁骨架齊全（定位鈕／結果清單／${acc.get('slots')} 個預渲染結果槽／無 JS 退路的縣市清單），`
      + `格網索引 ${cells.get('cells')} 個格檔共 ${cells.get('rows')} 筆與資料**雙向**逐筆相符`
      + `（每筆都落在正確的格、無多餘格檔、無座標者一間都不在裡面）`;
  },
};

export const nearbyGridCells = {
  id: 'nearby/grid-cells',
  legacyIds: ['13'],
  title: '格檔 ↔ 資料雙向逐筆相符，無多餘格檔，無座標的廟一間都不在格檔裡',
  source: 'none',
  run(ctx, acc) {
    const expected = buildCells(ctx.data.temples);
    const cellDir = ctx.join(ctx.DIST, 'temples', 'nearby', 'cells');
    let nbRows = 0;
    for (const [key, rows] of expected) {
      const file = ctx.join(cellDir, `${key}.json`);
      if (!ctx.exists(file)) {
        acc.violate(`附近的廟：格檔缺少 ${key}.json（資料有 ${rows.length} 間廟落在這格）`);
        continue;
      }
      let actual;
      try {
        actual = JSON.parse(ctx.read(file));
      } catch {
        acc.violate(`附近的廟：格檔 ${key}.json 不是合法 JSON`);
        continue;
      }
      if (JSON.stringify(actual) !== JSON.stringify(rows)) {
        acc.violate(
          `附近的廟：格檔 ${key}.json 與資料不符（檔內 ${Array.isArray(actual) ? actual.length : '?'} 筆、`
          + `資料 ${rows.length} 筆；欄位順序或內容被改動？）`,
        );
        continue;
      }
      // 每一筆都真的屬於這一格（防「格檔內容對、但整格算在錯的位置」）。
      for (const r of rows) {
        if (cellKey(r[2], r[3]) !== key) {
          acc.violate(`附近的廟：${r[0]} 被放進 ${key}.json，但其座標應落在 ${cellKey(r[2], r[3])}`);
        }
      }
      nbRows += rows.length;
    }
    acc.count('cells', expected.size);
    acc.count('rows', nbRows);

    if (ctx.exists(cellDir)) {
      const extra = ctx.readdir(cellDir)
        .filter((n) => n.endsWith('.json'))
        .filter((n) => !expected.has(n.replace(/\.json$/, '')));
      for (const n of extra.slice(0, 5)) acc.violate(`附近的廟：dist 有多餘的格檔 ${n}（資料裡沒有這一格）`);
      if (extra.length > 5) acc.violate(`附近的廟：另有 ${extra.length - 5} 個多餘格檔`);
      // 無座標的廟不得出現在任何格檔（寧可查不到，也不能把人導到假座標）。
      const noCoord = new Set(
        ctx.data.temples.filter((t) => typeof t.lat !== 'number' || typeof t.lng !== 'number').map((t) => t.id),
      );
      if (noCoord.size) {
        const inCells = new Set([...expected.values()].flat().map((r) => r[0]));
        for (const id of noCoord) {
          if (inCells.has(id)) acc.violate(`附近的廟：${id} 無座標卻出現在格檔裡`);
        }
      }
    } else if (expected.size) {
      acc.violate('附近的廟：dist 完全沒有格檔目錄（/temples/nearby/cells/）');
    }
  },
  summary: false, // 併在 nearby/page-skeleton 那一句裡
};
