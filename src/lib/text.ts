const TRAILING_PUNCTUATION = /[。！？!?；;，,、：:\s]+$/u;

/** Remove one or more pairs of wrapping parentheses without touching inner text. */
export function stripOuterParens(value: string): string {
  let text = value.trim();
  while ((text.startsWith('（') && text.endsWith('）')) || (text.startsWith('(') && text.endsWith(')'))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

/** Remove punctuation only from the end of a sentence fragment. */
export function withoutTerminalPunctuation(value: string): string {
  return value.trim().replace(TRAILING_PUNCTUATION, '');
}

/**
 * Build a bounded excerpt while preferring a real sentence/phrase boundary.
 * This avoids slicing Latin words or leaving a Chinese clause visibly unfinished.
 */
export function excerptAtBoundary(value: string, maxLength: number): string {
  const text = value.replace(/\s+/gu, ' ').trim();
  if (text.length <= maxLength) return text;

  const head = text.slice(0, maxLength + 1);
  const minimum = Math.floor(maxLength * 0.55);
  let boundary = -1;
  for (const match of head.matchAll(/[。！？!?；;]/gu)) {
    if ((match.index ?? -1) >= minimum && (match.index ?? 0) < maxLength) boundary = (match.index ?? 0) + 1;
  }
  if (boundary > 0) return head.slice(0, boundary).trim();

  const contentLimit = Math.max(1, maxLength - 1);
  const wordBoundary = head.lastIndexOf(' ', contentLimit);
  const cut = wordBoundary >= minimum ? wordBoundary : contentLimit;
  return `${withoutTerminalPunctuation(head.slice(0, cut))}…`;
}
