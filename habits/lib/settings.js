/**
 * Habit settings: which task categories count as habits.
 *
 * A module has no storage of its own (MODULES.md), so the choice is kept as an
 * option of the habit dashboard widget, in the user's saved dashboard layout:
 * `options.categories`, a list of category keys. That is the only per-user,
 * server-side store a browser-only module can reach, and it is why this file is
 * the single place that knows about it: to move the setting somewhere else,
 * change `loadCategoryKeys` and `saveCategoryKeys` and nothing else.
 *
 * Everything below goes through /api/v1 (/preferences, /tasks/categories).
 */

import { api } from '/api.js';
import { t } from '/i18n.js';

export const WIDGET_ID = 'habits:week';
export const DEFAULT_CATEGORY_KEYS = ['habit'];
export const DEFAULT_CATEGORY_NAME = 'Habit';

function normalizeKeys(value) {
  if (!Array.isArray(value)) return [...DEFAULT_CATEGORY_KEYS];
  return [...new Set(value.filter((key) => typeof key === 'string' && key !== ''))];
}

function optionsEntry(layout) {
  return (Array.isArray(layout) ? layout : []).find((widget) => widget.id === WIDGET_ID);
}

/** Selected category keys; the default ("habit") until the user chooses. */
export async function loadCategoryKeys({ signal } = {}) {
  const res = await api.get('/preferences', { signal });
  return normalizeKeys(optionsEntry(res?.data?.dashboard_widgets)?.options?.categories);
}

/** Saved row order: series keys, first = top. Empty until the user drags. */
export async function loadOrder({ signal } = {}) {
  const res = await api.get('/preferences', { signal });
  return normalizeOrder(optionsEntry(res?.data?.dashboard_widgets)?.options?.order);
}

export function normalizeOrder(value) {
  return Array.isArray(value) ? value.filter((key) => typeof key === 'string' || typeof key === 'number').map(String) : [];
}

function withOptions(layout, patch, { addIfMissing }) {
  const list = Array.isArray(layout) ? layout.map((widget) => ({ ...widget })) : [];
  const entry = list.find((widget) => widget.id === WIDGET_ID);
  if (entry) {
    entry.options = { ...(entry.options ?? {}), ...patch };
  } else if (addIfMissing) {
    list.push({ id: WIDGET_ID, visible: true, size: '4x2', options: { ...patch } });
  }
  return list;
}

async function saveOptions(patch) {
  const res = await api.get('/preferences');
  const prefs = res?.data ?? {};
  const body = { dashboard_widgets: withOptions(prefs.dashboard_widgets, patch, { addIfMissing: true }) };
  // The phone layout is a separate list. Keep it in step, but never add the
  // widget to a phone layout that does not already have it.
  if (Array.isArray(prefs.dashboard_widgets_phone)) {
    body.dashboard_widgets_phone = withOptions(prefs.dashboard_widgets_phone, patch, { addIfMissing: false });
  }
  await api.put('/preferences', body);
}

export const saveCategoryKeys = (keys) => saveOptions({ categories: keys });
export const saveOrder = (order) => saveOptions({ order: order.map(String) });

/** All task categories as { key, label }. */
export async function fetchCategories({ signal } = {}) {
  const res = await api.get('/tasks/categories', { signal });
  return (res?.data ?? []).map((cat) => ({
    key: cat.key,
    label: cat.name || (cat.label_key ? t(cat.label_key) : cat.key),
  }));
}

export async function createCategory(name) {
  const res = await api.post('/tasks/categories', { name });
  return res?.data;
}
