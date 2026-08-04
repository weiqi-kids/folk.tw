// 來源標註渲染輔助：資料層的 `source.ref` 常把網址直接接在名稱後面
// （例「內政部全國宗教資訊網·天上聖母(Mazu) https://religion.moi.gov.tw/…」）。
// 舊渲染 `sources.map(s => s.ref).join('；')` 會讓整串裸露網址；此處把網址抽出來，
// 名稱當錨文字、網址進 href，交由 <Sources> 元件統一輸出（見 src/components/Sources.astro）。
//
// 🔴 2026-08-04：`ref` 是**純網址**（名稱寫在 `note`）時，原本 `label || url` 會退回網址本身，
// 於是 131 個頁面的「來源：」整段是裸露網址（/poems 100、/practices 12、/festivals 10、
// /deities 5、/events 3、/vocabulary 1），使用者看到的是
// 「來源：https://www.th.gov.tw/Epaper_Content/238/5723/；https://zh.wikipedia.org/…」
// 而不是來源單位名稱。全站 313 筆純網址 ref **每一筆都有 note**，名稱一直都在，
// 只是解析器從來沒讀它。修法＝ref 取不出名稱時改用 note。
// 硬 gate＝`pnpm check:anchor-text`（錨文字不得含 http），已串進 CI。

export interface SourceRef {
  ref: string;
  /** 來源說明；`ref` 為純網址時，錨文字取自這裡。 */
  note?: string;
  url?: string;
}

export interface ParsedSource {
  label: string;
  url: string | null;
}

// 抓 ref 內第一個網址；名稱＝去掉網址後的其餘文字。URL 尾端常見的中/英標點不算網址一部分。
// ⚠️ 終止字元要含**全形標點**：資料裡有「URL（說明）」這種網址後面直接接全形括號、中間無空格的寫法
//    （events 的 polyline_source）。若只用 \S+ 會把「（大甲媽祖即時衛星定位服務…」一起吃進網址，
//    產生點不開的 href（2026-08-04 線上實測 3 個活動頁的即時軌跡連結都是死的）。
const URL_CHARS = String.raw`[^\s（）()「」『』【】〔〕，、；。？！]`;
const URL_RE = new RegExp(`https?://${URL_CHARS}+`);
const URL_RE_G = new RegExp(`https?://(${URL_CHARS}+)`, 'g');
const TRAIL_PUNCT = /[)\]）」』】。，、；,.;]+$/;
/** 前後成對的全形／半形括號當標籤時是雜訊（「（說明）」→「說明」）。 */
const WRAP_PARENS = /^[（(]([\s\S]*)[）)]$/;

/** 錨文字長度上限（全形字）。超過就退到「：」前的機構／條目名，再不行才截字。 */
const LABEL_MAX = 40;
const fullWidth = (s: string) => [...s].reduce((n, c) => n + (/[\x00-\xff]/.test(c) ? 0.5 : 1), 0);

function clamp(s: string, max: number): string {
  if (fullWidth(s) <= max) return s;
  let out = '';
  for (const c of s) {
    if (fullWidth(out + c) > max - 1) break;
    out += c;
  }
  return `${out}…`;
}

/**
 * 由 note 產生錨文字。
 * - 整段夠短就直接用（「拜出好運來：安太歲完整流程」＝12 全形字，切掉冒號後半反而丟失條目名）。
 * - 太長才取「：」前那段（慣例寫法「機構〈條目〉：內容…」），仍太長才截字。
 * - 「同上」這類相對指涉當不了標籤，回 null 交給呼叫端退到網域名。
 */
function labelFromNote(note?: string): string | null {
  const n = (note ?? '').replace(/\s+/g, ' ').trim();
  if (!n || /^(同上|同前|見上|同前註)$/.test(n)) return null;
  if (fullWidth(n) <= LABEL_MAX) return n;
  const head = n.split(/[：:]/)[0].trim();
  if (head && fullWidth(head) <= LABEL_MAX) return head;
  return clamp(n, LABEL_MAX);
}

/** 最後手段：拿網域當標籤（去掉 www.）。永遠不含 "http"，故不會再退回裸網址。 */
function labelFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '來源連結';
  }
}

/**
 * 標籤清理：去掉外層成對括號，並把**殘留的第二個以後的網址**換成網域名。
 * 後者是實例驅動的——xigang 的 polyline_source 說明裡還寫著另一個網址
 * （「2021辛丑科為 https://pro.godroad.tw/E210501/」），抽掉第一個網址後它仍留在標籤裡，
 * 錨文字就還是含 http。換成網域名可讀且不失資訊。
 */
function cleanLabel(s: string): string {
  let out = s.replace(/\s+/g, ' ').trim();
  // 整段被一對括號包住才拆（內層還有括號就不動，避免拆錯配對）。
  const wrapped = out.match(WRAP_PARENS);
  if (wrapped && !/[（(]/.test(wrapped[1])) out = wrapped[1].trim();
  out = out.replace(URL_RE_G, (_m, rest: string) => {
    const host = String(rest).split('/')[0];
    return host.replace(/^www\./, '');
  });
  // 抽掉網址後可能留下空括號：「文化部國家文化資產網（https://…）」→「…（）」。
  out = out.replace(/[（(]\s*[）)]/g, '').trim();
  // ⚠️ 尾端只清**分隔用**標點。**不可**連收括號一起清——`TRAIL_PUNCT` 含「）」，
  // 用在 label 上會把「台灣民間信仰（行業神）」削成「台灣民間信仰（行業神」，
  // 全站數十筆合法的括號註記都會變成沒配對（2026-08-04 我自己引入過這個回歸，實測抓到）。
  out = out.replace(/[。，、；,.;]+$/g, '').trim();
  // 只有在括號真的不成對、且落單的開括號剛好在尾端時才拿掉它。
  const opens = (out.match(/[（(]/g) ?? []).length;
  const closes = (out.match(/[）)]/g) ?? []).length;
  if (opens > closes && /[（(]$/.test(out)) out = out.replace(/[（(]$/, '').trim();
  return out.replace(/\s+/g, ' ').trim();
}

export function parseSourceRef(s: SourceRef): ParsedSource {
  // 資料若已有獨立 url 欄位（如 topical 祈福來源），直接用它、ref 當文字。
  if (s.url) {
    const label = s.ref.replace(URL_RE, '').replace(/\s+/g, ' ').trim();
    return { label: label || labelFromNote(s.note) || labelFromUrl(s.url), url: s.url };
  }
  const m = s.ref.match(URL_RE);
  if (!m) return { label: cleanLabel(s.ref), url: null };
  const url = m[0].replace(TRAIL_PUNCT, '');
  const label = cleanLabel(s.ref.slice(0, m.index) + s.ref.slice(m.index! + m[0].length));
  return { label: label || labelFromNote(s.note) || labelFromUrl(url), url };
}
