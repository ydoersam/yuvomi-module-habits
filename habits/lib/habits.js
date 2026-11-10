/**
 * Habits: shared data + rendering for the module page and the dashboard widget.
 *
 * A habit is an ordinary task from the Tasks module whose category is one of
 * the categories chosen in the module's settings (default: "habit"). All data
 * is read and written through /api/v1/tasks; this module owns none of its own.
 *
 * WHEN CAN A HABIT BE TICKED? That comes from the task's recurrence rule, not
 * from tags:
 *   - daily rule                -> every day is its own cell
 *   - weekly, ONE weekday       -> only that weekday is clickable
 *   - weekly, SEVERAL weekdays  -> each occurrence is clickable from its day
 *                                  until the day before the next occurrence
 *                                  (Mon/Wed/Fri = Mon-Tue, Wed-Thu, Fri-Sun);
 *                                  ticking any day of the window marks the
 *                                  whole window done
 *   - anything else             -> clickable from the due date until done
 *
 * HISTORY comes from GET /tasks/completions, matched to a row by series id.
 * Only today's cell is interactive because a completion is always stamped
 * with the moment it is made.
 */

import { api } from '/api.js';
import { t, getLocale, getWeekStart } from '/i18n.js';
import {
  todayKey, addLocalDays, startOfLocalWeekKey, parseLocalDateKey, weekStartIndex, zonedDateKey,
} from './dates.js';
import { el, checkIcon } from './dom.js';
import { makeReorderable } from './reorder.js';
import { loadCategoryKeys, loadOrder, saveOrder, normalizeOrder, fetchCategories } from './settings.js';

const MAX_COMPLETION_PAGES = 6;
const SETTINGS_ROUTE = '/settings/modules/ext/habits';
const k = (key) => `extensions.habits.${key}`;
const BYDAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const seriesKey = (task) => String(task.recurrence_series_id ?? task.id);
const mod = (a, n) => ((a % n) + n) % n;
const weekdayOf = (dayKey) => parseLocalDateKey(dayKey).getDay();
const dayDiff = (a, b) => Math.round((parseLocalDateKey(a) - parseLocalDateKey(b)) / 86400000);

/** Category keys from a widget's options, or null if the option is not set. */
export function orderFromOptions(options) {
  return Array.isArray(options?.order) ? normalizeOrder(options.order) : null;
}

export function categoriesFromOptions(options) {
  if (!Array.isArray(options?.categories)) return null;
  return options.categories.filter((key) => typeof key === 'string' && key !== '');
}

/** The seven day keys of the current week, in the user's week-start order. */
export function currentWeek(today = todayKey()) {
  const start = startOfLocalWeekKey(today, weekStartIndex(getWeekStart()));
  return Array.from({ length: 7 }, (_, i) => addLocalDays(start, i));
}

// ---------------------------------------------------------------- rules

function parseRule(rule) {
  const out = { freq: '', interval: 1, byday: [] };
  if (!rule) return out;
  for (const part of String(rule).replace(/^RRULE:/i, '').split(';')) {
    const [key, val = ''] = part.split('=');
    const name = key.toUpperCase();
    if (name === 'FREQ') out.freq = val.toUpperCase();
    else if (name === 'INTERVAL') out.interval = parseInt(val, 10) || 1;
    else if (name === 'BYDAY') {
      out.byday = [...new Set(val.split(',')
        .map((d) => BYDAY_INDEX[d.trim().slice(-2).toUpperCase()])
        .filter((n) => Number.isInteger(n)))];
    }
  }
  return out;
}

/**
 * Returns a function day -> window key. Days that share a key are one window
 * (one click covers them all); null means "not a day for this habit".
 */
