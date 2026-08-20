// 「這次 build 的基準日」——全站唯一入口（台北 UTC+8 的日曆日）。
//
// 🔴 為什麼要有這支（2026-08-21）：基準日原本是**環境效果**，不是介面。
//    `todayInTaipei()` 每次呼叫都讀一次牆上時鐘（53 個 call site），另外還有 5 支腳本
//    各自用 `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })` 再實作一份
//    （gen-build-stamp／gen-og-temples／gen-og-festivals／check-release-schedule／render-context），
//    再加上 `src/pages/temples/[id].astro` 自己那份 `Date.now() + 8h`。**七份實作、零個共同基準。**
//    完整 build ≈20 分鐘，跨過台北午夜就會出現「前半段用昨天、後半段用今天」：
//    2026-08-19 就這樣假紅燈擋住部署（build 台北 23:45 開始、00:11 跑 gate，
//    兩間廟的 meta description 被判未含祭典句——資料沒錯，是 gate 自己換了基準日）。
//
// ── 解析順序（本檔載入時算一次，之後恆定）──────────────────────────────
//   1. `process.env.BUILD_DATE`（逃生口：CI 重現、測試釘死日期）
//   2. `.build-date`（repo 根目錄，`pnpm build` 第一步寫、postbuild 最後一步刪）
//   3. `dist/.build-date`（**只有 `distBuildDate()` 會看**，見下）
//   4. 牆上時鐘
//
// ── 為什麼是兩個 export，不是一個 ────────────────────────────────────────
//   `buildDate()`      ＝「**我這次** build 用哪一天」：頁面、OG 卡、來源層 gate。
//   `distBuildDate()`  ＝「**那份 dist** 是用哪一天建的」：吃 dist 的 gate（check:rendered）。
//   兩者在一次真正的 build 裡必定相同（根戳記還在）；差別只在**單獨跑 gate**時：
//   check:rendered 對著昨天建好的 dist 跑，要的是昨天那個日期（這正是 2026-08-19 的修法），
//   而 check:release 掃的是原始碼，要的是今天。把兩個問題混成一個 export 會讓其中一邊變錯。
//
// ⚠️ 為什麼根戳記不是 `dist/.build-date`：`astro build` 開場會清空 outDir，
//    prebuild 寫進 dist 的東西活不過 build。所以戳記寫在 repo 根、postbuild 末尾才複製進 dist。
//
// ⚠️ 路徑相對於 cwd（不是本檔位置）：所有寫入者與讀取者都由 repo 根的 npm script 啟動，
//    而本檔會被 Vite 打包進 SSR chunk——那時 `import.meta.url` 指向暫存目錄，不能拿來推 repo 根。
import { readFileSync } from 'node:fs';

export type TaipeiDate = { iso: string; epochDay: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** repo 根戳記：`pnpm build` 第一步寫入，整條 build＋postbuild 鏈共用它。 */
export const ROOT_STAMP = '.build-date';
/** 產物戳記：postbuild 最後一步由根戳記複製而來，讓事後單獨跑的 gate 也對得上。 */
export const DIST_STAMP = 'dist/.build-date';

/** 純函式：一個瞬間 → 台北（UTC+8，無日光節約）的日曆日。 */
export function taipeiDateOf(now: Date): TaipeiDate {
  const shifted = new Date(now.getTime() + 8 * 3600 * 1000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth() + 1;
  const d = shifted.getUTCDate();
  const iso = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d
    .toString()
    .padStart(2, '0')}`;
  return { iso, epochDay: Math.floor(Date.UTC(y, m - 1, d) / 86400000) };
}

/** 純函式：ISO 日字串 → TaipeiDate（epochDay 與 taipeiDateOf 同一算法）。 */
export function taipeiDateOfIso(iso: string): TaipeiDate {
  const [y, m, d] = iso.split('-').map(Number);
  return { iso, epochDay: Math.floor(Date.UTC(y, m - 1, d) / 86400000) };
}

/**
 * 可注入版的解析（單元測試用；正式路徑只在本檔載入時各呼叫一次）。
 * 戳記內容不是 `YYYY-MM-DD` 就當它不存在——半寫入的檔案不可以變成一個假日期。
 */
export function resolveBuildDate(deps: {
  env?: Record<string, string | undefined>;
  readStamp?: (path: string) => string | null;
  stamps?: readonly string[];
  now?: Date;
}): TaipeiDate {
  const raw = deps.env?.BUILD_DATE?.trim();
  if (raw && ISO_DATE.test(raw)) return taipeiDateOfIso(raw);
  const read = deps.readStamp;
  if (read) {
    for (const path of deps.stamps ?? []) {
      const stamped = read(path)?.trim();
      if (stamped && ISO_DATE.test(stamped)) return taipeiDateOfIso(stamped);
    }
  }
  return taipeiDateOf(deps.now ?? new Date());
}

const readStamp = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null; // 沒 build 過就沒有戳記，那時本來就沒有「build 當時」可言
  }
};

// 🔴 `astro dev` 一律跟牆上時鐘：dev 沒有 build，讀到上一次（尤其是失敗那次）留下的
//    根戳記會把畫面上的「今日」凍在過去，而那是最容易被誤判成資料錯的症狀。
//    plain node 底下 `import.meta.env` 不存在 → 判為非 dev，正常讀戳記。
const IS_DEV = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
const ENV = typeof process !== 'undefined' ? process.env : {};

const BUILD = Object.freeze(
  resolveBuildDate({ env: ENV, readStamp, stamps: IS_DEV ? [] : [ROOT_STAMP] }),
);
const DIST_BUILD = Object.freeze(
  resolveBuildDate({ env: ENV, readStamp, stamps: IS_DEV ? [] : [ROOT_STAMP, DIST_STAMP] }),
);

/** 這次 build 的基準日（頁面／OG 卡／來源層 gate）。 */
export function buildDate(): TaipeiDate {
  return BUILD;
}

/** 手上這份 dist 是用哪一天建的（吃 dist 的 gate）。 */
export function distBuildDate(): TaipeiDate {
  return DIST_BUILD;
}
