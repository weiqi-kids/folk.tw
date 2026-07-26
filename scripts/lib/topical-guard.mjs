// 時事祈福文案硬守門（純函式、無副作用，可被 orchestrate/news-scan/followup 安全 import）。
//
// 鐵則（用戶 2026-07-20 定，session 結束不得回頭）：面向使用者的祈福頁文案
//   **絕不出現具體傷亡／災損數字**（幾人罹難、幾棟受損、幾人疏散、金額…）。
//   理由：那些數字未經機器複驗、且隨救援變動；本站只做「為平安／復原祈福」，不是災情速報。
//   具體事實一律留給「有逐筆掛源、可查證」的後續發展時間軸；即便如此，時間軸也走同一守門不寫死數字。
//
// 這是**機器強制的最後一道**，補 LLM prompt 軟約束之不足：prompt 叫它別寫、它偶爾仍寫，
//   本守門在寫入 topical.json 前攔下，確保「數字」永遠不會上線。改動務必跑 lib 自帶自測（見檔尾註）。

// 數字 token：阿拉伯/全形數字，或中文數字串（含 約/逾/近/超過/達 等常見前綴會一起被涵蓋）。
const NUM = '(?:[0-9０-９]+|[一二三四五六七八九十百千萬兩零]+)';
// 傷亡／災損量詞：只收「講傷亡與災損規模」會用的量詞；**刻意不含 日/月/時/分/個/起/橋/地** 等，
//   以免誤傷日期（七月十七日）、地名（烏江三橋）、次數（第三個作業面）等正當用字。
const UNIT = '(?:人|名|死|傷|亡|罹難|失蹤|失聯|受困|受傷|死亡|傷亡|遇難|棟|戶|間|所|處|座|輛|艘|架|億|萬|元|公頃|平方公里)';
const BANNED_NUM = new RegExp(NUM + '\\s*' + UNIT);

/** 文案是否含「具體傷亡／災損數字」。true＝違規、須攔下。 */
export function hasBannedNumber(text) {
  return BANNED_NUM.test(String(text ?? ''));
}

/** 開頁事件文案的無數字保底祈福語（event 觸雷時用它取代，保住頁面、去掉數字）。 */
export const SAFE_EVENT = '願受影響的鄉親都平安、家園早日復原。';

// ── 大陸用語機械黑名單（2026-07-26 加）──────────────────────────────────────
// 由來：時事祈福的事件多在中國，P2/P4 的 LLM 讀的是陸媒報導，寫出來的中文就會沾上陸用語
//   （「線索征集」「機械掘進搭配人工排查」「搶險人員」）。三支 prompt 都寫了「禁大陸用語」，
//   但那是軟約束——2026-07-26 彭水山崩併頁時實際在線上文案抓到殘留，證明靠 LLM 自律不夠。
//   本表是機器強制那一層，慣例比照 check-copy-voice.mjs：**只收嚴、不放寬，踩到新的就往下加一列**。
//
// 收錄標準（三條都要滿足才收，寧可漏不可誤傷）：
//   1. 台灣有明確、單一的對應說法（能一對一機械替換，不必看語境）；
//   2. 台灣媒體幾乎不會這樣寫（「甄別」「善後」「應急」台灣也用 → 不收）；
//   3. 替換後不會改壞專有名詞或改變事實（故不收會出現在機構名裡的「應急管理」）。
// 排序：長詞在前——「山體滑坡」要整組換成「山崩」，否則會被短詞換成「山體山崩」。
const MAINLAND_TERMS = [
  ['山體滑坡', '山崩'], ['滑坡體', '崩塌土石'], ['滑坡', '山崩'],
  ['塌方', '坍方'], ['垮塌', '坍塌'], ['泥石流', '土石流'], ['危房', '危樓'],
  ['遇難', '罹難'], ['傷員', '傷者'], ['幸存', '倖存'], ['傷情', '傷勢'], ['危重', '危急'],
  ['群眾', '民眾'], ['搶險救援', '搶救'], ['搶險', '搶救'], ['排查', '清查'], ['摸排', '清查'], ['掘進', '開挖'],
  ['視頻', '影片'], ['信息', '資訊'], ['網絡', '網路'], ['網民', '網友'],
  ['質量', '品質'], ['渠道', '管道'], ['力度', '力道'],
  ['出租車', '計程車'], ['公交車', '公車'],
  // 簡繁轉換殘字：性質相鄰（同樣是「陸媒原文沒轉乾淨」），且同樣一對一可機械修，故收在同一張表。
  // 只收在正體語境中**不可能正確**的字形，例如「获」（正體恆為「獲」）、「征集」（正體為「徵集」）。
  ['征集', '徵集'], ['获', '獲'],
];

/**
 * 找出文中所有大陸用語。回傳 [{ term, tw }]（無則空陣列）。
 * 純偵測、不改字——要改字用 replaceMainlandTerms()。
 */
export function findMainlandTerms(text) {
  const s = String(text ?? '');
  return MAINLAND_TERMS.filter(([term]) => s.includes(term)).map(([term, tw]) => ({ term, tw }));
}

/** 是否含大陸用語。true＝違規、須處置。 */
export const hasMainlandTerm = (text) => findMainlandTerms(text).length > 0;

/**
 * 機械替換成台灣說法（依表順序，長詞先換）。表內每個詞都有一對一對應，
 * 故替換後必定不再含表內詞——呼叫端可直接用結果，不需重試迴圈。
 */
