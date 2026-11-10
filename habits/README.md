# Habits module for Yuvomi

A weekly habit matrix built on top of the **Tasks** module. It owns no data and
runs no server: a "habit" is simply a recurring task whose category you have
marked as a habit category. The module reads and writes everything through
Yuvomi's own `/api/v1`.

```
   Tasks module (core)                       Habits module (this folder)
 +-----------------------+                 +------------------------------+
 | recurring tasks       |   category      | week matrix on the start page|
 | category = "habit"    | --------------> | + full page  + settings sheet|
 | completion log        |   API only      | click = complete the task    |
 +-----------------------+                 +------------------------------+
```

---

## 1. Quick start

1. **Install:** unzip so you get `modules/habits/`, then enable it under
   Settings -> Modules -> Active modules.
2. **Create a category** called `Habit` (Tasks -> category picker), or let the
   settings sheet do it for you (step 3).
3. **Open Settings -> Modules -> Habits.** Tick the categories that count as
   habits. If there is no `habit` category yet, the sheet offers a button that
   creates it. Press **Save**.
4. **Create a recurring task** (daily, weekly, ...) in one of those
   categories.
5. The habit appears in the **Habits** widget on the start page and on
   the page `/m/habits`.

If you never touch the settings, the module looks for the category whose key is
`habit`.

---

## 2. What you see: the week matrix

Always one full week, starting on the weekday set in your Yuvomi preferences
(Monday by default). Rows are habits, columns are days, the last column counts
what is done.

```
 +--------------------------+-----+-----+-----+-----+-----+-----+-----+-----+
 | Habit                    | Mon | Tue | Wed | Thu | Fri | Sat | Sun |     |
 |                          |  2  |  3  |  4  |  5  |  6  |  7  | *8* |     |
 +--------------------------+-----+-----+-----+-----+-----+-----+-----+-----+
 | Water plants (daily)     | (#) | (#) | ( ) | (#) | (#) | (#) | [ ] | 5/7 |
 | Run (Mon/Wed/Fri)        |   (###)   |   (   )   |      [   ]      | 1/3 |
 | Bins out (Thursday)      |  .  |  .  |  .  | (#) |  .  |  .  |  .  | 1/1 |
 | Call mum (Sunday)        |  .  |  .  |  .  |  .  |  .  |  .  | [ ] | 0/1 |
 +--------------------------+-----+-----+-----+-----+-----+-----+-----+-----+
                                                                  today = Sun 8
```

Legend (the real widget uses circles and a green check mark):

```
   (#)    done                                  filled green circle, check
   [#]    today, done - click again to undo     filled green button
   [ ]    today, can be ticked - click to do    empty round button
   ( )    missed: scheduled day in the past,    empty ring
          nothing done
   (:)    upcoming scheduled day                dashed ring
    .     not a day for this habit              small dot
 (###)    a merged cell = one "window" of days  pill spanning the days
```

Only **today's** cell is ever clickable (see section 7 for why). Past days are
history; future days are preview.

