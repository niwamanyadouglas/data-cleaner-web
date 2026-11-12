import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  cleanWithReport,
  DEFAULT_PLACEHOLDERS,
  type Cell,
  type CleanOptions,
  type ColumnCase,
  type Row,
} from "@/lib/cleaner";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ParsedOptions {
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

function parseOptions(raw: string | null | undefined): CleanOptions {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ParsedOptions;
    const out: CleanOptions = {};
    if (Array.isArray(parsed.dateColumns)) out.dateColumns = parsed.dateColumns;
    if (typeof parsed.dayfirst === "boolean") out.dayfirst = parsed.dayfirst;
    if (typeof parsed.convertNumeric === "boolean") out.convertNumeric = parsed.convertNumeric;
    if (Array.isArray(parsed.placeholders)) out.placeholders = parsed.placeholders;
    if (parsed.columnCase === "snake" || parsed.columnCase === "camel" || parsed.columnCase === "keep") {
      out.columnCase = parsed.columnCase;
    }
    if (typeof parsed.normaliseInternalWs === "boolean") out.normaliseInternalWs = parsed.normaliseInternalWs;
    if (typeof parsed.dedup === "boolean") out.dedup = parsed.dedup;
    if (Array.isArray(parsed.dedupSubset)) out.dedupSubset = parsed.dedupSubset;
    if (Array.isArray(parsed.numericSkip)) out.numericSkip = parsed.numericSkip;
    return out;
  } catch {
    return {};
  }
}

function excelCellToCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function sheetToRows(sheet: XLSX.WorkSheet): Row[] {
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });
  return json.map((obj) => {
    const row: Row = {};
    for (const [k, v] of Object.entries(obj)) {
      row[k] = excelCellToCell(v);
    }
    return row;
  });
}

function parseCsv(text: string, delimiter?: string): Row[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: delimiter || "",
    transformHeader: (h) => h,
  });
  return result.data.map((obj) => {
    const row: Row = {};
    for (const [k, v] of Object.entries(obj)) {
      row[k] = v === undefined || v === "" ? null : v;
    }
    return row;
  });
}

function parseTsv(text: string): Row[] {
  return parseCsv(text, "\t");
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    let rows: Row[] = [];
    let sourceName: string | undefined;
    let options: CleanOptions = {};

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const text = form.get("text");
      const optionsRaw = form.get("options");
      options = parseOptions(typeof optionsRaw === "string" ? optionsRaw : null);

      if (typeof file === "object" && file !== null && "name" in file) {
        const f = file as File;
        sourceName = f.name;
        const buf = Buffer.from(await f.arrayBuffer());
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "";

        if (ext === "csv") {
          rows = parseCsv(buf.toString("utf-8"));
        } else if (ext === "tsv") {
          rows = parseTsv(buf.toString("utf-8"));
        } else if (ext === "json") {
          const data = JSON.parse(buf.toString("utf-8"));
          if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== "object") {
            return NextResponse.json(
              { error: "JSON input must be an array of objects." },
              { status: 400 },
            );
          }
          rows = data as Row[];
        } else if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
          const wb = XLSX.read(buf, { type: "buffer" });
          const sheetName = wb.SheetNames[0];
          rows = sheetToRows(wb.Sheets[sheetName]);
        } else {
          rows = parseCsv(buf.toString("utf-8"));
        }
      } else if (typeof text === "string" && text.trim().length > 0) {
        const firstLine = text.split(/\r?\n/)[0] ?? "";
        if (firstLine.includes("\t") && !firstLine.includes(",")) {
          rows = parseTsv(text);
        } else {
          rows = parseCsv(text);
        }
        sourceName = "pasted-data.csv";
      } else {
        return NextResponse.json(
          { error: "No input provided. Send a 'file' or a 'text' field." },
          { status: 400 },
        );
      }
    } else if (contentType.includes("application/json")) {
      const body = await req.json() as { text?: string; options?: ParsedOptions; delimiter?: string };
      if (!body.text || body.text.trim().length === 0) {
        return NextResponse.json(
          { error: "JSON body must include a non-empty 'text' field." },
          { status: 400 },
        );
      }
      const delimiter = body.delimiter;
      if (delimiter === "\t") {
        rows = parseTsv(body.text);
      } else if (delimiter) {
        rows = parseCsv(body.text, delimiter);
      } else {
        const firstLine = body.text.split(/\r?\n/)[0] ?? "";
        rows = firstLine.includes("\t") && !firstLine.includes(",") ? parseTsv(body.text) : parseCsv(body.text);
      }
      sourceName = "pasted-data.csv";
      const o = body.options ?? {};
      if (Array.isArray(o.dateColumns)) options.dateColumns = o.dateColumns;
      if (typeof o.dayfirst === "boolean") options.dayfirst = o.dayfirst;
      if (typeof o.convertNumeric === "boolean") options.convertNumeric = o.convertNumeric;
      if (Array.isArray(o.placeholders)) options.placeholders = o.placeholders;
      if (o.columnCase === "snake" || o.columnCase === "camel" || o.columnCase === "keep") options.columnCase = o.columnCase;
      if (typeof o.normaliseInternalWs === "boolean") options.normaliseInternalWs = o.normaliseInternalWs;
      if (typeof o.dedup === "boolean") options.dedup = o.dedup;
      if (Array.isArray(o.dedupSubset)) options.dedupSubset = o.dedupSubset;
      if (Array.isArray(o.numericSkip)) options.numericSkip = o.numericSkip;
    } else {
      return NextResponse.json(
        { error: `Unsupported content-type: ${contentType}. Use multipart/form-data or application/json.` },
        { status: 400 },
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No rows could be parsed from the input." },
        { status: 400 },
      );
    }

    const result = cleanWithReport(rows, options, sourceName);

    return NextResponse.json({
      ...result,
      defaultPlaceholders: DEFAULT_PLACEHOLDERS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to clean data: ${message}` },
      { status: 500 },
    );
  }
}