export function replaceMainlandTerms(text) {
  let s = String(text ?? '');
  for (const [term, tw] of MAINLAND_TERMS) s = s.split(term).join(tw);
  return s;
}

// ── 全量盤點：node scripts/lib/topical-guard.mjs --scan [--fix] ─────────────────
// 掃 src/data/topical.json 裡所有面向使用者的文案（title／event／updates[].text），列出殘留。
// --fix 直接機械替換寫回（updates 的 hash = f(urls, text)，故一併重算，維持不變式）。
if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes('--scan')) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const FIX = process.argv.includes('--fix');
  const F = 'src/data/topical.json';
  const list = JSON.parse(readFileSync(F, 'utf8'));
  const normUrl = (u) => { try { const x = new URL(String(u).trim()); x.hash = ''; for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|from|share|ref)/i.test(k)) x.searchParams.delete(k); return (x.host + x.pathname + (x.search || '')).toLowerCase().replace(/\/+$/, ''); } catch { return String(u || '').trim().toLowerCase().replace(/\/+$/, ''); } };
  const normText = (s) => String(s || '').toLowerCase().replace(/[\s　]+/g, '').replace(/[，,、。.；;：:「」『』（）()\-—－]/g, '');
  let hits = 0;
  for (const e of list) {
    const slots = [['title', () => e.title, (v) => { e.title = v; }], ['event', () => e.event, (v) => { e.event = v; }]];
    (e.updates ?? []).forEach((u, i) => slots.push([`updates[${i}].text`, () => u.text, (v) => {
      u.text = v; u.hash = createHash('sha1').update([...new Set((u.sources ?? []).map((s) => normUrl(s.url)))].sort().join('|') + '::' + normText(v)).digest('hex').slice(0, 12);
    }]));
    for (const [name, get, set] of slots) {
      const found = findMainlandTerms(get());
      if (!found.length) continue;
      hits++;
      console.log(`${e.id} ${name}：${found.map((h) => `${h.term}→${h.tw}`).join('、')}`);
      console.log(`   ${String(get()).slice(0, 60)}…`);
      if (FIX) set(replaceMainlandTerms(get()));
    }
  }
  if (FIX && hits) { writeFileSync(F, JSON.stringify(list, null, 2) + '\n'); console.log(`\n已替換並寫回 ${hits} 處`); }
  else console.log(hits ? `\n共 ${hits} 處（加 --fix 可機械替換寫回）` : '✓ 全站文案無大陸用語殘留');
  process.exit(0);
}

// ── 檔尾自測（node scripts/lib/topical-guard.mjs 直接跑，改守門後務必綠）──────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const banned = ['八人罹難', '造成三十六棟民宅受損', '逾四千四百人一度疏散', '一座教堂受損', '4人受傷', '死亡2人'];
  const ok = ['發生山崩，願受影響的鄉親都平安', '七月十七日發生地震', '烏江三橋一帶', '搜救行動至此告一段落',
    '所幸未造成人員傷亡', '無人罹難', '第三個作業面', '調撥賑災物資協助安置'];
  let pass = true;
  for (const t of banned) if (!hasBannedNumber(t)) { console.error('✗ 應攔未攔:', t); pass = false; }
  for (const t of ok) if (hasBannedNumber(t)) { console.error('✗ 誤傷正當字:', t); pass = false; }

  // 大陸用語黑名單：該攔的攔、台灣正當用字零誤傷、替換後必定乾淨。
  const cn = [
    ['機械掘進搭配人工排查', '機械開挖搭配人工清查'],
    ['搶險人員針對現場危岩展開作業', '搶救人員針對現場危岩展開作業'],
    ['山體滑坡致多棟民房被埋', '山崩致多棟民房被埋'],   // 長詞優先，不可變成「山體山崩」
    ['當地組織群眾轉移安置', '當地組織民眾轉移安置'],
    ['遇難者遺體已尋獲', '罹難者遺體已尋獲'],
    ['發生塌方與泥石流', '發生坍方與土石流'],
    ['傷員送醫，傷情穩定', '傷者送醫，傷勢穩定'],
    ['成立現場搶險救援指揮部', '成立現場搶救指揮部'],   // 長詞優先，不可變成「搶救救援指揮部」
    ['經廣泛線索征集後尋获遺體', '經廣泛線索徵集後尋獲遺體'],
  ];
  for (const [bad, want] of cn) {
    if (!hasMainlandTerm(bad)) { console.error('✗ 陸用語應攔未攔:', bad); pass = false; }
    const got = replaceMainlandTerms(bad);
    if (got !== want) { console.error(`✗ 替換結果不符：「${got}」應為「${want}」`); pass = false; }
    if (hasMainlandTerm(got)) { console.error('✗ 替換後仍殘留陸用語:', got); pass = false; }
  }
  const cnOk = ['搜救行動至此告一段落', '罹難者遺體陸續尋獲', '倖存者已送醫', '土石流沖毀路面',
    '專家研判為坡地表層鬆動崩落', '經走訪調查與技術甄別後核實', '災民安置與重建進度', '當局公布事故成因分析'];
  for (const t of cnOk) if (hasMainlandTerm(t)) { console.error('✗ 陸用語黑名單誤傷正當字:', t, findMainlandTerms(t)); pass = false; }

  console.log(pass ? '✓ topical-guard 自測通過（數字與陸用語全攔、正當字零誤傷）' : '✗ topical-guard 自測失敗');
  process.exit(pass ? 0 : 1);
}
