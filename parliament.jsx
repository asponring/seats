import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";

// ─── Color palette ───────────────────────────────────────────────────────────
const PALETTE = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48", "#0ea5e9", "#d946ef", "#fb923c",
];

// ─── Party colour swatches ────────────────────────────────────────────────────
const PARTY_COLORS = [
  "#ef4444", // Red
  "#3b82f6", // Blue
  "#111827", // Black
  "#22c55e", // Green
  "#eab308", // Yellow
  "#ec4899", // Pink
  "#06b6d4", // Turquoise
  "#f8fafc", // White
  "#f97316", // Orange
  "#a855f7", // Purple
];

// ─── Custom colour picker ─────────────────────────────────────────────────────
function ColorPicker({ value, onChange }) {
  const [open, setOpen]   = useState(false);
  const [pos,  setPos]    = useState({ top: 0, left: 0 });
  const btnRef            = useRef(null);
  const popoverRef        = useRef(null);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        btnRef.current     && !btnRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div style={{ flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title="Choose colour"
        style={{
          width: 30, height: 30, borderRadius: 8,
          background: value, border: "2px solid #334155",
          cursor: "pointer", padding: 0, display: "block",
        }}
      />
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
            background: "#1e293b", border: "1px solid #334155", borderRadius: 10,
            padding: 8, display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
            gap: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
          }}
        >
          {PARTY_COLORS.map(c => (
            <button
              key={c}
              onClick={() => { onChange(c); setOpen(false); }}
              title={c}
              style={{
                width: 26, height: 26, borderRadius: 6,
                background: c,
                border: c === value ? "2px solid #f8fafc" : "2px solid transparent",
                outline: c === value ? "2px solid #64748b" : "none",
                outlineOffset: 1,
                cursor: "pointer", padding: 0,
              }}
            />
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── ID generator ────────────────────────────────────────────────────────────
let _uid = 1;
const uid = () => _uid++;

// ─── Sample data ─────────────────────────────────────────────────────────────
const SAMPLE = [
  { id: uid(), name: "Progressive Party",   seats: 220, color: "#3b82f6" },
  { id: uid(), name: "Conservative Party",  seats: 195, color: "#ef4444" },
  { id: uid(), name: "Green Alliance",      seats:  42, color: "#22c55e" },
  { id: uid(), name: "Liberty Union",       seats:  28, color: "#f59e0b" },
  { id: uid(), name: "Social Democrats",    seats:  15, color: "#a855f7" },
];

// ─── SVG helpers ─────────────────────────────────────────────────────────────
function toXY(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, R, r, a1, a2) {
  const p1 = toXY(cx, cy, R, a1);
  const p2 = toXY(cx, cy, R, a2);
  const p3 = toXY(cx, cy, r, a2);
  const p4 = toXY(cx, cy, r, a1);
  const lg = a2 - a1 > 180 ? 1 : 0;
  const f  = (n) => n.toFixed(3);
  return [
    `M ${f(p1.x)} ${f(p1.y)}`,
    `A ${R} ${R} 0 ${lg} 1 ${f(p2.x)} ${f(p2.y)}`,
    `L ${f(p3.x)} ${f(p3.y)}`,
    `A ${r} ${r} 0 ${lg} 0 ${f(p4.x)} ${f(p4.y)}`,
    "Z",
  ].join(" ");
}

// ─── Chart constants ──────────────────────────────────────────────────────────
const CX = 250, CY = 258;
const OR = 222, IR = 128;
const GAP_DEG = 0.8;

// ─── Drag helper: how far should row at `idx` translate? ─────────────────────
function getTranslateY(idx, drag) {
  if (!drag) return 0;
  const { origIdx, insertIdx, rh } = drag;
  if (idx === origIdx) return 0;
  // Dragging downward — items in between shift up
  if (origIdx < insertIdx && idx > origIdx && idx <= insertIdx) return -rh;
  // Dragging upward — items in between shift down
  if (origIdx > insertIdx && idx >= insertIdx && idx < origIdx) return rh;
  return 0;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ParliamentVisualizer() {
  const [parties, setParties]   = useState(SAMPLE);
  const [draft, setDraft]       = useState({ name: "", seats: "", color: PALETTE[5] });
  const [hoveredId, setHovered] = useState(null);
  const [chamber, setChamber]   = useState("Parliament");

  // drag = { id, origIdx, insertIdx, rh, ghostX, ghostY, ghostW }
  const [drag, setDrag] = useState(null);

  // Mutable drag metadata — not state so pointer-move doesn't lag
  const dragMeta = useRef(null);
  // DOM refs for each party row, keyed by party id
  const rowRefs  = useRef({});
  // Ref for the party list container — used to clamp the ghost position
  const listRef  = useRef(null);

  // ── Derived totals ──────────────────────────────────────────────────────────
  const totalSeats = useMemo(
    () => parties.reduce((s, p) => s + (p.seats || 0), 0),
    [parties]
  );
  const majority = Math.floor(totalSeats / 2) + 1;

  // ── Arc slices ──────────────────────────────────────────────────────────────
  const slices = useMemo(() => {
    if (totalSeats === 0) return [];
    const active   = parties.filter(p => p.seats > 0);
    const totalGap = GAP_DEG * active.length;
    const avail    = 180 - totalGap;
    let angle = 180;
    return active.map(p => {
      const span  = (p.seats / totalSeats) * avail;
      const slice = { ...p, a1: angle, a2: angle + span };
      angle += span + GAP_DEG;
      return slice;
    });
  }, [parties, totalSeats]);

  // ── Majority line ───────────────────────────────────────────────────────────
  // Walk the same arc geometry as the slices to find where exactly 50% of
  // seats falls. This keeps the marker aligned with the party boundaries
  // regardless of how many parties exist or how the gaps are distributed.
  const majorityAngle = useMemo(() => {
    if (totalSeats === 0) return 270;
    const active   = parties.filter(p => p.seats > 0);
    if (active.length === 0) return 270;
    const totalGap = GAP_DEG * active.length;
    const avail    = 180 - totalGap;
    const half     = totalSeats / 2; // exact 50% (may be fractional)

    let angle    = 180;
    let cumSeats = 0;
    for (const p of active) {
      const span         = (p.seats / totalSeats) * avail;
      const nextCumSeats = cumSeats + p.seats;

      if (nextCumSeats > half) {
        // 50% falls strictly inside this party's arc
        const remaining = half - cumSeats;
        return angle + (remaining / p.seats) * span;
      } else if (nextCumSeats === half) {
        // 50% falls exactly on a gap boundary — centre the marker in the gap
        return angle + span + GAP_DEG / 2;
      }

      cumSeats = nextCumSeats;
      angle   += span + GAP_DEG;
    }
    return 270;
  }, [parties, totalSeats]);

  const majA     = toXY(CX, CY, IR - 10, majorityAngle);
  const majB     = toXY(CX, CY, OR + 10, majorityAngle);
  const majLabel = toXY(CX, CY, OR + 26, majorityAngle);

  const hoveredParty = hoveredId ? parties.find(p => p.id === hoveredId) : null;

  // ── CRUD ────────────────────────────────────────────────────────────────────
  const addParty = useCallback(() => {
    const seats = parseInt(draft.seats, 10);
    if (!draft.name.trim() || !seats || seats <= 0) return;
    setParties(prev => [
      ...prev,
      { id: uid(), name: draft.name.trim(), seats, color: draft.color },
    ]);
    setDraft({ name: "", seats: "", color: PALETTE[_uid % PALETTE.length] });
  }, [draft]);

  const removeParty = useCallback((id) => {
    setParties(prev => prev.filter(p => p.id !== id));
  }, []);

  const updateParty = useCallback((id, field, val) => {
    setParties(prev =>
      prev.map(p =>
        p.id === id
          ? { ...p, [field]: field === "seats" ? Math.max(0, parseInt(val, 10) || 0) : val }
          : p
      )
    );
  }, []);

  // ── Pointer-based drag ──────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e, id) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const idx   = parties.findIndex(p => p.id === id);
    const rowEl = rowRefs.current[id];
    const rect  = rowEl.getBoundingClientRect();
    const rh    = rect.height + 8; // row height + flex gap

    // Snapshot the list bounds so we can clamp the ghost inside it
    const listRect = listRef.current ? listRef.current.getBoundingClientRect() : null;
    const rowH     = rect.height; // just the row, without the gap

    dragMeta.current = {
      id, origIdx: idx, startY: e.clientY,
      origTop: rect.top, rh,
      // Clamping limits for ghostY (fixed px):
      clampMin: listRect ? listRect.top                     : -Infinity,
      clampMax: listRect ? listRect.bottom - rowH           :  Infinity,
    };

    // Capture so pointermove/up keep firing even outside the handle
    e.currentTarget.setPointerCapture(e.pointerId);

    setDrag({
      id, origIdx: idx, insertIdx: idx, rh,
      ghostX: rect.left,
      ghostY: rect.top,
      ghostW: rect.width,
    });
  }, [parties]);

  const handlePointerMove = useCallback((e) => {
    const m = dragMeta.current;
    if (!m) return;

    const dy        = e.clientY - m.startY;
    const ghostY    = Math.max(m.clampMin, Math.min(m.clampMax, m.origTop + dy));
    const insertIdx = Math.max(
      0,
      Math.min(parties.length - 1, m.origIdx + Math.round(dy / m.rh))
    );

    setDrag(d => d ? { ...d, ghostY, insertIdx } : null);
  }, [parties.length]);

  const commitDrag = useCallback(() => {
    const m = dragMeta.current;
    if (!m) return;
    dragMeta.current = null;

    setDrag(d => {
      if (!d) return null;
      const { origIdx, insertIdx } = d;
      if (origIdx !== insertIdx) {
        setParties(prev => {
          const next = [...prev];
          next.splice(insertIdx, 0, next.splice(origIdx, 1)[0]);
          return next;
        });
      }
      return null;
    });
  }, []);

  // ── For rendering the ghost, find the party being dragged ──────────────────
  const draggedParty = drag ? parties.find(p => p.id === drag.id) : null;

  const s = styles;

  return (
    <div style={s.page}>
      <div style={s.container}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={s.header}>
          <input
            value={chamber}
            onChange={e => setChamber(e.target.value)}
            style={s.chamberInput}
            placeholder="Chamber name…"
          />
          <p style={s.subtitle}>
            {totalSeats.toLocaleString()} total seats
            &nbsp;·&nbsp;
            Majority: {majority.toLocaleString()} seats
          </p>
        </div>

        {/* ── Chart card ─────────────────────────────────────────────────── */}
        <div style={s.card}>
          <svg viewBox="0 0 500 272" style={{ width: "100%", display: "block" }}>
            <path d={arcPath(CX, CY, OR, IR, 180, 360)} fill="#0f172a" />

            {slices.map(sl => (
              <path
                key={sl.id}
                d={arcPath(CX, CY, OR, IR, sl.a1, sl.a2)}
                fill={sl.color}
                opacity={hoveredId && hoveredId !== sl.id ? 0.28 : 1}
                style={{ cursor: "pointer", transition: "opacity 0.15s" }}
                onMouseEnter={() => setHovered(sl.id)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}

            <line
              x1={majA.x} y1={majA.y} x2={majB.x} y2={majB.y}
              stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="5 3"
              strokeLinecap="round"
            />
            <text
              x={majLabel.x} y={majLabel.y}
              textAnchor="middle" dominantBaseline="middle"
              fill="#fbbf24" fontSize="10.5" fontWeight="600"
              style={{ pointerEvents: "none" }}
            >
              50%
            </text>

            {hoveredParty ? (
              <>
                <text x={CX} y={CY - 42} textAnchor="middle"
                  fill={hoveredParty.color} fontSize="14" fontWeight="700"
                  style={{ pointerEvents: "none" }}>
                  {hoveredParty.name}
                </text>
                <text x={CX} y={CY - 12} textAnchor="middle"
                  fill="#f8fafc" fontSize="32" fontWeight="800"
                  style={{ pointerEvents: "none" }}>
                  {hoveredParty.seats.toLocaleString()}
                </text>
                <text x={CX} y={CY + 14} textAnchor="middle"
                  fill="#94a3b8" fontSize="13"
                  style={{ pointerEvents: "none" }}>
                  {totalSeats > 0
                    ? ((hoveredParty.seats / totalSeats) * 100).toFixed(1) + "% of seats"
                    : "—"}
                </text>
                {hoveredParty.seats >= majority && (
                  <text x={CX} y={CY + 32} textAnchor="middle"
                    fill="#4ade80" fontSize="11" fontWeight="600"
                    style={{ pointerEvents: "none" }}>
                    ✓ Majority
                  </text>
                )}
              </>
            ) : (
              <>
                <text x={CX} y={CY - 42} textAnchor="middle"
                  fill="#475569" fontSize="13"
                  style={{ pointerEvents: "none" }}>
                  {chamber || "Parliament"}
                </text>
                <text x={CX} y={CY - 12} textAnchor="middle"
                  fill="#f8fafc" fontSize="34" fontWeight="800"
                  style={{ pointerEvents: "none" }}>
                  {totalSeats.toLocaleString()}
                </text>
              </>
            )}

            <line
              x1={CX - OR - 6} y1={CY}
              x2={CX + OR + 6} y2={CY}
              stroke="#1e293b" strokeWidth="2"
            />
          </svg>

          {/* Legend */}
          <div style={s.legend}>
            {parties.map(p => (
              <div key={p.id} style={s.legendItem}>
                <span style={{ ...s.dot, background: p.color }} />
                <span style={s.legendName}>{p.name}</span>
                <span style={s.legendSeats}>{p.seats}</span>
                {p.seats >= majority && (
                  <span style={s.majorityBadge}>majority</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Party editor ───────────────────────────────────────────────── */}
        <div style={s.card}>
          <h2 style={s.sectionTitle}>Parties</h2>

          {/* Column headings */}
          <div style={{ ...s.row, marginBottom: 4, padding: "0 12px" }}>
            <div style={{ width: 18 }} />
            <div style={{ width: 32 }} />
            <span style={{ ...s.colLabel, flex: 1 }}>Name</span>
            <span style={{ ...s.colLabel, width: 90, textAlign: "right" }}>Seats</span>
            <span style={{ ...s.colLabel, width: 48, textAlign: "right" }}>Share</span>
            <div style={{ width: 28 }} />
          </div>

          {/* Party rows */}
          <div ref={listRef} style={s.partyList}>
            {parties.map((p, idx) => {
              const isDragging = drag && drag.id === p.id;
              const ty = getTranslateY(idx, drag);
              return (
                <div
                  key={p.id}
                  ref={el => { if (el) rowRefs.current[p.id] = el; }}
                  style={{
                    ...s.partyRow,
                    borderLeft: `3px solid ${p.color}`,
                    // Invisible placeholder while being dragged
                    opacity: isDragging ? 0 : 1,
                    // Slide other rows out of the way
                    transform: `translateY(${ty}px)`,
                    transition: isDragging
                      ? "none"
                      : "transform 0.18s cubic-bezier(0.25,0.46,0.45,0.94)",
                    // Prevent text selection while dragging
                    userSelect: drag ? "none" : "auto",
                  }}
                >
                  {/* Drag handle */}
                  <span
                    style={s.dragHandle}
                    title="Drag to reorder"
                    onPointerDown={e => handlePointerDown(e, p.id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={commitDrag}
                    onPointerCancel={commitDrag}
                  >
                    ⠿
                  </span>

                  <ColorPicker
                    value={p.color}
                    onChange={v => updateParty(p.id, "color", v)}
                  />
                  <input
                    type="text"
                    value={p.name}
                    onChange={e => updateParty(p.id, "name", e.target.value)}
                    style={{ ...s.textInput, flex: 1 }}
                    placeholder="Party name"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={p.seats === 0 ? "" : p.seats}
                    onChange={e => updateParty(p.id, "seats", e.target.value.replace(/\D/g, ""))}
                    style={{ ...s.textInput, width: 90, textAlign: "right" }}
                    placeholder="0"
                  />
                  <span style={s.shareLabel}>
                    {totalSeats > 0
                      ? ((p.seats / totalSeats) * 100).toFixed(1) + "%"
                      : "—"}
                  </span>
                  <button
                    onClick={() => removeParty(p.id)}
                    style={s.removeBtn}
                    title="Remove"
                    onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
                    onMouseLeave={e => e.currentTarget.style.color = "#475569"}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add party row */}
          <div style={{ ...s.partyRow, ...s.addRow }}>
            {/* Spacer to align with drag handle column above */}
            <div style={{ width: 18, flexShrink: 0 }} />
            <ColorPicker
              value={draft.color}
              onChange={v => setDraft(d => ({ ...d, color: v }))}
            />
            <input
              type="text"
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addParty()}
              style={{ ...s.textInput, flex: 1 }}
              placeholder="New party name…"
            />
            <input
              type="text"
              inputMode="numeric"
              value={draft.seats}
              onChange={e => setDraft(d => ({ ...d, seats: e.target.value.replace(/\D/g, "") }))}
              onKeyDown={e => e.key === "Enter" && addParty()}
              style={{ ...s.textInput, width: 90, textAlign: "right" }}
              placeholder="Seats"
            />
            <button
              onClick={addParty}
              style={{ ...s.addBtn, width: 86, textAlign: "center" }}
              onMouseEnter={e => e.currentTarget.style.background = "#15803d"}
              onMouseLeave={e => e.currentTarget.style.background = "#16a34a"}
            >
              + Add
            </button>
          </div>
        </div>

        <p style={s.hint}>Hover over the chart to inspect a party · Click the colour swatch to customise · Drag ⠿ to reorder</p>
      </div>

      {/* ── Floating drag ghost ────────────────────────────────────────────── */}
      {drag && draggedParty && (
        <div
          style={{
            position: "fixed",
            top:    drag.ghostY,
            left:   drag.ghostX,
            width:  drag.ghostW,
            pointerEvents: "none",
            zIndex: 9999,
            // Lifted look
            boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
            borderRadius: 12,
            opacity: 0.96,
            transform: "scale(1.03)",
            // Match row style
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#0f172a",
            borderLeft: `3px solid ${draggedParty.color}`,
            padding: "9px 12px",
            boxSizing: "border-box",
          }}
        >
          <span style={{ ...styles.dragHandle, color: "#64748b", cursor: "grabbing" }}>⠿</span>
          <span style={{
            width: 30, height: 30, borderRadius: 8,
            background: draggedParty.color, flexShrink: 0,
          }} />
          <span style={{ flex: 1, fontSize: 14, color: "#f1f5f9", overflow: "hidden",
            whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
            {draggedParty.name}
          </span>
          <span style={{ width: 90, textAlign: "right", fontSize: 14,
            color: "#f1f5f9", background: "#1e293b", borderRadius: 8,
            padding: "7px 11px", border: "1px solid #334155", boxSizing: "border-box" }}>
            {draggedParty.seats}
          </span>
          <span style={{ width: 48, textAlign: "right", fontSize: 13, color: "#475569" }}>
            {totalSeats > 0
              ? ((draggedParty.seats / totalSeats) * 100).toFixed(1) + "%"
              : "—"}
          </span>
          <span style={{ width: 28 }} />
        </div>
      )}
    </div>
  );
}

// ─── Style objects ────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f172a",
    color: "#f1f5f9",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "28px 16px 48px",
  },
  container: {
    maxWidth: 760,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  header: {
    textAlign: "center",
    marginBottom: 4,
  },
  chamberInput: {
    background: "transparent",
    border: "none",
    borderBottom: "2px solid #334155",
    color: "#f8fafc",
    fontSize: 26,
    fontWeight: 700,
    textAlign: "center",
    outline: "none",
    padding: "4px 8px",
    width: "100%",
    maxWidth: 420,
  },
  subtitle: {
    color: "#64748b",
    marginTop: 8,
    fontSize: 14,
  },
  card: {
    background: "#1e293b",
    borderRadius: 20,
    padding: 20,
    boxShadow: "0 4px 32px rgba(0,0,0,0.45)",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 600,
    margin: "0 0 14px",
    color: "#e2e8f0",
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "8px 20px",
    padding: "2px 8px 4px",
    marginTop: 4,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "#cbd5e1",
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    flexShrink: 0,
  },
  legendName: { color: "#cbd5e1" },
  legendSeats: { color: "#475569" },
  majorityBadge: {
    background: "#14532d",
    color: "#4ade80",
    fontSize: 10,
    fontWeight: 600,
    padding: "1px 6px",
    borderRadius: 99,
    letterSpacing: "0.02em",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  colLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  partyList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 10,
  },
  partyRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#0f172a",
    borderRadius: 12,
    padding: "9px 12px",
  },
  addRow: {
    border: "1px dashed #334155",
    background: "transparent",
    borderLeft: "1px dashed #334155",
  },
  colorPicker: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: "none",
    padding: 0,
    flexShrink: 0,
  },
  textInput: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "7px 11px",
    color: "#f1f5f9",
    fontSize: 14,
    outline: "none",
  },
  shareLabel: {
    width: 48,
    textAlign: "right",
    fontSize: 13,
    color: "#475569",
    flexShrink: 0,
  },
  dragHandle: {
    color: "#334155",
    cursor: "grab",
    fontSize: 18,
    lineHeight: 1,
    userSelect: "none",
    flexShrink: 0,
    width: 18,
    textAlign: "center",
    touchAction: "none",
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: "#475569",
    cursor: "pointer",
    fontSize: 22,
    lineHeight: 1,
    padding: "0 2px",
    borderRadius: 6,
    transition: "color 0.15s",
    flexShrink: 0,
    width: 28,
  },
  addBtn: {
    background: "#16a34a",
    border: "none",
    color: "white",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    padding: "8px 16px",
    borderRadius: 8,
    transition: "background 0.15s",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  hint: {
    textAlign: "center",
    fontSize: 12,
    color: "#334155",
    marginTop: 4,
  },
};

createRoot(document.getElementById("root")).render(<ParliamentVisualizer />);
