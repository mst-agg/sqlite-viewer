"use strict";

const SQL_WASM_PATH = "https://inloop.github.io/sqlite-viewer/js/sql-wasm.wasm";

const SQL_FROM_REGEX = /FROM\s+((?=['"])((["'])(?<g1>[^'"]+))|(?<g2>\w+))/mi;
const SQL_LIMIT_REGEX = /LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/mi;
const SQL_SELECT_REGEX = /SELECT\s+[^;]+\s+FROM\s+/mi;

let db = null;
let lastCachedQueryCount = { select: "", count: 0 };
let loadedTableNames = [];
let cellChanges = new Map(); // Track edited cells: key = "rowIndex-colIndex", value = {oldValue, newValue, columnName}
let currentTableName = null;
let currentColumnNames = [];
const editor = ace.edit("sql-editor");
const errorBox = $("#error");
const infoBox = $("#info");

const selectFormatter = function (item) {
    const index = item.text.indexOf("(");
    if (index > -1) {
        const name = item.text.substring(0, index);
        const tableName = item.text.substring(index - 1);
        return $(`<span>${name}<span style="color:#ccc">${tableName}</span></span>`);
    } else {
        return item.text;
    }
};

initialize();

function initialize() {
    let fileReaderOpts = {
        readAsDefault: "ArrayBuffer", on: {
            load: function (e) {
                loadDB(e.target.result);
            }
        }
    };

    let toggleFullScreen = function () {
        const container = $("#main-container");
        const resizerExpandIcon = $("#resizer-expand");
        const resizerCollapseIcon = $("#resizer-collapse");

        container.toggleClass("container container-fluid");
        resizerExpandIcon.toggle();
        resizerCollapseIcon.toggle();
    };
    $("#resizer").click(toggleFullScreen);
    $("#sql-editor").keydown(onKeyDown);

    if (typeof FileReader === "undefined" || typeof WebAssembly === "undefined") {
        $("#dropzone, #dropzone-dialog").hide();
        $("#compat-error").toggleClass("d-none", false);
    } else {
        $("#dropzone, #dropzone-dialog").fileReaderJS(fileReaderOpts);
    }

    //Initialize editor
    editor.setTheme("ace/theme/chrome");
    editor.renderer.setShowGutter(false);
    editor.renderer.setShowPrintMargin(false);
    editor.renderer.setPadding(20);
    editor.renderer.setScrollMargin(8, 8, 0, 0);
    editor.setHighlightActiveLine(false);
    editor.getSession().setUseWrapMode(true);
    editor.getSession().setMode("ace/mode/sql");
    editor.setOptions({maxLines: 5});
    editor.setFontSize(16);

    $(".no-propagate").on("click", function (el) {
        el.stopPropagation();
    });

    //Check url to load remote DB
    $.urlParam = function (name) {
        let results = new RegExp( `[\?&]${name}=([^&#]*)`).exec(window.location.href);
        if (results == null) {
            return null;
        } else {
            return results[1] || 0;
        }
    };
    const loadUrlDB = $.urlParam("url");
    if (loadUrlDB != null) {
        setIsLoading(true);
        const xhr = new XMLHttpRequest();
        xhr.open("GET", decodeURIComponent(loadUrlDB), true);
        xhr.responseType = "arraybuffer";
        xhr.onload = function (e) {
            loadDB(this.response);
        };
        xhr.onerror = function (e) {
            setIsLoading(false);
        };
        xhr.send();
    }
}

function loadDB(arrayBuffer) {
    setIsLoading(true);

    resetTableList();

    initSqlJs({locateFile: file => SQL_WASM_PATH}).then(function (SQL) {
        let tables = null;
        try {
            db = new SQL.Database(new Uint8Array(arrayBuffer));

            //Get all table names from master table
            tables = db.prepare("SELECT * FROM sqlite_master WHERE type='table' OR type='view' ORDER BY name");
        } catch (ex) {
            if (tables !== null) {
                tables.free();
            }
            setIsLoading(false);
            window.alert(ex);
            return;
        }

        let firstTableName = null;
        const tableList = $("#tables");

        while (tables.step()) {
            const rowObj = tables.getAsObject();
            const name = rowObj["name"];
            const type = rowObj["type"];

            // Skip sqlite internal tables
            if (name === 'sqlite_sequence') {
                continue;
            }

            if (firstTableName === null) {
                firstTableName = name;
            }
            const rowCount = getTableRowsCount(name);
            loadedTableNames.push(name);
            const tableType = type !== "table" ? `, ${type}` : "";
            tableList.append(`<option value="${name}">${name} (${rowCount} rows${tableType})</option>`);
        }
        tables.free();

        //Select first table and show It
        tableList.val(firstTableName);
        doDefaultSelect(firstTableName);

        $("#output-box").fadeIn();
        $(".nouploadinfo").hide();
        $("#sample-db-link").hide();
        $("#dropzone").fadeOut(500);
        $("#success-box").show();

        setIsLoading(false);
    });
}

function getTableRowsCount(name) {
    const sel = db.prepare(`SELECT COUNT(*) AS count FROM '${name}'`);
    if (sel.step()) {
        const count = sel.getAsObject()["count"];
        sel.free();
        return count;
    } else {
        sel.free();
        return -1;
    }
}

function getQueryRowCount(query) {
    if (query === lastCachedQueryCount.select) {
        return lastCachedQueryCount.count;
    }

    let queryReplaced = query.replace(SQL_SELECT_REGEX, "SELECT COUNT(*) AS count FROM ");

    if (queryReplaced !== query) {
        queryReplaced = queryReplaced.replace(SQL_LIMIT_REGEX, "");
        const sel = db.prepare(queryReplaced);
        if (sel.step()) {
            const count = sel.getAsObject()["count"];
            sel.free();

            lastCachedQueryCount.select = query;
            lastCachedQueryCount.count = count;

            return count;
        } else {
            sel.free();
            return -1;
        }
    } else {
        return -1;
    }
}

function getTableColumnTypes(tableName) {
    let result = new Map();
    const sel = db.prepare(`PRAGMA table_info('${tableName}')`);

    while (sel.step()) {
        const obj = sel.getAsObject();
        let type = obj["type"];
        if (obj["notnull"] === 1) {
            type += " NOT NULL";
        }
        if (obj["pk"] === 1) {
            type += " PRIMARY KEY";
        }
        result.set(obj.name, type);
    }
    sel.free();

    return result;
}

function resetTableList() {
    const tables = $("#tables");
    loadedTableNames = [];
    tables.empty();
    tables.append("<option></option>");
    tables.select2({
        placeholder: "Select a table",
        theme: "bootstrap-5",
        templateSelection: selectFormatter,
        templateResult: selectFormatter
    });
    tables.on("change", function (e) {
        doDefaultSelect(tables.val());
    });
}

function setIsLoading(isLoading) {
    const dropText = $("#drop-text");
    const loading = $("#drop-loading");
    if (isLoading) {
        dropText.hide();
        loading.toggleClass("d-none", false);
    } else {
        dropText.show();
        loading.toggleClass("d-none", true);
    }
}

function dropzoneClick() {
    $("#dropzone-dialog").click();
}

function doDefaultSelect(name) {
    const defaultSelect = `SELECT * FROM '${name}' LIMIT 0,10000`;
    editor.setValue(defaultSelect, -1);
    renderQuery(defaultSelect);
}

function executeSql() {
    const query = editor.getValue();
    renderQuery(query);
    $("#tables").val(getTableNameFromQuery(query));
}

function getTableNameFromQuery(query) {
    const sqlRegex = SQL_FROM_REGEX.exec(query);
    if (sqlRegex != null) {
        return sqlRegex.groups.g1 ?? sqlRegex.groups.g2;
    } else {
        return null;
    }
}

function parseLimitFromQuery(query) {
    const sqlRegex = SQL_LIMIT_REGEX.exec(query);
    if (sqlRegex != null) {
        let result = { max: 0, offset: 0 };

        if (sqlRegex.length > 2 && typeof sqlRegex[2] !== "undefined") {
            result.offset = parseInt(sqlRegex[1]);
            result.max = parseInt(sqlRegex[2]);
        } else {
            result.offset = 0;
            result.max = parseInt(sqlRegex[1]);
        }

        if (result.max == 0) {
            result.pages = 0;
            result.currentPage = 0;
            return result;
        }

        const queryRowsCount = getQueryRowCount(query);
        if (queryRowsCount != -1) {
            result.pages = Math.ceil(queryRowsCount / result.max);
        }
        result.currentPage = Math.floor(result.offset / result.max) + 1;
        result.rowCount = queryRowsCount;

        return result;
    } else {
        return null;
    }
}

function setPage(el, next) {
    if ($(el).hasClass("disabled")) return;

    const query = editor.getValue();
    const limit = parseLimitFromQuery(query);

    let pageToSet = 0;
    if (typeof next !== "undefined") {
        pageToSet = (next ? limit.currentPage : limit.currentPage - 2);
    } else {
        const page = window.prompt("Go to page");
        if (!isNaN(page) && page >= 1 && page <= limit.pages) {
            pageToSet = page - 1;
        } else {
            return;
        }
    }

    const offset = (pageToSet * limit.max);
    editor.setValue(query.replace(SQL_LIMIT_REGEX, `LIMIT ${offset},${limit.max}`), -1);

    executeSql();
}

function refreshPagination(query) {
    const limit = parseLimitFromQuery(query);
    if (limit !== null && limit.pages > 1) {
        const pager = $("#pager");
        const pagePrev = $("#page-prev");
        const pageNext = $("#page-next");

        pager.attr("title", `Row count: ${limit.rowCount}`);
        bootstrap.Tooltip.getOrCreateInstance("#pager").hide();
        pager.text(limit.currentPage + " / " + limit.pages);

        if (limit.currentPage <= 1) {
            pagePrev.addClass("disabled");
        } else {
            pagePrev.removeClass("disabled");
        }

        if ((limit.currentPage + 1) > limit.pages) {
            pageNext.addClass("disabled");
        } else {
            pageNext.removeClass("disabled");
        }

        setPagerVisible(true);
    } else {
        setPagerVisible(false);
    }
}

function showError(msg) {
    $("#data").hide();
    setPagerVisible(false);
    errorBox.show();
    errorBox.text(msg);
}

function setPagerVisible(visible) {
    $("#bottom-bar").toggleClass("d-none", !visible);
    if (visible) {
        $("#footer").attr("style", "margin-top: -0.75rem !important");
    } else {
        $("#footer").css("margin-top", "");
    }
}

function htmlEncode(value) {
    return $("<div/>").text(value).html();
}

function renderQuery(query) {
    const dataBox = $("#data");
    const headerRow = $("#header-row");
    const filterRow = $("#filter-row");
    const tbody = dataBox.find("tbody");

    headerRow.empty();
    filterRow.empty();
    tbody.empty();
    errorBox.hide();
    infoBox.hide();
    dataBox.show();

    let columnTypes = new Map();
    const tableName = getTableNameFromQuery(query);

    // Clear changes when switching tables
    if (currentTableName !== tableName) {
        cellChanges.clear();
        updateSaveButton();
    }
    currentTableName = tableName;

    if (tableName != null) {
        columnTypes = getTableColumnTypes(tableName);
    }

    let sel = null;
    try {
        sel = db.prepare(query);
    } catch (ex) {
        if (sel != null) {
            sel.free();
        }
        showError(ex);
        return;
    }

    let isEmptyTable = true;
    const columnNames = sel.getColumnNames();
    currentColumnNames = columnNames; // Store for edit tracking

    for (let i = 0; i < columnNames.length; i++) {
        const columnName = columnNames[i];
        const type = columnTypes.has(columnName) ? columnTypes.get(columnNames[i]) : "";
        const isHidden = columnName.toLowerCase() === 'context_checked';
        const hiddenClass = isHidden ? ' class="hidden-column"' : '';
        headerRow.append(`<th${hiddenClass}><span data-bs-toggle="tooltip" title="${type}">${columnNames[i]}</span></th>`);
        filterRow.append(`<th${hiddenClass}><input type="text" class="form-control form-control-sm column-filter" data-column="${i}" placeholder="Search..."></th>`);
    }

    while (sel.step()) {
        isEmptyTable = false;
        const tr = $('<tr>');
        const s = sel.get();
        for (let i = 0; i < s.length; i++) {
            const columnName = columnNames[i];
            const type = columnTypes.has(columnName) ? columnTypes.get(columnName).toLowerCase() : "";
            if (type === "blob" || type === "blob sub_type binary") {
                if (s[i] === null) {
                    tr.append(`<td><span title="Blob">null</span></td>`);
                } else {
                    renderBlobItem(tr, s[i]);
                }
            } else {
                let value = htmlEncode(s[i]);
                // Mark 'en' and 'id' columns as non-editable, hide 'context_checked' column
                const isReadOnly = columnName.toLowerCase() === 'en' || columnName.toLowerCase() === 'id';
                const isHidden = columnName.toLowerCase() === 'context_checked';
                let classAttr = '';
                if (isHidden) {
                    classAttr = ' class="hidden-column"';
                } else if (isReadOnly) {
                    classAttr = ' class="non-editable"';
                }
                tr.append(`<td data-original-value="${value}" title="${value}"${classAttr}>${value}</td>`);
            }
        }
        tbody.append(tr);
    }
    sel.free();

    if (isEmptyTable) {
        infoBox.text("No data for given select.");
        infoBox.show();
    }

    refreshPagination(query);

    // Enable tooltips
    document.querySelectorAll('[data-bs-toggle="tooltip"]')
        .forEach(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

    // Setup column filters
    $(".column-filter").on("keyup", function() {
        filterTable();
    });

    // Initialize editable table (exclude non-editable cells)
    dataBox.editableTableWidget();

    // Remove tabindex from non-editable cells to prevent editing
    $("#data tbody td.non-editable").prop('tabindex', -1).off('click keypress dblclick');

    // Track cell changes
    $("#data tbody td:not(.non-editable)").on("change", function(evt, newValue) {
        const cell = $(this);
        const rowIndex = cell.parent().index();
        const colIndex = cell.index();
        const cellKey = `${rowIndex}-${colIndex}`;
        const columnName = currentColumnNames[colIndex];
        const originalValue = cell.attr('data-original-value');

        // Get the original row data for WHERE clause (always use original values)
        const rowData = [];
        cell.parent().find("td").each(function() {
            const origVal = $(this).attr('data-original-value');
            rowData.push(origVal || $(this).text());
        });

        // Store the change
        if (!cellChanges.has(cellKey)) {
            // First time editing this cell - store original value
            cellChanges.set(cellKey, {
                rowIndex: rowIndex,
                colIndex: colIndex,
                columnName: columnName,
                oldValue: originalValue,
                newValue: newValue,
                rowData: rowData
            });
        } else {
            // Update existing change - keep the same rowData (original values)
            const change = cellChanges.get(cellKey);
            change.newValue = newValue;
        }

        // Highlight the cell
        cell.addClass('edited-cell');

        updateSaveButton();
    });
}

function filterTable() {
    const filters = [];
    $(".column-filter").each(function() {
        filters.push($(this).val().toLowerCase());
    });

    $("#data tbody tr").each(function() {
        const row = $(this);
        let showRow = true;

        row.find("td").each(function(index) {
            if (filters[index] && filters[index].length > 0) {
                const cellText = $(this).text().toLowerCase();
                if (!cellText.includes(filters[index])) {
                    showRow = false;
                    return false; // break out of loop
                }
            }
        });

        if (showRow) {
            row.show();
        } else {
            row.hide();
        }
    });
}

function renderBlobItem(tr, bytes) {
    const td = document.createElement("td");
    const span = document.createElement("span");
    span.title = "Blob";
    const downloadLink = document.createElement("a");
    downloadLink.href = "javascript:void(0)";
    downloadLink.innerText = `Download (${formatBytes(bytes.length)})`;
    downloadLink.onclick = function () {
        saveAs(new Blob([bytes]), "blob");
    };
    span.append(downloadLink);
    td.append(span);
    tr.append(td);
}

function formatBytes(bytes,decimals) {
    if(bytes === 0) return '0 Bytes';
    const k = 1024,
        dm = decimals || 2,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        executeSql();
    }
}

function updateSaveButton() {
    const saveBtn = $("#save-changes-btn");
    const changeCount = $("#change-count");
    const count = cellChanges.size;

    if (count > 0) {
        changeCount.text(count);
        saveBtn.show();
    } else {
        saveBtn.hide();
    }
}

function saveChanges() {
    const changeCount = cellChanges.size;

    if (changeCount === 0) {
        alert("No changes to save!");
        return;
    }

    if (!currentTableName) {
        alert("Cannot determine which table to update!");
        return;
    }

    try {
        // Group changes by row
        const changesByRow = new Map();
        cellChanges.forEach((change, key) => {
            const rowIndex = change.rowIndex;
            if (!changesByRow.has(rowIndex)) {
                changesByRow.set(rowIndex, []);
            }
            changesByRow.get(rowIndex).push(change);
        });

        // Apply changes row by row
        changesByRow.forEach((rowChanges, rowIndex) => {
            // Use the first change to get the row data (original values for WHERE clause)
            const rowData = rowChanges[0].rowData;

            // Build WHERE clause using original column values to identify the row uniquely
            const whereConditions = currentColumnNames.map((col, idx) => {
                const value = rowData[idx];
                if (value === null || value === "null") {
                    return `"${col}" IS NULL`;
                } else {
                    return `"${col}" = '${value.replace(/'/g, "''")}'`;
                }
            }).join(" AND ");

            // Build SET clause with all changed columns for this row
            const setClause = rowChanges.map(change => {
                const escapedValue = change.newValue.replace(/'/g, "''");
                return `"${change.columnName}" = '${escapedValue}'`;
            }).join(", ");

            // Build and execute UPDATE statement
            const updateSql = `UPDATE "${currentTableName}" SET ${setClause} WHERE ${whereConditions}`;

            console.log("Executing:", updateSql);
            db.run(updateSql);
        });

        // Export the modified database
        const data = db.export();
        const blob = new Blob([data], { type: "application/x-sqlite3" });

        // Use the original filename or default to translations.db
        const filename = "translations.db";
        saveAs(blob, filename);

        // Clear changes and update UI
        cellChanges.clear();
        $(".edited-cell").removeClass("edited-cell");
        updateSaveButton();

        alert(`Database saved! ${changeCount} changes applied.\n\nThe file has been downloaded as "${filename}".\nReplace your original file with this downloaded version.`);
    } catch (ex) {
        alert("Error saving changes: " + ex.message);
        console.error(ex);
    }
}

function arrayToCsv(data) {
    return data.map(row =>
        row.map(String)  // convert every value to String
            .map(v => v.replaceAll('"', '""'))  // escape double quotes
            .map(v => `"${v}"`)  // quote it
            .join(',')  // comma-separated
    ).join('\r\n');  // rows starting on new lines
}

function exportCsvTableQuery(query) {
    let exportedRows = [];
    let sel = null;
    try {
        sel = db.prepare(query);
    } catch (ex) {
        if (sel != null) {
            sel.free();
        }
        showError(ex);
        setIsLoading(false);
        return null;
    }

    const columnNames = sel.getColumnNames();

    exportedRows.push(...[columnNames]);
    while (sel.step()) {
        const rows = sel.get();
        exportedRows.push(...[rows]);
    }
    sel.free();
    return exportedRows;
}

function exportCsvTable(tableName) {
    return exportCsvTableQuery(`SELECT * FROM '${tableName}'`);
}

function exportAllToCsv() {
    setIsLoading(true);
    const zip = new JSZip();
    for (const tableName of loadedTableNames) {
        const exportedRows = exportCsvTable(tableName);
        if (exportedRows != null) {
            zip.file(tableName + ".csv", arrayToCsv(exportedRows));
        } else {
            return;
        }
    }

    zip.generateAsync({type: "blob"})
        .then(function (content) {
            saveAs(content, "exported_all_db.zip");
        });
    setIsLoading(false);
}

function exportSelectedTableToCsv() {
    const tableName = $("#tables").val();
    setIsLoading(true);

    const exportedRows = exportCsvTable(tableName);
    if (exportedRows != null) {
        const blob = new Blob([arrayToCsv(exportedRows)], {type: "text/plain;charset=utf-8"});
        saveAs(blob, "exported_" + tableName.toLowerCase() + "_db.csv");
    }

    setIsLoading(false);
}

function exportQueryTableToCsv() {
    setIsLoading(true);

    const query = editor.getValue();
    const exportedRows = exportCsvTableQuery(query);
    if (exportedRows != null) {
        const blob = new Blob([arrayToCsv(exportedRows)], {type: "text/plain;charset=utf-8"});
        saveAs(blob, "exported_" + getTableNameFromQuery(query).toLowerCase() + "_db.csv");
    }

    setIsLoading(false);
}

function exportToExcel() {
    const tableName = $("#tables").val();

    if (!tableName) {
        alert("Please select a table first!");
        return;
    }

    setIsLoading(true);

    try {
        // Get all data from current table (no LIMIT)
        const query = "SELECT * FROM '" + tableName + "'";
        const results = db.exec(query);

        if (!results || results.length === 0) {
            alert("No data to export!");
            setIsLoading(false);
            return;
        }

        const result = results[0];
        const columns = result.columns;
        const values = result.values;

        // Filter out hidden columns (like 'context_checked')
        const visibleColumnIndices = [];
        const visibleColumns = [];

        columns.forEach((col, index) => {
            if (col !== 'context_checked') {  // Skip hidden columns
                visibleColumnIndices.push(index);
                visibleColumns.push(col);
            }
        });

        // Filter values to only include visible columns
        const filteredValues = values.map(row =>
            visibleColumnIndices.map(index => row[index])
        );

        // Create worksheet data: [headers, ...rows]
        const wsData = [visibleColumns, ...filteredValues];

        // Create worksheet from array of arrays
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Create workbook and add worksheet
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, tableName);

        // Generate filename
        const filename = tableName.toLowerCase() + '.xlsx';

        // Write file
        XLSX.writeFile(wb, filename);

        console.log("Excel export successful: " + filename);

    } catch (error) {
        console.error("Excel export error:", error);
        alert("Error exporting to Excel: " + error.message);
    }

    setIsLoading(false);
}

function splitTableByLanguage() {
    const tableName = $("#tables").val();

    if (!tableName) {
        alert("Please select a table first!");
        return;
    }

    setIsLoading(true);

    try {
        // Get all columns from the table
        const query = "SELECT * FROM '" + tableName + "' LIMIT 1";
        const results = db.exec(query);

        if (!results || results.length === 0) {
            alert("No data to export!");
            setIsLoading(false);
            return;
        }

        const allColumns = results[0].columns;

        // Filter to get language columns (exclude 'en' and 'context_checked')
        const languageColumns = allColumns.filter(col =>
            col.toLowerCase() !== 'en' && col.toLowerCase() !== 'context_checked'
        );

        if (languageColumns.length === 0) {
            alert("No language columns found to split!");
            setIsLoading(false);
            return;
        }

        // Check if 'en' column exists
        if (!allColumns.includes('en')) {
            alert("'en' column not found in table!");
            setIsLoading(false);
            return;
        }

        // Create a separate database for each language
        initSqlJs({locateFile: file => SQL_WASM_PATH}).then(function (SQL) {
            languageColumns.forEach(langCol => {
                // Create new database
                const newDb = new SQL.Database();

                // Create table with just 'en' and the language column
                const createTableSql = `CREATE TABLE "${tableName}" (en TEXT, "${langCol}" TEXT)`;
                newDb.run(createTableSql);

                // Copy data (only 'en' and language column)
                const selectSql = `SELECT en, "${langCol}" FROM '${tableName}'`;
                const sourceResults = db.exec(selectSql);

                if (sourceResults && sourceResults.length > 0) {
                    const values = sourceResults[0].values;

                    // Insert all rows into new database
                    values.forEach(row => {
                        const enValue = row[0] !== null ? row[0].toString().replace(/'/g, "''") : '';
                        const langValue = row[1] !== null ? row[1].toString().replace(/'/g, "''") : '';
                        const insertSql = `INSERT INTO "${tableName}" (en, "${langCol}") VALUES ('${enValue}', '${langValue}')`;
                        newDb.run(insertSql);
                    });
                }

                // Export the new database
                const data = newDb.export();
                const blob = new Blob([data], { type: "application/x-sqlite3" });
                const filename = `translations-en-${langCol}.db`;

                saveAs(blob, filename);
                console.log(`Created: ${filename}`);

                // Close the new database
                newDb.close();
            });

            alert(`Successfully created ${languageColumns.length} split database(s)!\n\nFiles: ${languageColumns.map(col => `translations-en-${col}.db`).join(', ')}`);
            setIsLoading(false);
        });

    } catch (error) {
        console.error("Split table error:", error);
        alert("Error splitting table: " + error.message);
        setIsLoading(false);
    }
}

function splitToExcel() {
    const tableName = $("#tables").val();

    if (!tableName) {
        alert("Please select a table first!");
        return;
    }

    setIsLoading(true);

    try {
        // Get all columns from the table
        const query = "SELECT * FROM '" + tableName + "'";
        const results = db.exec(query);

        if (!results || results.length === 0) {
            alert("No data to export!");
            setIsLoading(false);
            return;
        }

        const allColumns = results[0].columns;
        const allValues = results[0].values;

        // Get index of id and en columns
        const idIndex = allColumns.findIndex(col => col.toLowerCase() === 'id');
        const enIndex = allColumns.findIndex(col => col.toLowerCase() === 'en');

        if (idIndex === -1 || enIndex === -1) {
            alert("'id' or 'en' column not found in table!");
            setIsLoading(false);
            return;
        }

        // Filter to get language columns (exclude 'id', 'en', and 'context_checked')
        const languageColumns = allColumns
            .map((col, index) => ({ col, index }))
            .filter(item =>
                item.col.toLowerCase() !== 'id' &&
                item.col.toLowerCase() !== 'en' &&
                item.col.toLowerCase() !== 'context_checked'
            );

        if (languageColumns.length === 0) {
            alert("No language columns found to split!");
            setIsLoading(false);
            return;
        }

        // Create a ZIP file to hold all Excel files
        const zip = new JSZip();

        // Create an Excel file for each language
        languageColumns.forEach(langItem => {
            const langCol = langItem.col;
            const langIndex = langItem.index;

            // Prepare data: headers and rows with id, en, and language column
            const headers = ['id', 'en', langCol];
            const rows = allValues.map(row => [
                row[idIndex],
                row[enIndex],
                row[langIndex]
            ]);

            // Create worksheet data: [headers, ...rows]
            const wsData = [headers, ...rows];

            // Create worksheet from array of arrays
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // Create workbook and add worksheet
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'translations');

            // Generate Excel file as binary
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

            // Add to ZIP
            const filename = `translations-en-${langCol}.xlsx`;
            zip.file(filename, wbout);

            console.log(`Added to ZIP: ${filename}`);
        });

        // Generate and download the ZIP file
        zip.generateAsync({ type: "blob" })
            .then(function (content) {
                saveAs(content, "split-translations.zip");
                alert(`Successfully created ${languageColumns.length} Excel file(s)!\n\nDownloading: split-translations.zip`);
                setIsLoading(false);
            });

    } catch (error) {
        console.error("Split to Excel error:", error);
        alert("Error splitting to Excel: " + error.message);
        setIsLoading(false);
    }
}
