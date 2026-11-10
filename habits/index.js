/**
 * Habits module page: the same week matrix as the dashboard widget, full size.
 * Contract: export render(container, context).
 */

import { t } from '/i18n.js';
import { esc } from '/utils/html.js';
import { renderPageHeader, renderPageTitle, renderPageBody, renderPageSection } from '/utils/page-layout.js';
import { createPageFab } from '/utils/fab.js';
import { mountMatrix } from './lib/habits.js';

export async function render(container, context) {
  container.replaceChildren();
  container.insertAdjacentHTML('beforeend',
    renderPageHeader({ title: renderPageTitle(esc(t('extensions.habits.title'))) })
    + renderPageBody({
      content: renderPageSection({
        content: '<div class="habits habits--page" data-habits-body></div>',
      }),
    }));

  const { refresh } = await mountMatrix(container.querySelector('[data-habits-body]'), {
    sortable: true,
    user: context?.user,
    signal: context?.signal,
  });

  // "New task": the same button the Tasks page has, opening the same form
  // over this page. It is only offered if core's tasks page can be loaded.
  try {
    const { openNewTask } = await import('/pages/tasks.js');
    const fab = createPageFab({
      id: 'fab-new-habit',
      label: t('tasks.newTask'),
      dockLabel: t('newLabel.tasks'),
      onClick: async () => {
        try {
          await openNewTask({ user: context?.user, signal: context?.signal, onChanged: refresh });
        } catch (err) {
          window.yuvomi?.showToast?.(err?.message || t('extensions.habits.error'), 'danger');
        }
      },
    });
    container.append(fab);
    window.lucide?.createIcons?.({ el: fab });
  } catch { /* no button, the rest of the page works */ }
}
