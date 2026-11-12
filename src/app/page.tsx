"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Hash,
  Link2,
  Loader2,
  Sparkles,
  Table as TableIcon,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/theme-toggle";

import type { CleanOptions, ColumnCase, FullCleanResult, Row } from "@/lib/cleaner";

const SAMPLE_DATA = `First Name,  Email Address  ,Date,Amount,Zip Code
  Alice  ,a@x.com,2026-01-05,100,01234
Bob,b@x.com,05/01/2026,200.5,05678
  Charlie  ,c@x.com,2026-02-01,N/A,99999
Alice,a@x.com,2026-01-05,100,01234
Bob,b@x.com,05/01/2026,200.5,05678
John  Doe,j@x.com,2026-03-15,50,00001`;

type InputMode = "upload" | "paste";

interface UiOptions {
  dateColumns: string;
  dayfirst: boolean;
  columnCase: ColumnCase;
  placeholders: string; // comma-separated, empty = default
  normaliseInternalWs: boolean;
  skipNumeric: boolean;
  skipDedup: boolean;
}

const DEFAULT_UI_OPTIONS: UiOptions = {
  dateColumns: "date",
  dayfirst: true,
  columnCase: "snake",
  placeholders: "",
  normaliseInternalWs: false,
  skipNumeric: false,
  skipDedup: false,
};

function buildOptions(ui: UiOptions): CleanOptions {
  const opts: CleanOptions = {
    dayfirst: ui.dayfirst,
    convertNumeric: !ui.skipNumeric,
    dedup: !ui.skipDedup,
    columnCase: ui.columnCase,
    normaliseInternalWs: ui.normaliseInternalWs,
  };
  const dateCols = ui.dateColumns.split(",").map((s) => s.trim()).filter(Boolean);
  if (dateCols.length > 0) opts.dateColumns = dateCols;
  const placeholders = ui.placeholders.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (placeholders.length > 0) opts.placeholders = placeholders;
  return opts;
}

function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") {
    // Compact ISO date strings for display.
    if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.\d{3})?Z$/.test(v)) return v.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}T.+$/.test(v)) return v.replace("T", " ").replace(/\.\d{3}Z$/, "").replace("Z", "");
    return v;
  }
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v);
}

const MAX_PREVIEW_ROWS = 100;

