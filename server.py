import asyncio
import json
import logging
import math
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("backend")

app = FastAPI(title="Arbitrage Funding API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GRVT_BASE = "https://market-data.grvt.io"
EXTENDED_BASE = "https://api.starknet.extended.exchange/api/v1"
POSITIONS_FILE = Path("positions.json")
HISTORY_FILE = Path("funding_history.json")

SUPPORTED_PLATFORMS = {"grvt", "extended"}

PAIRS = [
    # ── Confirmées sur GRVT et Extended ──────────────────────────────────────
    {"symbol": "BTC/USD",    "grvt": "BTC_USDT_Perp",     "extended": "BTC-USD"},
    {"symbol": "ETH/USD",    "grvt": "ETH_USDT_Perp",     "extended": "ETH-USD"},
    {"symbol": "SOL/USD",    "grvt": "SOL_USDT_Perp",     "extended": "SOL-USD"},
    {"symbol": "XRP/USD",    "grvt": "XRP_USDT_Perp",     "extended": "XRP-USD"},
    {"symbol": "AVAX/USD",   "grvt": "AVAX_USDT_Perp",    "extended": "AVAX-USD"},
    {"symbol": "OP/USD",     "grvt": "OP_USDT_Perp",      "extended": "OP-USD"},
    {"symbol": "AAVE/USD",   "grvt": "AAVE_USDT_Perp",    "extended": "AAVE-USD"},
    {"symbol": "CRV/USD",    "grvt": "CRV_USDT_Perp",     "extended": "CRV-USD"},
    {"symbol": "ENA/USD",    "grvt": "ENA_USDT_Perp",     "extended": "ENA-USD"},
    {"symbol": "HYPE/USD",   "grvt": "HYPE_USDT_Perp",    "extended": "HYPE-USD"},
    {"symbol": "KAITO/USD",  "grvt": "KAITO_USDT_Perp",   "extended": "KAITO-USD"},
    {"symbol": "AVNT/USD",   "grvt": "AVNT_USDT_Perp",    "extended": "AVNT-USD"},
    {"symbol": "SUI/USD",    "grvt": "SUI_USDT_Perp",     "extended": "SUI-USD"},
    {"symbol": "WIF/USD",    "grvt": "WIF_USDT_Perp",     "extended": "WIF-USD"},
    {"symbol": "LTC/USD",    "grvt": "LTC_USDT_Perp",     "extended": "LTC-USD"},
    {"symbol": "UNI/USD",    "grvt": "UNI_USDT_Perp",     "extended": "UNI-USD"},
    {"symbol": "TIA/USD",    "grvt": "TIA_USDT_Perp",     "extended": "TIA-USD"},
    {"symbol": "MKR/USD",    "grvt": "MKR_USDT_Perp",     "extended": "MKR-USD"},
    {"symbol": "SNX/USD",    "grvt": "SNX_USDT_Perp",     "extended": "SNX-USD"},
    {"symbol": "WLD/USD",    "grvt": "WLD_USDT_Perp",     "extended": "WLD-USD"},
    {"symbol": "PENGU/USD",  "grvt": "PENGU_USDT_Perp",   "extended": "PENGU-USD"},
    {"symbol": "MNT/USD",    "grvt": "MNT_USDT_Perp",     "extended": "MNT-USD"},
    {"symbol": "XLM/USD",    "grvt": "XLM_USDT_Perp",     "extended": "XLM-USD"},
    {"symbol": "APT/USD",    "grvt": "APT_USDT_Perp",     "extended": "APT-USD"},
    {"symbol": "POPCAT/USD", "grvt": "POPCAT_USDT_Perp",  "extended": "POPCAT-USD"},

    # ── À vérifier — présentes sur GRVT, peut-être sur Extended ─────────────
    {"symbol": "ARB/USD",    "grvt": "ARB_USDT_Perp",     "extended": "ARB-USD"},
    {"symbol": "DOGE/USD",   "grvt": "DOGE_USDT_Perp",    "extended": "DOGE-USD"},
    {"symbol": "LINK/USD",   "grvt": "LINK_USDT_Perp",    "extended": "LINK-USD"},
    {"symbol": "ATOM/USD",   "grvt": "ATOM_USDT_Perp",    "extended": "ATOM-USD"},
    {"symbol": "BNB/USD",    "grvt": "BNB_USDT_Perp",     "extended": "BNB-USD"},
    {"symbol": "DOT/USD",    "grvt": "DOT_USDT_Perp",     "extended": "DOT-USD"},
    {"symbol": "FIL/USD",    "grvt": "FIL_USDT_Perp",     "extended": "FIL-USD"},
    {"symbol": "BCH/USD",    "grvt": "BCH_USDT_Perp",     "extended": "BCH-USD"},
    {"symbol": "ADA/USD",    "grvt": "ADA_USDT_Perp",     "extended": "ADA-USD"},
    {"symbol": "EIGEN/USD",  "grvt": "EIGEN_USDT_Perp",   "extended": "EIGEN-USD"},
    {"symbol": "JUP/USD",    "grvt": "JUP_USDT_Perp",     "extended": "JUP-USD"},
    {"symbol": "LDO/USD",    "grvt": "LDO_USDT_Perp",     "extended": "LDO-USD"},
    {"symbol": "HBAR/USD",   "grvt": "HBAR_USDT_Perp",    "extended": "HBAR-USD"},
    {"symbol": "ICP/USD",    "grvt": "ICP_USDT_Perp",     "extended": "ICP-USD"},
]


def load_positions() -> list:
    if POSITIONS_FILE.exists():
        try:
            return json.loads(POSITIONS_FILE.read_text())
        except json.JSONDecodeError:
            log.warning("positions.json invalide, reset en liste vide")
    return []


def save_positions(positions: list) -> None:
    POSITIONS_FILE.write_text(json.dumps(positions, indent=2))


def load_history() -> dict:
    if HISTORY_FILE.exists():
        try:
            data = json.loads(HISTORY_FILE.read_text())
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            log.warning("funding_history.json invalide, reset historique")
    return {}


def save_history(history: dict) -> None:
    HISTORY_FILE.write_text(json.dumps(history, indent=2))


def add_history_samples(history: dict, combo_key: str, rows: list, now_ts: float) -> dict:
    combo = history.setdefault(combo_key, {})

    # On garde 30 jours glissants de mesures
    cutoff_30d = now_ts - (30 * 24 * 3600)

    for row in rows:
        symbol = row["symbol"]
        value = float(row["opportunity"]["best_net_pct"])
        samples = combo.setdefault(symbol, [])
        samples.append({"ts": now_ts, "best_net_pct": value})

        combo[symbol] = [
            s
            for s in samples
            if isinstance(s, dict)
            and isinstance(s.get("ts"), (int, float))
            and s["ts"] >= cutoff_30d
        ]

    return history


def compute_stability(vals: list[float]) -> dict:
    """
    Calcule les indicateurs de stabilité sur une liste de valeurs APR.

    - mean_apr       : APR moyen sur la fenêtre
    - consistency    : % de mesures positives (entre 0.0 et 1.0)
    - volatility     : écart-type des mesures (plus c'est bas, plus c'est stable)
    - stability_score: mean_apr × consistency × 1 / (1 + volatility)

    Le score est nul si moins de 3 mesures — pas assez de données pour être fiable.
    """
    n = len(vals)
    if n < 3:
        return {
            "mean_apr": None,
            "consistency": None,
            "volatility": None,
            "stability_score": None,
            "sample_count": n,
        }

    mean_apr = sum(vals) / n

    # Consistance : % de valeurs positives
    positive_count = sum(1 for v in vals if v > 0)
    consistency = positive_count / n

    # Volatilité : écart-type (population)
    variance = sum((v - mean_apr) ** 2 for v in vals) / n
    volatility = math.sqrt(variance)

    # Score composite — on protège contre les APR négatifs (score = 0 si mean <= 0)
    if mean_apr <= 0:
        stability_score = 0.0
    else:
        stability_score = round(mean_apr * consistency * (1 / (1 + volatility)), 3)

    return {
        "mean_apr": round(mean_apr, 3),
        "consistency": round(consistency, 3),
        "volatility": round(volatility, 3),
        "stability_score": stability_score,
        "sample_count": n,
    }


def best_apr_windows(history: dict, combo_key: str, symbol: str, now_ts: float) -> dict:
    combo = history.get(combo_key, {})
    samples = combo.get(symbol, [])

    def filter_samples(window_seconds: int) -> list[float]:
        return [
            float(s.get("best_net_pct", 0))
            for s in samples
            if isinstance(s, dict)
            and isinstance(s.get("ts"), (int, float))
            and s["ts"] >= now_ts - window_seconds
        ]

    vals_7d  = filter_samples(7  * 24 * 3600)
    vals_30d = filter_samples(30 * 24 * 3600)

    stability_7d  = compute_stability(vals_7d)
    stability_30d = compute_stability(vals_30d)

    return {
        # Anciennes métriques conservées pour compatibilité
        "best_7d_apr_pct":  round(max(vals_7d),  3) if vals_7d  else None,
        "best_30d_apr_pct": round(max(vals_30d), 3) if vals_30d else None,
        "samples_7d":  len(vals_7d),
        "samples_30d": len(vals_30d),

        # Nouvelles métriques de stabilité
        "stability_7d":  stability_7d,
        "stability_30d": stability_30d,
    }


def annualized_from_grvt(rate: float, interval_h: float) -> float:
    return rate * (8760 / interval_h)


def annualized_from_extended(rate_per_hour_fraction: float) -> float:
    return rate_per_hour_fraction * 8760 * 100


def compute_opp(side_a: dict, side_b: dict) -> dict:
    ann_a = float(side_a.get("annualized_rate_pct", 0))
    ann_b = float(side_b.get("annualized_rate_pct", 0))

    strat1 = ann_a + (-ann_b)   # short A + long B
    strat2 = (-ann_a) + ann_b   # long A + short B

    best = max(strat1, strat2)
    best_strategy = "short_a_long_b" if strat1 >= strat2 else "long_a_short_b"

    return {
        "strat1_net_pct": round(strat1, 3),
        "strat2_net_pct": round(strat2, 3),
        "best_net_pct":   round(best, 3),
        "best_strategy":  best_strategy,
        "short_platform": side_a["platform"] if best_strategy == "short_a_long_b" else side_b["platform"],
        "long_platform":  side_b["platform"] if best_strategy == "short_a_long_b" else side_a["platform"],
        "tier": "fire" if best > 10 else "good" if best > 3 else "weak" if best > 0 else "negative",
    }


async def fetch_grvt(instrument: str, client: httpx.AsyncClient) -> dict:
    try:
        response = await client.post(
            f"{GRVT_BASE}/full/v1/funding",
            json={"instrument": instrument, "limit": 1},
            timeout=8,
        )
        response.raise_for_status()
        entry = (response.json().get("result") or [])[0]

        rate = float(entry.get("funding_rate", 0))
        interval_h = float(entry.get("funding_interval_hours", 8))
        annualized = annualized_from_grvt(rate, interval_h)
        funding_ns = entry.get("funding_time", 0)

        next_funding_time = None
        if funding_ns:
            next_ms = int(funding_ns) // 1_000_000 + int(interval_h * 3600 * 1000)
            next_funding_time = datetime.fromtimestamp(next_ms / 1000, tz=timezone.utc).isoformat()

        return {
            "platform": "grvt",
            "instrument": instrument,
            "funding_rate": round(rate, 8),
            "interval_hours": interval_h,
            "annualized_rate_pct": round(annualized, 4),
            "mark_price": float(entry.get("mark_price", 0)),
            "next_funding_time": next_funding_time,
            "source": "live",
        }
    except Exception as exc:
        log.warning("GRVT error for %s: %s", instrument, exc)
        return {
            "platform": "grvt",
            "instrument": instrument,
            "funding_rate": 0,
            "interval_hours": 8.0,
            "annualized_rate_pct": 0,
            "mark_price": 0.0,
            "next_funding_time": None,
            "source": "unavailable",
        }


async def fetch_extended_all(client: httpx.AsyncClient) -> dict:
    try:
        response = await client.get(f"{EXTENDED_BASE}/info/markets", timeout=10)
        response.raise_for_status()
        markets = response.json().get("data") or []

        out = {}
        for market in markets:
            name = market.get("name")
            stats = market.get("marketStats") or {}
            if not name:
                continue

            rate = float(stats.get("fundingRate", 0))
            out[name] = {
                "platform": "extended",
                "instrument": name,
                "funding_rate": round(rate, 8),
                "interval_hours": 1.0,
                "annualized_rate_pct": round(annualized_from_extended(rate), 4),
                "mark_price": float(stats.get("markPrice", 0)),
                "source": "live",
            }
        return out
    except Exception as exc:
        log.warning("Extended error: %s", exc)
        return {}


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.get("/api/platforms")
async def get_platforms():
    return {
        "platforms": [
            {"id": "grvt",     "name": "GRVT",     "chain": "GRVT L2",  "color": "#8b5cf6"},
            {"id": "extended", "name": "Extended",  "chain": "Starknet", "color": "#f97316"},
        ]
    }


@app.get("/api/funding")
async def get_funding(platform_a: str = "extended", platform_b: str = "grvt"):
    if platform_a == platform_b:
        raise HTTPException(status_code=400, detail="platform_a et platform_b doivent etre differents")
    if platform_a not in SUPPORTED_PLATFORMS or platform_b not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=400, detail="plateforme non supportee")

    async with httpx.AsyncClient() as http:
        grvt_tasks    = asyncio.gather(*[fetch_grvt(pair["grvt"], http) for pair in PAIRS])
        extended_task = fetch_extended_all(http)
        grvt_list, extended_map = await asyncio.gather(grvt_tasks, extended_task)

    grvt_by_symbol = {PAIRS[i]["symbol"]: grvt_list[i] for i in range(len(PAIRS))}

    rows = []
    for pair in PAIRS:
        side_a = grvt_by_symbol[pair["symbol"]] if platform_a == "grvt" else extended_map.get(pair["extended"])
        side_b = grvt_by_symbol[pair["symbol"]] if platform_b == "grvt" else extended_map.get(pair["extended"])

        if not side_a or not side_b:
            continue

        rows.append({
            "symbol":     pair["symbol"],
            "platform_a": platform_a,
            "platform_b": platform_b,
            "side_a":     side_a,
            "side_b":     side_b,
            "opportunity": compute_opp(side_a, side_b),
        })

    rows.sort(key=lambda item: item["opportunity"]["best_net_pct"], reverse=True)

    now_ts    = datetime.now(timezone.utc).timestamp()
    combo_key = f"{platform_a}__{platform_b}"

    history = load_history()
    history = add_history_samples(history, combo_key, rows, now_ts)

    for row in rows:
        row["opportunity"].update(best_apr_windows(history, combo_key, row["symbol"], now_ts))

    save_history(history)

    return {
        "timestamp":  datetime.utcnow().isoformat() + "Z",
        "platform_a": platform_a,
        "platform_b": platform_b,
        "pairs":      rows,
        "sources": {
            f"{platform_a}_live": sum(1 for row in rows if row["side_a"]["source"] == "live"),
            f"{platform_b}_live": sum(1 for row in rows if row["side_b"]["source"] == "live"),
            "total": len(rows),
        },
    }


@app.get("/api/positions")
async def get_positions():
    return {"positions": load_positions()}


@app.post("/api/positions")
async def add_position(position: dict):
    positions = load_positions()
    if not position.get("id"):
        position["id"] = f"pos_{int(datetime.utcnow().timestamp())}"
    if not position.get("created_at"):
        position["created_at"] = datetime.utcnow().isoformat()

    positions.append(position)
    save_positions(positions)
    return {"status": "ok", "position": position}


@app.delete("/api/positions/{position_id}")
async def delete_position(position_id: str):
    positions = load_positions()
    filtered = [p for p in positions if p.get("id") != position_id]
    save_positions(filtered)
    return {"status": "ok", "deleted": len(positions) - len(filtered)}
