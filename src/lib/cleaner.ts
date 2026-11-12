/**
 * TypeScript port of the Python `cleaner` package.
 *
 * Mirrors the structure of `cleaner/cleaning.py` and `cleaner/report.py`
 * so behaviour stays close to the CLI tool. Operates on plain JS objects
 * (rows = Record<string, Cell>) which is what CSV/Excel/JSON parsers return.
 */

export type Cell = string | number | null;
export type Row = Record<string, Cell>;

export type ColumnCase = "snake" | "camel" | "keep";
export type ReportFormat = "text" | "markdown";

export interface CleaningLog {
  renamedColumns: Record<string, string>;
  columnCaseStyle: ColumnCase;
  placeholdersReplaced: number;
  whitespaceNormalised: number;
  duplicatesRemoved: number;
  datesUnparsed: Record<string, number>;
  numericColumns: string[];
  stepsRun: string[];
}

export interface CleanOptions {
  dateColumns?: string[];
  dayfirst?: boolean;
  convertNumeric?: boolean;
  placeholders?: string[];
  columnCase?: ColumnCase;
  normaliseInternalWs?: boolean;
  dedup?: boolean;
  dedupSubset?: string[];
  numericSkip?: string[];
}

export interface CleanResult {
  rows: Row[];
  log: CleaningLog;
}

export interface FullCleanResult extends CleanResult {
  originalRows: Row[];
  reportText: string;
  reportMarkdown: string;
  cleanedDtypes: Record<string, string>;
  originalColumns: string[];
  cleanedColumns: string[];
}

export const DEFAULT_PLACEHOLDERS: string[] = [
  "N/A",
  "n/a",
  "NA",
  "#N/A",
  "null",
  "NULL",
  "Null",
  "-",
  "--",
  "None",
  "none",
  "NaN",
  "nan",
  "",
  " ",
];

const LEADING_ZERO = /^[+-]?0\d/;
const INTERNAL_WS = /\s+/g;

function newLog(): CleaningLog {
  return {
    renamedColumns: {},
    columnCaseStyle: "snake",
    placeholdersReplaced: 0,
    whitespaceNormalised: 0,
    duplicatesRemoved: 0,
    datesUnparsed: {},
    numericColumns: [],
    stepsRun: [],
  };
}

function recordStep(log: CleaningLog, name: string): void {
  if (log.stepsRun[log.stepsRun.length - 1] !== name) {
    log.stepsRun.push(name);
  }
}

function isStringCell(v: Cell): v is string {
  return typeof v === "string";
}

function isMissing(v: Cell): boolean {
  return v === null || v === undefined || (typeof v === "string" && v === "");
}

