"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Check, Design, DesignStatus } from "@/lib/types";
import { failedCheckCount, hasFailedCheck } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const money = (cents: number | null) =>
  cents === null ? "—" : `$${(cents / 100).toFixed(2)}`;

function contribution(design: Design): { dollars: string; pct: string } {
  if (design.costCents === null || design.priceCents === null)
    return { dollars: "—", pct: "—" };
  const c = design.priceCents - design.costCents;
  return {
    dollars: money(c),
    pct: `${Math.round((c / design.priceCents) * 100)}%`,
  };
}

const STATUS_LABEL: Record<DesignStatus, string> = {
  draft: "Draft",
  generating: "Generating…",
  ready: "Ready",
  approved: "Approved",
  killed: "Killed",
  publishing: "Publishing…",
  live: "Live",
  failed: "Failed",
};

/** Queue dot: red if any check failed, otherwise colored by status. */
function dotClass(design: Design): string {
  if (hasFailedCheck(design)) return "bg-red-500";
  switch (design.status) {
    case "generating":
    case "publishing":
      return "bg-amber-400 animate-pulse";
    case "ready":
      return "bg-emerald-400";
    case "approved":
      return "bg-sky-400";
    case "live":
      return "bg-emerald-600";
    case "killed":
      return "bg-stone-600";
    case "failed":
      return "bg-red-500";
    default:
      return "bg-stone-500";
  }
}

