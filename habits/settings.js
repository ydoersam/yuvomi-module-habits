/**
 * Settings sheet (Settings -> Modules -> Habits): which task categories count
 * as habits. Contract: export render(container, { section, user, query }).
 *
 * Uses the app's own settings classes (titled section, one rounded group of
 * rows, switches that save when flipped, footer text). The markup is built here
 * because the app's settings components are no longer importable by modules.
 */

import { t } from '/i18n.js';
import { el } from './lib/dom.js';
import {
  fetchCategories, loadCategoryKeys, saveCategoryKeys, createCategory,
  DEFAULT_CATEGORY_KEYS, DEFAULT_CATEGORY_NAME,
} from './lib/settings.js';

const k = (key) => `extensions.habits.settings.${key}`;

const toast = (message, kind) => window.yuvomi?.showToast?.(message, kind);

export async function render(container, { section } = {}) {
  if (section !== 'mine') return;

  const groupHost = el('div', {});
  const footerHost = el('div', {});
  container.replaceChildren(
    el('section', { class: 'settings-section' },
      el('h2', { class: 'settings-section__title' }, t(k('categories'))),
      groupHost,
      footerHost));

  let categories = [];
  let selected = new Set();

  async function persist(previous) {
    try {
      await saveCategoryKeys([...selected]);
      toast(t(k('saved')), 'success');
      return true;
    } catch (err) {
      selected = previous;
      toast(err?.message || t(k('error')), 'danger');
      return false;
    }
  }

  function draw() {
    const hasDefault = categories.some((cat) => cat.key === DEFAULT_CATEGORY_KEYS[0]);

    const rows = categories.map((cat) => {
      const input = el('input', { type: 'checkbox', role: 'switch', 'data-instant-save': '' });
      input.checked = selected.has(cat.key);
      const row = el('label', { class: 'toggle-row toggle-row--switch' },
        el('span', { class: 'toggle-row__label' }, cat.label),
        el('span', { class: 'toggle' }, input, el('span', { class: 'toggle__track', 'aria-hidden': 'true' })));
      input.addEventListener('change', async () => {
        const previous = new Set(selected);
        if (input.checked) selected.add(cat.key);
        else selected.delete(cat.key);
        input.disabled = true;
        const ok = await persist(previous);
        if (!ok) input.checked = !input.checked;
        input.disabled = false;
      });
      return el('div', { class: 'settings-setting-row settings-setting-row--switch' }, row);
    });

    if (!rows.length) rows.push(el('p', { class: 'form-hint' }, t(k('none'))));

    if (!hasDefault) {
      const create = el('button', { type: 'button', class: 'btn btn--secondary' },
        t(k('create'), { name: DEFAULT_CATEGORY_NAME }));
      create.addEventListener('click', async () => {
        create.disabled = true;
        try {
          const made = await createCategory(DEFAULT_CATEGORY_NAME);
          categories = await fetchCategories();
          if (made?.key) selected.add(made.key);
          await persist(new Set(selected));
          draw();
        } catch (err) {
          create.disabled = false;
          toast(err?.message || t(k('error')), 'danger');
        }
      });
      rows.push(el('div', { class: 'settings-setting-row' },
        el('div', { class: 'settings-setting-row__copy' },
          el('span', { class: 'settings-setting-row__label' }, t(k('create_hint'), { name: DEFAULT_CATEGORY_NAME }))),
        el('div', { class: 'settings-setting-row__control' }, create)));
    }

    groupHost.replaceChildren(el('div', { class: 'row-carrier settings-group' }, rows));
    footerHost.replaceChildren(
      el('p', { class: 'settings-group__footer form-hint' }, t(k('intro'))),
      el('p', { class: 'settings-group__footer form-hint' }, t(k('categories_hint'))));
  }

  try {
    const [all, keys] = await Promise.all([fetchCategories(), loadCategoryKeys()]);
    categories = all;
    // A saved key whose category has since been deleted is simply dropped.
    selected = new Set(keys.filter((key) => all.some((cat) => cat.key === key)));
    draw();
  } catch (err) {
    footerHost.replaceChildren(el('p', { class: 'form-error', role: 'alert' }, err?.message || t(k('error'))));
  }
}
