# Research Tracker — Features

A living catalog of what the extension does, kept in sync with the code to make
versioning and release notes easier. When you ship a change, update the relevant
section here and move items out of **Future ideas** as they land.

---

## Capture

- **Popup capture** — preview the current tab, add tags + a note, then **Save this tab**.
- **Save window** — saves every savable tab in the current window as a **collection/space**.
- **Save all windows** — saves every savable tab across all Chrome windows as a collection/space.
- **Keyboard shortcut** — `Alt+Shift+S` saves the current tab from anywhere (no popup).
- **Context menus** — right-click a page (**Save page**) or a link (**Save link**, without opening it).
- **Dedup** — duplicate URLs are detected and skipped on capture.
- **Unsavable pages** — `chrome://` and other non-`http(s)` pages can't be saved; feedback distinguishes
  "saved" / "already saved" / "can't save" via the toolbar badge (`+N` / `✓` / `–`).
- **Badge feedback** — a transient action badge, cleared reliably via `setTimeout` + a `chrome.alarms` backstop.

## Open the dashboard

- From the popup (**Open dashboard →**) or with `Alt+Shift+D`.

## Views & layout

- **Cards ⇄ Table** — the item renderer toggle (visual cards vs. dense table).
- **Group by space** (⊞) — orthogonal toggle; works with either renderer. Breaks items into
  collapsible sections per saved window/space.
- **Compact** (≣) — denser table rows; cards collapse into pills with hover-revealed controls
  that slide in over the right of the pill.
- **List virtualization** — flat (non-grouped) views render in windows of 80 and grow on scroll
  (IntersectionObserver), keeping the DOM bounded for large libraries.

## Spaces / collections

- Saved windows become **named spaces** (the `batchId` grouping).
- **Filter chips** — one chip per space (filter-only; counts + relative date).
- **Grouped view management** — per-space header with **rename** (inline), **Open all**, and **Delete**.
- **Move items between spaces** — bulk **Move to space** (existing or create new) and per-item via the edit modal.
- Empty spaces are pruned automatically.

## Search & filtering

- **Search** (`/` to focus) across titles, URLs, domains, notes, and tags.
- **Operators** — `tag:ai`, `domain:arxiv.org`, `is:untagged`, `is:tagged`, `is:noted`.
- **Negation** — prefix any token with `!` to exclude (e.g. `!tag:ai`, `!is:noted`, `!slides`).
- **Operator autocomplete** — a suggestions dropdown proposes operators and live values (existing tags/domains);
  ↑/↓ to highlight, **Tab** completes, **Enter** completes only when something is highlighted, Esc dismisses.
  Incomplete operators don't blank the list as you type.
- **Match highlighting** — free-text matches are `<mark>`-highlighted in titles, domains, and notes.
- **Result count** — when any filter is active, the filter bar shows “N of M items”.
- **Tag & domain facets** — pill bars (revealed from the *tags* / *domains* stat) to filter; combine multiple.
- **Time range** — toolbar dropdown (All time / Today / This week / This month); *this week* stat is a shortcut.
- **Active-filter chips** — each active filter shows as a removable chip, plus **Clear all**.

## Sort

- Sort by **date / title / domain**, ascending or descending.
- **Sortable table headers** with asc/desc indicators, kept in sync with the toolbar **Sort by** dropdown
  (the dropdown is the sort control for cards/pills, which have no headers).

## Activity calendar

- Contribution-style **heatmap** (toggle ▤), ~26 weeks, with month labels and intensity levels.
- **Drag to select** a date range; click a day to filter; click the same single day to clear.
- **Summary-stats side panel** (columns, kept within heatmap height): items, domains, tags, active days,
  avg/day, peak day, plus **top 5 domains** and **top 5 tags** for the hovered day / selected range / all activity.

## Editing & bulk actions

- **Edit** an item's title, tags, note, and space.
- **Bulk** (table view, via selection): add tags, move to space, **Open all** (this window / new window /
  incognito), delete.
- **Open targets** — a dropdown on both the bulk **Open all** and each grouped-space header opens items in
  the current window, a new window, or incognito (incognito requires the extension to be allowed in incognito mode).

## Trash & recovery

- **Soft delete** — deletes move items to a **Trash** (30-day retention), with an **Undo** toast.
- **Trash modal** — select items (with select-all) to **Restore selected** / **Delete selected**, act on a single
  row, or **Empty trash**; permanent deletes are confirmed.
- Expired items are purged on load.

## Data

- **Export** the current (filtered) view as **JSON** or **CSV**.
- **Import JSON** — merges items, skipping duplicate URLs; imported items start ungrouped.
- Everything is stored locally in `chrome.storage.local`.

## Appearance & polish

- **Dark / light theme**, remembered across sessions, applied synchronously to avoid a flash on load.
- **Confirmation dialogs** for irreversible actions (empty trash, delete space).
- Live-updates when tabs are saved while the dashboard is open.
- Accessible-ish: keyboard focus styles, `/` shortcut, Enter-to-open on cards/pills.

---

## Future ideas

Not yet built — rough backlog, roughly ordered by value.

- **Read / archive status** — mark items read/done, filter and dim accordingly (most on-purpose feature).
- **URL normalization for dedup** — collapse `?utm_*`, trailing slashes, and `#fragments` so near-duplicates
  don't slip through on capture/import.
- **Drag-and-drop into spaces** — drag cards into space sections in the grouped view.
- **Tag management** — rename / merge / delete a tag across all items.
- **Tag/domain AND vs OR** — toggle between "any" and "all" when combining facet filters.
- **More keyboard shortcuts** — `j/k` move focus, `e` edit, `o` open, `x` select, `g` toggle group.
- **Selection in cards view** — shift-click / hover checkbox so bulk actions aren't table-only.
- **Calendar accessibility/touch** — keyboard navigation and pointer (touch) support for range select.
- **Toolbar consolidation** — group density/group/compact (and export/theme) under popovers as controls grow.
- **Settings panel** — configurable dedup behavior, default view, calendar window length, retention period.
- **Pin / favorite items**; **notes with light markdown**; **per-item screenshots/thumbnails**.
- **Sync / backup** — optional `chrome.storage.sync` or cloud export.
