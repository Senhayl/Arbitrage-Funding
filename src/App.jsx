import { useState, useEffect, useCallback, useRef } from "react"

// ── CONSTANTES ───────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === "localhost" ? "http://localhost:8000" : "https://back-end-production-5712.up.railway.app")

const parseJsonOrThrow = async (response, label) => {
  const raw = await response.text()
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`)
  try {
    return JSON.parse(raw)
  } catch {
    const contentType = response.headers.get("content-type") ?? "inconnu"
    const preview = raw.slice(0, 80).replace(/\s+/g, " ")
    throw new Error(`${label}: réponse non JSON (${contentType}) "${preview}"`)
  }
}

const PLATFORMS = [
  { id: "grvt",     name: "GRVT",     chain: "GRVT L2",  color: "#a78bfa", type: "funding" },
  { id: "extended", name: "Extended", chain: "Starknet",  color: "#f97316", type: "funding" },
]

const TIER_ICON  = { fire: "🔥", good: "🟢", weak: "🟡", negative: "🔴" }
const SORT_OPTIONS = [
  { key: "best",      label: "Meilleur APR"  },
  { key: "stability", label: "Stabilité"     },
  { key: "symbol",    label: "Paire A→Z"     },
  { key: "b_rate",    label: "|Rate B|"      },
]

const platColor = (id) => PLATFORMS.find((p) => p.id === id)?.color ?? "#888"
const platName  = (id) => PLATFORMS.find((p) => p.id === id)?.name  ?? id
const fmt       = (v, sign = false) => `${sign && v > 0 ? "+" : ""}${v}`
const calcLiq   = (entry, lev, side) => {
  const margin = (1 / lev) * 0.9
  return side === "short"
    ? parseFloat((entry * (1 + margin)).toFixed(6))
    : parseFloat((entry * (1 - margin)).toFixed(6))
}

// ── TELEGRAM ─────────────────────────────────────────────────────────────────

const getTelegramConfig = () => ({
  token:  localStorage.getItem("telegram_token")   ?? "",
  chatId: localStorage.getItem("telegram_chat_id") ?? "",
})

const sendTelegram = async (text) => {
  const { token, chatId } = getTelegramConfig()
  if (!token || !chatId) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

function TelegramConfig({ onConfigured }) {
  const saved = getTelegramConfig()
  const [token,  setToken]  = useState(saved.token)
  const [chatId, setChatId] = useState(saved.chatId)
  const [status, setStatus] = useState(null)   // null | "ok" | "error" | "testing"
  const [open,   setOpen]   = useState(false)

  const isConfigured = saved.token && saved.chatId

  const handleSave = () => {
    localStorage.setItem("telegram_token",   token.trim())
    localStorage.setItem("telegram_chat_id", chatId.trim())
    onConfigured(Boolean(token.trim() && chatId.trim()))
    setStatus("ok")
    setTimeout(() => setStatus(null), 2000)
  }

  const handleTest = async () => {
    // On sauvegarde d'abord pour utiliser les valeurs actuelles
    localStorage.setItem("telegram_token",   token.trim())
    localStorage.setItem("telegram_chat_id", chatId.trim())
    onConfigured(Boolean(token.trim() && chatId.trim()))
    setStatus("testing")
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token.trim()}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId.trim(),
            text: "✅ Delta Neutral — Notifications Telegram configurées avec succès !",
          }),
        }
      )
      const json = await res.json()
      setStatus(json.ok ? "ok" : "error")
    } catch {
      setStatus("error")
    }
    setTimeout(() => setStatus(null), 3000)
  }

  return (
    <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-5 mb-5">
      {/* Header — toujours visible */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-black uppercase tracking-widest text-white">🔔 Alertes Telegram</h2>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              isConfigured
                ? "bg-green-400/15 text-green-400"
                : "bg-yellow-400/15 text-yellow-400"
            }`}
          >
            {isConfigured ? "✓ Configuré" : "⚠ Non configuré"}
          </span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
        >
          {open ? "Fermer" : "Configurer"}
        </button>
      </div>

      {/* Formulaire — visible seulement si open */}
      {open && (
        <div className="mt-4 flex flex-col gap-3">
          {/* Explication */}
          <p className="text-xs text-gray-500 leading-relaxed">
            Entre ton token BotFather et ton Chat ID. Ces informations restent uniquement dans
            ton navigateur — elles ne sont jamais envoyées à notre serveur.
          </p>

          {/* Champs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 uppercase tracking-wide block mb-1.5">
                Token BotFather
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456:ABC-DEF..."
                className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-xs font-mono placeholder-gray-700 focus:outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 uppercase tracking-wide block mb-1.5">
                Chat ID
              </label>
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="123456789"
                className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-3 py-2 text-xs font-mono placeholder-gray-700 focus:outline-none focus:border-white/25"
              />
            </div>
          </div>

          {/* Boutons */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 text-xs font-bold rounded-lg hover:text-white transition-colors"
            >
              💾 Sauvegarder
            </button>
            <button
              onClick={handleTest}
              disabled={!token || !chatId || status === "testing"}
              className="px-4 py-2 bg-green-400/10 border border-green-400/30 text-green-400 text-xs font-bold rounded-lg hover:bg-green-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {status === "testing" ? "Envoi…" : "📨 Tester"}
            </button>

            {/* Feedback */}
            {status === "ok" && (
              <span className="self-center text-xs text-green-400 font-bold">✓ Message envoyé !</span>
            )}
            {status === "error" && (
              <span className="self-center text-xs text-red-400 font-bold">✗ Erreur — vérifie ton token et chat ID</span>
            )}
          </div>

          {/* Aide */}
          <div className="text-xs text-gray-700 leading-relaxed border-t border-white/5 pt-3">
            <span className="text-gray-500 font-semibold">Comment obtenir ces infos ?</span>
            <br />
            Token : ouvre Telegram → <span className="text-gray-400">@BotFather</span> → /newbot → copie le token
            <br />
            Chat ID : envoie un message à ton bot puis ouvre{" "}
            <span className="text-gray-400">api.telegram.org/bot{'<TOKEN>'}/getUpdates</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── NAVBAR ───────────────────────────────────────────────────────────────────

function Navbar({ serverOk, lastUpdate, onRefresh, refreshing }) {
  return (
    <header className="flex items-center justify-between mb-5">
      <div>
        <p className="text-xs text-green-400 tracking-widest uppercase font-mono mb-1">◈ PerpDex Funding Scanner</p>
        <h1 className="text-2xl font-black text-white tracking-tight">Delta Neutral</h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right text-xs text-gray-500">
          <div className="flex items-center gap-1.5 justify-end">
            <span className={`w-2 h-2 rounded-full inline-block ${serverOk ? "bg-green-400 shadow-[0_0_4px_#4ade80]" : "bg-yellow-400"}`} />
            <span>{serverOk ? "Backend connecté" : "Backend hors ligne"}</span>
          </div>
          {lastUpdate && <div className="mt-0.5">Mis à jour {lastUpdate}</div>}
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="bg-green-400 text-black font-bold text-sm px-4 py-2 rounded-lg hover:bg-green-300 disabled:bg-gray-700 disabled:text-gray-500 transition-colors"
        >
          {refreshing ? "⟳ …" : "⟳ Refresh"}
        </button>
      </div>
    </header>
  )
}

// ── PLATFORM TOGGLES ──────────────────────────────────────────────────────────

function PlatformToggles({ selected, onChange }) {
  const toggle = (id) => {
    if (selected.includes(id)) return // toujours 2 actifs, pas de déselection
    // Remplace le premier (FIFO) pour garder exactement 2
    onChange([selected[1], id])
  }

  return (
    <div className="flex gap-3 mb-5 flex-wrap items-center">
      {PLATFORMS.map((p) => {
        const active = selected.includes(p.id)
        const idx    = selected.indexOf(p.id)
        return (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all min-w-[140px]"
            style={
              active
                ? { borderColor: p.color, background: `${p.color}15` }
                : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", opacity: 0.45 }
            }
          >
            <div className="text-left flex-1">
              <div className="text-sm font-bold" style={{ color: active ? p.color : "#555" }}>{p.name}</div>
              <div className="text-xs text-gray-600">{p.chain}</div>
            </div>
            {active && (
              <div className="text-xs font-black w-5 h-5 rounded flex items-center justify-center"
                style={{ background: p.color, color: "#000" }}>
                {idx + 1}
              </div>
            )}
          </button>
        )
      })}
      <div className="ml-auto text-xs text-gray-600 font-mono px-3 py-2 rounded-lg bg-white/5 border border-white/10">
        <span style={{ color: platColor(selected[0]) }}>{platName(selected[0])}</span>
        <span className="text-gray-600 mx-2">×</span>
        <span style={{ color: platColor(selected[1]) }}>{platName(selected[1])}</span>
        <div className="text-gray-700 font-normal mt-0.5">Combo actif</div>
      </div>
    </div>
  )
}

// ── STATS BAR ────────────────────────────────────────────────────────────────

function StatsBar({ data, positions }) {
  if (!data.length) return null

  const pos   = data.filter((p) => p.opportunity.best_net_pct > 0).length

  // Paires des positions actives avec leur APR live
  const livePositions = positions
    .map((pos) => {
      const row = data.find((r) => r.symbol === pos.symbol)
      if (!row) return null
      return {
        symbol: pos.symbol,
        apr:    row.opportunity.best_net_pct,
        tier:   row.opportunity.tier,
      }
    })
    .filter(Boolean)

  return (
    <div className="flex gap-3 mb-5 flex-wrap items-stretch">

      {/* Carte paires rentables — toujours visible */}
      <div className="rounded-xl px-5 py-3 min-w-[130px] border"
        style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="text-xs text-gray-600 uppercase tracking-widest font-semibold">Paires rentables</div>
        <div className="text-xl font-black mt-1 mb-0.5 text-white">{pos}/{data.length}</div>
        <div className="text-xs text-gray-600">delta neutral positif</div>
      </div>

      {/* Cartes APR live des positions ouvertes */}
      {livePositions.length > 0 ? (
        livePositions.map(({ symbol, apr, tier }) => {
          const isPos  = apr > 0
          const isWarn = apr > 0 && apr < 5
          return (
            <div key={symbol}
              className="rounded-xl px-4 py-3 border flex flex-col justify-between min-w-[120px]"
              style={
                isWarn
                  ? { background: "rgba(251,146,60,0.06)", borderColor: "rgba(251,146,60,0.35)" }
                  : isPos
                  ? { background: "rgba(74,222,128,0.06)", borderColor: "rgba(74,222,128,0.3)" }
                  : { background: "rgba(248,113,113,0.06)", borderColor: "rgba(248,113,113,0.3)" }
              }>
              <div className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-1">
                {symbol} {TIER_ICON[tier] ?? ""}
              </div>
              <div className="text-xl font-black font-mono"
                style={{ color: isWarn ? "#fb923c" : isPos ? "#4ade80" : "#f87171" }}>
                {fmt(apr, true)}%
              </div>
              <div className="text-xs mt-0.5"
                style={{ color: isWarn ? "#fb923c99" : isPos ? "#4ade8077" : "#f8717177" }}>
                {isWarn ? "⚠ Funding bas" : isPos ? "Position active" : "Négatif"}
              </div>
            </div>
          )
        })
      ) : (
        /* Aucune position — on affiche la meilleure opp à la place */
        (() => {
          const best  = data.reduce((b, c) => c.opportunity.best_net_pct > (b?.opportunity?.best_net_pct ?? -999) ? c : b, null)
          const isPos = (best?.opportunity?.best_net_pct ?? 0) > 0
          return (
            <div className="rounded-xl px-5 py-3 min-w-[130px] border"
              style={isPos
                ? { background: "rgba(74,222,128,0.06)", borderColor: "rgba(74,222,128,0.3)" }
                : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="text-xs text-gray-600 uppercase tracking-widest font-semibold">Meilleure opp</div>
              <div className={`text-xl font-black mt-1 mb-0.5 ${isPos ? "text-green-400" : "text-white"}`}>
                {best ? fmt(best.opportunity.best_net_pct, true) + "%" : "—"}
              </div>
              <div className="text-xs text-gray-600">{best?.symbol ?? "—"}</div>
            </div>
          )
        })()
      )}
    </div>
  )
}

// ── PAIR CARD ────────────────────────────────────────────────────────────────

function PairCard({ row, platA, platB }) {
  const { symbol, side_a, side_b, opportunity: opp } = row
  const isPos     = opp.best_net_pct > 0
  const shortPlat = opp.short_platform
  const longPlat  = opp.long_platform
  const bRate     = side_b?.annualized_rate_pct ?? 0
  const aSrc      = side_a?.source ?? "mock"
  const bSrc      = side_b?.source ?? "mock"

  // Score de stabilité — on préfère 7j si suffisamment de données, sinon 30j
  const stab7  = opp.stability_7d
  const stab30 = opp.stability_30d
  const stab   = stab7?.sample_count >= 3 ? stab7 : stab30
  const score  = stab?.stability_score ?? null
  const nSamples = stab?.sample_count ?? 0

  // Couleur et label du score
  const scoreColor = score === null ? "#555"
    : score > 6  ? "#4ade80"   // vert — très stable
    : score > 2  ? "#facc15"   // jaune — correct
    : score > 0  ? "#fb923c"   // orange — instable
    :              "#f87171"   // rouge — négatif/inutilisable

  const scoreLabel = score === null ? "—"
    : score > 6  ? "Stable"
    : score > 2  ? "Correct"
    : score > 0  ? "Instable"
    :              "Négatif"

  const shortSide = shortPlat === platA ? side_a : side_b
  const longSide  = longPlat === platA ? side_a : side_b
  const shortCarryPct = shortSide?.annualized_rate_pct ?? 0
  const longCarryPct  = -(longSide?.annualized_rate_pct ?? 0)

  return (
    <div className="bg-[#0d1117] rounded-2xl overflow-hidden border-2 hover:-translate-y-0.5 transition-all"
      style={{ borderColor: isPos ? "#4ade8033" : "#f8717133", borderLeftColor: isPos ? "#4ade80" : "#f87171", borderLeftWidth: 3 }}>

      {/* Top — symbol + APR */}
      <div className="flex items-start justify-between px-3 pt-3 pb-2.5 border-b border-white/5">
        <div className="font-black text-sm text-white">
          {symbol} <span className="text-xs font-normal">{TIER_ICON[opp.tier] ?? "—"}</span>
        </div>
        <div className="text-right">
          <div className="text-base font-black font-mono" style={{ color: isPos ? "#4ade80" : "#f87171" }}>
            {fmt(opp.best_net_pct, true)}%
          </div>
          <div className="text-xs text-gray-600">/an</div>
        </div>
      </div>

      {/* Action box */}
      <div className="mx-2 mt-2 mb-1.5 rounded-xl p-2.5 border"
        style={isPos
          ? { background: "linear-gradient(135deg,rgba(74,222,128,0.07),transparent 70%)", borderColor: "rgba(74,222,128,0.18)" }
          : { background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.05)" }}>
        <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ color: isPos ? "#4ade80" : "#f87171" }}>
          {isPos ? "✅ Positions à ouvrir" : "⛔ Non rentable"}
        </div>

        {[
          { plat: shortPlat, dir: "SHORT ↓", dirColor: "#fca5a5", carry: shortCarryPct },
          { plat: longPlat,  dir: "LONG ↑",  dirColor: "#4ade80", carry: longCarryPct  },
        ].map(({ plat, dir, dirColor, carry }, i) => (
          <div key={i}
            className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5 border border-white/5 mb-1 last:mb-0">
            <span className="text-xs font-black uppercase tracking-wide w-14 flex-shrink-0" style={{ color: platColor(plat) }}>
              {platName(plat)}
            </span>
            <span className="text-sm font-black w-16 flex-shrink-0" style={{ color: dirColor }}>{dir}</span>
            <span className="ml-auto text-xs font-mono text-gray-600">
              {fmt((carry ?? 0).toFixed(2), true)}%/an
            </span>
          </div>
        ))}
      </div>

      {/* Footer — 4 colonnes : Rate B / Net / Stabilité / Sources */}
      <div className="grid grid-cols-4 gap-1 px-3 pb-3 pt-1">
        <div>
          <div className="text-xs text-gray-700 uppercase tracking-wide mb-0.5">Rate B</div>
          <div className="text-xs font-mono font-semibold" style={{ color: bRate > 0 ? "#f8a" : "#8f8" }}>
            {fmt(bRate.toFixed(1), true)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-700 uppercase tracking-wide mb-0.5">Net</div>
          <div className="text-xs font-mono font-semibold" style={{ color: isPos ? "#4ade80" : "#f87171" }}>
            {fmt(opp.best_net_pct, true)}%
          </div>
        </div>

        {/* Score de stabilité */}
        <div>
          <div className="text-xs text-gray-700 uppercase tracking-wide mb-0.5">Stabilité</div>
          {score === null ? (
            <div className="text-xs text-gray-700 font-mono" title={`${nSamples} mesure(s) — min. 3 requises`}>
              En cours…
            </div>
          ) : (
            <div className="text-xs font-bold" style={{ color: scoreColor }}
              title={`Score: ${score} | Moyenne: ${stab?.mean_apr}% | Consistance: ${(stab?.consistency * 100).toFixed(0)}% | Volatilité: ${stab?.volatility}`}>
              {score.toFixed(1)} <span className="font-normal opacity-70">{scoreLabel}</span>
            </div>
          )}
        </div>

        <div>
          <div className="text-xs text-gray-700 uppercase tracking-wide mb-0.5">Sources</div>
          <div className="flex gap-1 mt-0.5">
            {[{ src: aSrc, plat: platA }, { src: bSrc, plat: platB }].map(({ src, plat }) => (
              <span key={plat} className="text-xs font-black px-1 rounded"
                style={src === "live"
                  ? { background: "rgba(74,222,128,0.15)", color: "#4ade80" }
                  : { background: "rgba(250,176,5,0.15)",  color: "#fab005" }}>
                {platName(plat).slice(0, 2)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CARDS GRID ────────────────────────────────────────────────────────────────

function CardsGrid({ data, sortBy, onSort, platA, platB }) {
  const sorted = [...data].sort((a, b) => {
    if (sortBy === "best")      return b.opportunity.best_net_pct - a.opportunity.best_net_pct
    if (sortBy === "symbol")    return a.symbol.localeCompare(b.symbol)
    if (sortBy === "b_rate")    return Math.abs(b.side_b?.annualized_rate_pct ?? 0) - Math.abs(a.side_b?.annualized_rate_pct ?? 0)
    if (sortBy === "stability") {
      const scoreA = a.opportunity.stability_7d?.stability_score ?? a.opportunity.stability_30d?.stability_score ?? -1
      const scoreB = b.opportunity.stability_7d?.stability_score ?? b.opportunity.stability_30d?.stability_score ?? -1
      return scoreB - scoreA
    }
    return 0
  })

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-600 uppercase tracking-widest mr-1">Trier</span>
        {SORT_OPTIONS.map((s) => (
          <button key={s.key} onClick={() => onSort(s.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
              sortBy === s.key
                ? "bg-green-400/20 border border-green-400/50 text-green-400"
                : "bg-white/5 border border-white/10 text-gray-500 hover:text-gray-300"
            }`}>
            {s.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-600">{data.length} paires</span>
      </div>

      {/* ~5 cards par ligne */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {sorted.map((row) => (
          <PairCard key={row.symbol} row={row} platA={platA} platB={platB} />
        ))}
      </div>
    </div>
  )
}

// ── POSITIONS ─────────────────────────────────────────────────────────────────

function PositionForm({ onSave, onCancel, symbols }) {
  const [form, setForm] = useState({
    symbol: symbols[0] ?? "BTC/USD",
    shortPlat: "extended", shortEntry: "", shortLev: 3, shortSize: 100,
    longPlat:  "grvt",     longEntry:  "", longLev:  3, longSize:  100,
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const shortLiq = form.shortEntry ? calcLiq(+form.shortEntry, +form.shortLev, "short") : null
  const longLiq  = form.longEntry  ? calcLiq(+form.longEntry,  +form.longLev,  "long")  : null

  const handleSave = () => {
    if (!form.shortEntry || !form.longEntry) return alert("Entrez les prix d'entrée")
    onSave({
      id: "trade_" + Date.now(), symbol: form.symbol,
      short: { platform: form.shortPlat, entry_price: +form.shortEntry, leverage: +form.shortLev, size_usd: +form.shortSize, liq_price: shortLiq },
      long:  { platform: form.longPlat,  entry_price: +form.longEntry,  leverage: +form.longLev,  size_usd: +form.longSize,  liq_price: longLiq  },
      created_at: new Date().toISOString(),
    })
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs text-gray-500 uppercase tracking-wide">Paire</label>
        <select value={form.symbol} onChange={set("symbol")}
          className="bg-white/10 border border-white/15 text-white rounded-md px-2 py-1 text-sm font-bold">
          {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: "SHORT ↓", color: "#fca5a5", platK: "shortPlat", entryK: "shortEntry", levK: "shortLev", sizeK: "shortSize", liq: shortLiq },
          { label: "LONG ↑",  color: "#4ade80", platK: "longPlat",  entryK: "longEntry",  levK: "longLev",  sizeK: "longSize",  liq: longLiq  },
        ].map(({ label, color, platK, entryK, levK, sizeK, liq }) => (
          <div key={label} className="rounded-xl p-3 border" style={{ background: `${color}08`, borderColor: `${color}20` }}>
            <div className="text-xs font-black uppercase tracking-widest mb-3" style={{ color }}>{label}</div>
            <div className="flex flex-col gap-2">
              {[
                { label: "Plateforme", key: platK, type: "select" },
                { label: "Prix entrée $", key: entryK, type: "number" },
                { label: "Levier", key: levK, type: "number" },
                { label: "Taille $", key: sizeK, type: "number" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-xs text-gray-600 block mb-1">{f.label}</label>
                  {f.type === "select" ? (
                    <select value={form[f.key]} onChange={set(f.key)}
                      className="w-full bg-white/10 border border-white/15 text-white rounded-md px-2 py-1.5 text-xs font-mono">
                      {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <input type="number" value={form[f.key]} onChange={set(f.key)}
                      className="w-full bg-white/10 border border-white/15 text-white rounded-md px-2 py-1.5 text-xs font-mono" />
                  )}
                </div>
              ))}
              {liq && <div className="text-xs font-mono px-2 py-1.5 rounded bg-white/5" style={{ color }}>Liq : ${liq}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave}
          className="flex-1 bg-green-400 text-black font-bold text-sm py-2 rounded-lg hover:bg-green-300 transition-colors">
          ✓ Enregistrer & activer alertes
        </button>
        <button onClick={onCancel}
          className="px-4 bg-white/5 border border-white/10 text-gray-400 text-sm rounded-lg hover:text-white transition-colors">
          Annuler
        </button>
      </div>
    </div>
  )
}

function PositionItem({ pos, onDelete }) {
  const s = pos.short, l = pos.long
  const neutral = Math.abs((l.size_usd * l.leverage) - (s.size_usd * s.leverage)) < s.size_usd * s.leverage * 0.05
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-black text-white">{pos.symbol}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${neutral ? "bg-green-400/15 text-green-400" : "bg-yellow-400/15 text-yellow-400"}`}>
          {neutral ? "✓ Delta neutre" : "⚠ Déséquilibré"}
        </span>
        <span className="ml-auto text-xs text-gray-600">{new Date(pos.created_at).toLocaleDateString()}</span>
        <button onClick={() => onDelete(pos.id)}
          className="text-xs px-2 py-1 rounded bg-red-400/10 border border-red-400/20 text-red-400 hover:bg-red-400/20 transition-colors">
          ✕ Fermer
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
        {[
          { data: s, color: "#fca5a5", label: "SHORT ↓" },
          { data: l, color: "#4ade80", label: "LONG ↑"  },
        ].map(({ data, color, label }) => (
          <div key={label} className="rounded-lg px-3 py-2 border" style={{ background: `${color}08`, borderColor: `${color}18` }}>
            <div className="font-black uppercase tracking-wide mb-2" style={{ color }}>
              {label} <span style={{ color: platColor(data.platform) }}>{platName(data.platform)}</span>
            </div>
            <div className="text-gray-500 space-y-0.5">
              <div>Entrée : <span className="text-gray-200">${data.entry_price}</span></div>
              <div>Levier : <span className="text-gray-200">{data.leverage}x</span> · <span className="text-gray-200">${(data.size_usd * data.leverage).toFixed(0)}</span> notionnel</div>
              <div>Liq : <span style={{ color }}>${data.liq_price}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PositionsPanel({ apiUrl }) {
  const [positions, setPositions] = useState([])
  const [showForm,  setShowForm]  = useState(false)
  const SYMBOLS = ["BTC/USD","ETH/USD","SOL/USD","DOGE/USD","ARB/USD","OP/USD","AVAX/USD","LINK/USD","XRP/USD"]

  const load = useCallback(async () => {
    if (!apiUrl) return
    try {
      const r = await fetch(`${apiUrl}/api/positions`)
      const j = await parseJsonOrThrow(r, "Positions API")
      setPositions(j.positions ?? [])
    } catch { /* backend offline */ }
  }, [apiUrl])

  useEffect(() => { load() }, [load])

  const handleSave = async (trade) => {
    try {
      await fetch(`${apiUrl}/api/positions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(trade) })
      setShowForm(false)
      load()
    } catch (e) { alert("Erreur: " + e.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce trade ?")) return
    await fetch(`${apiUrl}/api/positions/${id}`, { method: "DELETE" })
    load()
  }

  return (
    <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-white">🔔 Positions delta neutral</h2>
        <button onClick={() => setShowForm((v) => !v)}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
          {showForm ? "Annuler" : "+ Nouveau trade"}
        </button>
      </div>
      {showForm && <PositionForm onSave={handleSave} onCancel={() => setShowForm(false)} symbols={SYMBOLS} />}
      {positions.length === 0 ? (
        <p className="text-xs text-gray-600 text-center py-6">Aucun trade surveillé — clique "+ Nouveau trade"</p>
      ) : (
        <div className="flex flex-col gap-3">
          {positions.map((p) => <PositionItem key={p.id} pos={p} onDelete={handleDelete} />)}
        </div>
      )}
    </div>
  )
}

// ── APP ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [selected,      setSelected]      = useState(["grvt", "extended"])
  const [data,          setData]          = useState([])
  const [positions,     setPositions]     = useState([])
  const [sortBy,        setSortBy]        = useState("best")
  const [loading,       setLoading]       = useState(false)
  const [serverOk,      setServerOk]      = useState(false)
  const [lastUpdate,    setLastUpdate]    = useState(null)
  const [error,         setError]         = useState(null)
  const [telegramReady, setTelegramReady] = useState(
    () => {
      const { token, chatId } = getTelegramConfig()
      return Boolean(token && chatId)
    }
  )

  const sentAlerts = useRef(new Set())

  const platA = selected[0]
  const platB = selected[1]

  // ── VÉRIFICATION DES ALERTES ────────────────────────────────────────────────
  // Appelée après chaque refresh avec les données fraîches + positions en cours

  const checkAlerts = useCallback(async (freshData, positions) => {
    if (!telegramReady) return
    if (!freshData.length || !positions.length) return

    for (const pos of positions) {
      const row = freshData.find((r) => r.symbol === pos.symbol)

      // ── 1. ALERTE LIQUIDATION ──────────────────────────────────────────────
      // On a besoin du prix actuel — on l'estime via le prix d'entrée moyen
      // des deux sides (approximation acceptable sans flux de prix temps réel)
      const avgEntry = (pos.short.entry_price + pos.long.entry_price) / 2

      const shortLiqDist = Math.abs(pos.short.liq_price - avgEntry) / avgEntry
      const longLiqDist  = Math.abs(pos.long.liq_price  - avgEntry) / avgEntry

      // Alerte si la liquidation est à moins de 20% du prix d'entrée
      if (shortLiqDist < 0.20) {
        const key = `liq-short-${pos.id}`
        if (!sentAlerts.current.has(key)) {
          await sendTelegram(
            `⚠️ LIQUIDATION PROCHE — ${pos.symbol} SHORT\n` +
            `Plateforme : ${pos.short.platform.toUpperCase()}\n` +
            `Prix liq : $${pos.short.liq_price}\n` +
            `Distance : ${(shortLiqDist * 100).toFixed(1)}% du prix d'entrée\n` +
            `Levier : ${pos.short.leverage}x`
          )
          sentAlerts.current.add(key)
        }
      } else {
        // Si le danger est passé, on réinitialise pour pouvoir alerter à nouveau
        sentAlerts.current.delete(`liq-short-${pos.id}`)
      }

      if (longLiqDist < 0.20) {
        const key = `liq-long-${pos.id}`
        if (!sentAlerts.current.has(key)) {
          await sendTelegram(
            `⚠️ LIQUIDATION PROCHE — ${pos.symbol} LONG\n` +
            `Plateforme : ${pos.long.platform.toUpperCase()}\n` +
            `Prix liq : $${pos.long.liq_price}\n` +
            `Distance : ${(longLiqDist * 100).toFixed(1)}% du prix d'entrée\n` +
            `Levier : ${pos.long.leverage}x`
          )
          sentAlerts.current.add(key)
        }
      } else {
        sentAlerts.current.delete(`liq-long-${pos.id}`)
      }

      // ── 2. ALERTE FUNDING BAS ──────────────────────────────────────────────
      if (row) {
        const netPct = row.opportunity.best_net_pct

        if (netPct < 5) {
          const key = `funding-low-${pos.id}`
          if (!sentAlerts.current.has(key)) {
            await sendTelegram(
              `📉 FUNDING BAS — ${pos.symbol}\n` +
              `Taux net actuel : ${netPct.toFixed(2)}%/an\n` +
              `La stratégie n'est plus rentable au seuil de 5%.\n` +
              `Envisage de fermer la position.`
            )
            sentAlerts.current.add(key)
          }
        } else {
          // Taux redevenu acceptable — on réinitialise
          sentAlerts.current.delete(`funding-low-${pos.id}`)
        }
      }
    }
  }, [telegramReady])

  const refresh = useCallback(async () => {
    if (loading) return
    if (!API_URL) {
      setServerOk(false)
      setError("URL API introuvable")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${API_URL}/api/funding?platform_a=${platA}&platform_b=${platB}`)
      const j = await parseJsonOrThrow(r, "Funding API")
      const freshData = j.pairs ?? []
      setData(freshData)
      setServerOk(true)
      setLastUpdate(new Date().toLocaleTimeString())

      // Récupère les positions puis vérifie les alertes
      try {
        const rPos = await fetch(`${API_URL}/api/positions`)
        const jPos = await parseJsonOrThrow(rPos, "Positions API")
        const freshPositions = jPos.positions ?? []
        setPositions(freshPositions)
        await checkAlerts(freshData, freshPositions)
      } catch { /* positions inaccessibles — on ignore */ }

    } catch (e) {
      setServerOk(false)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [platA, platB, loading, checkAlerts])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [platA, platB]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#07090d] text-white px-6 py-6 max-w-7xl mx-auto">
      <Navbar serverOk={serverOk} lastUpdate={lastUpdate} onRefresh={refresh} refreshing={loading} />
      <PlatformToggles selected={selected} onChange={(s) => { setSelected(s); setData([]) }} />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-red-300">
          ⚠ Backend inaccessible ({error}) — Lance{" "}
          <code className="text-yellow-400 text-xs">python3 -m uvicorn server:app --reload --port 8000</code>
        </div>
      )}

      <StatsBar data={data} positions={positions} />

      {loading && !data.length ? (
        <div className="text-center py-16 text-gray-600">
          <div className="text-3xl animate-spin inline-block mb-3">⟳</div>
          <p className="text-sm">Connexion au backend…</p>
        </div>
      ) : data.length > 0 ? (
        <CardsGrid data={data} sortBy={sortBy} onSort={setSortBy} platA={platA} platB={platB} />
      ) : !error ? (
        <div className="text-center py-16 text-gray-600 text-sm">Aucune donnée — clique Refresh</div>
      ) : null}

      <PositionsPanel apiUrl={API_URL} />
      <TelegramConfig onConfigured={setTelegramReady} />
    </div>
  )
}
