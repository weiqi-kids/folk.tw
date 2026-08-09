// 節日行事曆連結的共用格式器。
// 日期只接受 festivals 頁面透過 festivalNextSolar() 算出的 ISO 日；這裡不做農曆換算，
// 避免 Google Calendar、ICS 與頁面顯示各走一套日期規則。

type FestivalCalendarInput = {
  slug: string;
  name: string;
  lead: string;
  date_note?: string;
};

const SITE_ORIGIN = 'https://folk.tw';

export function compactCalendarDate(iso: string): string {
  return iso.replaceAll('-', '');
}

export function nextCalendarDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function calendarDescription(festival: FestivalCalendarInput, lunarLabel: string): string {
  const note = festival.date_note ? `\n日期說明：${festival.date_note}` : '';
  return `${festival.name}（${lunarLabel}）\n${festival.lead}${note}\n詳情：${SITE_ORIGIN}/festivals/${festival.slug}/`;
}

export function googleCalendarUrl(
  festival: FestivalCalendarInput,
  iso: string,
  lunarLabel: string,
): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: festival.name,
    dates: `${compactCalendarDate(iso)}/${compactCalendarDate(nextCalendarDay(iso))}`,
    details: calendarDescription(festival, lunarLabel),
    ctz: 'Asia/Taipei',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcs(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}

// RFC 5545 建議每行不超過 75 octets；逐字元計算 UTF-8 bytes，避免切壞中文字。
function foldIcsLine(line: string): string[] {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = '';
  let limit = 73;
  for (const char of line) {
    if (encoder.encode(current + char).length > limit && current) {
      folded.push(current);
      current = ` ${char}`;
      limit = 74;
    } else {
      current += char;
    }
  }
  folded.push(current);
  return folded;
}

export function festivalIcs(
  festival: FestivalCalendarInput,
  iso: string,
  lunarLabel: string,
): string {
  const start = compactCalendarDate(iso);
  const end = compactCalendarDate(nextCalendarDay(iso));
  const canonical = `${SITE_ORIGIN}/festivals/${festival.slug}/`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//folk.tw//Festival Reminder//ZH-HANT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${festival.slug}-${start}@folk.tw`,
    `DTSTAMP:${start}T000000Z`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcs(festival.name)}`,
    `DESCRIPTION:${escapeIcs(calendarDescription(festival, lunarLabel))}`,
    `URL:${canonical}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.flatMap(foldIcsLine).join('\r\n')}\r\n`;
}
