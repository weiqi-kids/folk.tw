import reviewed from '../data/poem-locales.reviewed.json' with { type: 'json' };
export const POEM_LOCALE_OPTIONS = [
  { code: 'ja', flag: '🇯🇵', label: '日本語' },
  { code: 'ko', flag: '🇰🇷', label: '한국어' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' },
  { code: 'th', flag: '🇹🇭', label: 'ไทย' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'id', flag: '🇮🇩', label: 'Bahasa Indonesia' },
] as const;

export type PoemLocaleCode = (typeof POEM_LOCALE_OPTIONS)[number]['code'];

type LocaleEntry = {
  sourceId: string;
  system: string;
  kind: 'literary' | 'medicine';
  form: string;
  lines: string[];
  status: string;
  safetyLink?: string;
};

type ReviewedPayload = {
  languages: Record<string, Record<string, LocaleEntry[]>>;
};

const payload = reviewed as ReviewedPayload;

export type PoemLocaleView = LocaleEntry & {
  code: PoemLocaleCode;
  flag: string;
  label: string;
};

/** Return the reviewed literary version for one source poem or medicine slip. */
export function getPoemLocaleViews(system: string, sourceId: string): PoemLocaleView[] {
  return POEM_LOCALE_OPTIONS.flatMap((option) => {
    const entry = payload.languages[option.code]?.[system]?.find((item) => item.sourceId === sourceId);
    return entry ? [{ ...entry, ...option }] : [];
  });
}