const CHECK_LABEL: Record<Check["key"], string> = {
  verse_match: "Verse match",
  translation_license: "Translation license",
  resolution: "Resolution",
  alpha_halo: "Alpha halo",
  stroke_weight: "Stroke weight",
  ink_count: "Ink count",
  trademark: "Trademark",
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function DeskClient({
  initialDesigns,
  igQuota,
}: {
  initialDesigns: Design[];
  igQuota: { used: number; cap: number };
}) {
  const [designs, setDesigns] = useState(initialDesigns);
  const [selectedId, setSelectedId] = useState(initialDesigns[0]?.id ?? null);

  const selected = useMemo(
    () => designs.find((d) => d.id === selectedId) ?? null,
    [designs, selectedId]
  );

  const selectByOffset = useCallback(
    (offset: number) => {
      setSelectedId((current) => {
        const idx = designs.findIndex((d) => d.id === current);
        const next = Math.min(Math.max(idx + offset, 0), designs.length - 1);
        return designs[next]?.id ?? current;
      });
    },
    [designs]
  );

  const decidable = selected?.status === "ready";
  const failCount = selected ? failedCheckCount(selected) : 0;
  const approveBlocked = failCount > 0;

  // Phase 1: decisions mutate local state only. Phase 5 wires the API.
  const decide = useCallback(
    (decision: "approved" | "killed") => {
      if (!selected || selected.status !== "ready") return;
      if (decision === "approved" && hasFailedCheck(selected)) return;
      setDesigns((prev) =>
        prev.map((d) =>
          d.id === selected.id
            ? { ...d, status: decision, decidedAt: new Date().toISOString() }
            : d
        )
      );
    },
    [selected]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      switch (e.key) {
        case "j":
          selectByOffset(1);
          break;
        case "k":
          selectByOffset(-1);
          break;
        case "a":
          decide("approved");
          break;
        case "x":
          decide("killed");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectByOffset, decide]);

  const quotaPct = Math.min(100, Math.round((igQuota.used / igQuota.cap) * 100));

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ---------- Header ---------- */}
      <header className="flex items-center justify-between border-b border-stone-800 px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-lg tracking-wide text-stone-100">
            Faith Apparel
          </h1>
          <span className="text-xs uppercase tracking-widest text-stone-500">
            Desk
          </span>
        </div>
        <div className="flex items-center gap-3" title="Instagram publishes in the rolling 24h window">
          <span className="text-xs text-stone-400">
            IG quota {igQuota.used} / {igQuota.cap}
          </span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-stone-800">
            <div
              className={`h-full rounded-full ${
                quotaPct >= 90 ? "bg-red-500" : quotaPct >= 70 ? "bg-amber-400" : "bg-emerald-500"
              }`}
              style={{ width: `${quotaPct}%` }}
            />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---------- Left rail: queue ---------- */}
        <nav className="w-64 shrink-0 overflow-y-auto border-r border-stone-800">
          <ul>
            {designs.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => setSelectedId(d.id)}
                  className={`flex w-full items-start gap-2.5 border-b border-stone-900 px-4 py-3 text-left transition-colors ${
                    d.id === selectedId ? "bg-stone-900" : "hover:bg-stone-900/50"
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass(d)}`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-stone-200">
                      {d.concept.split("—")[0].trim()}
                    </span>
                    <span className="block text-xs text-stone-500">
                      {STATUS_LABEL[d.status]}
                      {d.verseRef ? ` · ${d.verseRef}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-4 py-3 text-[11px] leading-relaxed text-stone-600">
            <kbd className="rounded bg-stone-800 px-1">j</kbd>/
            <kbd className="rounded bg-stone-800 px-1">k</kbd> navigate ·{" "}
            <kbd className="rounded bg-stone-800 px-1">a</kbd> approve ·{" "}
            <kbd className="rounded bg-stone-800 px-1">x</kbd> kill
          </p>
        </nav>

        {selected ? (
          <>
            {/* ---------- Center: proof + mockups ---------- */}
            <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6">
              <div className="flex min-h-0 flex-1 items-center justify-center">
                {selected.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.artworkUrl}
                    alt={`Artwork proof — ${selected.concept}`}
                    className="max-h-[62vh] max-w-full rounded-sm shadow-2xl shadow-black/60"
                  />
                ) : (
                  <div className="flex h-80 w-64 items-center justify-center rounded-sm border border-dashed border-stone-700 text-sm text-stone-500">
                    {selected.status === "generating"
                      ? "Generating artwork…"
                      : "No artwork yet"}
                  </div>
                )}
              </div>
              {(selected.flatMockupUrl || selected.modelMockupUrls.length > 0) && (
                <div className="mt-5 flex gap-3">
                  {selected.flatMockupUrl && (
                    <figure>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selected.flatMockupUrl}
                        alt="Flat product mockup"
                        className="h-24 w-20 rounded-sm object-cover ring-1 ring-stone-800"
                      />
                      <figcaption className="mt-1 text-[10px] uppercase tracking-wider text-stone-500">
                        Flat
                      </figcaption>
                    </figure>
                  )}
                  {selected.modelMockupUrls.map((url, i) => (
                    <figure key={url}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`On-model mockup ${i + 1}`}
                        className="h-24 w-20 rounded-sm object-cover ring-1 ring-stone-800"
                      />
                      <figcaption className="mt-1 text-[10px] uppercase tracking-wider text-stone-500">
                        Model {i + 1}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </main>

            {/* ---------- Right: spec, checks, economics ---------- */}
            <aside className="w-80 shrink-0 overflow-y-auto border-l border-stone-800 p-5 text-sm">
              <h2 className="text-base text-stone-100">{selected.concept}</h2>

              <dl className="mt-4 space-y-1.5 text-[13px]">
                <SpecRow label="Garment" value={selected.garmentName ?? "—"} />
                <SpecRow label="Supplier" value={selected.supplier} />
                <SpecRow label="SKU" value={selected.garmentSku ?? "—"} />
                <SpecRow
                  label="Artwork"
                  value={
                    selected.artworkFormat
                      ? `${selected.artworkFormat.toUpperCase()} · ${
                          selected.widthPx ?? "?"
                        }×${selected.heightPx ?? "?"}px @ ${selected.dpi ?? "?"} DPI`
                      : "—"
                  }
                />
                <SpecRow
                  label="Inks"
                  value={selected.colorCount !== null ? `${selected.colorCount}` : "—"}
                />
                <SpecRow label="Translation" value={selected.translation ?? "—"} />
                {selected.verseRef && (
                  <SpecRow label="Verse" value={selected.verseRef} />
                )}
              </dl>

              {selected.verseText && (
                <blockquote className="mt-3 border-l-2 border-stone-700 pl-3 text-[13px] italic leading-relaxed text-stone-400">
                  {selected.verseText}
                </blockquote>
              )}

              {/* Quality checks */}
              <h3 className="mt-6 text-xs font-medium uppercase tracking-widest text-stone-500">
                Quality checks
              </h3>
              {selected.checks.length === 0 ? (
                <p className="mt-2 text-[13px] text-stone-500">
                  Not run yet — checks execute after generation.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {selected.checks.map((check) => (
                    <li key={check.key} className="flex gap-2">
                      <CheckBadge status={check.status} />
                      <div className="min-w-0">
                        <p className="text-[13px] text-stone-200">
                          {CHECK_LABEL[check.key]}
                        </p>
                        <p className="text-xs leading-snug text-stone-500">
                          {check.note}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Unit economics */}
              <h3 className="mt-6 text-xs font-medium uppercase tracking-widest text-stone-500">
                Unit economics
              </h3>
              <dl className="mt-2 space-y-1.5 text-[13px]">
                <SpecRow label="Landed cost" value={money(selected.costCents)} />
                <SpecRow label="List price" value={money(selected.priceCents)} />
                <SpecRow
                  label="Contribution"
                  value={`${contribution(selected).dollars} · ${contribution(selected).pct}`}
                />
              </dl>
            </aside>
          </>
        ) : (
          <main className="flex flex-1 items-center justify-center text-stone-500">
            Queue is empty.
          </main>
        )}
      </div>

      {/* ---------- Bottom: decisions ---------- */}
      <footer className="flex items-center justify-between border-t border-stone-800 px-5 py-3">
        <p className="text-xs text-stone-500">
          {selected
            ? `${STATUS_LABEL[selected.status]}${
                selected.decidedAt
                  ? ` · decided ${new Date(selected.decidedAt).toLocaleString()}`
                  : ""
              }`
            : ""}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => decide("killed")}
            disabled={!decidable}
            className="rounded-md border border-stone-700 px-5 py-2 text-sm text-stone-300 transition-colors hover:border-red-500/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Kill
          </button>
          {/* No override path: a failing check disables approval, full stop. */}
          <button
            onClick={() => decide("approved")}
            disabled={!decidable || approveBlocked}
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-800 disabled:text-stone-500"
          >
            {approveBlocked
              ? `Blocked — ${failCount} check${failCount === 1 ? "" : "s"} failed`
              : "Approve and publish"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right text-stone-200">{value}</dd>
    </div>
  );
}

function CheckBadge({ status }: { status: Check["status"] }) {
  const styles = {
    pass: "bg-emerald-500/15 text-emerald-400",
    warn: "bg-amber-500/15 text-amber-400",
    fail: "bg-red-500/15 text-red-400",
  } as const;
  const glyph = { pass: "✓", warn: "!", fail: "✕" } as const;
  return (
    <span
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${styles[status]}`}
      aria-label={status}
    >
      {glyph[status]}
    </span>
  );
}
