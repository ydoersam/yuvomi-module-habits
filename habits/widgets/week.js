/**
 * Dashboard widget: the habit week matrix.
 * Contract: export renderWidget(container, { size, options, user }).
 *
 * The core mounts extension widgets in a bare `.widget`; the chrome (header with
 * module seal, padded body) is ours to draw, using the same core classes as the
 * built-in widgets so spacing and typography match.
 */

import { t } from '/i18n.js';
import { el } from '../lib/dom.js';
import { mountMatrix, categoriesFromOptions, orderFromOptions } from '../lib/habits.js';

// The page stylesheet from module.json is only loaded on the module's own page,
// so the widget pulls it in itself (once).
const STYLE_ID = 'habits-module-style';
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  document.head.append(el('link', {
    id: STYLE_ID,
    rel: 'stylesheet',
    href: new URL('../style.css', import.meta.url).href,
  }));
}

export async function renderWidget(container, { options, user } = {}) {
  ensureStyle();
  const title = t('extensions.habits.title');
  const body = el('div', { class: 'habits habits--widget' });

  container.replaceChildren(
    el('div', { class: 'widget__header' },
      el('h3', { class: 'widget__title' },
        el('span', {
          class: 'module-seal module-seal--sm',
          style: '--seal-accent: var(--module-habits, var(--color-accent))',
          'aria-hidden': 'true',
        }, el('i', { 'data-lucide': 'repeat', class: 'module-glyph', 'aria-hidden': 'true' })),
        el('span', { class: 'widget__title-text' }, title)),
      el('a', {
        href: '/m/habits',
        'data-route': '/m/habits',
        class: 'widget__link',
        'aria-label': `${t('extensions.habits.open_page')}: ${title}`,
      }, t('extensions.habits.open_page'))),
    el('div', { class: 'widget__body' }, body));

  if (window.lucide) window.lucide.createIcons({ el: container });
  await mountMatrix(body, { categories: categoriesFromOptions(options), order: orderFromOptions(options), user });
}
