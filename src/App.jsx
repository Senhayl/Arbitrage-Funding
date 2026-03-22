import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000" : "");

const PLATFORMS = [
  { id: "extended", name: "Extended" },
  { id: "grvt", name: "GRVT" },
];

function toPct(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  const n = Number(value);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

export default function App() {
  const [platformA, setPlatformA] = useState("extended");
  const [platformB, setPlatformB] = useState("grvt");
  const [rows, setRows] = useState([]);
  const [positions, setPositions] = useState([]);
  const [symbol, setSymbol] = useState("BTC/USD");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const refreshFunding = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        apiUrl(`/api/funding?platform_a=${platformA}&platform_b=${platformB}`)
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      setRows(payload.pairs || []);
      setUpdatedAt(payload.timestamp || new Date().toISOString());
    } catch (err) {
      setRows([]);
      setError(`Backend indisponible: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [platformA, platformB]);

  const loadPositions = useCallback(async () => {
    try {
      const response = await fetch(apiUrl("/api/positions"));
      if (!response.ok) throw new Error("positions not available");
      const payload = await response.json();
      setPositions(payload.positions || []);
    } catch {
      setPositions([]);
    }
  }, []);

  useEffect(() => {
    refreshFunding();
    const timer = setInterval(refreshFunding, 30000);
    return () => clearInterval(timer);
  }, [refreshFunding]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  const best = useMemo(() => {
    if (!rows.length) return null;
    return rows.reduce((acc, row) => {
      if (!acc) return row;
      return row.opportunity.best_net_pct > acc.opportunity.best_net_pct ? row : acc;
    }, null);
  }, [rows]);

  const positiveCount = rows.filter((r) => r.opportunity.best_net_pct > 0).length;

  async function addPosition(event) {
    event.preventDefault();
    const payload = {
      id: `pos_${Date.now()}`,
      symbol,
      note,
      created_at: new Date().toISOString(),
    };

    await fetch(apiUrl("/api/positions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setNote("");
    await loadPositions();
  }

  async function removePosition(id) {
    await fetch(apiUrl(`/api/positions/${id}`), { method: "DELETE" });
    await loadPositions();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Arbitrage Funding</p>
          <h1>Comparateur de funding</h1>
        </div>
        <button className="btn" onClick={refreshFunding} disabled={loading}>
          {loading ? "Chargement..." : "Rafraichir"}
        </button>
      </header>

      <section className="panel filters">
        <label>
          Plateforme A
          <select
            value={platformA}
            onChange={(e) => {
              const nextA = e.target.value;
              setPlatformA(nextA);
              if (nextA === platformB) {
                setPlatformB(nextA === "extended" ? "grvt" : "extended");
              }
            }}
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Plateforme B
          <select
            value={platformB}
            onChange={(e) => {
              const nextB = e.target.value;
              setPlatformB(nextB);
              if (nextB === platformA) {
                setPlatformA(nextB === "extended" ? "grvt" : "extended");
              }
            }}
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="meta">
          <div>
            <strong>{rows.length}</strong> paires
          </div>
          <div>
            <strong>{positiveCount}</strong> opportunites positives
          </div>
          <div>
            Best: <strong>{best ? `${best.symbol} (${toPct(best.opportunity.best_net_pct)})` : "-"}</strong>
          </div>
          <div>Maj: {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "-"}</div>
        </div>
      </section>

      {error && <section className="panel error">{error}</section>}

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Paire</th>
              <th>{platformA} ann.</th>
              <th>{platformB} ann.</th>
              <th>Meilleure strat</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol}>
                <td>{row.symbol}</td>
                <td>{toPct(row.side_a?.annualized_rate_pct)}</td>
                <td>{toPct(row.side_b?.annualized_rate_pct)}</td>
                <td>{row.opportunity.best_strategy === "short_a_long_b" ? "Short A / Long B" : "Long A / Short B"}</td>
                <td className={row.opportunity.best_net_pct > 0 ? "pos" : "neg"}>
                  {toPct(row.opportunity.best_net_pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Positions suivies</h2>
        <form className="position-form" onSubmit={addPosition}>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {rows.map((row) => (
              <option key={row.symbol} value={row.symbol}>
                {row.symbol}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Note (optionnel)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="btn" type="submit">
            Ajouter
          </button>
        </form>

        <ul className="positions">
          {positions.map((p) => (
            <li key={p.id}>
              <span>
                <strong>{p.symbol}</strong> {p.note ? `- ${p.note}` : ""}
              </span>
              <button onClick={() => removePosition(p.id)}>Supprimer</button>
            </li>
          ))}
          {positions.length === 0 && <li className="empty">Aucune position enregistree</li>}
        </ul>
      </section>
    </main>
  );
}
