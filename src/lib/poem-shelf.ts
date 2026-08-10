export type PoemShelfItem = {
  id: string;
  title: string;
  system: string;
  href: string;
  touchedAt: number;
};

const SAVED_KEY = 'folk_poem_saved_v1';
const RECENT_KEY = 'folk_poem_recent_v1';
export const MAX_SAVED_POEMS = 12;
export const MAX_RECENT_POEMS = 8;

function validItem(value: unknown): value is PoemShelfItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PoemShelfItem>;
  return typeof item.id === 'string'
    && /^[a-z0-9_-]+$/.test(item.id)
    && typeof item.title === 'string'
    && item.title.length > 0
    && item.title.length <= 160
    && typeof item.system === 'string'
    && item.system.length <= 80
    && item.href === `/poems/${item.id}/`
    && typeof item.touchedAt === 'number'
    && Number.isFinite(item.touchedAt);
}

function read(key: string): PoemShelfItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter(validItem) : [];
  } catch {
    return [];
  }
}

function write(key: string, items: PoemShelfItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // 無痕模式、儲存空間已滿時維持頁面可用；不把資料送到其他地方。
  }
}

function normalize(item: Omit<PoemShelfItem, 'touchedAt'>): PoemShelfItem {
  return { ...item, touchedAt: Date.now() };
}

export function listSavedPoems() {
  return read(SAVED_KEY);
}

export function listRecentPoems() {
  return read(RECENT_KEY);
}

export function isPoemSaved(id: string) {
  return read(SAVED_KEY).some((item) => item.id === id);
}

export function toggleSavedPoem(item: Omit<PoemShelfItem, 'touchedAt'>) {
  const saved = read(SAVED_KEY);
  const exists = saved.some((row) => row.id === item.id);
  const next = exists
    ? saved.filter((row) => row.id !== item.id)
    : [normalize(item), ...saved.filter((row) => row.id !== item.id)].slice(0, MAX_SAVED_POEMS);
  write(SAVED_KEY, next);
  return !exists;
}

export function rememberPoem(item: Omit<PoemShelfItem, 'touchedAt'>) {
  const next = [normalize(item), ...read(RECENT_KEY).filter((row) => row.id !== item.id)]
    .slice(0, MAX_RECENT_POEMS);
  write(RECENT_KEY, next);
}

export function emitPoemEvent(name: 'save_poem' | 'unsave_poem' | 'revisit_saved_poem', poemId: string, source: string) {
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === 'function') gtag('event', name, { poem_id: poemId, source });
}