export function makeWindowKeyOf(rule, due) {
  const r = parseRule(rule);

  // Not recurring, or a rule shape we do not model (monthly, yearly): open from
  // the due date until it is done.
  const openFromDue = (day) => (!due || day >= due ? (due || 'open') : null);
  if (!r.freq || (r.freq !== 'DAILY' && r.freq !== 'WEEKLY')) return openFromDue;

  if (r.freq === 'DAILY') {
    return (day) => {
      if (r.byday.length && !r.byday.includes(weekdayOf(day))) return null;
      if (r.interval > 1 && due && mod(dayDiff(day, due), r.interval) !== 0) return null;
      return day;
    };
  }

  // WEEKLY. Without BYDAY the rule repeats on the weekday of the due date.
  const weekdays = r.byday.length ? r.byday : (due ? [weekdayOf(due)] : []);
  if (!weekdays.length) return openFromDue;

  if (weekdays.length === 1 || r.interval > 1) {
    // One day per occurrence: clickable on that day only.
    return (day) => {
      if (!weekdays.includes(weekdayOf(day))) return null;
      if (r.interval > 1 && due) {
        const weeks = Math.round(dayDiff(startOfLocalWeekKey(day, 1), startOfLocalWeekKey(due, 1)) / 7);
        if (mod(weeks, r.interval) !== 0) return null;
      }
      return day;
    };
  }

  // Several weekdays: a window runs from an occurrence to the day before the
  // next one. Its key is the day it starts.
  return (day) => {
    for (let back = 0; back < 7; back += 1) {
      const candidate = addLocalDays(day, -back);
      if (weekdays.includes(weekdayOf(candidate))) return candidate;
    }
    return null;
  };
}

// ----------------------------------------------------------------- data

async function fetchCompletionDays(meId, oldestDay, signal) {
  const bySeries = new Map(); // seriesKey -> Map(dayKey -> taskId)
  let cursor = '';
  for (let page = 0; page < MAX_COMPLETION_PAGES; page += 1) {
    const res = await api.get(`/tasks/completions?user_id=${meId}&limit=200${cursor}`, { signal });
    let reachedOlder = false;
    for (const c of res?.data ?? []) {
      const day = zonedDateKey(c.completed_at);
      if (!day) continue;
      if (day < oldestDay) { reachedOlder = true; continue; }
      const key = c.series_id ?? c.task_id;
      if (!bySeries.has(key)) bySeries.set(key, new Map());
      bySeries.get(key).set(day, c.task_id);
    }
    if (!res?.has_more || reachedOlder || !res.next_cursor) break;
    cursor = `&before_at=${encodeURIComponent(res.next_cursor.before_at)}&before_id=${encodeURIComponent(res.next_cursor.before_id)}`;
  }
  return bySeries;
}

function buildRow(task, doneDays, today, { finished = false } = {}) {
  const due = task.due_date || null;
  const rule = task.is_recurring ? task.recurrence_rule : null;
  const windowKeyOf = makeWindowKeyOf(rule, due);
  // A completion outside any window (an old rule, a manual edit) still shows,
  // as a window of its own.
  const keyFor = (day) => windowKeyOf(day) ?? (doneDays.has(day) ? `done:${day}` : null);

  const doneKeys = new Set();
  for (const day of doneDays.keys()) {
    const key = keyFor(day);
    if (key) doneKeys.add(key);
  }

  const todayKeyOfWindow = windowKeyOf(today);
  const doneNow = doneDays.has(today) || (todayKeyOfWindow !== null && doneKeys.has(todayKeyOfWindow));
  return {
    seriesKey: seriesKey(task),
    taskId: task.id,
    title: task.title,
    due,
    doneDays,
    doneKeys,
    keyFor,
    // A finished instance (no open follow-up exists) is shown but never ticked.
    canTick: !finished && todayKeyOfWindow !== null && !doneNow && (!due || due <= today),
    // Where today's window begins; a late instance is moved here before it is
    // completed, so the next occurrence is calculated from the right place.
    windowStart: /^\d{4}-\d{2}-\d{2}$/.test(todayKeyOfWindow ?? '') ? todayKeyOfWindow : today,
  };
}

/**
 * Loads everything the matrix needs.
 * @returns {Promise<{ today: string, days: string[], rows: object[] }>}
 */
