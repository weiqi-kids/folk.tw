// 時事祈福 · 同一事件去重（純函式，無副作用；2026-07-25 自 topical-news-scan.mjs 抽出）
//
// 抽出來的理由：這段邏輯 2026-07-17 重慶彭水山崩踩過一次坑——同一起事件被開了三頁
// （「重慶市彭水縣」／「重慶市彭水苗族土家族自治縣」／「重庆彭水县汉葭街道」），
// 原本埋在 main() 迴圈裡無法測。抽成純函式後可用歷史資料回測（見檔尾用法），
// 改動去重規則時能直接驗「當初那三筆會不會被擋」。
//
// 四道規則（任一命中即視為重複）：
//   d1 地名字串相等   — 最便宜，涵蓋同一寫法重複回報。（≤3 天）
//   d2 來源網址重疊   — 引用到同一篇報導＝同一起事件，地名寫法再怎麼變都擋得住。（≤3 天）
//   dC 颱風名相同     — **僅 eventType=cyclone**，≤14 天、不看距離（見下）。
//   d3 同型別＋距離 ≤10km — 需要座標（P2 在複驗後補地理編碼，見 lib/topical-geo.mjs）；
//                          無座標時退回地名字串比對（＝原行為，不放行也不誤擋）。（≤3 天）
//
// dC 的由來（2026-07-26）：颱風會移動，「≤10km／≤3 天」是為地震山崩設計的，對橫跨數日、
// 上千公里的氣旋結構上無效。實例：P1 於 7/23 依 GDACS 開了 `gdacs-tc-1001294`
// （place=`China`、座標 17.4/128.4＝當時海上位置），P2 於 7/26 又從新聞撈到同一個颱風紅霞
// （place=`巴士海峽、東沙島海面及臺灣海峽`、地理編碼查無→無座標）——三道規則全漏，
// 差點為同一個颱風開出第二頁。氣旋的自然主鍵是**名字**，故對 cyclone 改以名字比對。
//
// 兩條產線用的是兩套字串：P1（GDACS）只有國際命名 `NOUL`，P2（新聞）只有中文名「紅霞」。
// 故名字集合裡一律把英文名用 CWA 對照表（lib/typhoon-names.json）換算成中文再比，兩個方向都擋得住。
//
// 名字抽取刻意「寧可過度抽取」：前後綴兩式各同時收 2 字與 3 字（颱風名 2～3 字皆有，
// 如紅霞／杜蘇芮），因為最終要求**兩邊的名字集合有交集**才算命中，單邊的雜訊自然被交集濾掉。
// 真正的誤併風險是「兩邊都抽到同一個常見詞」（如兩個不同颱風都寫『颱風登陸』），
// 故用 CYCLONE_STOP 擋掉災防新聞裡緊鄰氣旋詞的常見詞彙。新踩到的詞往 CYCLONE_STOP 加。
// 自我測試：`node scripts/lib/topical-dedup.mjs --selftest`（含上述紅霞案例與誤併反例）。

import { readFileSync } from 'node:fs';
import { normSourceUrl } from './topical-geo.mjs';

export const SAME_EVENT_DAYS = 3;
export const SAME_EVENT_KM = 10;
/** 氣旋同事件的時間窗：一個颱風的生命週期通常 5～10 天，取 14 天涵蓋「生成→登陸→減弱」全程。 */
export const CYCLONE_DAYS = 14;

/** 地名正規化：小寫、去空白、去中英文逗號頓號。 */
export const normPlace = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[，,、]/g, '');

const inferType = (e) => e.eventType ?? (e.mag != null || String(e.id).startsWith('eq-') ? 'quake' : 'other');

