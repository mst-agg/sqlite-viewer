# SQLite Viewer Project Documentation

## Project Overview
Fork of https://github.com/inloop/sqlite-viewer - A client-side SQLite database viewer that runs entirely in the browser.

**Goal**: Create a simple .db viewer for the team as an alternative to Excel, which can't keep proper format.

## How It Works
- **Client-side only**: All processing happens in the browser, no server uploads
- **sql.js**: Uses SQLite compiled to WebAssembly (https://github.com/sql-js/sql.js)
- **File loading**: Drag & drop or file picker to load .sqlite/.db files
- **Query execution**: SQL queries run in-browser against loaded database
- **Pagination**: Currently shows 30 rows per page with navigation controls

## Tech Stack
- **Pure JavaScript** (no build system, no package.json)
- **Libraries**:
  - sql.js (SQLite WASM) - loaded from CDN
  - Bootstrap 5 - UI framework
  - jQuery 3.7.1 - DOM manipulation
  - Ace Editor - SQL query editor
  - Select2 - Enhanced table dropdown
  - mindmup-editabletable.js - Table editing (already included but not fully utilized)
  - JSZip + FileSaver - CSV export functionality

## File Structure
```
├── index.html              # Main UI structure
├── css/
│   ├── bootstrap.min.css
│   ├── select2*.css
│   └── main.css           # Custom styles
├── js/
│   ├── main.js            # Core application logic (550 lines)
│   ├── sql-wasm.js        # SQLite WebAssembly loader
│   ├── filereader.js      # File loading utilities
│   ├── ace/               # Code editor
│   ├── jquery-3.7.1.min.js
│   ├── bootstrap.bundle.min.js
│   ├── select2.min.js
│   ├── mindmup-editabletable.js  # Table editing library
│   ├── jszip.min.js
│   └── FileSaver.min.js
└── examples/              # Sample SQLite files

```

## Key Functions (js/main.js)

### Database Loading
- `loadDB(arrayBuffer)` - Loads SQLite file from ArrayBuffer (main.js:98)
- `getTableRowsCount(name)` - Counts rows in a table (main.js:151)
- `getTableColumnTypes(tableName)` - Gets column types via PRAGMA (main.js:190)

### Query & Display
- `doDefaultSelect(name)` - Shows first 30 rows of selected table (main.js:242)
- `executeSql()` - Runs current SQL query from editor (main.js:248)
- `renderQuery(query)` - Renders query results to HTML table (main.js:368)
- `refreshPagination(query)` - Updates page navigation (main.js:319)

### Export
- `exportAllToCsv()` - Exports all tables to ZIP (main.js:508)
- `exportSelectedTableToCsv()` - Exports current table (main.js:527)
- `exportQueryTableToCsv()` - Exports query results (main.js:540)

### Important Variables
- `db` - sql.js Database instance (main.js:9)
- `loadedTableNames` - Array of table names (main.js:11)
- `editor` - Ace Editor instance (main.js:12)

## Current UI Flow
1. User drops/selects .sqlite file
2. File loads into sql.js Database
3. Table list populates from sqlite_master
4. First table auto-selected → runs `SELECT * FROM 'table' LIMIT 0,30`
5. Results render in table with pagination
6. User can select different tables or write custom SQL

## Planned Enhancements (from todo.md)
1. Edit title, header & image (visual branding)
2. Hide drop zone after file loads
3. Auto-show all rows (remove 30-row limit)
4. Remove pagination
5. **Per-column search bars** (main feature)
6. Enable cell editing
7. Save changes back to .db file

## Notes
- The app already includes `mindmup-editabletable.js` (main.js:145, 437) which provides cell editing
- WASM path is hardcoded to GitHub Pages URL (main.js:3)
- Running on localhost:8080 via Python HTTP server
- Git branch: gh-pages (used for GitHub Pages deployment)
