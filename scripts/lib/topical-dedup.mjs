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

// ── 行政區名（2026-08-12 加，柞水案）────────────────────────────────────────
// 把地名拆成行政層級的名字，分「細」「粗」兩層：
//   細（縣/區/鄉/鎮/村）＝真正指認地點的那一層，兩造有交集才可能是同一件事。
//   粗（省/市/州）＝只拿來**否決**：兩造的粗層都有值卻毫無交集，就是不同城市，不准併。
// 🔴 粗層絕不可拿來當併頁的依據——同一個省/直轄市內的兩場不同災害會被誤併。
//    這也是為什麼「市」被歸在粗層：中國的地級市可以比台灣一個縣還大。
// ⚠️ 只認中文行政區後綴。日文「県」不在其中（沖繩那批因此不會被本規則碰到），刻意保守。
const FINE_SUFFIX = '縣區鄉鎮村';
const COARSE_SUFFIX = '省市州';
export function adminNames(place) {
  const fine = new Set(), coarse = new Set();
  let cur = '';
  for (const ch of normPlace(place)) {
    if (FINE_SUFFIX.includes(ch)) { if (cur.length >= 2) fine.add(cur); cur = ''; }
    else if (COARSE_SUFFIX.includes(ch)) { if (cur.length >= 2) coarse.add(cur); cur = ''; }
    else cur += ch;
  }
  return { fine, coarse };
}
const hasIntersection = (a, b) => [...a].some((x) => b.has(x));

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
// 匯出給 P4 事後補名用（把標題裡的氣旋詞替換成「颱風○○」），改動請兩處一起想。
export const CYC_WORD = '(?:超強颱風|強烈颱風|熱帶氣旋|熱帶風暴|熱帶低壓|強颱|中颱|輕颱|颱風|台風|颶風)';
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

/**
 * 國際命名（英，`NOUL` 或 GDACS 原樣的 `NOUL-26`）→ CWA 中文譯名；查無回 null。
 * 給標題產線用：GDACS 那側只有英文名，但面向使用者的標題要寫台灣人認得的「紅霞」，
 * 而中文名**只能查 CWA 對照表**、絕不可讓 LLM 自創音譯（紅線：絕不杜撰）。
 */
export function typhoonZhName(en) {
  if (!en) return null;
  const key = String(en).trim().toLowerCase().replace(/-\d+$/, '').replace(/-/g, '');
  return TYPHOON_ZH.get(key) ?? null;
}

/**
 * 標題撞名檢查（2026-07-27 加）：新頁的標題若與既有「還看得到的」條目**完全相同**，
 * 使用者在 /qiugian/ 清單上就只看到一排一模一樣的「🕯 為○○祈福 →」，分不出誰是誰。
 *
 * 由來：2026-07-27 GDACS 一次給了三場西班牙野火（座標相距數百公里、**確實是三場不同的火**，
 * 不是重複開頁），但它的 `country` 欄只給國名，正向閘手上就只有「Spain」可寫 → 三頁全叫
 * 「為西班牙野火平安祈福」。去重規則全對（本來就不同事件），問題出在**標題沒有辨識度**。
 *
 * 撞名＝來源給的地理資訊不足以區分這兩起事件，此時保守 block（寧漏不錯）：本站不必為每個事件開頁，
 * 而掛一頁講不清是哪一場的頁面，對使用者是負值。若之後來源給出更細的地名，標題自然不撞、就會開成。
 *
 * @param {Array<object>} list topical.json 全部條目
 * @param {string} title 待開頁的標題
 * @returns {object|null} 撞到的既有條目（無則 null）
 */
export function findTitleClash(list, title) {
  const t = String(title || '').trim();
  if (!t) return null;
  return list.find((it) => !it.mergedInto && it.status !== 'archived' && String(it.title || '').trim() === t) ?? null;
}

/** CWA 140 個正式中文譯名的集合，供「抽到的詞是不是真的颱風名」這道權威濾網。 */
const TYPHOON_ZH_SET = new Set(TYPHOON_ZH.values());

/**
 * 從文字抽出**確定是 CWA 正式颱風名**的中文名，供面向使用者的標題用。
 * 與 cycloneNames() 的差別：那支刻意過度抽取、靠「兩造取交集」濾雜訊；這支只有單邊文字可用，
 * 故改以正式名單當濾網，並要求**恰好命中一個**（命中兩個以上代表文中混著別的颱風，寧可放棄）。
 * 這樣「颱風登陸」的『登陸』、「颱風假」的『假期』都不可能通過。查無回 null。
 */