export default function HomePage() {
  const [inputMode, setInputMode] = useState<InputMode>("upload");
  const [pastedText, setPastedText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uiOptions, setUiOptions] = useState<UiOptions>(DEFAULT_UI_OPTIONS);
  const [isCleaning, setIsCleaning] = useState(false);
  const [result, setResult] = useState<FullCleanResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasInput = inputMode === "upload" ? !!selectedFile : pastedText.trim().length > 0;

  const handleFileSelect = useCallback((file: File | null) => {
    if (!file) return;
    const okExtensions = [".csv", ".tsv", ".xlsx", ".xls", ".xlsm", ".json"];
    const lower = file.name.toLowerCase();
    if (!okExtensions.some((ext) => lower.endsWith(ext))) {
      toast.error("Unsupported file type", {
        description: `Please upload one of: ${okExtensions.join(", ")}`,
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large", {
        description: "Maximum size is 10 MB.",
      });
      return;
    }
    setSelectedFile(file);
    setResult(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const loadSample = useCallback(() => {
    setPastedText(SAMPLE_DATA);
    setInputMode("paste");
    setSelectedFile(null);
    setResult(null);
    toast.success("Sample data loaded", {
      description: "6 rows of messy data ready to clean.",
    });
  }, []);

  const clearInput = useCallback(() => {
    setSelectedFile(null);
    setPastedText("");
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const runClean = useCallback(async () => {
    if (!hasInput) {
      toast.error("No input", { description: "Upload a file or paste data first." });
      return;
    }
    setIsCleaning(true);
    setResult(null);

    try {
      const form = new FormData();
      if (inputMode === "upload" && selectedFile) {
        form.append("file", selectedFile);
      } else {
        form.append("text", pastedText);
      }
      form.append("options", JSON.stringify(buildOptions(uiOptions)));

      const res = await fetch("/api/clean", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error ?? `Request failed (${res.status})`;
        toast.error("Cleaning failed", { description: msg });
        return;
      }
      setResult(data as FullCleanResult);
      toast.success("Cleaning complete", {
        description: `${data.originalRows.length} rows in → ${data.rows.length} rows out.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Network error", { description: msg });
    } finally {
      setIsCleaning(false);
    }
  }, [hasInput, inputMode, pastedText, selectedFile, uiOptions]);

  const previewRows = useMemo(() => {
    if (!result) return [];
    return result.rows.slice(0, MAX_PREVIEW_ROWS);
  }, [result]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Toaster richColors position="top-right" />
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Data Cleaner</h1>
              <p className="text-xs text-muted-foreground leading-tight">
                Drop your messy data, get clean data back.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href="https://github.com/niwamanyadouglas/data-cleaner"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <section className="mb-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Clean messy spreadsheets in seconds
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Drag and drop a CSV, TSV, Excel or JSON file — or paste your data straight in.
            Standardised column names, parsed dates, replaced placeholders, deduplicated rows,
            and a full report of what changed.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap text-xs">
            <Badge variant="secondary">CSV / TSV / XLSX / JSON</Badge>
            <Badge variant="secondary">Up to 10 MB</Badge>
            <Badge variant="secondary">Runs in your browser</Badge>
          </div>
        </section>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">1. Provide your data</CardTitle>
            <CardDescription>
              Upload a file or paste raw CSV/TSV text. Either works.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as InputMode)}>
              <TabsList className="mb-4">
                <TabsTrigger value="upload" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Upload file
                </TabsTrigger>
                <TabsTrigger value="paste" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Paste data
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload">
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.xlsx,.xls,.xlsm,.json"
                    className="sr-only"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <FileSpreadsheet className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-medium">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Replace
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedFile(null)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-6">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Upload className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-medium">
                          Drag and drop your file here
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          or click to browse — CSV, TSV, XLSX, JSON (max 10 MB)
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose file
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="paste">
                <div className="space-y-2">
                  <Label htmlFor="paste-area" className="text-xs text-muted-foreground">
                    Paste CSV or TSV (with a header row)
                  </Label>
                  <Textarea
                    id="paste-area"
                    value={pastedText}
                    onChange={(e) => {
                      setPastedText(e.target.value);
                      setResult(null);
                    }}
                    placeholder={"First Name, Email, Date, Amount\nAlice, a@x.com, 2026-01-05, 100\nBob, b@x.com, 05/01/2026, 200.5"}
                    className="font-mono text-xs min-h-[200px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tip: tabs are detected automatically for TSV pasted from Excel.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadSample}>
                Load sample data
              </Button>
              {hasInput && (
                <Button variant="ghost" size="sm" onClick={clearInput}>
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">2. Cleaning options</CardTitle>
            <CardDescription>
              Defaults are sensible. Expand any section to customise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" defaultValue={["dates"]} className="w-full">
              <AccordionItem value="dates">
                <AccordionTrigger className="text-sm">Dates</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="date-cols">Date columns (comma-separated, original names)</Label>
                    <Input
                      id="date-cols"
                      value={uiOptions.dateColumns}
                      onChange={(e) => setUiOptions((o) => ({ ...o, dateColumns: e.target.value }))}
                      placeholder="date, order_date, ship_date"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ambiguous date format (e.g. 05/01/2026)</Label>
                    <RadioGroup
                      value={uiOptions.dayfirst ? "day" : "month"}
                      onValueChange={(v) => setUiOptions((o) => ({ ...o, dayfirst: v === "day" }))}
                      className="flex gap-6"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem id="day-first" value="day" />
                        <Label htmlFor="day-first" className="font-normal text-sm">
                          Day first (5 Jan)
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem id="month-first" value="month" />
                        <Label htmlFor="month-first" className="font-normal text-sm">
                          Month first (1 May)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="columns">
                <AccordionTrigger className="text-sm">Column names</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="case-select">Column name style</Label>
                    <Select
                      value={uiOptions.columnCase}
                      onValueChange={(v: ColumnCase) => setUiOptions((o) => ({ ...o, columnCase: v }))}
                    >
                      <SelectTrigger id="case-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="snake">snake_case (default)</SelectItem>
                        <SelectItem value="camel">camelCase</SelectItem>
                        <SelectItem value="keep">keep original case</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="placeholders">Custom placeholders (leave empty for defaults)</Label>
                    <Input
                      id="placeholders"
                      value={uiOptions.placeholders}
                      onChange={(e) => setUiOptions((o) => ({ ...o, placeholders: e.target.value }))}
                      placeholder="N/A, TBD, ?, --"
                    />
                    <p className="text-xs text-muted-foreground">
                      Defaults cover N/A, null, None, NaN, -, --, empty string.
                    </p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="ws-switch" className="text-sm">Collapse internal whitespace</Label>
                      <p className="text-xs text-muted-foreground">
                        Convert &quot;John  Doe&quot; → &quot;John Doe&quot;.
                      </p>
                    </div>
                    <Switch
                      id="ws-switch"
                      checked={uiOptions.normaliseInternalWs}
                      onCheckedChange={(c) => setUiOptions((o) => ({ ...o, normaliseInternalWs: c }))}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="advanced">
                <AccordionTrigger className="text-sm">Advanced</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="numeric-switch" className="text-sm">Convert numeric columns</Label>
                      <p className="text-xs text-muted-foreground">
                        Convert all-numeric text columns to numbers (on by default).
                      </p>
                    </div>
                    <Switch
                      id="numeric-switch"
                      checked={!uiOptions.skipNumeric}
                      onCheckedChange={(c) => setUiOptions((o) => ({ ...o, skipNumeric: !c }))}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="dedup-switch" className="text-sm">Remove duplicate rows</Label>
                      <p className="text-xs text-muted-foreground">
                        Drop exact duplicates after other cleaning steps (on by default).
                      </p>
                    </div>
                    <Switch
                      id="dedup-switch"
                      checked={!uiOptions.skipDedup}
                      onCheckedChange={(c) => setUiOptions((o) => ({ ...o, skipDedup: !c }))}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
          <CardFooter className="border-t pt-4 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {hasInput
                ? inputMode === "upload"
                  ? `Ready: ${selectedFile?.name}`
                  : `Ready: ${pastedText.trim().split(/\r?\n/).length} line(s) pasted`
                : "Waiting for input…"}
            </p>
            <Button onClick={runClean} disabled={!hasInput || isCleaning} className="gap-2">
              {isCleaning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isCleaning ? "Cleaning…" : "Clean my data"}
              {!isCleaning && <ArrowRight className="h-4 w-4" />}
            </Button>
          </CardFooter>
        </Card>

        {result && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    Cleaning complete
                  </CardTitle>
                  <CardDescription>
                    {result.originalRows.length} rows in → {result.rows.length} rows out ·{" "}
                    {Object.keys(result.log.renamedColumns).length} column(s) renamed ·{" "}
                    {result.log.duplicatesRemoved} duplicate(s) removed
                  </CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() =>
                      download(
                        "cleaned.csv",
                        csvFromRows(result.rows),
                        "text/csv",
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => download("cleaning-report.txt", result.reportText)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Report .txt
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => download("cleaning-report.md", result.reportMarkdown, "text/markdown")}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Report .md
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard
                  icon={<ArrowRight className="h-4 w-4" />}
                  label="Rows in"
                  value={result.originalRows.length}
                />
                <StatCard
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  label="Rows out"
                  value={result.rows.length}
                />
                <StatCard
                  icon={<Hash className="h-4 w-4" />}
                  label="Placeholders replaced"
                  value={result.log.placeholdersReplaced}
                />
                <StatCard
                  icon={<XCircle className="h-4 w-4" />}
                  label="Duplicates removed"
                  value={result.log.duplicatesRemoved}
                />
              </div>

              <Tabs defaultValue="data">
                <TabsList>
                  <TabsTrigger value="data" className="gap-1.5">
                    <TableIcon className="h-4 w-4" />
                    Cleaned data
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {result.rows.length}
                      {result.rows.length > MAX_PREVIEW_ROWS ? ` (first ${MAX_PREVIEW_ROWS} shown)` : ""}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="report-text" className="gap-1.5">
                    <FileText className="h-4 w-4" />
                    Report (text)
                  </TabsTrigger>
                  <TabsTrigger value="report-md" className="gap-1.5">
                    <FileText className="h-4 w-4" />
                    Report (markdown)
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="data" className="mt-4">
                  {result.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      All rows were removed as duplicates.
                    </p>
                  ) : (
                    <ScrollArea className="h-[480px] rounded-md border">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                          <TableRow>
                            {result.cleanedColumns.map((col) => (
                              <TableHead key={col} className="font-medium whitespace-nowrap">
                                {col}
                                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                  {result.cleanedDtypes[col]}
                                </span>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewRows.map((row, i) => (
                            <TableRow key={i}>
                              {result.cleanedColumns.map((col) => {
                                const v = row[col];
                                const isMissing = v === null || v === undefined;
                                return (
                                  <TableCell
                                    key={col}
                                    className={`whitespace-nowrap font-mono text-xs ${
                                      isMissing ? "text-muted-foreground italic" : ""
                                    }`}
                                  >
                                    {isMissing ? "—" : formatCell(v)}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </TabsContent>

                <TabsContent value="report-text" className="mt-4">
                  <ScrollArea className="h-[480px] rounded-md border">
                    <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words">
                      {result.reportText}
                    </pre>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="report-md" className="mt-4">
                  <ScrollArea className="h-[480px] rounded-md border">
                    <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words">
                      {result.reportMarkdown}
                    </pre>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t mt-auto py-6">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          Built by{" "}
          <a
            href="https://github.com/niwamanyadouglas"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            Niwamanya Douglas
          </a>{" "}
          ·{" "}
          <a
            href="https://github.com/niwamanyadouglas/data-cleaner"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-semibold mt-1">{value.toLocaleString()}</p>
    </div>
  );
}

function csvFromRows(rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [cols.map(escape).join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => escape(row[c])).join(","));
  }
  return lines.join("\n");
}
