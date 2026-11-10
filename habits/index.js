/**
 * Habits module page: the same week matrix as the dashboard widget, full size.
 * Contract: export render(container, context).
 *
 * Only the stable facades are imported (/i18n.js, /utils/html.js, /api.js via
 * lib/), as MODULES.md asks since the app is shipped built.
 */

import { t } from '/i18n.js';
import { esc } from '/utils/html.js';
import { mountMatrix } from './lib/habits.js';

export async function render(container, context) {
  container.replaceChildren();
  container.insertAdjacentHTML('beforeend', `
    <div class="page-toolbar page-toolbar--narrow">
      <h1 class="page-toolbar__title">${esc(t('extensions.habits.title'))}</h1>
    </div>
    <div class="app-page__body">
      <section class="page-section page-measure">
        <div class="habits habits--page" data-habits-body></div>
      </section>
    </div>`);

  await mountMatrix(container.querySelector('[data-habits-body]'), {
    sortable: true,
    user: context?.user,
    signal: context?.signal,
  });
}
