import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import {
  X,
  ChevronDown,
  ChevronRight,
  Plus,
  MoreVertical,
  Calendar as CalendarIcon,
  Copy,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/flyout-mock")({
  head: () => ({
    meta: [
      { title: "Data Entry Flyout — Mockup" },
      {
        name: "description",
        content:
          "Streamlined manual data entry flyout mockup for the Portfolio → Data screen.",
      },
    ],
  }),
  component: FlyoutMockPage,
});

type ValueTypeKey = "usage" | "spend" | "distance";

type Record = {
  id: string;
  measuringPoint: string;
  startDate: string;
  endDate: string;
  usage: string;
  usageUom: string;
  spend: string;
  currency: string;
  distance: string;
  distanceUom: string;
  country: string;
  voltageClass: string;
  // Optional
  supplier: string;
  meterNumber: string;
  invoiceNumber: string;
  tariffPlan: string;
  notes: string;
};

const blankRecord = (overrides: Partial<Record> = {}): Record => ({
  id: crypto.randomUUID(),
  measuringPoint: "H7298 - PULLMAN SHANGHAI CENTRAL",
  startDate: "",
  endDate: "",
  usage: "",
  usageUom: "kWh",
  spend: "",
  currency: "USD",
  distance: "",
  distanceUom: "km",
  country: "China",
  voltageClass: "LV",
  supplier: "",
  meterNumber: "",
  invoiceNumber: "",
  tariffPlan: "",
  notes: "",
  ...overrides,
});