export async function loadWeek({ categories, order = [], user, signal }) {
  const today = todayKey();
  const days = currentWeek(today);
  if (!categories.length) return { today, days, rows: [] };

  const meId = user?.id ?? (await api.get('/auth/me', { signal }))?.user?.id;
  const query = new URLSearchParams();
  categories.forEach((key) => query.append('category', key));
  query.append('status', 'open');
  query.append('status', 'in_progress');
  // Without this Tasks hides a task whose next instance starts later, which is
  // exactly what a habit looks like right after it is ticked: it would vanish.
  query.append('include_future', '1');

  // One week back, so a window that began last week (Fri-Sun, say) is known to
  // be done when this week starts.
  const [tasksRes, completions] = await Promise.all([
    api.get(`/tasks?${query}`, { signal }),
    fetchCompletionDays(meId, addLocalDays(days[0], -7), signal),
  ]);

  const openTasks = (tasksRes?.data ?? []);
  const rows = openTasks
    .filter((task) => {
      const people = task.assigned_users ?? [];
      return people.length === 0 || people.some((p) => p.id === meId);
    })
    .map((task) => buildRow(task, completions.get(task.recurrence_series_id ?? task.id) ?? new Map(), today))
    ;

  // Habits with NO open instance left (the follow-up went to someone else by
  // rotation, the series ended, a one-off task) would vanish the moment they
  // are done. Bring back every series I completed in the shown weeks: look up
  // its last completed task, and keep it if it is in a habit category.
  const known = new Set(rows.map((row) => row.seriesKey));
  const missing = [...completions.entries()]
    .filter(([key]) => !known.has(String(key)))
    .map(([key, byDay]) => {
      const latestDay = [...byDay.keys()].sort().pop();
      return { key: String(key), taskId: byDay.get(latestDay), byDay };
    });
  const finished = await Promise.all(missing.map(async ({ key, taskId, byDay }) => {
    try {
      const task = (await api.get(`/tasks/${taskId}`, { signal }))?.data;
      if (!task || task.archived_at || !categories.includes(task.category)) return null;
      return buildRow({ ...task, recurrence_series_id: task.recurrence_series_id ?? key }, byDay, today, { finished: true });
    } catch { return null; }
  }));
  rows.push(...finished.filter(Boolean));

  rows.sort((a, b) => {
      const ia = order.indexOf(a.seriesKey);
      const ib = order.indexOf(b.seriesKey);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib) || 0;
      return a.title.localeCompare(b.title, getLocale());
    });

  return { today, days, rows };
}

// ------------------------------------------------------------ rendering

function dayHeader(dayKey, today) {
  const date = parseLocalDateKey(dayKey);
  const isToday = dayKey === today;
  return el('th', { scope: 'col', class: `habits-day${isToday ? ' habits-day--today' : ''}`, 'aria-current': isToday ? 'date' : null },
    el('span', { class: 'habits-day__name' }, new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(date)),
    el('span', { class: 'habits-day__num' }, String(date.getDate())));
}

const mark = (variant, label) => el('span', {
  class: `habits-mark habits-mark--${variant}`,
  role: label ? 'img' : null,
  'aria-label': label ?? null,
  'aria-hidden': label ? null : 'true',
}, variant === 'done' ? checkIcon() : null);

/** One cell for a run of days that share a window. */
function windowCell(row, key, runDays, today) {
  const containsToday = runDays.includes(today);
  const done = row.doneKeys.has(key);
  const cell = el('td', {
    class: `habits-cell${containsToday ? ' habits-cell--today' : ''}`,
    colspan: runDays.length > 1 ? runDays.length : null,
  });

  if (containsToday && row.doneDays.has(today)) {
    cell.append(el('button', {
      type: 'button',
      class: 'habits-check habits-check--done',
      'aria-pressed': 'true',
      'aria-label': t(k('undo'), { title: row.title }),
      dataset: { habitUndo: row.doneDays.get(today) },
    }, checkIcon()));
  } else if (done) {
    cell.append(mark('done', t(k('done_on'), { title: row.title })));
  } else if (containsToday && row.canTick) {
    cell.append(el('button', {
      type: 'button',
      class: 'habits-check',
      'aria-pressed': 'false',
      'aria-label': t(k('tick'), { title: row.title }),
      dataset: { habitDone: row.taskId },
    }));
  } else if (containsToday) {
    cell.append(mark('off', t(k('not_due'), { title: row.title })));
  } else if (runDays.every((day) => day < today)) {
    cell.append(mark('missed', t(k('missed'), { title: row.title })));
  } else {
    cell.append(mark('upcoming'));
  }
  return cell;
}

/** Day cells of one row; days of one window merge into a single cell. */
function rowCells(row, days, today) {
  const cells = [];
  let i = 0;
  while (i < days.length) {
    const key = row.keyFor(days[i]);
    if (key === null) {
      cells.push(el('td', { class: 'habits-cell' }, mark('off')));
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < days.length && row.keyFor(days[j + 1]) === key) j += 1;
    cells.push(windowCell(row, key, days.slice(i, j + 1), today));
    i = j + 1;
  }
  return cells;
}

