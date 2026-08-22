// 檔期倒推的**唯一運算入口**：接下來 N 天有哪些節慶檔期、各自的頁在 GSC 上拿到多少。
//
// 消費端有兩個，刻意共用這一支（不要在任何一邊長出第二份分派）：
//   ① scripts/growth-calendar-gaps.mjs  人工查看用的 CLI
//   ② scripts/seo-daily.mjs             每日 JSON 的 calendarGaps 段（大腦層與 Slack 讀它）
//
// 為什麼要進每日 JSON：大腦層 2026-08 期間幾乎天天 no-op，因為它拿到的候選
// （strikingDistance／highImpZeroClick／cannibalization）**清一色是廟名查詢**，
// 而站規明文禁止逐廟調整——等於每天餵它一份它依規則只能全部退掉的清單。
// 檔期缺口是它唯一能合法動手、而且有時效性的題目。
//
// 🔴 本檔只算與報，不改檔、不當 gate（理由見 growth-calendar-gaps.mjs 檔頭）。

/** 判讀門檻是**編輯提示**不是及格線；要不要動手照 docs/demand-page-playbook.md §3 的三條件判。 */
export function verdictOf({ impressions, clicks, position }) {
  if (impressions === 0) return '沒進候選池';
  if (position !== null && position > 10) return '在第二頁以後';
  if (position !== null && position > 6) return '在第一頁下緣';
  if (clicks === 0 && impressions >= 50) return '有曝光零點擊';
  return '正常';
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * @param festivals  src/data/festivals.json 的內容
 * @param festivalNextSolar  src/lib/lunar-date.ts 的同名函式（呼叫端注入，避免本檔綁 TS 載入方式）
 * @param pageRows   GSC page 維度的列（keys[0] 為完整網址）；不打 GSC 時給空陣列
 */
/**
 * @param hasGsc 有沒有真的查過 GSC。🔴 **不可以用 `pageRows.length` 代替它**——
 *   2026-08-22 回測（`--as-of 2026-08-01`）當場抓到：那個窗口 `/festivals/` 整批 0 曝光，
 *   於是 `pageRows` 是空陣列，舊寫法就把每一檔都判成「—」（＝沒查 GSC），
 *   **把最該示警的「有頁卻拿不到任何曝光」整批吃掉**。而七夕在 2026-08-01 正是這個狀態，
 *   等於這支工具就算當時存在也不會把它標出來——回測的意義就在抓出這種事。
 */
export function computeCalendarGaps({ festivals, festivalNextSolar, pageRows = [], hasGsc = true, todayIso, horizon = 120 }) {
  const stats = new Map();
  for (const r of pageRows) {
    stats.set(r.keys[0].replace('https://folk.tw', ''), {
      impressions: r.impressions, clicks: r.clicks, position: r.position,
    });
  }

  const upcoming = [];
  for (const f of festivals) {
    const { iso, label } = festivalNextSolar(f, todayIso);
    if (!iso) continue;
    const tMinus = daysBetween(todayIso, iso);
    if (tMinus < 0 || tMinus > horizon) continue;
    const url = `/festivals/${f.slug}/`;
    const s = stats.get(url) ?? { impressions: 0, clicks: 0, position: null };
    upcoming.push({
      slug: f.slug, name: f.name, url, iso, label, tMinus,
      isDraftWeek: Number.isInteger(f.draft_week),
      impressions: s.impressions, clicks: s.clicks,
      position: s.position ?? null,
      verdict: hasGsc ? verdictOf({ impressions: s.impressions, clicks: s.clicks, position: s.position ?? null }) : '—',
    });
  }
  upcoming.sort((a, b) => a.tMinus - b.tMinus || a.slug.localeCompare(b.slug));
  return upcoming;
}
