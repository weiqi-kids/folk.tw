// 一張已建置的 HTML 產物頁：**吃 dist 的 gate 家族共用的唯一 HTML 讀解層**。
//
// 🔴 這支存在的理由（2026-08-20 抽出）：`Page` 原本是 invariant-runner.mjs 裡的私有類別，
//    它的檔頭誇口「把重複讀 4~5 次的走訪合併成一次」——但那個合併停在它自己的模組邊界上。
//    邊界外還有四支同樣吃 dist 的 gate 各自剖析 HTML：
//      · check-canonical-links.mjs   · check-anchor-text.mjs
//      · check-discover-coverage.mjs · check-content-quality.mjs
//    「同一個欄位有幾種讀法」不是風格問題，而是 gate 會不會誤放行的問題——見下面那條
//    實測到的 description 差異：同一批 dist、同一個欄位，兩種讀法差 4 頁。
//
// ── 這支負責什麼、不負責什麼 ─────────────────────────────────────────────
//  ✅ 負責：把 HTML 讀成欄位（title／description／meta／canonical／section／anchors／
//     可見文字／h1／img／JSON-LD @type），lazy + 快取，一頁只剖析一次。
//  ⛔ 不負責：**判準**。什麼算違規（括號要不要成對、幾種括號、http 怎麼認、報告截幾條）
//     留在各 gate 自己身上。抽這一層的目的是共用「怎麼讀」，不是偷偷統一「怎麼判」——
//     統一判準會改變 gate 的鬆緊度，那是要由人決定的事，不是重構的副作用。
//
// ── 🔴 已知且**刻意保留**的讀法差異（2026-08-20 實測，勿順手「統一」）────────
//  `description()`（字面屬性擷取）與 `meta('name','description')`（先切 `<meta …>` 標籤再讀屬性）
//  在 4 個廟頁上不一致：那些頁的 description 內文含**未跳脫的角括號**（例「<台南州祠廟名鑑詳記>」），
//  `<meta\b[^>]*>` 會在內文那個 `>` 提早收尾 → 標籤法讀到的字串被截短（實測 140→70、
//  115→46、125→37、129→53 字）。四頁：dist/temples/moi_{1776,1911,4605,5979}_*/index.html。
//  兩種讀法各有既有消費者（runner／check-content-quality 用字面法；check-discover 用標籤法），
//  所以**兩個方法都保留**、名字不同、差異寫在這裡，等人決定要不要收斂成一種。
//
// ── 靜默失效的機械防線（沿用 runner 原有機制）────────────────────────────
//  `section('temple-qifu')` 打錯一個字，那條不變量就永遠通過而 CI 全綠。所以 section()
//  會把每個名字的命中／落空記進外部傳入的 sectionStats，由 runner 統計後擋下。
import { readFileSync } from 'node:fs';