export function officialCycloneName(text) {
  const hits = new Set();
  for (const n of cycloneNames(text)) if (TYPHOON_ZH_SET.has(n)) hits.add(n);
  return hits.size === 1 ? [...hits][0] : null;
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
  // d0 GLIDE：聯合國 OCHA／ReliefWeb 等機構共用的**災害事件唯一識別碼**（如 `WF-2026-000128-ESP`），
  // GDACS 在 RSS 的 <gdacs:glide> 直接給。同一個 GLIDE ＝ 國際上登記為同一場災害，
  // **不看距離也不看時間窗**（一場野火/洪水可以燒淹好幾週、橫跨大範圍，距離與時間都不可靠）。
  // 這是目前最權威的一條，故排在最前面。查證來源：GDACS geteventdata API 的 `glide` 欄。
  if (cand.glide) {
    const hitGlide = list.find((it) => it.glide && it.glide === cand.glide);
    if (hitGlide) return { id: hitGlide.id, rule: 'glide', name: cand.glide };
  }

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

  // dP 行政區名（2026-08-12 加）：同 eventType、≤3 天，且**細層行政區名有交集**。
  // 由來（第三次同類漏網，前兩次是彭水與紅霞）：「為陝西柞水山崩祈福」與「為陝西柞水土石流平安祈福」
  // 是同一場災害開了兩頁——place 寫成「陝西省柞水縣杏坪鎮」與「陝西省商洛市柞水縣」，
  // 字串不等（place 規則過不了）、引用不同新聞（source-url 過不了）、
  // 座標相距 **29.6km**（geo 規則門檻 10km，過不了）。但兩邊都指名「柞水縣」。
  // 🔴 粗層只用來否決：「台北市中正區」與「基隆市中正區」細層都是「中正」，
  //    但粗層 {台北} 與 {基隆} 無交集 → 不准併。少了這道就會把不同城市的同名區併成一頁。
  if (inferType(cand) !== 'other') {
    const c = adminNames(cand.place);
    if (c.fine.size) {
      for (const it of list) {
        if (inferType(it) !== inferType(cand) || !withinDays(it, cand)) continue;
        const a = adminNames(it.place);
        if (!hasIntersection(a.fine, c.fine)) continue;
        // 兩造都有粗層卻互不相干＝不同城市的同名行政區，否決。
        if (a.coarse.size && c.coarse.size && !hasIntersection(a.coarse, c.coarse)) continue;
        return { id: it.id, rule: 'admin-place', name: [...c.fine].find((x) => a.fine.has(x)) };
      }
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

  // (5b) officialCycloneName：只認 CWA 正式名單、且要恰好一個（供 P2 產標題與 P4 事後補名）。
  check('正式名單濾網：抽得到紅霞', officialCycloneName('颱風紅霞持續增強，即將於廣東登陸。'), '紅霞');
  check('正式名單濾網：英文名也換得到', officialCycloneName('tropical cyclone NOUL-26 was active'), '紅霞');
  check('正式名單濾網：「颱風登陸」不會被當名字', officialCycloneName('颱風登陸廣東沿海。'), null);
  check('正式名單濾網：「颱風假」不會被當名字', officialCycloneName('明日是否放颱風假仍待宣布。'), null);
  check('正式名單濾網：文中混兩個颱風 → 放棄不猜',
    officialCycloneName('颱風紅霞減弱，颱風康芮接續生成。'), null);
  check('正式名單濾網：無氣旋詞的文字 → null', officialCycloneName('重慶市彭水縣發生山崩。'), null);

  // (5d) GLIDE：同一場災害被拆成多個 eventid 時唯一擋得住的規則；不同 GLIDE 則不可誤併。
  //      實例（2026-07-27 查 GDACS geteventdata API 證實）：三場西班牙野火 GLIDE 各為
  //      …000128/000130/000131-ESP ＝ 國際上登記為三場不同災害，即使同國、同期、同類型也不能併。
  const wfEsp = { id: 'gdacs-wf-1029540', eventType: 'wildfire', place: 'Spain', time: '2026-07-18',
    glide: 'WF-2026-000128-ESP', lat: 41.11, lon: -3.06 };
  check('同 GLIDE（同一場災害被拆成兩個 eventid）→ 併',
    findDuplicate([wfEsp], { eventType: 'wildfire', place: 'Spain', time: '2026-08-02',
      glide: 'WF-2026-000128-ESP', lat: 40.2, lon: -4.9 }),
    { id: 'gdacs-wf-1029540', rule: 'glide', name: 'WF-2026-000128-ESP' });
  check('不同 GLIDE（同國同期的另一場火）→ 不併',
    findDuplicate([wfEsp], { eventType: 'wildfire', place: 'Spain', time: '2026-07-22',
      glide: 'WF-2026-000130-ESP', lat: 40.36, lon: -4.55 }), null);
  check('GLIDE 相同但相距 400km、隔 15 天 → 仍併（野火會蔓延數週跨大範圍，距離時間都不可靠）',
    findDuplicate([wfEsp], { eventType: 'wildfire', place: 'Spain', time: '2026-08-02',
      glide: 'WF-2026-000128-ESP', lat: 39.88, lon: -0.25 })?.rule, 'glide');
  check('候選無 GLIDE → 不因此誤併，退回原有規則',
    findDuplicate([wfEsp], { eventType: 'wildfire', place: 'Portugal', time: '2026-07-19', lat: 39.5, lon: -8.0 }), null);

  // (5c) findTitleClash：標題撞名＝來源地理資訊不足以辨識，須擋（2026-07-27 三場西班牙野火案）。
  const wf = [
    { id: 'gdacs-wf-1029540', status: 'active', title: '為西班牙野火平安祈福' },
    { id: 'gdacs-wf-old', status: 'archived', title: '為葡萄牙野火平安祈福' },
    { id: 'gdacs-wf-merged', mergedInto: 'gdacs-wf-1029540', title: '為義大利野火平安祈福' },
  ];
  check('標題與既有 active 頁完全相同 → 擋',
    findTitleClash(wf, '為西班牙野火平安祈福')?.id, 'gdacs-wf-1029540');
  check('標題不同（地名更細）→ 放行',
    findTitleClash(wf, '為西班牙瓦倫西亞野火平安祈福'), null);
  check('只與已撤下（archived）的頁同名 → 放行（清單上看不到它，不會混淆）',
    findTitleClash(wf, '為葡萄牙野火平安祈福'), null);
  check('只與併頁條目同名 → 放行（它只剩 redirect）',
    findTitleClash(wf, '為義大利野火平安祈福'), null);
  check('空標題 → null（交由上游的 !g.title 擋）', findTitleClash(wf, '  '), null);

  // (6) 既有規則不得退化：2026-07-17 重慶彭水山崩三種寫法仍要被擋（走 geo）。
  const pengshui = { id: 'news-landslide-20260717-470423', eventType: 'landslide', place: '重慶市彭水縣', time: '2026-07-17', lat: 29.293, lon: 108.166 };
  check('彭水山崩：不同寫法 ≤10km → 仍擋得住（geo）',
    findDuplicate([pengshui], { eventType: 'landslide', place: '重庆彭水县汉葭街道', time: '2026-07-18', lat: 29.295, lon: 108.170 }),
    { id: 'news-landslide-20260717-470423', rule: 'geo' });
  check('非氣旋類不受 dC 影響（不同地不同時）→ 不併',
    findDuplicate([pengshui], { eventType: 'landslide', place: '南投縣仁愛鄉', time: '2026-07-18', lat: 24.0, lon: 121.1 }), null);

  // (7) 2026-08-12 柞水案（dP 行政區名）：同一場山崩開了兩頁，前五道規則全漏。
  const zhashui = {
    id: 'news-landslide-20260805-0c8a78', eventType: 'landslide',
    place: '陝西省柞水縣杏坪鎮', time: '2026-08-05', lat: 33.4870516, lon: 109.4929183,
    sources: [{ url: 'https://www.thepaper.cn/newSDetail_forward_33729566' }],
  };
  check('柞水：兩種寫法、相距 29.6km、來源不同 → 擋（admin-place）',
    findDuplicate([zhashui], {
      eventType: 'landslide', place: '陝西省商洛市柞水縣', time: '2026-08-05',
      lat: 33.681389, lon: 109.275278,
      sources: [{ url: 'https://www.news.cn/politics/20260806/28f723872fbd41f6a0e0bffe4033eccb/c.html' }],
    }),
    { id: 'news-landslide-20260805-0c8a78', rule: 'admin-place', name: '柞水' });
  check('行政區名拆解：細層取縣/鎮、粗層取省',
    [[...adminNames('陝西省柞水縣杏坪鎮').fine], [...adminNames('陝西省柞水縣杏坪鎮').coarse]],
    [['柞水', '杏坪'], ['陝西']]);

  // (7b) 誤併反例：不同城市的同名行政區，粗層必須否決。
  check('台北市中正區 vs 基隆市中正區 → 不併（粗層無交集）',
    findDuplicate([{ id: 'a', eventType: 'flood', place: '台北市中正區', time: '2026-08-05' }],
      { eventType: 'flood', place: '基隆市中正區', time: '2026-08-06' }), null);
  // (7c) 誤併反例：同縣但事件類型不同，不可併。
  check('同一縣但不同事件類型 → 不併',
    findDuplicate([zhashui], { eventType: 'flood', place: '陝西省柞水縣', time: '2026-08-05' }), null);
  // (7d) 誤併反例：逾 3 天窗，不可併。
  check('同一縣但差 10 天 → 不併',
    findDuplicate([zhashui], { eventType: 'landslide', place: '陝西省柞水縣', time: '2026-08-15' }), null);
  // (7e) 日文地名不觸發本規則（「県」不是中文後綴，且「市」是粗層）。
  check('沖繩日文地名 → 本規則不發動',
    findDuplicate([{ id: 'a', eventType: 'storm', place: '沖縄県名護市など沖縄本島北部', time: '2026-08-08' }],
      { eventType: 'storm', place: '沖縄県石垣市', time: '2026-08-09' }), null);

  console.log(fail ? `\n${fail} 項未通過` : '\n全部通過');
  process.exit(fail ? 1 : 0);
}
