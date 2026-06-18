# ◎ Research Tracker

A Chrome extension for capturing and organizing your web research. Save the tab you're on, every tab in a window, or everything across all windows — then browse it all in a beautiful dashboard as cards or a table.

## Install (load unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this folder (`research-tracker/`)
4. Pin the icon from the puzzle-piece menu for one-click access

## Capturing research

| How | What it does |
|---|---|
| Click the toolbar icon | Popup with the current tab previewed — add tags/notes, then **Save this tab** |
| **Save window** button | Saves every tab in the current window |
| **Save all windows** button | Saves every open tab in every Chrome window |
| `Alt+Shift+S` | Saves the current tab instantly from anywhere (no popup) |
| Right-click a page | **Save page to Research Tracker** |
| Right-click a link | **Save link to Research Tracker** (saves it without opening) |

Duplicates are detected by URL and skipped automatically. Browser-internal pages (`chrome://…`) can't be saved.

## The dashboard

Open it from the popup (**Open dashboard →**) or with `Alt+Shift+D`.

- **Cards ⇄ Table** views — cards for visual browsing, table for dense scanning with bulk actions
- **Group by space** (⊞ toggle) — works with either view; breaks items into collapsible sections per saved window/space, each with rename / open-all / delete
- **Compact** (≣ toggle) — denser table rows, and cards collapse into pills whose controls appear on hover
- **Spaces** — windows saved with **Save window** / **Save all windows** become named spaces; filter to them via chips, rename and manage them in the grouped view, move items between them (bulk **Move to space** or per-item), or delete a whole space
- **Search** (`/` to focus) across titles, URLs, domains, notes, and tags
- **Tag & domain chips** — click to filter, combine multiple; reveal them from the *tags* / *domains* stat
- **Time range** — a toolbar dropdown (All time / Today / This week / This month); clicking the *this week* stat is a shortcut
- **Activity calendar** — a contribution-style heatmap (toggle ▤) with a summary-stats side panel (items, domains, tags, active days, avg/day, peak); hover a day or selection for its stats, click to filter, or drag across days to select a range
- **Sort** by date, title, or domain (ascending/descending) — from the toolbar dropdown in any view, or by clicking table column headers; the two stay in sync
- **Edit** any item's title, tags, note, and space
- **Bulk actions** (table view) — select items to add tags, move to a space, open all, or delete; every delete asks for confirmation
- **Export** the current (filtered) view as JSON or CSV
- **Dark / light theme** toggle, remembered across sessions (no flash on load)
- Live-updates if you save tabs while the dashboard is open

## Data

Everything is stored locally in `chrome.storage.local` — nothing leaves your machine. Use **Export JSON** for backups.

## Files

```
manifest.json    MV3 manifest (permissions: tabs, storage, contextMenus, alarms)
storage.js       Shared data layer (items, collections, dedup, tag parsing)
background.js    Service worker: context menus, keyboard shortcuts, badge feedback
theme-init.js    Applies the saved theme synchronously to avoid a flash on load
popup.html/css/js      Quick-capture popup
dashboard.html/css/js  Full dashboard (cards/table, search, filters, collections, calendar, export)
gen_icons.py     Regenerates icons/ (pure-stdlib PNG writer)
```