/** HTML entity 還原：只還原站上產物實際會出現的那幾個。 */
export function decode(value) {
  return String(value ?? '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'");
}

/** 一段 HTML → 可見文字：去 script/style、去標籤、去零寬字元、收斂空白。 */
export function visibleText(html) {
  return decode(String(html ?? ''))
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[\u200b-\u200d\ufeff]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** 從一個標籤字串讀屬性值（屬性順序無關、名稱大小寫無關）。 */
export function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(tag ?? '').match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)`, 'i'))?.[1] ?? '';
}

export class Page {
  /**
   * @param {string} file  產物路徑（如 `dist/temples/x/index.html`）
   * @param {string} html  該檔全文
   * @param {{sectionStats?: Map<string, {hit:number, miss:number}>}} [options]
   *        sectionStats：跨頁共享的 section 命中統計（runner 用來擋「選擇器打錯」）。
   */
  constructor(file, html, options = {}) {
    this.file = file;
    this.html = html;
    this._sectionStats = options.sectionStats ?? new Map();
    this._sections = new Map();
    this._cache = new Map();
    this._metaTags = undefined;
  }

  /** 讀檔並建一頁。走訪型 gate 用這個；runner 走 ctx.read（它另有讀取計數）。 */
  static load(file, options = {}) {
    return new Page(file, readFileSync(file, 'utf8'), options);
  }

  /** `dist/temples/x/index.html` → `/temples/x/index.html` */
  get route() { return this.file.slice('dist'.length) || '/'; }

  /** lazy 快取的共同入口：同一頁同一欄位只算一次。 */
  _memo(key, compute) {
    if (!this._cache.has(key)) this._cache.set(key, compute());
    return this._cache.get(key);
  }

  /** `<title>` 的原始內文（不 decode、不 trim——各 gate 自己決定要不要）。 */
  title() {
    return this._memo('title', () => this.html.match(/<title>([\s\S]*?)<\/title>/iu)?.[1] ?? '');
  }

  /**
   * meta description 的**字面屬性擷取**：`content="…"` 直到收尾引號。
   * ⚠️ 與 `meta('name','description')` 在 4 頁上不同，見檔頭。
   */
  description() {
    return this._memo('description', () =>
      this.html.match(/<meta\s+name="description"\s+content="([^"]*)"/iu)?.[1] ?? '');
  }

  /** 全頁的 `<meta …>` 標籤（切一次，之後所有 meta() 查詢共用）。 */
  _tags() {
    if (this._metaTags === undefined) this._metaTags = this.html.match(/<meta\b[^>]*>/gi) ?? [];
    return this._metaTags;
  }

  /** 第一個 `[key] === value`（大小寫無關）的 `<meta>` 的 content；查無回 ''。 */
  meta(key, value) {
    return this._memo(`meta:${key}=${value}`, () => {
      const wanted = String(value).toLowerCase();
      const tag = this._tags().find((t) => attr(t, key).toLowerCase() === wanted);
      return tag ? attr(tag, 'content') : '';
    });
  }

  /** 第一個 `<link rel="…canonical…">` 的 href；查無回 ''。 */
  canonical() {
    return this._memo('canonical', () => {
      const tag = this.html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/iu)?.[0] ?? '';
      return attr(tag, 'href');
    });
  }

  /**
   * 切出 `<section class="name" …>…</section>` 的內文；找不到回 undefined。
   * 🔴 有區塊就**不准**退回全頁 includes：nav／頁尾每頁都渲染一堆連結，
   *    全頁比對會讓雙向的「不應出現」那半邊恆為真＝gate 靜默失效。
   */
  section(name) {
    if (this._sections.has(name)) return this._sections.get(name);
    const found = this.html.match(new RegExp(`<section class="${name}"[^>]*>([\\s\\S]*?)</section>`))?.[1];
    this._sections.set(name, found);
    const stat = this._sectionStats.get(name) ?? { hit: 0, miss: 0 };
    if (found === undefined) stat.miss += 1; else stat.hit += 1;
    this._sectionStats.set(name, stat);
    return found;
  }

  /** `<main>` 的原始內文；沒有 `<main>` 回 ''。 */
  main() {
    return this._memo('main', () => this.html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu)?.[1] ?? '');
  }

  /** 全頁可見文字。 */
  text() { return this._memo('text', () => visibleText(this.html)); }

  /** `<main>` 內的可見文字（正文薄厚就是量這個，不含 nav／頁尾）。 */
  mainText() { return this._memo('mainText', () => visibleText(this.main())); }

  /**
   * 全頁的 `<a>`：`{ inner, text }`。
   * text ＝ 去巢狀標籤、收斂空白、trim 後的**可見文字**。
   * ⚠️ 刻意**不** decode entity：現有 check:anchor-text 的判準是對原字串跑的，
   *    decode 會改變它的鬆緊度（`&lt;http…` 之類），那是判準決定、不是讀法決定。
   */
  anchors() {
    return this._memo('anchors', () => {
      const out = [];
      for (const m of this.html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
        out.push({ inner: m[1], text: m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() });
      }
      return out;
    });
  }

  /** 全頁第一個 `<h1>` 的文字（去標籤、trim）；沒有回 ''。 */
  h1() {
    return this._memo('h1', () =>
      this.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1]?.replace(/<[^>]+>/gu, '').trim() ?? '');
  }

  /** `<main>` 內的 `<h1>` 個數（收錄衛生看的是正文那一個，不是版型裡的）。 */
  mainH1Count() { return this._memo('mainH1Count', () => (this.main().match(/<h1\b/giu) ?? []).length); }

  /** `<main>` 內的 `<img …>` 標籤原文。 */
  mainImages() { return this._memo('mainImages', () => this.main().match(/<img\b[^>]*>/giu) ?? []); }

  /** 全頁 JSON-LD 裡出現過的 `@type`（去重、排序）；解析不了的區塊略過。 */
  jsonLdTypes() {
    return this._memo('jsonLdTypes', () => {
      const types = [];
      const blocks = this.html.matchAll(
        /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu,
      );
      for (const match of blocks) {
        try {
          const visit = (node) => {
            if (!node) return;
            if (Array.isArray(node)) return node.forEach(visit);
            if (typeof node !== 'object') return;
            if (node['@type']) {
              const list = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
              types.push(...list.map(String));
            }
            if (node['@graph']) visit(node['@graph']);
          };
          visit(JSON.parse(match[1]));
        } catch {
          // JSON-LD 語法由別的 gate 驗；這裡只需要讀得懂的那些 @type。
        }
      }
      return [...new Set(types)].sort();
    });
  }
}

export default Page;
