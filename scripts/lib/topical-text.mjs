// 時事祈福 · 文字層共用詞彙與正規化（純函式、無副作用，可被 orchestrate/news-scan/followup 安全 import）。
//
// 抽出的理由：這四樣東西原本在三支腳本裡各有一份，而且**已經漂移過**——
//   `TYPE_LABEL` 在 orchestrate.mjs 與 news-scan.mjs 逐字複製，還附註解請人類自己保持同步；
//   `stripHtml`／`normText` 在 news-scan 與 followup 各一份；`zh`（全形標點保底）三份。
// 複製的根因是「腳本一 import 就會跑起來」，那個 seam 已於 2026-08-19 修掉（三支都改成
//   `main()` ＋ 被直接執行才跑），所以這裡可以只留一份。**新增事件類型只改本檔。**

/**
 * 事件類型 → 中文標籤。
 * 用途有二：(1) 正向閘產文案時的「類型」欄；(2) P2 新聞掃描的合法 eventType 白名單。
 * 🔴 新增類型＝在此登記一列即可，三支腳本自動跟上；別再回頭在腳本裡自己開一份表。
 */
export const TYPE_LABEL = {
  quake: '地震', cyclone: '熱帶氣旋', flood: '水災', volcano: '火山活動', wildfire: '野火',
  landslide: '山崩', 'bridge-collapse': '橋樑坍塌', fire: '火災', 'gas-explosion': '氣爆',
  storm: '風災', other: '重大事件',
};

/** 合法 eventType 集合（P2 用來丟棄 LLM 亂回的類型）。 */
export const VALID_EVENT_TYPES = new Set(Object.keys(TYPE_LABEL));

/** 類型標籤查表；未登記的類型退回「重大事件」。 */
export const typeLabel = (eventType) => TYPE_LABEL[eventType] ?? '重大事件';

/** 去掉 script/style/標籤/實體，留下可供關鍵詞比對的純文字（不做正規化，接 normText）。 */
export function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
}

/** 比對用正規化：小寫、去所有空白（含全形）、去中英文標點。 */
export const normText = (s) => String(s || '').toLowerCase()
  .replace(/[\s　]+/g, '').replace(/[，,、。.；;：:「」『』（）()\-—－]/g, '');

/**
 * 全形標點機械保底：緊鄰中文字的半形逗號／分號轉全形。
 * 由來 2026-07-19 墨西哥頁事故——prompt 寫了「禁半形逗號句號」，claude 偶爾仍吐半形。
 * 刻意只碰逗號與分號：英文語境（「Madero, Mexico」）左側是拉丁字母故不動；
 * **不碰句號**，免誤傷「7.3」這種小數。
 */
export const zh = (s) => typeof s === 'string'
  ? s.replace(/([一-鿿])\s*,/g, '$1，').replace(/([一-鿿])\s*;/g, '$1；')
  : s;
