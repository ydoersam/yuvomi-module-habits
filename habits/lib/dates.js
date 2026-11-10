/**
 * Small date helpers, kept here because since Yuvomi 2.88 a module may import
 * only /api.js, /i18n.js and /utils/html.js. Day keys are 'YYYY-MM-DD' in the
 * browser's time zone.
 */

const pad = (n) => String(n).padStart(2, '0');

export function toLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayKey = () => toLocalDateKey(new Date());

/** The calendar day of a timestamp such as a completion's `completed_at`. */
export const zonedDateKey = (value) => toLocalDateKey(value);

export function parseLocalDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addLocalDays(dateKey, days) {
  const date = parseLocalDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

export function startOfLocalWeekKey(dateKey, weekStartsOn = 1) {
  const date = parseLocalDateKey(dateKey);
  date.setDate(date.getDate() - ((date.getDay() - weekStartsOn + 7) % 7));
  return toLocalDateKey(date);
}

const WEEK_START_INDEX = { monday: 1, sunday: 0, saturday: 6 };
export const weekStartIndex = (value) => WEEK_START_INDEX[value] ?? 1;