function rowTotals(row, days) {
  const keys = new Set(days.map((day) => row.keyFor(day)).filter((key) => key !== null));
  const done = [...keys].filter((key) => row.doneKeys.has(key)).length;
  return { done, total: keys.size, complete: keys.size > 0 && done >= keys.size };
}

function dragHandle(title) {
  return el('button', {
    type: 'button',
    class: 'row-action list-row__drag habits-drag',
    'data-sortable-handle': '',
    'aria-label': title,
    title: t('shopping.reorderHandleHint'),
  }, el('i', { 'data-lucide': 'grip-vertical', class: 'icon-md', 'aria-hidden': 'true' }));
}

const handleLabel = (name, index, total) =>
  `${t('shopping.reorderHandle', { name })}, ${t('shopping.reorderPosition', { index, total })}`;

function refreshHandleLabels(tbody) {
  const rows = [...tbody.querySelectorAll('tr[data-series]')];
  rows.forEach((tr, i) => {
    tr.querySelector('[data-sortable-handle]')
      ?.setAttribute('aria-label', handleLabel(tr.dataset.title ?? '', i + 1, rows.length));
  });
}

function buildMatrix({ today, days, rows }, { sortable = false } = {}) {
  const totals = rows.map((row) => rowTotals(row, days));
  const allDone = totals.length > 0 && totals.every((x) => x.complete);
  const table = el('table', { class: 'habits-grid' },
    el('caption', { class: 'habits-sr' }, t(k('caption'))),
    el('thead', {}, el('tr', {},
      sortable ? el('th', { scope: 'col', class: 'habits-drag-head' }) : null,
      el('th', { scope: 'col', class: 'habits-name-head' }, el('span', { class: 'habits-sr' }, t(k('col.habit')))),
      days.map((day) => dayHeader(day, today)),
      el('th', { scope: 'col', class: 'habits-total-head' }, el('span', { class: 'habits-sr' }, t(k('col.total')))))),
    el('tbody', {}, rows.map((row, i) => {
      const x = totals[i];
      const tr = el('tr', { class: x.complete ? 'habits-row--complete' : null, dataset: { series: row.seriesKey, title: row.title } },
        sortable ? el('td', { class: 'habits-drag-cell' }, dragHandle(row.title)) : null,
        el('th', { scope: 'row', class: 'habits-name' },
          el('a', { class: 'habits-name__link', href: `/tasks?open=${encodeURIComponent(row.taskId)}`, 'data-route': `/tasks?open=${encodeURIComponent(row.taskId)}`, dataset: { habitOpen: row.taskId } }, row.title)),
        rowCells(row, days, today),
        el('td', { class: 'habits-total' }, x.complete ? el('span', { class: 'habits-total__done' }, checkIcon(), el('span', { class: 'habits-sr' }, `${x.done}/${x.total}`)) : `${x.done}/${x.total}`));
      return tr;
    })));
  const wrap = el('div', { class: 'habits-scroll' }, table);
  if (!allDone) return wrap;
  return el('div', {}, wrap, el('p', { class: 'habits-celebrate', role: 'status' }, t(k('all_done'))));
}

function settingsLink() {
  return el('a', { href: SETTINGS_ROUTE, 'data-route': SETTINGS_ROUTE, class: 'habits-empty__link' }, t(k('empty.settings_link')));
}

async function buildEmpty(categories, signal) {
  if (!categories.length) {
    return el('div', { class: 'habits-empty' },
      el('p', { class: 'habits-empty__title' }, t(k('empty.none_title'))),
      el('p', { class: 'habits-empty__hint' }, t(k('empty.none_hint')), ' ', settingsLink()));
  }
  let labels = categories;
  try {
    const all = await fetchCategories({ signal });
    labels = categories.map((key) => all.find((c) => c.key === key)?.label ?? key);
  } catch { /* the keys are a good enough fallback */ }
  return el('div', { class: 'habits-empty' },
    el('p', { class: 'habits-empty__title' }, t(k('empty.title'))),
    el('p', { class: 'habits-empty__hint' },
      t(k('empty.hint'), { categories: labels.join(', ') }), ' ', settingsLink()));
}

// ------------------------------------------------------------- behaviour