/** 兩點距離（km）；任一方缺座標回 Infinity。 */
export function km(a, b) {
  if (a?.lat == null || b?.lat == null) return Infinity;
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const withinDays = (a, b, days = SAME_EVENT_DAYS) =>
  Math.abs(Date.parse(a.time) - Date.parse(b.time)) / 864e5 <= days;

/** 同事件判定：同 eventType 且時間差 ≤3 天 且（座標 ≤10km 或 normPlace 相符）。 */
export function sameEvent(a, b) {
  if (inferType(a) !== inferType(b)) return false;
  if (!withinDays(a, b)) return false;
  const d = km(a, b);
  if (d !== Infinity) return d <= SAME_EVENT_KM;
  return normPlace(a.place) && normPlace(a.place) === normPlace(b.place);
}

// ── 氣旋：以颱風名判同事件 ───────────────────────────────────────────────
// 氣旋詞（長的排前面，正則交替取最先匹配者，避免「強烈颱風」被「颱風」吃掉）。
const CYC_WORD = '(?:超強颱風|強烈颱風|熱帶氣旋|熱帶風暴|熱帶低壓|強颱|中颱|輕颱|颱風|台風|颶風)';
// 緊鄰氣旋詞、但絕不是颱風名的常見詞（含強度形容詞、災防動作、時間詞）。只收嚴不放寬。
const CYCLONE_STOP = new Set([
  '超強', '強烈', '中度', '輕度', '熱帶', '這個', '本次', '此次', '該起', '今年', '首個', '今夏', '上述',
  '警報', '戒備', '特報', '警戒', '假期', '動向', '路徑', '中心', '強度', '眼牆', '環流', '外圍', '位置',
  '侵襲', '來襲', '登陸', '影響', '過境', '生成', '增強', '減弱', '逼近', '遠離', '移動', '北上', '南下',
  '轉向', '季節', '天氣', '災情', '消息', '期間', '前夕', '過後', '威脅', '命名', '編號', '名稱', '系統',
  '等級', '帶來', '造成', '導致', '可能', '預計', '預報', '未來', '今天', '今日', '明天', '昨天', '目前',
  '已經', '持續', '停課', '停班', '停止', '恢復', '防範', '準備', '整備', '應變', '疏散', '撤離', '救援',
]);

// 英文颱風名 → 中文譯名（CWA《颱風百問》表 2-1，140 筆；資料與出處見 lib/typhoon-names.json）。
// 用途：GDACS 只給英文名（RSS 標題 `tropical cyclone NOUL-26`），新聞只給中文名（紅霞），
// 少了這座橋，P1 開的頁與 P2 開的頁就是兩套字串、名字規則發動不了。
const TYPHOON_ZH = new Map(
  JSON.parse(readFileSync(new URL('./typhoon-names.json', import.meta.url), 'utf8'))
    .names.map(({ zh, en }) => [en.toLowerCase().replace(/-/g, ''), zh]));

/** 條目／候選可供比對的全部文字（標題、祈福語、摘要、地名、颱風英文名、後續進展）。 */
export const eventText = (o) => [
  o?.title, o?.event, o?.summary, o?.place, o?.cycloneName,
  ...((o?.updates ?? []).map((u) => u?.text)),
].filter(Boolean).join('　');

/**
 * 從文字抽出颱風名候選（刻意過度抽取，靠交集濾雜訊；見檔頭）。
 * 命名位置＝氣旋詞的前或後，各同時收 2 字與 3 字。
 */
export function cycloneNames(text) {
  const out = new Set();
  const push = (s) => { if (s && s.length >= 2 && !CYCLONE_STOP.has(s)) out.add(s); };
  const s = String(text || '');
  // 後綴式：颱風紅霞 ／ 颱風「紅霞」
  for (const m of s.matchAll(new RegExp(`${CYC_WORD}[「『"'‘“]?([一-鿿]{2,3})`, 'g'))) {
    push(m[1].slice(0, 2)); push(m[1]);
  }
  // 前綴式：紅霞颱風 ／「紅霞」颱風
  for (const m of s.matchAll(new RegExp(`([一-鿿]{2,3})[」』"'’”]?${CYC_WORD}`, 'g'))) {
    push(m[1].slice(-2)); push(m[1]);
  }
  // 英文國際命名（GDACS 那側只有這個）→ 一律換算成中文名放進集合，兩側才比得起來。
  // 只認 CWA 140 個正式名稱、且要求完整單詞邊界，不會誤抓一般英文字。
  for (const m of s.matchAll(/[A-Za-z][A-Za-z-]{2,}/g)) {
    const zh = TYPHOON_ZH.get(m[0].toLowerCase().replace(/-/g, ''));
    if (zh) out.add(zh);
  }
  return out;
}

/** 兩造是否指向同一個有名字的氣旋；回傳共同的名字（無則 null）。 */
export function sharedCycloneName(a, b) {
  const na = cycloneNames(eventText(a));
  if (!na.size) return null;
  for (const n of cycloneNames(eventText(b))) if (na.has(n)) return n;
  return null;
}

/**
 * 在既有事件清單中找出與候選重複者。
 * @param {Array<object>} list  topical.json 全部條目（含已併頁的 mergedInto 條目——它們的地名字串
 *                              仍是擋住同事件再開頁的有效線索，故不可過濾掉）
 * @param {object} cand  { eventType, place, time, lat?, lon?, sources? }
 * @returns {{ id: string, rule: 'place'|'source-url'|'cyclone-name'|'geo', name?: string } | null}
 */
export function findDuplicate(list, cand) {
  const hitPlace = list.find((it) =>
    normPlace(it.place) && normPlace(it.place) === normPlace(cand.place) && withinDays(it, cand));
  if (hitPlace) return { id: hitPlace.id, rule: 'place' };

  const candUrls = new Set((cand.sources ?? []).map((s) => normSourceUrl(s.url)));
  const hitUrl = candUrls.size
    ? list.find((it) => withinDays(it, cand) &&
        (it.sources ?? []).some((s) => candUrls.has(normSourceUrl(s.url))))
    : null;
  if (hitUrl) return { id: hitUrl.id, rule: 'source-url' };

  // dC 氣旋：同名即同一個颱風，不看距離（會移動）、時間窗放寬到整個生命週期。
  if (inferType(cand) === 'cyclone') {
    for (const it of list) {
      if (inferType(it) !== 'cyclone' || !withinDays(it, cand, CYCLONE_DAYS)) continue;
      const name = sharedCycloneName(it, cand);
      if (name) return { id: it.id, rule: 'cyclone-name', name };
    }
  }

  const hitGeo = list.find((it) => sameEvent(it, cand));
  if (hitGeo) return { id: hitGeo.id, rule: 'geo' };

  return null;
}

// ── 自我測試：node scripts/lib/topical-dedup.mjs --selftest ──────────────────
// 用歷史事故資料回測：改動去重規則時先跑這支，確認當初踩過的坑都還擋得住、且不誤併。
if (process.argv[1]?.endsWith('topical-dedup.mjs') && process.argv.includes('--selftest')) {
  let fail = 0;
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
  };

  // (1) 2026-07-26 紅霞：P1 依 GDACS 開的頁（place=China、海上座標）vs P2 從新聞撈到的同一個颱風。
  const koguma = {
    id: 'gdacs-tc-1001294', eventType: 'cyclone', title: '為中國熱帶氣旋平安祈福',
    event: '西北太平洋熱帶氣旋侵襲中國沿海地區。', place: 'China', time: '2026-07-23',
    lat: 17.4, lon: 128.4,
    updates: [{ date: '2026-07-24', text: '颱風紅霞持續增強為強烈等級，預測即將於廣東沿海一帶登陸。' }],
  };
  check('紅霞：GDACS 頁 vs 新聞候選 → 同事件',
    findDuplicate([koguma], {
      eventType: 'cyclone', place: '巴士海峽、東沙島海面及臺灣海峽', time: '2026-07-26',
      summary: '颱風紅霞外圍環流影響巴士海峽一帶，中央氣象署發布海上颱風警報。',
    }),
    { id: 'gdacs-tc-1001294', rule: 'cyclone-name', name: '紅霞' });

  // (2) 誤併反例：同期但不同名的兩個颱風，不可併。
  check('同期不同名（康芮 vs 紅霞）→ 不併',
    findDuplicate([koguma], {
      eventType: 'cyclone', place: '菲律賓呂宋島', time: '2026-07-25',
      summary: '颱風康芮於呂宋島東方海面生成，強度持續增強。',
    }), null);

  // (3) 誤併反例：兩則都只寫災防常見詞（無名字），不可靠「颱風登陸」這種詞併頁。
  check('兩造皆無名字（颱風登陸 X vs 颱風登陸 Y）→ 不併',
    findDuplicate([{ id: 'a', eventType: 'cyclone', place: '廣東', time: '2026-07-23', event: '颱風登陸廣東沿海。' }],
      { eventType: 'cyclone', place: '福建', time: '2026-07-26', summary: '颱風登陸福建沿海。' }), null);

  // (4) 逾時間窗：同名但差 20 天＝不同颱風季的事，不併。
  check('同名但差 20 天 → 不併',
    findDuplicate([koguma], {
      eventType: 'cyclone', place: '沖繩', time: '2026-08-15', summary: '颱風紅霞…',
    }), null);

  // (4b) P2→P1 方向（2026-07-26 補）：P2 先用中文名開了頁，P1 之後才從 GDACS 撈到同一個颱風
  //      （GDACS 只給國際命名 NOUL）。靠 CWA 對照表 Noul→紅霞 橋接才擋得住。
  check('P2 中文名頁 vs P1 的 GDACS 英文名候選 → 同事件',
    findDuplicate([{
      id: 'news-cyclone-20260724-abc123', eventType: 'cyclone', title: '為紅霞颱風平安祈福',
      event: '颱風紅霞逼近，願平安。', place: '巴士海峽', time: '2026-07-24',
    }], { eventType: 'cyclone', cycloneName: 'NOUL', place: 'China', time: '2026-07-26', lat: 17.4, lon: 128.4 }),
    { id: 'news-cyclone-20260724-abc123', rule: 'cyclone-name', name: '紅霞' });
  check('英文名對照表：Noul→紅霞、Koguma→小熊、Krathon→山陀兒',
    ['Noul', 'Koguma', 'Krathon'].map((en) => [...cycloneNames(en)][0]), ['紅霞', '小熊', '山陀兒']);
  check('不同颱風的英文名不互相橋接（NOUL vs KOGUMA）→ 不併',
    findDuplicate([{ id: 'a', eventType: 'cyclone', cycloneName: 'KOGUMA', place: 'Japan', time: '2026-07-23' }],
      { eventType: 'cyclone', cycloneName: 'NOUL', place: 'China', time: '2026-07-26' }), null);

  // (5) 強度形容詞不可被當成名字。
  check('「強烈颱風」不抽成名字', cycloneNames('強烈颱風紅霞').has('強烈'), false);
  check('「強烈颱風紅霞」抽得到紅霞', cycloneNames('強烈颱風紅霞').has('紅霞'), true);
  check('「紅霞颱風」抽得到紅霞', cycloneNames('為紅霞颱風平安祈福').has('紅霞'), true);
  check('三字名（杜蘇芮）抽得到', cycloneNames('颱風杜蘇芮登陸').has('杜蘇芮'), true);

  // (6) 既有規則不得退化：2026-07-17 重慶彭水山崩三種寫法仍要被擋（走 geo）。
  const pengshui = { id: 'news-landslide-20260717-470423', eventType: 'landslide', place: '重慶市彭水縣', time: '2026-07-17', lat: 29.293, lon: 108.166 };
  check('彭水山崩：不同寫法 ≤10km → 仍擋得住（geo）',
    findDuplicate([pengshui], { eventType: 'landslide', place: '重庆彭水县汉葭街道', time: '2026-07-18', lat: 29.295, lon: 108.170 }),
    { id: 'news-landslide-20260717-470423', rule: 'geo' });
  check('非氣旋類不受 dC 影響（不同地不同時）→ 不併',
    findDuplicate([pengshui], { eventType: 'landslide', place: '南投縣仁愛鄉', time: '2026-07-18', lat: 24.0, lon: 121.1 }), null);

  console.log(fail ? `\n${fail} 項未通過` : '\n全部通過');
  process.exit(fail ? 1 : 0);
}
