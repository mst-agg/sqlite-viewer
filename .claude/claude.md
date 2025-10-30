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

## Completed Enhancements

### ✅ Visual Changes
1. **Header color changed** to #60fcee (cyan/turquoise) - css/main.css:10
2. **Removed upload info text** and sample file link from drop zone - index.html:60
3. **Hide drop zone after file loads** - Fades out completely (main.js:144)

### ✅ Data Display
4. **Show 10,000 rows by default** instead of 30 - main.js:243
5. **Hide pagination when only 1 page** - Only shows when pages > 1 (main.js:321)

### ✅ Per-Column Search Bars
6. **Search inputs in header** - Each column has a search box (index.html:101)
7. **Real-time filtering** - Case-insensitive search across all columns (main.js:501-520)
8. **Multi-column filtering** - All filters work together (AND logic)

### ✅ Cell Editing & Saving
9. **Click-to-edit cells** - Uses mindmup-editabletable.js, fixed readonly issue (js/mindmup-editabletable.js:140)
10. **Edited cells highlighted** - Yellow background with orange border (css/main.css:61-64)
11. **Change tracking** - Stores all edits in Map structure (main.js:12-13)
12. **Save Changes button** - Appears when edits exist, shows count (index.html:75-77)
13. **Database export** - Groups changes by row, generates efficient UPDATE statements (main.js:572-642)
14. **Original values stored** - Each cell has data-original-value attribute (main.js:446)
15. **Multiple edits per row** - Fixed to handle multiple cell changes in same row correctly (main.js:586-622)

### ✅ Column Access Control
16. **'en' column non-editable** - Grayed out, locked from editing (main.js:438, css/main.css:66-70)
17. **'context_checked' column hidden** - Completely hidden from view (main.js:416-442, css/main.css:72-74)

## New Functions Added

### Edit Tracking
- `updateSaveButton()` - Shows/hides save button based on change count (main.js:560-570)
- `saveChanges()` - Groups changes by row, applies all edits via UPDATE SQL, exports modified database (main.js:572-642)
- `filterTable()` - Client-side filtering for column search (main.js:501-520)

### New Variables
- `cellChanges` - Map storing all cell edits (main.js:12)
- `currentTableName` - Tracks current table for saving (main.js:13)
- `currentColumnNames` - Array of column names for edit tracking (main.js:14)

## Fixed Issues
- **✅ Readonly textarea** - Removed readonly attribute from mindmup-editabletable.js (line 140)
- **✅ Multiple edits per row** - Now groups changes by row and creates single UPDATE statement per row
- **✅ Span wrapper blocking edits** - Removed span wrappers from td elements (main.js:446)

## How Editing Works
1. User clicks a cell to edit (mindmup-editabletable.js handles UI)
2. Textarea appears for editing (removed readonly attribute to enable)
3. Press Enter to save edit, ESC to cancel
4. On change event, cell gets yellow highlight with orange border
5. Change tracked in cellChanges Map with: rowIndex, colIndex, columnName, oldValue, newValue, rowData
6. Save button appears showing number of changes
7. On Save:
   - Groups all changes by row (main.js:586-594)
   - Builds single UPDATE SQL per row with multiple SET clauses (main.js:596-622)
   - Uses original row data in WHERE clause to identify unique row
   - Executes all UPDATEs on in-memory database
   - Exports database using db.export()
   - Downloads as "translations.db"
   - User replaces original file manually
   - Clears change tracking and highlights

## Column Configuration
- **'en' column** - Non-editable (protected from changes), visually grayed out
- **'context_checked' column** - Completely hidden from UI (but data remains in database)
- **All other columns** - Fully editable with change tracking

## Notes
- WASM path is hardcoded to GitHub Pages URL (main.js:3)
- Running on localhost:8080 via Python HTTP server
- Git branch: gh-pages (used for GitHub Pages deployment)
- CSV export functionality remains available in Export dropdown
- Current version: v=24 (index.html:144)
