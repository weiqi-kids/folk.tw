// 來源標註渲染輔助：資料層的 `source.ref` 常把網址直接接在名稱後面
// （例「內政部全國宗教資訊網·天上聖母(Mazu) https://religion.moi.gov.tw/…」）。
// 舊渲染 `sources.map(s => s.ref).join('；')` 會讓整串裸露網址；此處把網址抽出來，
// 名稱當錨文字、網址進 href，交由 <Sources> 元件統一輸出（見 src/components/Sources.astro）。

export interface SourceRef {
  ref: string;
  url?: string;
}

export interface ParsedSource {
  label: string;
  url: string | null;
}

// 抓 ref 內第一個網址；名稱＝去掉網址後的其餘文字。URL 尾端常見的中/英標點不算網址一部分。
const URL_RE = /https?:\/\/\S+/;
const TRAIL_PUNCT = /[)\]）」』】。，、；,.;]+$/;

export function parseSourceRef(s: SourceRef): ParsedSource {
  // 資料若已有獨立 url 欄位（如 topical 祈福來源），直接用它、ref 當文字。
  if (s.url) {
    const label = s.ref.replace(URL_RE, '').replace(/\s+/g, ' ').trim();
    return { label: label || s.url, url: s.url };
  }
  const m = s.ref.match(URL_RE);
  if (!m) return { label: s.ref.trim(), url: null };
  const url = m[0].replace(TRAIL_PUNCT, '');
  const label = (s.ref.slice(0, m.index) + s.ref.slice(m.index! + m[0].length))
    .replace(/\s+/g, ' ')
    .trim();
  return { label: label || url, url };
}