Each row is announced to screen readers ("Run done", "Run not done", "Mark Run
as done"); the table has a caption and column/row headers.

---

## 3. Which tasks show up

A task becomes a row when **all** of these hold:

```
 task.category        is one of the selected habit categories
 task.status          is "open" or "in_progress"
 task assignees       include you, OR nobody is assigned
```

Not shown: finished one-off tasks, archived tasks, tasks assigned only to other
people. Completions are matched to rows **by series**: a recurring task is a
chain of instances (each completion spawns the next one), and all of them share
one series id, so the history of last week's instance shows up on this week's
row.

```
 instance 1 (due Mon)  --done Mon-->  instance 2 (due Wed)  --done-->  instance 3 ...
        \__________________________________|_______________________________/
                       one series  ->  one row in the matrix
```

---

## 4. When can a habit be ticked? (recurrence rules)

There are **no tags**. The task's own recurrence rule decides which days are
clickable. Set the rule in the normal Yuvomi task form.

```
 Recurrence rule                  Clickable days                     Cells
 -------------------------------  ---------------------------------  ----------------
 daily (every day)                every day                          one per day
 daily, every 2nd day             every 2nd day (from due date)      one per such day
 weekly on ONE weekday            only that weekday                  one cell
 weekly on SEVERAL weekdays       from each occurrence until the     merged windows
                                  day before the next one
 weekly every 2nd week            the chosen weekday(s), every       one cell each
                                  2nd week                           (no merging)
 not recurring                    from the due date until done       one open window
 monthly / yearly / other         from the due date until done       one open window
```

### 4.1 Weekly on one weekday: only that day

"Once a week, but not on any day of the week."

```
 Rule: FREQ=WEEKLY;BYDAY=FR

        Mon   Tue   Wed   Thu   Fri   Sat   Sun
         .     .     .     .    [ ]    .     .
                                 ^
                                 only clickable on Friday
```

### 4.2 Weekly on several weekdays: windows

"Either Monday or Tuesday, Wednesday or Thursday, Friday to Sunday - and one
click marks the whole window done."

```
 Rule: FREQ=WEEKLY;BYDAY=MO,WE,FR

         Mon   Tue   Wed   Thu   Fri   Sat   Sun
        +-----------+-----------+-----------------+
        | window 1  | window 2  |    window 3     |
        +-----------+-----------+-----------------+
         ^           ^           ^
         occurrence  occurrence  occurrence
         Monday      Wednesday   Friday

 A window starts on an occurrence day and lasts until the day BEFORE the next
 occurrence. Tick on any day inside it -> the whole window shows as done.
```

```
 BYDAY=MO,FR            window 1 = Mon-Thu   window 2 = Fri-Sun
 BYDAY=TU,TH,SA         window 1 = Tue-Wed   window 2 = Thu-Fri   window 3 = Sat-Mon
 BYDAY=WE,FR            Wed-Thu, and Fri-Tue (runs over the week boundary)
```

A window that runs over the week boundary shows as two merged parts (end of
one week, start of the next) that share one state. The module looks one week
back so a Friday-to-Tuesday window done last Saturday is still "done" on this
Monday and Tuesday:

```
   last week                      this week
   Wed  Thu  Fri  Sat  Sun   |   Mon  Tue  Wed  Thu  Fri ...
        ...  [ window: Fri .. Tue ]--------]
                  ^ done on Sat
   -> Mon and Tue of this week show as done, nothing to tick.
```

### 4.3 Example week with the three kinds side by side

```
                  Mon   Tue   Wed   Thu   Fri   Sat   Sun
 daily            [d]   [d]   [d]   [d]   [d]   [d]   [d]     7 chances
 BYDAY=MO,WE,FR   [   w1  ] [   w2  ] [      w3       ]       3 chances
 BYDAY=FR          .     .     .     .    [f]    .     .      1 chance
```

---

## 5. What a click does

```
 click on today's cell
         |
         v
 +---------------------------------------------+
 | open instance due BEFORE the start of       |
 | today's window?  (a late / missed instance) |
 +----------------------+----------------------+
                  yes   |   no
                        v    \
   PUT /tasks/:id            \
   { due_date: window start } |
   (failure is ignored)       |
                        \     |
                         v    v
        PATCH /tasks/:id/status  { status: "done" }
                         |
                         v
   Yuvomi stores the completion and creates the next instance
   (next occurrence of the rule, anchored to the due date)
                         |
                         v
   matrix reloads: tasks + completion log
```

**Undo:** clicking a done "today" button sends `PATCH /tasks/:id/status
{ status: "open" }` for the instance that was completed today. Yuvomi reopens
it and removes the follow-up instance it had created (unless someone already
edited that follow-up). Only a completion made **today** can be undone from the
matrix.

**Why the due date is moved first.** Yuvomi calculates the next occurrence from
the due date of the instance you complete, not from the day you tick. If you
complete an instance that belongs to an earlier window, moving it into the
current window first keeps the series aligned with the windows shown in the
matrix and avoids leaving a stale overdue instance behind. It is a safeguard:
if the update fails, the task is still completed. Side effect: that one
instance's due date changes.

---

## 6. Settings

Settings -> Modules -> **Habits** (URL `/settings/modules/ext/habits`).

```
 +---------------------------------------------------------+
 | Habits                                                  |
 | Tasks in the categories you pick here show up in ...    |
 |                                                         |
 | Habit categories                                        |
 |   [x] Habit                                             |
 |   [ ] Household                                         |
 |   [x] Sport                                             |
 |                                                         |
 | There is no "Habit" category yet.   [Create "Habit"]    |  <- only if missing
 |                                                         |
 | [ Save ]                                                |
 +---------------------------------------------------------+
```

- The list comes from `GET /tasks/categories`; you can select any number of
  categories.
- **Create "Habit"** calls `POST /tasks/categories { name: "Habit" }` and
  pre-selects it. Press Save to keep the selection.
- A saved category that has since been deleted is dropped silently.
- The sheet is personal ("For me"): every member chooses their own.

### Where the choice is stored

A module has no storage of its own, so the selection is kept as an option of the
habit dashboard widget, inside your saved dashboard layout:

```
 Settings sheet  --Save-->  PUT /preferences
                            { dashboard_widgets: [
                                 ...,
                                 { id: "habits:week", visible: true, size: "4x2",
                                   options: { categories: ["habit", "sport"] } } ],
                              dashboard_widgets_phone: <same entry, only if the
                                 phone layout already contains the widget> }

 Widget          --reads-->  its own options.categories (from the layout that rendered it)
 Page /m/habits  --reads-->  GET /preferences  ->  dashboard_widgets -> habits:week
 Nothing saved?  ----------> default ["habit"]
```

Consequences worth knowing:

- It is **per user and server-side**, so it follows you across devices.
- Saving the first time stores your current dashboard layout as your own.
- The phone layout is a separate list. It is updated only if the widget is
  already in it.
- `lib/settings.js` is the **only** file that knows about this. To store the
  choice somewhere else (for example `localStorage`, or a sidecar service),
  change `loadCategoryKeys` and `saveCategoryKeys` and nothing else.

---

## 7. Why only today is clickable

A completion is always stamped with the moment it is made; the Tasks API has no
"complete on a past date". The module therefore reads past days from the
completion log and cannot backfill them. A true backfill would need a separate
service with its own database (see "Modules with a backend service" in Yuvomi's
MODULES.md).

---

## 8. Architecture

```
 Browser
 +-----------------------------------------------------------------------+
 |  Start page                Settings sheet              Page /m/habits |
 |  widgets/week.js           settings.js                 index.js       |
 |        \                        |                         /           |
 |         +-----------+-----------+------------------------+            |
 |                     |                                                 |
 |        lib/habits.js   (rules -> windows, rows, matrix, clicks)       |
 |        lib/settings.js (which categories; categories API)             |
 |        lib/dom.js      (tiny DOM builder, no HTML strings)            |
 +---------------------|-------------------------------------------------+
                       |  /api/v1  via public /api.js
                       |  (session cookie + CSRF handled by api.js)
                       v
 +----------------------------------------------------------------------+
 | Yuvomi core                                                          |
 |  GET  /tasks?category=..&status=open&status=in_progress              |
 |  GET  /tasks/completions?user_id=..&limit=200[&before_at&before_id]  |
 |  PATCH /tasks/:id/status      PUT /tasks/:id  { due_date }           |
 |  GET/POST /tasks/categories   GET/PUT /preferences   GET /auth/me    |
 +----------------------------------------------------------------------+
```

### Data flow of one render

```
 1. categories      options.categories  or  GET /preferences       (none -> hint)
 2. in parallel     GET /tasks?category=..                 -> candidate tasks
                    GET /tasks/completions?user_id=me      -> history
                      (paged, up to 6 x 200, stops once older than
                       one week before the displayed week starts)
 3. keep            tasks assigned to me or to nobody
 4. match           task.recurrence_series_id ?? task.id
                      == completion.series_id ?? completion.task_id
 5. windows         makeWindowKeyOf(rule, dueDate)  -> day -> window key
 6. cells           merge consecutive days with the same key into one cell,
                    decide state: done / tick / undo / missed / upcoming / off
```

Day boundaries use the display time zone configured in Yuvomi (completion
timestamps are converted with the app's own helper), and the week start follows
your preference.

### Files

```
 modules/habits/
 |- module.json         manifest: page, menu, settings sheet, widget, permissions
 |- index.js            page /m/habits
 |- settings.js         settings sheet (categories)
 |- style.css           page styles; the widget loads it itself
 |- widgets/
 |   '- week.js         dashboard widget "habits:week"
 |- lib/
 |   |- habits.js       rules, windows, data loading, rendering, click handling
 |   |- settings.js     category choice + categories API
 |   '- dom.js          DOM builder and check-mark icon
 |- locales/
 |   |- en.json         English strings (default)
 |   '- de.json         German strings
 '- README.md           this file
```

### Identifiers

```
 module id          habits
 page route         /m/habits
 settings sheet     /settings/modules/ext/habits
 widget id          habits:week        (default size 4x2, visible by default)
 permission key     ext:habits         (Settings -> Household -> Roles & permissions)
 i18n namespace     extensions.habits.*
```

---

## 9. Behaviour details and edge cases

```
 Situation                                   Result
 ------------------------------------------  ------------------------------------
 No category selected                        hint + link to the settings sheet
 Category selected, no matching tasks        hint listing the selected categories
 Habit assigned only to someone else         not shown to you
 Already done in today's window              today's cell shows done, nothing to tick
 Instance due in the future                  not clickable until its due day
 Missed window (nothing done)                shown as an empty ring, stays missed
 Tick on a later day of a window             whole window turns done
 Rule changed after completions exist        past completions outside the new
                                             windows still show, as single-day windows
 Recurring series that has ended             the row disappears (no open instance)
 Several overlapping/odd rules               monthly, yearly, and rules with an
                                             interval on several weekdays are treated
                                             simply (see table in section 4)
 Network error on tick                       error message above the table, button
                                             re-enabled
 Widget rendered twice in the same place     old click handlers are dropped first,
                                             so one click never sends two requests
```

### Known limitations

- Only today can be ticked (section 7).
- Overdue instances of habits are **not** hidden from the normal Tasks page.
  A module cannot change core pages; use the Tasks page's own category filter.
- Weekly rules with an interval greater than 1 use week parity relative to the
  due date; unusual rules are approximated rather than fully modelled.
- Weekly rules with several weekdays are treated as windows only when the
  interval is 1.
- The history lookup reads at most 6 pages of 200 completions. A user with a very
  large number of completions within the last two weeks could see older ticks
  missing.
- The `categories` option is also a normal option of the widget; the settings
  sheet is the intended place to change it.

---

## 10. Troubleshooting

```
 Symptom                              Check
 -----------------------------------  ------------------------------------------
 Widget says "No habit category       Settings -> Modules -> Habits: tick a
 selected"                            category, press Save
 "No habits yet"                      Is the task recurring? In a selected
                                      category? Assigned to you or nobody? Open?
 Cell not clickable today             Is today a day of the rule (4.1/4.2)? Was
                                      today's window already done? Is the open
                                      instance due later than today?
 Settings choice not visible on       The phone layout is separate; save again,
 the phone                            or add the widget to the phone layout
 Error message above the table        Reload; check that Tasks permissions allow
                                      you to complete the task
 Widget has no padding / looks odd    The widget draws its own header using the
                                      core `widget__header` / `widget__body`
                                      classes; keep Yuvomi up to date
```

---

## 11. Customising

```
 Change ...                          Edit
 ----------------------------------  -------------------------------------
 default category key                lib/settings.js  DEFAULT_CATEGORY_KEYS
 name of the "create" button         lib/settings.js  DEFAULT_CATEGORY_NAME
 where the choice is stored          lib/settings.js  load/saveCategoryKeys
 how rules become windows            lib/habits.js    makeWindowKeyOf
 which tasks are rows                lib/habits.js    loadWeek
 look of cells                       style.css        .habits-* classes
 texts / languages                   locales/*.json   (add a file, e.g. fr.json)
 widget size / default visibility    module.json      capabilities.widgets
```

Licensing and trust: like every Yuvomi module this runs in the browser with the
session of whoever opens it, and uses only Yuvomi's public browser libraries and
`/api/v1`. It does not touch the database, use external CDNs, or call any other
server.

---

## Update: row order, kept-visible habits, settings look

**Row order.** On `/m/habits` every row has the same grip handle as the
dashboard (`grip-vertical`, SortableJS via `/utils/sortable.js`). Drag it, or
focus it and press ArrowUp / ArrowDown. The order is saved as `options.order`
(a list of series keys: `recurrence_series_id ?? id`) on the `habits:week`
entry of your dashboard layout, next to `options.categories`, so the start-page
widget shows the same order. The widget has no handles. New habits that are
not in the saved order go to the end, sorted by title. A failed save puts the
rows back and shows the error.

```
 page /m/habits                      widget (start page)
 +---+--------+-----------+          +--------+-----------+
 | ⋮⋮| Run    | Mon .. Sun|          | Run    | Mon .. Sun|
 | ⋮⋮| Read   |           |   same   | Read   |           |
 | ⋮⋮| Stretch|           |  order   | Stretch|           |
 +---+--------+-----------+          +--------+-----------+
```

**Finished habits stay.** Tasks hides a task whose next instance starts later
(`start_date` in the future), which is exactly the state right after you tick a
weekly habit. The module now asks for `include_future=1`, so the row stays,
shows its green marks and a check badge in the last column, and when every
habit is done for the week a short "well done" line appears below the matrix.
A habit with no further instance at all (a one-off task, or a series that
ended) still disappears once done; a module cannot see those through the
open-task list.

**Settings page.** It now uses the app's own settings parts (section title,
rounded row group, iOS switches that save when flipped, footer text), so it
looks like the other settings pages and needs no CSS of its own.

---

## Update: open and edit the task from the habit name, "New task" button

The habit name is now a link (`/tasks?open=<id>`). A plain click calls core's
exported `openTaskById()` from `/pages/tasks.js`, the same entry point the
dashboard and calendar use: the task detail panel opens over the page, with the
same edit form and the same "..." menu as in the Tasks view. After a change the
matrix redraws. Nothing of the Tasks page is copied or rewritten. If that
import or call fails, the link's own address takes over and you land on the
task in the Tasks view. Ctrl/Cmd/Shift-click opens the Tasks view as usual.

The habits page also gets the core "New task" button (`openNewTask()`), with
the same form, shown only when `/pages/tasks.js` can be loaded. The form does
not preselect a habit category; pick it in the form.

---

## Update: finished habits stay in the overview

Besides the open tasks, the module now looks at every series you completed in
the shown weeks. If a series has no open instance left for you (the follow-up
was handed to someone else by rotation, the series ended, or it was a one-off
task), its last completed task is loaded and shown as a row with its green
marks. Such a row is display-only: it cannot be ticked.

---

## Update for Yuvomi 2.88: facades only

Yuvomi 2.88 ships the web app built. Since then a module may import **only**
`/api.js`, `/i18n.js` and `/utils/html.js`; every other core file has a hashed
name and no importable address, so a module that imported them failed to load.
Version 2.1.0 imports nothing else. What changed because of that:

- Date helpers and the drag-to-reorder code now live inside the module
  (`lib/dates.js`, `lib/reorder.js`; pointer events plus arrow keys on the same
  grip handle). Day keys use the browser's time zone, not the household's.
- The page and the settings sheet are built from the app's CSS classes, as
  MODULES.md now shows.
- The "New task" button and the side panel opened from a habit name are gone:
  they used the Tasks page's own code, which a module can no longer reach.
  The habit name is a link to `/tasks?open=<id>`, which opens that task in the
  Tasks view. Create new habits in the Tasks view, in a habit category.
