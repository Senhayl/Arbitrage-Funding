import { useState, useEffect, useCallback, useRef } from "react";

const API_URL = "https://railway.com/project/e4ac1015-ad74-4383-a509-39ea70a9c932"; // 👈 remplace par ton URL Railway/Render après deploy

const PLATFORMS = [
  { id: "avantis",  name: "Avantis",  chain: "Base",    color: "#22d3ee", accent: "#0e7490" },
  { id: "grvt",     name: "GRVT",     chain: "GRVT L2", color: "#a78bfa", accent: "#7c3aed" },
  { id: "extended", name: "Extended", chain: "Starknet", color: "#fb923c", accent: "#c2410c" },
];

const SORT_OPTIONS = [
  { id: "best",   label: "Best yield" },
  { id: "symbol", label: "A → Z" },
  { id: "b_rate", label: "Rate B" },
];

const G = "#4ade80"; // vert accent positif
const R = "#f87171"; // rouge négatif

const platColor = (id) => PLATFORMS.find((p) => p.id === id)?.color ?? "#888";
const platName  = (id) => PLATFORMS.find((p) => p.id === id)?.name  ?? id;
const fmt  = (v, sign = false) => (sign && v > 0 ? "+" : "") + v;
const fmtN = (n, d = 2) => (n == null ? "—" : Number(n).toFixed(d));

function tierBadge(tier) {
  const map = {
    fire:     ["🔥", "#f97316", "#431407"],
    good:     ["✦",  G,         "#052e16"],
    weak:     ["△",  "#facc15", "#713f12"],
    negative: ["✕",  R,         "#450a0a"],
  };
  const [icon, fg, bg] = map[tier] ?? ["·", "#555", "#111"];
  return { icon, fg, bg };
}

function calcLiq(entry, leverage, side) {
  const m = 0.9 / leverage;
  return parseFloat((entry * (side === "short" ? 1 + m : 1 - m)).toFixed(6));
}

function getSteps(row) {
  const { side_a, side_b, opportunity: opp, platform_a: pa, platform_b: pb } = row;
  const shortPlat = opp.short_platform;
  if (pa === "avantis" || pb === "avantis") {
    const avSide    = pa === "avantis" ? side_a : side_b;
    const otherSide = pa === "avantis" ? side_b : side_a;
    const otherPlat = pa === "avantis" ? pb : pa;
    const isAvShort = shortPlat === "avantis";
    const ann = otherSide.annualized_rate_pct;
    return [
      { plat: "avantis", dir: isAvShort ? "SHORT" : "LONG", fee: isAvShort ? avSide.short_annual_pct : avSide.long_annual_pct, lbl: "tu payes" },
      { plat: otherPlat, dir: isAvShort ? "LONG" : "SHORT", fee: fmtN(Math.abs(ann)), lbl: (isAvShort ? ann > 0 : ann < 0) ? "tu es payé" : "tu payes" },
    ];
  }
  const aAnn = side_a.annualized_rate_pct;
  const bAnn = side_b.annualized_rate_pct;
  const aIsShort = shortPlat === pa;
  return [
    { plat: pa, dir: aIsShort ? "SHORT" : "LONG", fee: fmtN(Math.abs(aAnn)), lbl: (aIsShort ? aAnn > 0 : aAnn < 0) ? "tu es payé" : "tu payes" },
    { plat: pb, dir: aIsShort ? "LONG"  : "SHORT", fee: fmtN(Math.abs(bAnn)), lbl: (aIsShort ? bAnn < 0 : bAnn > 0) ? "tu es payé" : "tu payes" },
  ];
}

