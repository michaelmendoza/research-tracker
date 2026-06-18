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

- **Cards ⇄ Table** toggle — cards for visual browsing, table for dense scanning with bulk select + delete
- **Search** (`/` to focus) across titles, URLs, domains, notes, and tags
- **Tag chips** — click to filter, combine multiple tags
- **Sort** by newest, oldest, title, or domain
- **Edit** any item's title, tags, and note; delete singly or in bulk
- **Export** the current view as JSON or CSV
- **Dark / light theme** toggle, remembered across sessions
- Live-updates if you save tabs while the dashboard is open

## Data

Everything is stored locally in `chrome.storage.local` — nothing leaves your machine. Use **Export JSON** for backups.

## Files

```
manifest.json    MV3 manifest (permissions: tabs, storage, contextMenus)
storage.js       Shared data layer (items, dedup, tag parsing)
background.js    Service worker: context menus, keyboard shortcuts, badge feedback
popup.html/css/js      Quick-capture popup
dashboard.html/css/js  Full dashboard (cards/table, search, filters, export)
gen_icons.py     Regenerates icons/ (pure-stdlib PNG writer)
```