function FlyoutMockPage() {
  const [open, setOpen] = React.useState(true);
  const [valueTypes, setValueTypes] = React.useState<Set<ValueTypeKey>>(
    new Set(["usage", "spend"]),
  );
  const [records, setRecords] = React.useState<Record[]>([blankRecord()]);
  const [tableLocked, setTableLocked] = React.useState(false);
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());
  const [cardOptionalOpen, setCardOptionalOpen] = React.useState(false);

  const isTable = tableLocked || records.length > 1;

  const toggleValueType = (key: ValueTypeKey) => {
    if (key === "usage") return; // required
    setValueTypes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const updateRecord = (id: string, patch: Partial<Record>) => {
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRecord = () => {
    setRecords((rs) => [...rs, blankRecord()]);
    setTableLocked(true);
  };

  const duplicateRow = (id: string) => {
    setRecords((rs) => {
      const idx = rs.findIndex((r) => r.id === id);
      if (idx < 0) return rs;
      const dup = { ...rs[idx], id: crypto.randomUUID() };
      const next = [...rs];
      next.splice(idx + 1, 0, dup);
      return next;
    });
    setTableLocked(true);
  };

  const deleteRow = (id: string) => {
    setRecords((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  };

  const applyOptionalToAll = (id: string) => {
    const src = records.find((r) => r.id === id);
    if (!src) return;
    const { supplier, meterNumber, invoiceNumber, tariffPlan, notes } = src;
    setRecords((rs) =>
      rs.map((r) =>
        r.id === id ? r : { ...r, supplier, meterNumber, invoiceNumber, tariffPlan, notes },
      ),
    );
  };

  const generateMonthlyRows = () => {
    const start = new Date();
    start.setDate(1);
    const rows: Record[] = [];
    for (let i = 0; i < 12; i++) {
      const s = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const e = new Date(start.getFullYear(), start.getMonth() + i + 1, 0);
      rows.push(
        blankRecord({
          startDate: s.toISOString().slice(0, 10),
          endDate: e.toISOString().slice(0, 10),
        }),
      );
    }
    setRecords(rows);
    setTableLocked(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mock page chrome */}
      <header className="border-b bg-background">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Portfolio → H7298 - Pullman Shanghai Central
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Data Collection</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mockup of the streamlined manual-entry flyout. Click "Add activity" to re-open.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEVEL 1 */}
          <div>
            <div className="mb-3 text-center text-xs uppercase tracking-widest text-muted-foreground">
              Level 1
            </div>
            <div className="rounded-xl border bg-background shadow-sm">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <div className="font-semibold">Electric Power</div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold text-amber-600">68%</span>
                  <button className="rounded-md p-1 hover:bg-muted" aria-label="Close">
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              <div className="border-b px-5 py-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Reporting period
                </div>
                <div className="text-base font-semibold">March 2026</div>
              </div>
              <div className="px-5 py-4">
                <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  March 1 – March 31, 2026
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 text-left font-medium">Measure</th>
                      <th className="py-2 text-right font-medium">Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Usage", "15,000", "kWh"],
                      ["Spend", "10,000", "USD"],
                      ["Peak demand", "420", "kW"],
                    ].map(([m, v, u]) => (
                      <tr key={m} className="border-b last:border-0">
                        <td className="py-3">{m}</td>
                        <td className="py-3 text-right">
                          <span className="font-semibold">{v}</span>{" "}
                          <span className="text-xs text-muted-foreground">{u}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Add Data CTA on Level 1 */}
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => setOpen(true)} className="gap-2" size="sm">
                    <Plus className="size-4" /> Add data
                  </Button>
                </div>

                <div className="mt-6 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Source measuring points (3)
                </div>
                <div className="mt-3 space-y-3">
                  {[
                    { name: "Main Incomer A", pct: "42%", color: "text-red-600", usage: "4,200", spend: "2,800", peak: "125" },
                    { name: "Main Incomer B", pct: "100%", color: "text-emerald-600", usage: "8,800", spend: "5,900", peak: "210" },
                  ].map((s) => (
                    <div key={s.name} className="rounded-md border-l-4 border-l-primary/40 bg-muted/20 p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{s.name}</div>
                        <div className={cn("text-sm font-semibold", s.color)}>{s.pct} ▸</div>
                      </div>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex justify-between"><span>Usage</span><span>{s.usage} <span className="text-xs text-muted-foreground">kWh</span></span></div>
                        <div className="flex justify-between"><span>Spend</span><span>{s.spend} <span className="text-xs text-muted-foreground">USD</span></span></div>
                        <div className="flex justify-between"><span>Peak Demand</span><span>{s.peak} <span className="text-xs text-muted-foreground">kW</span></span></div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2 border-t pt-3">
                        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                          <Plus className="size-3.5" /> Add data
                        </Button>
                        <Button variant="outline" size="sm">View details</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* LEVEL 2 */}
          <div>
            <div className="mb-3 text-center text-xs uppercase tracking-widest text-muted-foreground">
              Level 2
            </div>
            <div className="rounded-xl border bg-background shadow-sm">
              <div className="flex items-center justify-between border-b px-5 py-4">
                <div className="flex items-center gap-2 text-sm">
                  <ChevronRight className="size-4 rotate-180" />
                  <span className="text-muted-foreground">Electric Power /</span>
                  <span className="font-semibold">Main Incomer A</span>
                </div>
                <button className="rounded-md p-1 hover:bg-muted" aria-label="Close">
                  <X className="size-4" />
                </button>
              </div>
              <div className="px-5 py-4">
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="font-medium">⚠ 2 gaps detected</div>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    <li>Mar 1, 2026 – Mar 10, 2026 (10 day gap) Peak demand &amp; Spend</li>
                    <li>Mar 20, 2026 – Mar 25, 2026 (5 day gap) Usage</li>
                  </ul>
                </div>
              </div>
              <div className="border-y px-5 py-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Reporting period
                </div>
                <div className="text-base font-semibold">March 2026</div>
              </div>
              <div className="px-5 py-4">
                <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  March 1 – March 31, 2026
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 text-left font-medium">Measure</th>
                      <th className="py-2 text-right font-medium">Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Usage", "8,200", "kWh"],
                      ["Spend", "4,100", "USD"],
                      ["Peak demand", "120", "kW"],
                    ].map(([m, v, u]) => (
                      <tr key={m} className="border-b last:border-0">
                        <td className="py-3">{m}</td>
                        <td className="py-3 text-right">
                          <span className="font-semibold">{v}</span>{" "}
                          <span className="text-xs text-muted-foreground">{u}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-5 flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Past measurements
                  </div>
                  <Button variant="outline" size="sm">Download</Button>
                </div>

                <div className="mt-3 flex justify-end">
                  <Button onClick={() => setOpen(true)} className="gap-2" size="sm">
                    <Plus className="size-4" /> Add data
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Flyout */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-[920px] flex-col bg-background shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Add data
                </div>
                <h2 className="text-lg font-semibold">Electric Power</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-2 hover:bg-muted"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Value Types */}
              <section className="mb-6 rounded-lg border bg-muted/20 p-4">
                <div className="mb-3 text-sm font-medium">Value Types</div>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked disabled />
                    <span>
                      Usage{" "}
                      <span className="text-xs text-muted-foreground">(required)</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={valueTypes.has("spend")}
                      onCheckedChange={() => toggleValueType("spend")}
                    />
                    <span>Spend</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={valueTypes.has("distance")}
                      onCheckedChange={() => toggleValueType("distance")}
                    />
                    <span>Distance</span>
                  </label>
                </div>
              </section>

              {/* Records */}
              {!isTable ? (
                <CardRecord
                  record={records[0]}
                  valueTypes={valueTypes}
                  optionalOpen={cardOptionalOpen}
                  setOptionalOpen={setCardOptionalOpen}
                  onChange={(patch) => updateRecord(records[0].id, patch)}
                />
              ) : (
                <TableRecords
                  records={records}
                  valueTypes={valueTypes}
                  expanded={expandedRows}
                  toggleExpand={toggleExpand}
                  onChange={updateRecord}
                  onDuplicate={duplicateRow}
                  onDelete={deleteRow}
                  onApplyOptional={applyOptionalToAll}
                  onGenerate={generateMonthlyRows}
                />
              )}

              <div className="mt-4 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={addRecord} className="gap-1.5">
                  <Plus className="size-3.5" /> {isTable ? "Add row" : "Add another record"}
                </Button>
                {isTable && records.length === 1 && (
                  <Button variant="ghost" size="sm" onClick={generateMonthlyRows}>
                    + Add 12 monthly rows
                  </Button>
                )}
              </div>

              <p className="mt-6 text-xs italic text-muted-foreground">
                Hidden required-without-default fields are resolved by the system and not
                rendered here.
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t px-6 py-4">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button>Submit</Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Card view ------------------------------- */

function CardRecord({
  record,
  valueTypes,
  optionalOpen,
  setOptionalOpen,
  onChange,
}: {
  record: Record;
  valueTypes: Set<ValueTypeKey>;
  optionalOpen: boolean;
  setOptionalOpen: (v: boolean) => void;
  onChange: (patch: Partial<Record>) => void;
}) {
  return (
    <div className="rounded-lg border p-5">
      <div className="mb-4 text-sm font-medium">Record 1</div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Measuring Point" required>
          <Select
            value={record.measuringPoint}
            onValueChange={(v) => onChange({ measuringPoint: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="H7298 - PULLMAN SHANGHAI CENTRAL">
                H7298 - PULLMAN SHANGHAI CENTRAL
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div />
        <Field label="Start Date" required>
          <DateInput
            value={record.startDate}
            onChange={(v) => onChange({ startDate: v })}
          />
        </Field>
        <Field label="End Date" required>
          <DateInput value={record.endDate} onChange={(v) => onChange({ endDate: v })} />
        </Field>

        <Field label="Usage" required>
          <Input
            type="number"
            value={record.usage}
            onChange={(e) => onChange({ usage: e.target.value })}
          />
        </Field>
        <Field label="UOM">
          <Select value={record.usageUom} onValueChange={(v) => onChange({ usageUom: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="kWh">kWh</SelectItem>
              <SelectItem value="MWh">MWh</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {valueTypes.has("spend") && (
          <>
            <Field label="Spend">
              <Input
                type="number"
                value={record.spend}
                onChange={(e) => onChange({ spend: e.target.value })}
              />
            </Field>
            <Field label="Currency">
              <Select
                value={record.currency}
                onValueChange={(v) => onChange({ currency: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="CNY">CNY</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        {valueTypes.has("distance") && (
          <>
            <Field label="Distance">
              <Input
                type="number"
                value={record.distance}
                onChange={(e) => onChange({ distance: e.target.value })}
              />
            </Field>
            <Field label="UOM">
              <Select
                value={record.distanceUom}
                onValueChange={(v) => onChange({ distanceUom: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="km">km</SelectItem>
                  <SelectItem value="mi">mi</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        <Field label="Country" hint="default">
          <Select value={record.country} onValueChange={(v) => onChange({ country: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="China">China</SelectItem>
              <SelectItem value="United States">United States</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Voltage Class" hint="default">
          <Select
            value={record.voltageClass}
            onValueChange={(v) => onChange({ voltageClass: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="LV">LV</SelectItem>
              <SelectItem value="MV">MV</SelectItem>
              <SelectItem value="HV">HV</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Optional collapsible */}
      <div className="mt-5 border-t pt-4">
        <button
          type="button"
          onClick={() => setOptionalOpen(!optionalOpen)}
          className="flex items-center gap-2 text-sm font-medium hover:text-primary"
        >
          {optionalOpen ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          Optional fields (5)
        </button>
        {optionalOpen && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <OptionalFields record={record} onChange={onChange} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Table view ------------------------------ */

function TableRecords({
  records,
  valueTypes,
  expanded,
  toggleExpand,
  onChange,
  onDuplicate,
  onDelete,
  onApplyOptional,
  onGenerate,
}: {
  records: Record[];
  valueTypes: Set<ValueTypeKey>;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  onChange: (id: string, patch: Partial<Record>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onApplyOptional: (id: string) => void;
  onGenerate: () => void;
}) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span>Frequency: Monthly · {records.length} record(s)</span>
        <Button variant="ghost" size="sm" onClick={onGenerate} className="h-7 text-xs">
          + Add 12 monthly rows
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="w-8 px-1 py-2" />
              <th className="px-2 py-2 text-left font-medium">Measuring Point</th>
              <th className="px-2 py-2 text-left font-medium">Start *</th>
              <th className="px-2 py-2 text-left font-medium">End *</th>
              <th className="px-2 py-2 text-left font-medium">Usage *</th>
              <th className="px-2 py-2 text-left font-medium">UOM</th>
              {valueTypes.has("spend") && (
                <>
                  <th className="px-2 py-2 text-left font-medium">Spend</th>
                  <th className="px-2 py-2 text-left font-medium">$</th>
                </>
              )}
              {valueTypes.has("distance") && (
                <>
                  <th className="px-2 py-2 text-left font-medium">Distance</th>
                  <th className="px-2 py-2 text-left font-medium">UOM</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const isExp = expanded.has(r.id);
              return (
                <React.Fragment key={r.id}>
                  <tr className="border-t hover:bg-muted/20">
                    <td className="px-1 py-1.5 text-center">
                      <button
                        onClick={() => toggleExpand(r.id)}
                        className="rounded p-1 hover:bg-muted"
                        aria-label="Expand"
                      >
                        {isExp ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded p-1 hover:bg-muted">
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => onDuplicate(r.id)}>
                            <Copy className="mr-2 size-4" /> Duplicate row
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onApplyOptional(r.id)}>
                            Apply optional fields to all rows
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDelete(r.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 size-4" /> Delete row
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                    <td className="px-2 py-1.5 text-xs">{r.measuringPoint}</td>
                    <td className="px-2 py-1.5">
                      <CellInput
                        type="date"
                        value={r.startDate}
                        onChange={(v) => onChange(r.id, { startDate: v })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <CellInput
                        type="date"
                        value={r.endDate}
                        onChange={(v) => onChange(r.id, { endDate: v })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <CellInput
                        type="number"
                        value={r.usage}
                        onChange={(v) => onChange(r.id, { usage: v })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">
                      {r.usageUom}
                    </td>
                    {valueTypes.has("spend") && (
                      <>
                        <td className="px-2 py-1.5">
                          <CellInput
                            type="number"
                            value={r.spend}
                            onChange={(v) => onChange(r.id, { spend: v })}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">
                          {r.currency}
                        </td>
                      </>
                    )}
                    {valueTypes.has("distance") && (
                      <>
                        <td className="px-2 py-1.5">
                          <CellInput
                            type="number"
                            value={r.distance}
                            onChange={(v) => onChange(r.id, { distance: v })}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">
                          {r.distanceUom}
                        </td>
                      </>
                    )}
                  </tr>
                  {isExp && (
                    <tr className="border-t bg-muted/20">
                      <td />
                      <td
                        colSpan={
                          5 +
                          (valueTypes.has("spend") ? 2 : 0) +
                          (valueTypes.has("distance") ? 2 : 0) +
                          1
                        }
                        className="px-4 py-4"
                      >
                        <div className="mb-3 text-xs font-medium text-muted-foreground">
                          Optional fields for {r.startDate || "this row"}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <OptionalFields
                            record={r}
                            onChange={(patch) => onChange(r.id, patch)}
                            compact
                          />
                        </div>
                        <div className="mt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onApplyOptional(r.id)}
                          >
                            Apply optional fields to all rows
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- Helpers ------------------------------- */

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
        {hint && (
          <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            ({hint})
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}

function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-8"
      />
      <CalendarIcon className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function CellInput({
  type,
  value,
  onChange,
}: {
  type: "date" | "number" | "text";
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-sm",
        "focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring",
      )}
    />
  );
}

function OptionalFields({
  record,
  onChange,
  compact,
}: {
  record: Record;
  onChange: (patch: Partial<Record>) => void;
  compact?: boolean;
}) {
  const Wrapper = compact ? "div" : React.Fragment;
  const items = (
    <>
      <Field label="Supplier">
        <Input
          value={record.supplier}
          onChange={(e) => onChange({ supplier: e.target.value })}
        />
      </Field>
      <Field label="Meter Number">
        <Input
          value={record.meterNumber}
          onChange={(e) => onChange({ meterNumber: e.target.value })}
        />
      </Field>
      <Field label="Invoice #">
        <Input
          value={record.invoiceNumber}
          onChange={(e) => onChange({ invoiceNumber: e.target.value })}
        />
      </Field>
      <Field label="Tariff Plan">
        <Select
          value={record.tariffPlan}
          onValueChange={(v) => onChange({ tariffPlan: v })}
        >
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Commercial">Commercial</SelectItem>
            <SelectItem value="Industrial">Industrial</SelectItem>
            <SelectItem value="Residential">Residential</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Notes">
        <Input
          value={record.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </Field>
    </>
  );
  return compact ? <>{items}</> : items;
}