// ── UI PRIMITIVES ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: "#0a0f1a", border: `1px solid ${accent ? accent + "30" : "#1e293b"}`, borderRadius: 12, padding: "14px 18px", minWidth: 130 }}>
      <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? "#fff", fontFamily: "monospace", letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function StepRow({ step, index }) {
  const isShort  = step.dir === "SHORT";
  const dirColor = isShort ? "#fb923c" : G;
  const paid     = step.lbl === "tu payes";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#070d1a", borderRadius: 8, padding: "9px 12px", border: `1px solid ${dirColor}18`, marginBottom: 4 }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", background: dirColor, color: "#000", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{index + 1}</div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: platColor(step.plat), width: 70, flexShrink: 0 }}>{platName(step.plat)}</div>
      <div style={{ fontSize: 13, fontWeight: 900, color: dirColor, width: 72, flexShrink: 0 }}>{step.dir} {isShort ? "↓" : "↑"}</div>
      <div style={{ marginLeft: "auto", textAlign: "right" }}>
        <div style={{ fontSize: 12, fontFamily: "monospace", color: "#94a3b8" }}>{step.fee}%/an</div>
        <div style={{ fontSize: 10, color: paid ? R : G }}>{step.lbl}</div>
      </div>
    </div>
  );
}

// ── PLATFORM PICKER (multi-select 2) ──────────────────────────────────────────