/** Turn a raw column name into a clean identifier. */
export function normaliseColumnName(name: unknown, caseStyle: ColumnCase = "snake"): string {
  const text = String(name ?? "").trim();
  if (!text) return "column";

  if (caseStyle === "keep") {
    const t = text.replace(INTERNAL_WS, "_").replace(/[^A-Za-z0-9_]/g, "").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    return t || "column";
  }

  const lower = text.toLowerCase();
  const t = lower
    .replace(INTERNAL_WS, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (caseStyle === "camel") {
    const parts = t.split("_").filter(Boolean);
    if (parts.length === 0) return "column";
    return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  }
  return t || "column";
}

/** Standardise column names, de-duplicating collisions with _2, _3, ... */
export function cleanColumnNames(
  rows: Row[],
  log: CleaningLog,
  caseStyle: ColumnCase = "snake",
): Row[] {
  if (rows.length === 0) return rows;
  const originalCols = Object.keys(rows[0]);
  const used = new Set<string>();
  const renameMap: Record<string, string> = {};

  for (const old of originalCols) {
    const base = normaliseColumnName(old, caseStyle);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    renameMap[old] = candidate;
    if (candidate !== old) {
      log.renamedColumns[old] = candidate;
    }
  }

  const out = rows.map((row) => {
    const newRow: Row = {};
    for (const old of originalCols) {
      newRow[renameMap[old]] = row[old];
    }
    return newRow;
  });

  log.columnCaseStyle = caseStyle;
  recordStep(log, "clean_column_names");
  return out;
}

/** Trim whitespace and optionally collapse internal whitespace runs. */
export function stripTextValues(
  rows: Row[],
  log: CleaningLog,
  normaliseInternal = false,
): Row[] {
  if (rows.length === 0) return rows;
  const cols = Object.keys(rows[0]);
  let normalised = 0;

  const out = rows.map((row) => {
    const newRow: Row = {};
    for (const col of cols) {
      const v = row[col];
      if (typeof v !== "string") {
        newRow[col] = v;
        continue;
      }
      let stripped = v.trim();
      if (normaliseInternal && stripped.length > 0) {
        const collapsed = stripped.replace(INTERNAL_WS, " ");
        if (collapsed !== stripped) normalised += 1;
        stripped = collapsed;
      }
      newRow[col] = stripped === "" ? null : stripped;
    }
    return newRow;
  });

  if (normaliseInternal) log.whitespaceNormalised += normalised;
  recordStep(log, "strip_text_values");
  return out;
}

/** Replace placeholder strings (exact match) with null. */
export function replacePlaceholders(
  rows: Row[],
  log: CleaningLog,
  placeholders: string[] = DEFAULT_PLACEHOLDERS,
): Row[] {
  if (rows.length === 0) return rows;
  const set = new Set(placeholders.filter((p) => typeof p === "string"));
  const cols = Object.keys(rows[0]);
  let total = 0;

  const out = rows.map((row) => {
    const newRow: Row = {};
    for (const col of cols) {
      const v = row[col];
      if (typeof v === "string" && set.has(v)) {
        newRow[col] = null;
        total += 1;
      } else {
        newRow[col] = v;
      }
    }
    return newRow;
  });

  log.placeholdersReplaced += total;
  recordStep(log, "replace_placeholders");
  return out;
}

/**
 * Month abbreviation lookup (case-insensitive).
 */
const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse a single date value into a UTC Date.
 *
 * All dates are interpreted as UTC midnight — no local-timezone shifting.
 * So "23/05/2025" becomes 2025-05-23T00:00:00.000Z regardless of where
 * the server runs. ISO timestamps with an explicit timezone are honoured
 * as-is; ISO dates without a timezone are treated as UTC.
 */
function parseDateValue(value: Cell, dayfirst: boolean): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;

  // Try ISO 8601 first: yyyy-mm-dd or yyyy-mm-ddTHH:MM:SS with optional timezone.
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (isoMatch) {
    const [, y, mo, d, hh, mm, ss] = isoMatch;
    // No timezone in the string → treat as UTC midnight (not local time).
    const date = new Date(Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      hh ? Number(hh) : 0,
      mm ? Number(mm) : 0,
      ss ? Number(ss) : 0,
    ));
    return isNaN(date.getTime()) ? null : date;
  }

  // Try dd-MMM-yyyy or dd MMM yyyy (e.g. "12-Oct-2025", "05 Jun 2026").
  const dmyLong = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,4})[-\s](\d{4})$/);
  if (dmyLong) {
    const [, d, monStr, y] = dmyLong;
    const month = MONTH_ABBR[monStr.toLowerCase()];
    if (month === undefined) return null;
    const day = Number(d);
    const year = Number(y);
    if (day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month, day));
    return isNaN(date.getTime()) ? null : date;
  }

  // Try "MMM dd, yyyy" or "MMM dd yyyy" (e.g. "Jan 5, 2026", "Jun 09 2026").
  const mdyLong = s.match(/^([A-Za-z]{3,4})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdyLong) {
    const [, monStr, d, y] = mdyLong;
    const month = MONTH_ABBR[monStr.toLowerCase()];
    if (month === undefined) return null;
    const day = Number(d);
    const year = Number(y);
    if (day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month, day));
    return isNaN(date.getTime()) ? null : date;
  }

  // Try dd/mm/yyyy or mm/dd/yyyy (4-digit year at end).
  const slashMatch = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (slashMatch) {
    const [, a, b, y] = slashMatch;
    const day = dayfirst ? Number(a) : Number(b);
    const month = dayfirst ? Number(b) : Number(a);
    const year = Number(y);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    return isNaN(date.getTime()) ? null : date;
  }

  // Try yy-mm-dd (2-digit year).
  const yymmdd = s.match(/^(\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (yymmdd) {
    const [, y, a, b] = yymmdd;
    const year = 2000 + Number(y);
    const day = dayfirst ? Number(a) : Number(b);
    const month = dayfirst ? Number(b) : Number(a);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    return isNaN(date.getTime()) ? null : date;
  }

  // Last resort: let Date parse it. This catches edge cases the regex misses.
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/** Parse date columns into ISO strings (so they survive JSON round-tripping). */
export function standardiseDates(
  rows: Row[],
  log: CleaningLog,
  dateColumns: string[],
  dayfirst = true,
): Row[] {
  if (rows.length === 0) return rows;
  const cols = Object.keys(rows[0]);

  let out = rows;
  for (const requested of dateColumns) {
    if (!cols.includes(requested)) continue;
    let unparsed = 0;
    let before = 0;
    out = out.map((row) => {
      const newRow = { ...row };
      const v = row[requested];
      if (v !== null && v !== undefined && !(typeof v === "string" && v === "")) {
        before += 1;
      }
      const parsed = parseDateValue(v, dayfirst);
      if (parsed === null) {
        if (v !== null && v !== undefined && !(typeof v === "string" && v === "")) {
          unparsed += 1;
        }
        newRow[requested] = null;
      } else {
        newRow[requested] = parsed.toISOString();
      }
      return newRow;
    });
    if (unparsed > 0) log.datesUnparsed[requested] = unparsed;
  }

  recordStep(log, "standardise_dates");
  return out;
}

/** Convert string columns to numbers when every non-missing value is numeric. */
export function convertNumericColumns(
  rows: Row[],
  log: CleaningLog,
  skip: string[] = [],
): Row[] {
  if (rows.length === 0) return rows;
  const cols = Object.keys(rows[0]);
  const skipSet = new Set(skip);

  for (const col of cols) {
    if (skipSet.has(col)) continue;
    // Only consider columns whose values are currently strings (or null).
    const nonMissingStrings: string[] = [];
    let allStrings = true;
    for (const row of rows) {
      const v = row[col];
      if (v === null || v === undefined) continue;
      if (typeof v !== "string") {
        allStrings = false;
        break;
      }
      nonMissingStrings.push(v);
    }
    if (!allStrings || nonMissingStrings.length === 0) continue;

    // Skip leading-zero identifiers.
    if (nonMissingStrings.some((s) => LEADING_ZERO.test(s))) continue;

    // Try to convert every value; if any fails, leave the column alone.
    const converted: number[] = [];
    let allOk = true;
    for (const s of nonMissingStrings) {
      const n = Number(s);
      if (isNaN(n) || !isFinite(n)) {
        allOk = false;
        break;
      }
      converted.push(n);
    }
    if (!allOk) continue;

    // Apply the conversion in place.
    for (const row of rows) {
      const v = row[col];
      if (typeof v === "string" && v !== "") {
        row[col] = Number(v);
      }
    }
    log.numericColumns.push(col);
  }

  recordStep(log, "convert_numeric_columns");
  return rows;
}

/** Stable JSON.stringify for a row, used for duplicate detection. */
function rowKey(row: Row, subset?: string[]): string {
  const cols = subset && subset.length > 0 ? subset : Object.keys(row);
  return cols.map((c) => {
    const v = row[c];
    if (v === null || v === undefined) return "\u0000";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  }).join("\u0001");
}

export function removeDuplicates(
  rows: Row[],
  log: CleaningLog,
  subset?: string[],
  keep: "first" | "last" | "none" = "first",
): Row[] {
  if (rows.length === 0) return rows;
  const seen = new Map<string, number>();
  const indicesToKeep: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const k = rowKey(rows[i], subset);
    if (!seen.has(k)) {
      seen.set(k, i);
      if (keep !== "none") indicesToKeep.push(i);
    } else if (keep === "last") {
      // Replace the previously kept index with this one.
      const prevIdx = seen.get(k)!;
      const pos = indicesToKeep.indexOf(prevIdx);
      if (pos >= 0) indicesToKeep[pos] = i;
      seen.set(k, i);
    } else if (keep === "none") {
      // Mark as duplicate so it won't appear, and also remove earlier occurrence.
      const prevIdx = seen.get(k)!;
      const pos = indicesToKeep.indexOf(prevIdx);
      if (pos >= 0) indicesToKeep.splice(pos, 1);
    }
  }

  const removed = rows.length - indicesToKeep.length;
  log.duplicatesRemoved += removed;
  const out = indicesToKeep.map((i) => rows[i]);
  recordStep(log, "remove_duplicates");
  return out;
}

export function cleanPipeline(rows: Row[], options: CleanOptions = {}): CleanResult {
  const log = newLog();
  const {
    dateColumns = ["date"],
    dayfirst = true,
    convertNumeric = true,
    placeholders = DEFAULT_PLACEHOLDERS,
    columnCase = "snake",
    normaliseInternalWs = false,
    dedup = true,
    dedupSubset,
    numericSkip = [],
  } = options;

  const normalisedDateCols = dateColumns.map((c) => normaliseColumnName(c, columnCase));

  let out = cleanColumnNames(rows, log, columnCase);
  out = stripTextValues(out, log, normaliseInternalWs);
  out = replacePlaceholders(out, log, placeholders);
  out = standardiseDates(out, log, normalisedDateCols, dayfirst);
  if (convertNumeric) {
    out = convertNumericColumns(out, log, numericSkip);
  }
  if (dedup) {
    out = removeDuplicates(out, log, dedupSubset);
  }
  return { rows: out, log };
}

/** Infer a dtype label for a column based on its values. */
function inferDtype(rows: Row[], col: string): string {
  let sawDate = false;
  let sawNumber = false;
  let sawString = false;
  let sawNull = false;
  for (const row of rows) {
    const v = row[col];
    if (v === null || v === undefined) {
      sawNull = true;
      continue;
    }
    if (typeof v === "number") {
      sawNumber = true;
    } else if (typeof v === "string") {
      // Dates were converted to ISO strings; detect by regex.
      if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v)) {
        sawDate = true;
      } else {
        sawString = true;
      }
    }
  }
  if (sawDate && !sawNumber && !sawString) return "datetime64[ns]";
  if (sawNumber && !sawString && !sawDate) return sawNull ? "Float64" : "float64";
  if (sawString) return "string";
  if (sawDate) return "datetime64[ns]";
  return "object";
}