/** Completes today's occurrence, first moving a late instance into today's window. */
async function tick(row) {
  if (row.due && row.due < row.windowStart) {
    try {
      await api.put(`/tasks/${row.taskId}`, { due_date: row.windowStart });
    } catch { /* not essential: completing it still works */ }
  }
  await api.patch(`/tasks/${row.taskId}/status`, { status: 'done' });
}

function showError(mount, err) {
  mount.querySelector('.habits-error')?.remove();
  mount.prepend(el('p', { class: 'habits-error', role: 'alert' },
    t(k('error')), err?.message ? ` (${err.message})` : ''));
}

const mountControllers = new WeakMap();

/**
 * Renders the matrix into `mount` and wires clicks. Re-renders after each tick.
 * `categories` may be passed (the widget has them as an option); otherwise the
 * saved choice is read.
 */
export async function mountMatrix(mount, { categories = null, order: givenOrder = null, sortable = false, user, signal: outerSignal } = {}) {
  // The dashboard may call renderWidget again on the same element: drop the old
  // listeners first so one click never sends two requests.
  mountControllers.get(mount)?.abort();
  const controller = new AbortController();
  mountControllers.set(mount, controller);
  outerSignal?.addEventListener('abort', () => controller.abort(), { once: true });
  const { signal } = controller;

  let busy = false;
  let rowsById = new Map();

  async function draw() {
    const keys = categories ?? await loadCategoryKeys({ signal });
    const order = givenOrder ?? await loadOrder({ signal });
    const data = await loadWeek({ categories: keys, order, user, signal });
    if (signal.aborted) return;
    rowsById = new Map(data.rows.map((row) => [String(row.taskId), row]));
    if (!data.rows.length) { mount.replaceChildren(await buildEmpty(keys, signal)); return; }
    mount.replaceChildren(buildMatrix(data, { sortable }));
    window.lucide?.createIcons?.();
    const tbody = mount.querySelector('tbody');
    if (sortable && tbody) wireOrder(tbody, signal);
  }

  /** Drag (SortableJS, like the dashboard) and arrow keys on the grip handle. */
  function wireOrder(tbody, sig) {
    let saved = [...tbody.querySelectorAll('tr[data-series]')].map((tr) => tr.dataset.series);
    let inflight = false;
    refreshHandleLabels(tbody);

    async function commit() {
      const ids = [...tbody.querySelectorAll('tr[data-series]')].map((tr) => tr.dataset.series);
      refreshHandleLabels(tbody);
      if (ids.join('|') === saved.join('|') || inflight) return;
      inflight = true;
      try {
        await saveOrder(ids);
        saved = ids;
      } catch (err) {
        // Put the rows back where the server still has them.
        const byKey = new Map([...tbody.children].map((tr) => [tr.dataset.series, tr]));
        saved.forEach((key) => tbody.append(byKey.get(key)));
        refreshHandleLabels(tbody);
        showError(mount, err);
      } finally {
        inflight = false;
      }
    }

    makeReorderable(tbody, { handle: '[data-sortable-handle]', row: 'tr[data-series]', onEnd: commit, signal: sig });

    tbody.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      const handle = event.target.closest?.('[data-sortable-handle]');
      if (!handle) return;
      event.preventDefault();
      if (inflight) return;
      const tr = handle.closest('tr[data-series]');
      const other = event.key === 'ArrowUp' ? tr.previousElementSibling : tr.nextElementSibling;
      if (!other) return;
      if (event.key === 'ArrowUp') tbody.insertBefore(tr, other);
      else tbody.insertBefore(other, tr);
      handle.focus();
      commit();
    }, { signal: sig });
  }

  // The habit name is a plain link (/tasks?open=<id>); the router opens the task.
  mount.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-habit-done], button[data-habit-undo]');
    if (!btn || busy) return;
    busy = true;
    btn.disabled = true;
    try {
      if (btn.dataset.habitDone) await tick(rowsById.get(btn.dataset.habitDone));
      else await api.patch(`/tasks/${btn.dataset.habitUndo}/status`, { status: 'open' });
      if (!signal.aborted) await draw();
    } catch (err) {
      if (signal.aborted) return;
      btn.disabled = false;
      showError(mount, err);
    } finally {
      busy = false;
    }
  }, { signal });

  try {
    await draw();
  } catch (err) {
    if (signal.aborted) return {};
    mount.replaceChildren();
    showError(mount, err);
  }
  return { refresh: () => draw().catch((err) => { if (!signal.aborted) showError(mount, err); }) };
}