function PlatformPicker({ platA, platB, onChange }) {
  const toggle = (id) => {
    if (platA === id) {
      // déselectionne A → B devient A, cherche autre
      const next = PLATFORMS.find((p) => p.id !== platB && p.id !== id);
      onChange(platB, next?.id ?? platA);
    } else if (platB === id) {
      const next = PLATFORMS.find((p) => p.id !== platA && p.id !== id);
      onChange(next?.id ?? platB, platA);
    } else {
      // sélectionne un nouveau → remplace B (le moins "fixe")
      onChange(platA, id);
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {PLATFORMS.map((p) => {
        const isA = platA === p.id;
        const isB = platB === p.id;
        const sel = isA || isB;
        return (
          <button key={p.id} onClick={() => toggle(p.id)} style={{
            padding: "10px 18px", borderRadius: 11,
            border: sel ? `1.5px solid ${p.color}` : "1.5px solid #1e293b",
            background: sel ? `${p.color}18` : "#0a0f1a",
            cursor: "pointer", transition: "all .15s",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: sel ? p.color : "#475569", fontFamily: "monospace" }}>{p.name}</span>
              <span style={{ fontSize: 9, color: sel ? p.accent : "#1e293b", letterSpacing: "0.08em" }}>{p.chain}</span>
            </div>
            {sel && (
              <span style={{ fontSize: 9, fontWeight: 800, background: p.color, color: "#000", borderRadius: 4, padding: "1px 6px" }}>
                {isA ? "A" : "B"}
              </span>
            )}
          </button>
        );
      })}
      <div style={{ alignSelf: "center", fontSize: 11, color: "#1e293b", fontFamily: "monospace", marginLeft: 4 }}>
        <span style={{ color: platColor(platA) }}>{platName(platA)}</span>
        <span style={{ color: "#1e293b" }}> × </span>
        <span style={{ color: platColor(platB) }}>{platName(platB)}</span>
      </div>
    </div>
  );
}

// ── PAIR CARD ─────────────────────────────────────────────────────────────────

function PairCard({ row, selected, onClick }) {
  const { symbol, side_a, side_b, opportunity: opp } = row;
  const isPos  = opp.best_net_pct > 0;
  const steps  = getSteps(row);
  const { icon, fg, bg } = tierBadge(opp.tier);
  const bRate  = side_b?.annualized_rate_pct ?? 0;
  const accent = isPos ? G : R;

  return (
    <div onClick={onClick} style={{
      background: "#070d1a", borderRadius: 14,
      border: selected ? `1.5px solid ${G}` : `1.5px solid ${isPos ? "#0d2a1a" : "#1a0d0d"}`,
      borderLeft: `3px solid ${accent}`,
      cursor: "pointer", transition: "all .15s",
      transform: selected ? "translateY(-2px)" : undefined,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 10px", borderBottom: "1px solid #0a0f1a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>{symbol.replace("/USD", "")}</span>
          <span style={{ fontSize: 9, color: "#334155", fontWeight: 600 }}>/USD</span>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: bg, color: fg, fontWeight: 700 }}>{icon}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace", color: accent, letterSpacing: "-0.03em" }}>
            {fmt(fmtN(opp.best_net_pct), true)}%
          </div>
          <div style={{ fontSize: 10, color: "#334155" }}>/an</div>
        </div>
      </div>

      {/* Steps */}
      <div style={{ padding: "10px 12px 0" }}>
        <div style={{ fontSize: 9, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 6 }}>
          {isPos ? "✓ Positions à ouvrir" : "✕ Non rentable"}
        </div>
        {steps.map((s, i) => <StepRow key={i} step={s} index={i} />)}
      </div>

      {/* Footer */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "6px 12px 12px", gap: 4, marginTop: 4 }}>
        {[
          { l: "Rate B", v: `${fmt(fmtN(bRate), true)}%`, c: bRate > 0 ? "#fb923c" : G },
          { l: "Net",    v: `${fmt(fmtN(opp.best_net_pct), true)}%`, c: accent },
          { l: "Data",   v: `${side_a?.source === "live" ? "●" : "○"} ${side_b?.source === "live" ? "●" : "○"}`, c: "#334155" },
        ].map((d, i) => (
          <div key={i}>
            <div style={{ fontSize: 9, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{d.l}</div>
            <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: d.c }}>{d.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DETAIL PANEL ──────────────────────────────────────────────────────────────

function DetailPanel({ row, onClose }) {
  if (!row) return null;
  const { symbol, side_a, side_b, opportunity: opp, platform_a: pa, platform_b: pb } = row;

  const buildSteps = (isS1) => {
    if (pa === "avantis" || pb === "avantis") {
      const avSide    = pa === "avantis" ? side_a : side_b;
      const otherSide = pa === "avantis" ? side_b : side_a;
      const otherPlat = pa === "avantis" ? pb : pa;
      const isAvShort = isS1 ? pa === "avantis" : pb === "avantis";
      const ann = otherSide.annualized_rate_pct;
      return [
        { plat: "avantis", dir: isAvShort ? "SHORT" : "LONG", fee: isAvShort ? avSide.short_annual_pct : avSide.long_annual_pct, lbl: "tu payes" },
        { plat: otherPlat, dir: isAvShort ? "LONG" : "SHORT", fee: fmtN(Math.abs(ann)), lbl: (isAvShort ? ann > 0 : ann < 0) ? "tu es payé" : "tu payes" },
      ];
    }
    const aAnn = side_a?.annualized_rate_pct ?? 0;
    const bAnn = side_b?.annualized_rate_pct ?? 0;
    return isS1
      ? [
          { plat: pa, dir: "SHORT", fee: fmtN(Math.abs(aAnn)), lbl: aAnn > 0 ? "tu es payé" : "tu payes" },
          { plat: pb, dir: "LONG",  fee: fmtN(Math.abs(bAnn)), lbl: bAnn < 0 ? "tu es payé" : "tu payes" },
        ]
      : [
          { plat: pa, dir: "LONG",  fee: fmtN(Math.abs(aAnn)), lbl: aAnn < 0 ? "tu es payé" : "tu payes" },
          { plat: pb, dir: "SHORT", fee: fmtN(Math.abs(bAnn)), lbl: bAnn > 0 ? "tu es payé" : "tu payes" },
        ];
  };

  const strats = [
    { label: `SHORT ${platName(pa)} + LONG ${platName(pb)}`,  net: opp.strat1_net_pct, steps: buildSteps(true) },
    { label: `LONG ${platName(pa)} + SHORT ${platName(pb)}`,  net: opp.strat2_net_pct, steps: buildSteps(false) },
  ];

  return (
    <div style={{ background: "#050b14", border: `1.5px solid ${G}22`, borderRadius: 16, padding: 22, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: G, letterSpacing: "-0.03em" }}>{symbol}</span>
          <span style={{ fontSize: 12, color: "#334155" }}>
            <span style={{ color: platColor(pa) }}>{platName(pa)}</span>
            <span style={{ color: "#1e293b" }}> × </span>
            <span style={{ color: platColor(pb) }}>{platName(pb)}</span>
          </span>
        </div>
        <button onClick={onClose} style={{ background: "#0f172a", border: "1px solid #1e293b", color: "#475569", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✕</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {strats.map((s, si) => {
          const isBest = s.net === opp.best_net_pct;
          const isPos  = s.net > 0;
          const accent = isPos ? G : R;
          return (
            <div key={si} style={{ background: isBest ? "#071a0e" : "#0a0f1a", border: `1px solid ${isBest ? G + "30" : "#1e293b"}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>Strat {si + 1} — {s.label}</span>
                {isBest && <span style={{ fontSize: 10, fontWeight: 800, background: G, color: "#000", padding: "2px 8px", borderRadius: 5 }}>MEILLEURE</span>}
              </div>
              {s.steps.map((st, i) => <StepRow key={i} step={st} index={i} />)}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#070d1a", borderRadius: 9, padding: "12px 14px", border: "1px solid #1e293b", marginTop: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#334155", marginBottom: 3 }}>Net annualisé</div>
                  <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "monospace", color: accent, letterSpacing: "-0.03em" }}>{fmt(fmtN(s.net), true)}%</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: accent }}>{isPos ? "+" : ""}${fmtN((s.net / 100) * 1000, 0)}/an</div>
                  <div style={{ fontSize: 11, color: "#334155" }}>sur $1 000</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── TRADE FORM ────────────────────────────────────────────────────────────────

function TradeForm({ allData, onSaved, onCancel }) {
  const [symbol,     setSymbol]     = useState("DOGE/USD");
  const [shortPlat,  setShortPlat]  = useState("extended");
  const [longPlat,   setLongPlat]   = useState("grvt");
  const [shortEntry, setShortEntry] = useState("");
  const [longEntry,  setLongEntry]  = useState("");
  const [shortLev,   setShortLev]   = useState(3);
  const [longLev,    setLongLev]    = useState(3);
  const [shortSize,  setShortSize]  = useState(100);
  const [longSize,   setLongSize]   = useState(100);
  const [shortFr,    setShortFr]    = useState("");
  const [longFr,     setLongFr]     = useState("");
  const [saving,     setSaving]     = useState(false);

  const sE = parseFloat(shortEntry), lE = parseFloat(longEntry);
  const sN = shortSize * shortLev,   lN = longSize  * longLev;
  const delta   = lN - sN;
  const neutral = Math.abs(delta) < sN * 0.05;
  const sLiq    = sE ? calcLiq(sE, shortLev, "short") : null;
  const lLiq    = lE ? calcLiq(lE, longLev,  "long")  : null;

  const getFr = (sym, plat) => {
    const row = allData.find((r) => r.symbol === sym);
    if (!row) return null;
    if (row.platform_a === plat) return row.side_a?.funding_rate ?? null;
    if (row.platform_b === plat) return row.side_b?.funding_rate ?? null;
    return null;
  };

  const save = async () => {
    if (!sE || !lE) { alert("Entrez les prix d'entrée"); return; }
    setSaving(true);
    const trade = {
      id: "trade_" + Date.now(), symbol,
      short: { platform: shortPlat, entry_price: sE, leverage: shortLev, size_usd: shortSize, initial_funding_rate: shortFr ? parseFloat(shortFr) : (getFr(symbol, shortPlat) ?? 0), liq_price: sLiq },
      long:  { platform: longPlat,  entry_price: lE, leverage: longLev,  size_usd: longSize,  initial_funding_rate: longFr  ? parseFloat(longFr)  : (getFr(symbol, longPlat)  ?? 0), liq_price: lLiq },
      created_at: new Date().toISOString(),
    };
    await fetch(API_URL + "/api/positions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(trade) });
    setSaving(false);
    onSaved();
  };

  const inp = (val, set, opts = {}) => (
    <input type="number" value={val} onChange={(e) => set(e.target.value)}
      style={{ width: "100%", background: "#070d1a", border: "1px solid #1e293b", color: "#f1f5f9", borderRadius: 7, padding: "7px 9px", fontFamily: "monospace", fontSize: 12 }}
      {...opts}
    />
  );

  const sidePanel = (dirLabel, dirColor, plat, setPlat, entry, setEntry, lev, setLev, sz, setSz, fr, setFr, liqP, notional) => (
    <div style={{ background: "#070d1a", border: `1.5px solid ${dirColor}25`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: dirColor, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
        {dirLabel === "SHORT" ? "↓" : "↑"} {dirLabel}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <div>
          <div style={{ fontSize: 10, color: "#334155", marginBottom: 4, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Plateforme</div>
          <div style={{ display: "flex", gap: 5 }}>
            {PLATFORMS.map((p) => (
              <button key={p.id} onClick={() => setPlat(p.id)} style={{ flex: 1, padding: "5px 4px", borderRadius: 7, border: plat === p.id ? `1.5px solid ${p.color}` : "1.5px solid #1e293b", background: plat === p.id ? `${p.color}18` : "#0a0f1a", cursor: "pointer", fontSize: 10, fontWeight: 700, color: plat === p.id ? p.color : "#334155" }}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        {[
          ["Prix entrée $", entry, setEntry, { step: "0.00001", placeholder: "0.000" }],
          ["Levier",        lev,   setLev,   { min: 1, max: 50, step: 1 }],
          ["Taille $",      sz,    setSz,    {}],
          ["Funding /h (auto si vide)", fr, setFr, { step: "0.0000001", placeholder: "auto" }],
        ].map(([label, v, s, o]) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: "#334155", marginBottom: 3, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
            {inp(v, s, o)}
          </div>
        ))}
        {liqP && (
          <div style={{ background: "#0a0f1a", borderRadius: 7, padding: "8px 10px", fontSize: 11, fontFamily: "monospace", color: "#334155" }}>
            Liq <span style={{ color: dirColor }}>${liqP}</span> · Notionnel <span style={{ color: "#64748b" }}>${notional}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ background: "#050b14", border: "1.5px solid #1e293b", borderRadius: 14, padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, color: "#334155", marginBottom: 4, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Paire</div>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ background: "#0a0f1a", border: "1px solid #1e293b", color: "#f1f5f9", borderRadius: 8, padding: "7px 12px", fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>
            {["BTC/USD","ETH/USD","SOL/USD","ARB/USD","DOGE/USD","LINK/USD","AVAX/USD","OP/USD","XRP/USD"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {sE && lE && (
          <div style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, background: neutral ? "#071a0e" : "#1c1208", border: `1px solid ${neutral ? G + "30" : "#fb923c30"}`, color: neutral ? G : "#fb923c", fontWeight: 700 }}>
            {neutral ? "✓ Delta neutre" : "⚠ Déséquilibre"} · ${delta > 0 ? "+" : ""}{delta.toFixed(0)}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        {sidePanel("SHORT", "#fb923c", shortPlat, setShortPlat, shortEntry, setShortEntry, shortLev, setShortLev, shortSize, setShortSize, shortFr, setShortFr, sLiq, (shortSize * shortLev).toFixed(0))}
        {sidePanel("LONG",  G,         longPlat,  setLongPlat,  longEntry,  setLongEntry,  longLev,  setLongLev,  longSize,  setLongSize,  longFr,  setLongFr,  lLiq,  (longSize  * longLev).toFixed(0))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ flex: 1, background: G, color: "#000", border: "none", borderRadius: 9, padding: "10px 0", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          {saving ? "..." : "✓ Enregistrer & activer alertes"}
        </button>
        <button onClick={onCancel} style={{ background: "#0a0f1a", border: "1px solid #1e293b", color: "#475569", borderRadius: 9, padding: "10px 18px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}

// ── POSITION CARD ─────────────────────────────────────────────────────────────

function PositionCard({ pos, onDelete }) {
  const s = pos.short, l = pos.long;
  const sN = (s?.size_usd ?? 0) * (s?.leverage ?? 1);
  const lN = (l?.size_usd ?? 0) * (l?.leverage ?? 1);
  const neutral = Math.abs(lN - sN) < sN * 0.05;
  const frAnn = (fr, plat) => fr ? (plat === "grvt" ? (fr * 8760 / 8).toFixed(2) : (fr * 8760 * 100).toFixed(2)) : "—";

  return (
    <div style={{ background: "#070d1a", border: "1px solid #1e293b", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>{pos.symbol}</span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: neutral ? "#071a0e" : "#1c1208", color: neutral ? G : "#fb923c", fontWeight: 700 }}>
          {neutral ? "✓ Neutre" : "⚠ Déséq."}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#1e293b" }}>{new Date(pos.created_at).toLocaleDateString()}</span>
        <button onClick={() => onDelete(pos.id)} style={{ background: "#0f172a", border: "1px solid #ef444430", color: "#f87171", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✕</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { side: s, dir: "SHORT ↓", color: "#fb923c", notional: sN },
          { side: l, dir: "LONG ↑",  color: G,         notional: lN },
        ].map(({ side, dir, color, notional }) => (
          <div key={dir} style={{ background: `${color}08`, border: `1px solid ${color}18`, borderRadius: 9, padding: "10px 12px" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color }}>{dir}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: platColor(side?.platform), textTransform: "uppercase" }}>{side?.platform}</span>
            </div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#334155", lineHeight: 1.9 }}>
              <span style={{ color: "#64748b" }}>${side?.entry_price}</span> · {side?.leverage}x · $
              {side?.size_usd} → <span style={{ color: "#64748b" }}>${notional.toFixed(0)}</span><br />
              Liq <span style={{ color }}>${side?.liq_price}</span> · {frAnn(side?.initial_funding_rate, side?.platform)}%/an
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────

export default function App() {
  const [platA,     setPlatA]     = useState("extended");
  const [platB,     setPlatB]     = useState("grvt");
  const [allData,   setAllData]   = useState([]);
  const [sortBy,    setSortBy]    = useState("best");
  const [selected,  setSelected]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [meta,      setMeta]      = useState(null);
  const [positions, setPositions] = useState([]);
  const [showForm,  setShowForm]  = useState(false);
  const detailRef = useRef(null);

  const refresh = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/funding?platform_a=${platA}&platform_b=${platB}`);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      setAllData(j.pairs ?? []);
      setMeta(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [platA, platB]);

  const loadPositions = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/positions`);
      const j = await r.json();
      setPositions(j.positions ?? []);
    } catch (_) {}
  }, []);

  const deletePosition = async (id) => {
    await fetch(`${API_URL}/api/positions/${id}`, { method: "DELETE" });
    loadPositions();
  };

  // Auto-refresh toutes les 30s
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [platA, platB]);

  useEffect(() => { loadPositions(); }, []);

  const handlePlatChange = (a, b) => {
    setPlatA(a); setPlatB(b);
    setSelected(null); setAllData([]);
  };

  const sorted = [...allData].sort((a, b) => {
    if (sortBy === "best")   return b.opportunity.best_net_pct - a.opportunity.best_net_pct;
    if (sortBy === "symbol") return a.symbol.localeCompare(b.symbol);
    if (sortBy === "b_rate") return Math.abs(b.side_b?.annualized_rate_pct ?? 0) - Math.abs(a.side_b?.annualized_rate_pct ?? 0);
    return 0;
  });

  const best     = allData.reduce((b, c) => c.opportunity.best_net_pct > (b?.opportunity?.best_net_pct ?? -999) ? c : b, null);
  const posCount = allData.filter((p) => p.opportunity.best_net_pct > 0).length;
  const selectedRow = allData.find((r) => r.symbol === selected);

  return (
    <div style={{ background: "#030712", minHeight: "100vh", padding: "28px 32px", fontFamily: "'JetBrains Mono', 'Fira Code', monospace, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {/* TOP BAR */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: G, boxShadow: `0 0 8px ${G}` }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: G, textTransform: "uppercase" }}>Funding Scanner</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {meta && <span style={{ fontSize: 10, color: "#1e293b", fontFamily: "monospace" }}>{new Date().toLocaleTimeString()}</span>}
          <button onClick={refresh} disabled={loading} style={{ padding: "6px 18px", borderRadius: 8, background: loading ? "#0a0f1a" : G, color: loading ? "#334155" : "#000", border: "none", cursor: loading ? "default" : "pointer", fontSize: 11, fontWeight: 800 }}>
            {loading ? <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span> : "⟳ Refresh"}
          </button>
        </div>
      </div>

      {/* PLATFORM PICKER */}
      <div style={{ background: "#070d1a", border: "1px solid #0f172a", borderRadius: 16, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: "#334155", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Sélectionne 2 plateformes</div>
        <PlatformPicker platA={platA} platB={platB} onChange={handlePlatChange} />
      </div>

      {/* ERROR */}
      {error && (
        <div style={{ background: "#1c0a0a", border: "1px solid #ef444430", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: R }}>
          ⚠ Backend inaccessible ({error})
        </div>
      )}

      {/* STATS */}
      {allData.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <StatCard label="Meilleure opp" value={best ? `${fmt(fmtN(best.opportunity.best_net_pct), true)}%` : "—"} sub={best?.symbol ?? "—"} accent={best?.opportunity.best_net_pct > 0 ? G : null} />
          <StatCard label="Paires rentables" value={`${posCount}/${allData.length}`} sub="delta neutral positif" />
          <StatCard label="P&L max / an" value={best ? `$${fmtN((best.opportunity.best_net_pct / 100) * 1000, 0)}` : "—"} sub="sur $1 000" accent={best?.opportunity.best_net_pct > 0 ? G : null} />
          <StatCard label="P&L max / mois" value={best ? `$${fmtN((best.opportunity.best_net_pct / 100) * 1000 / 12, 0)}` : "—"} sub="estimé" />
        </div>
      )}

      {/* SORT */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 10, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginRight: 4 }}>Trier</span>
        {SORT_OPTIONS.map((o) => (
          <button key={o.id} onClick={() => setSortBy(o.id)} style={{ background: sortBy === o.id ? G + "18" : "#0a0f1a", border: sortBy === o.id ? `1px solid ${G}50` : "1px solid #1e293b", color: sortBy === o.id ? G : "#334155", borderRadius: 7, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "monospace", fontWeight: 700 }}>
            {o.label}
          </button>
        ))}
      </div>

      {/* CARDS */}
      {loading && !allData.length ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#1e293b" }}>
          <div style={{ fontSize: 28, display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</div>
          <div style={{ fontSize: 12, marginTop: 10 }}>Connexion…</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {sorted.map((row) => (
            <PairCard key={row.symbol} row={row} selected={selected === row.symbol} onClick={() => {
              setSelected((s) => s === row.symbol ? null : row.symbol);
              setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
            }} />
          ))}
        </div>
      )}

      {/* DETAIL */}
      <div ref={detailRef}>
        <DetailPanel row={selectedRow} onClose={() => setSelected(null)} />
      </div>

      {/* POSITIONS */}
      <div style={{ background: "#070d1a", border: "1px solid #0f172a", borderRadius: 16, padding: "18px 22px", marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: positions.length || showForm ? 16 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: G }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: G, textTransform: "uppercase" }}>Positions</span>
            {positions.length > 0 && (
              <span style={{ fontSize: 10, background: G, color: "#000", borderRadius: 5, padding: "1px 7px", fontWeight: 800 }}>{positions.length}</span>
            )}
          </div>
          <button onClick={() => setShowForm((v) => !v)} style={{ background: "#0a0f1a", border: `1.5px solid ${showForm ? "#ef444440" : "#1e293b"}`, color: showForm ? R : G, borderRadius: 9, padding: "6px 16px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
            {showForm ? "✕ Annuler" : "+ Nouveau trade"}
          </button>
        </div>
        {showForm && (
          <TradeForm allData={allData} onSaved={() => { setShowForm(false); loadPositions(); }} onCancel={() => setShowForm(false)} />
        )}
        {positions.length === 0 && !showForm ? (
          <div style={{ fontSize: 12, color: "#1e293b", textAlign: "center", padding: "20px 0" }}>Aucun trade — clique "+ Nouveau trade"</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {positions.map((p) => <PositionCard key={p.id} pos={p} onDelete={deletePosition} />)}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ marginTop: 20, fontSize: 10, color: "#0f172a", lineHeight: 1.9, fontFamily: "monospace" }}>
        Avantis · Base · GRVT · market-data.grvt.io · Extended · api.starknet.extended.exchange
        &nbsp;·&nbsp; taux positif → SHORT reçoit, LONG paie
      </div>
    </div>
  );
}