function humanMemory(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function estimateMemory(rows: Row[]): number {
  if (rows.length === 0) return 0;
  const cols = Object.keys(rows[0]);
  let bytes = 0;
  for (const row of rows) {
    for (const col of cols) {
      const v = row[col];
      if (v === null) {
        bytes += 8;
      } else if (typeof v === "number") {
        bytes += 8;
      } else if (typeof v === "string") {
        bytes += v.length * 2 + 16;
      }
    }
  }
  return bytes;
}

/** Build the plain-text report. */
export function buildReport(
  originalRows: Row[],
  cleanedRows: Row[],
  log: CleaningLog,
  fmt: ReportFormat = "text",
  sourceName?: string,
  topNMissing = 20,
): string {
  const rowsBefore = originalRows.length;
  const rowsAfter = cleanedRows.length;
  const colsBefore = originalRows.length > 0 ? Object.keys(originalRows[0]).length : 0;
  const colsAfter = cleanedRows.length > 0 ? Object.keys(cleanedRows[0]).length : 0;
  const timestamp = new Date().toLocaleString();

  const unparsedEntries = Object.entries(log.datesUnparsed);
  const unparsedTotal = unparsedEntries.reduce((s, [, n]) => s + n, 0);
  const unparsedDetail = unparsedTotal > 0
    ? ` (${unparsedEntries.map(([c, n]) => `${c}: ${n}`).join(", ")})`
    : "";
  const numeric = log.numericColumns.length > 0 ? log.numericColumns.join(", ") : "none";
  const steps = log.stepsRun.length > 0 ? log.stepsRun.join(", ") : "none";
  const memoryBytes = estimateMemory(cleanedRows);

  const cleanedCols = cleanedRows.length > 0 ? Object.keys(cleanedRows[0]) : [];

  // Missing values per column.
  const missing: Array<[string, number]> = [];
  for (const col of cleanedCols) {
    let count = 0;
    for (const row of cleanedRows) {
      if (row[col] === null || row[col] === undefined) count += 1;
    }
    if (count > 0) missing.push([col, count]);
  }
  missing.sort((a, b) => b[1] - a[1]);

  if (fmt === "markdown") {
    const src = sourceName ? `**Source file:** \`${sourceName}\`\n\n` : "";
    const renamesMd = Object.keys(log.renamedColumns).length > 0
      ? "\n### Column renames\n\n| Original | Cleaned |\n| --- | --- |\n" +
        Object.entries(log.renamedColumns).map(([o, n]) => `| \`${o}\` | \`${n}\` |`).join("\n") + "\n"
      : "";
    const dtypeRows = cleanedCols.map((c) => `| \`${c}\` | \`${inferDtype(cleanedRows, c)}\` |`).join("\n");
    const missingMd = missing.length === 0
      ? "_No missing values._"
      : "| Column | Missing | % |\n| --- | ---: | ---: |\n" +
        missing.slice(0, topNMissing).map(([c, n]) => {
          const pct = rowsAfter > 0 ? (n / rowsAfter * 100).toFixed(1) : "n/a";
          return `| \`${c}\` | ${n} | ${pct}% |`;
        }).join("\n") +
        (missing.length > topNMissing ? `\n\n_... and ${missing.length - topNMissing} more._` : "");

    return `# Data Cleaning Report

_Generated: ${timestamp}_
${src}

## Summary

| Metric | Value |
| --- | ---: |
| Rows before | ${rowsBefore} |
| Rows after | ${rowsAfter} |
| Columns before | ${colsBefore} |
| Columns after | ${colsAfter} |
| Rows removed | ${rowsBefore - rowsAfter} |
| Columns renamed | ${Object.keys(log.renamedColumns).length} |
| Placeholder values replaced | ${log.placeholdersReplaced} |
| Internal whitespace runs normalised | ${log.whitespaceNormalised} |
| Duplicate rows removed | ${log.duplicatesRemoved} |
| Dates that could not be parsed | ${unparsedTotal}${unparsedDetail} |
| Columns converted to numbers | ${numeric} |
| Steps run | ${steps} |
${renamesMd}
### Column dtypes after cleaning

_Memory footprint: ${humanMemory(memoryBytes)}_

| Column | Dtype |
| --- | --- |
${dtypeRows || "| _(none)_ | |"}

### Missing values after cleaning

${missingMd}
`;
  }

  const lines: string[] = [
    "DATA CLEANING REPORT",
    "========================================",
    `Generated: ${timestamp}`,
  ];
  if (sourceName) lines.push(`Source file: ${sourceName}`);
  lines.push(
    `Rows before: ${rowsBefore} (${colsBefore} columns)`,
    `Rows after: ${rowsAfter} (${colsAfter} columns)`,
    `Rows removed: ${rowsBefore - rowsAfter}`,
    "",
    "Changes made:",
    `  - Columns renamed: ${Object.keys(log.renamedColumns).length}`,
    `  - Placeholder values replaced with missing: ${log.placeholdersReplaced}`,
    `  - Internal whitespace runs normalised: ${log.whitespaceNormalised}`,
    `  - Duplicate rows removed: ${log.duplicatesRemoved}`,
    `  - Dates that could not be parsed: ${unparsedTotal}${unparsedDetail}`,
    `  - Columns converted to numbers: ${numeric}`,
    `  - Steps run: ${steps}`,
  );

  if (Object.keys(log.renamedColumns).length > 0) {
    lines.push("", "Column renames:");
    for (const [old, n] of Object.entries(log.renamedColumns)) {
      lines.push(`  - '${old}' -> ${n}`);
    }
  }

  lines.push("", `Column dtypes after cleaning (memory: ${humanMemory(memoryBytes)}):`);
  for (const col of cleanedCols) {
    lines.push(`  - ${col}: ${inferDtype(cleanedRows, col)}`);
  }

  lines.push("", "Missing values after cleaning:");
  if (missing.length === 0) {
    lines.push("  (no missing values)");
  } else {
    for (const [col, count] of missing.slice(0, topNMissing)) {
      const pct = rowsAfter > 0 ? (count / rowsAfter * 100).toFixed(1) : "0.0";
      lines.push(`  - ${col}: ${count} (${pct}%)`);
    }
    if (missing.length > topNMissing) {
      lines.push(`  ... and ${missing.length - topNMissing} more columns with missing values`);
    }
  }

  return lines.join("\n");
}

/** Run the full pipeline and attach the text + markdown reports. */
export function cleanWithReport(
  originalRows: Row[],
  options: CleanOptions = {},
  sourceName?: string,
): FullCleanResult {
  const { rows: cleanedRows, log } = cleanPipeline(originalRows, options);
  const reportText = buildReport(originalRows, cleanedRows, log, "text", sourceName);
  const reportMarkdown = buildReport(originalRows, cleanedRows, log, "markdown", sourceName);
  const cleanedColumns = cleanedRows.length > 0 ? Object.keys(cleanedRows[0]) : [];
  const originalColumns = originalRows.length > 0 ? Object.keys(originalRows[0]) : [];
  const cleanedDtypes: Record<string, string> = {};
  for (const col of cleanedColumns) {
    cleanedDtypes[col] = inferDtype(cleanedRows, col);
  }
  return {
    rows: cleanedRows,
    log,
    originalRows,
    reportText,
    reportMarkdown,
    cleanedDtypes,
    originalColumns,
    cleanedColumns,
  };
}

/** Serialise cleaned rows to a CSV string for download. */
export function rowsToCsv(rows: Row[], delimiter = ","): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const escape = (v: Cell): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : String(v);
    if (s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [cols.map((c) => escape(c)).join(delimiter)];
  for (const row of rows) {
    lines.push(cols.map((c) => escape(row[c])).join(delimiter));
  }
  return lines.join("\n");
}
