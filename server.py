import asyncio
import json
import logging
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

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
GRVT_UI_BASE = os.getenv("GRVT_UI_BASE", "https://api.grvt.io")
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


def add_history_samples(history: dict, combo_key: str, rows: list, now_ts: float, all_symbols: Optional[list[str]] = None) -> dict:
    combo = history.setdefault(combo_key, {})

    # On garde 30 jours glissants de mesures
    cutoff_30d = now_ts - (30 * 24 * 3600)

    row_by_symbol = {}
    for row in rows:
        if not isinstance(row, dict) or "symbol" not in row or "opportunity" not in row:
            continue

        opp = row.get("opportunity_history") or row.get("opportunity") or {}
        row_by_symbol[row["symbol"]] = {
            "best_net_pct": float(opp.get("best_net_pct", 0)),
            "best_strategy": opp.get("best_strategy") if isinstance(opp.get("best_strategy"), str) else None,
        }

    symbols_to_track = []
    if all_symbols:
        symbols_to_track.extend(all_symbols)
    symbols_to_track.extend([s for s in combo.keys() if s not in symbols_to_track])
    symbols_to_track.extend([s for s in row_by_symbol.keys() if s not in symbols_to_track])

    for symbol in symbols_to_track:
        samples = combo.setdefault(symbol, [])

        if symbol in row_by_symbol:
            snap = row_by_symbol[symbol]
            samples.append({
                "ts": now_ts,
                "best_net_pct": snap["best_net_pct"],
                "best_strategy": snap.get("best_strategy"),
            })

        combo[symbol] = [
            s
            for s in samples
            if isinstance(s, dict)
            and isinstance(s.get("ts"), (int, float))
            and s["ts"] >= cutoff_30d
        ]

    return history


# ── MODIFIÉ : compute_stability ───────────────────────────────────────────────
def compute_stability(vals: list[float], timestamps: list[float] = None, strategies: list[str] = None) -> dict:
    """
    Score orienté "capture réelle" du funding, robuste aux faux pics d'APY.

    Principes:
    - APR conservateur: on limite l'optimisme via min(mean pondérée, médiane, dernier point).
    - Pénalité de rupture de régime: si le dernier point diverge trop de la médiane,
      on réduit fortement le score (cas classique des spikes qui s'écrasent avant snapshot).
    - Pénalité de volatilité robuste (MAD) + downside deviation + flips de signe.
    """
    n = len(vals)
    if n < 6:
        return {
            "mean_apr":            None,
            "conservative_apr":    None,
            "consistency":         None,
            "volatility":          None,
            "downside_vol":        None,
            "robust_vol":          None,
            "trend_coef":          None,
            "regime_shift":        None,
            "flip_rate":           None,
            "sample_confidence":   round(min(1.0, n / 24), 3),
            "stability_score":     None,
            "sample_count":        n,
        }

    def _median(seq: list[float]) -> float:
        s = sorted(seq)
        m = len(s) // 2
        return s[m] if len(s) % 2 == 1 else (s[m - 1] + s[m]) / 2

    # Pondération exponentielle: demi-vie courte pour capter vite les changements.
    if timestamps and len(timestamps) == n:
        t_max = max(timestamps)
        half_life = 12 * 3600
        raw_weights = [math.exp(-0.693 * (t_max - t) / half_life) for t in timestamps]
    else:
        raw_weights = [math.exp(0.693 * i / max(n - 1, 1)) for i in range(n)]

    total_w = sum(raw_weights)
    weights = [w / total_w for w in raw_weights]

    mean_apr = sum(w * v for w, v in zip(weights, vals))
    median_apr = _median(vals)
    last_apr = vals[-1]

    # APR utilisé pour scorer: prudent, pour éviter d'acheter un pic éphémère.
    conservative_apr = min(mean_apr, median_apr, last_apr)

    consistency = sum(w for w, v in zip(weights, vals) if v > 0)

    variance = sum(w * (v - mean_apr) ** 2 for w, v in zip(weights, vals))
    volatility = math.sqrt(variance)

    downside_sq = sum(w * min(v, 0) ** 2 for w, v in zip(weights, vals))
    downside_vol = math.sqrt(downside_sq)

    abs_dev = [abs(v - median_apr) for v in vals]
    mad = _median(abs_dev)
    robust_vol = 1.4826 * mad

    x_mean = (n - 1) / 2
    num = sum((i - x_mean) * v for i, v in enumerate(vals))
    den = sum((i - x_mean) ** 2 for i in range(n))
    slope = num / den if den > 0 else 0
    trend_coef = max(-0.3, min(0.3, slope / (abs(mean_apr) + 1e-9)))

    # Mesure de rupture de régime entre le dernier point et le régime central.
    regime_shift = abs(last_apr - median_apr) / (abs(median_apr) + 1.0)

    valid_strategies = []
    if strategies and len(strategies) == n:
        valid_strategies = [
            s
            for s in strategies
            if s in {"short_a_long_b", "long_a_short_b"}
        ]

    if len(valid_strategies) >= 2:
        flips = sum(
            1
            for i in range(1, len(valid_strategies))
            if valid_strategies[i] != valid_strategies[i - 1]
        )
        flip_rate = flips / max(1, len(valid_strategies) - 1)
    else:
        # Fallback legacy: anciens snapshots sans best_strategy.
        non_zero_signs = [1 if v > 0 else -1 for v in vals if v != 0]
        flips = sum(1 for i in range(1, len(non_zero_signs)) if non_zero_signs[i] != non_zero_signs[i - 1])
        flip_rate = flips / max(1, len(non_zero_signs) - 1)

    sample_confidence = min(1.0, n / 24)

    if conservative_apr <= 0:
        stability_score = 0.0
    else:
        regime_penalty = 1 / (1 + 1.8 * regime_shift)
        volatility_penalty = 1 / (1 + 0.30 * robust_vol + 0.15 * volatility)
        downside_penalty = 1 / (1 + downside_vol)
        flip_penalty = 1 / (1 + 2.0 * flip_rate)

        stability_score = round(
            conservative_apr
            * consistency
            * sample_confidence
            * regime_penalty
            * volatility_penalty
            * downside_penalty
            * flip_penalty
            * (1 + trend_coef),
            3,
        )

    return {
        "mean_apr":          round(mean_apr, 3),
        "conservative_apr":  round(conservative_apr, 3),
        "consistency":       round(consistency, 3),
        "volatility":        round(volatility, 3),
        "downside_vol":      round(downside_vol, 3),
        "robust_vol":        round(robust_vol, 3),
        "trend_coef":        round(trend_coef, 3),
        "regime_shift":      round(regime_shift, 3),
        "flip_rate":         round(flip_rate, 3),
        "sample_confidence": round(sample_confidence, 3),
        "stability_score":   stability_score,
        "sample_count":      n,
    }


# ── MODIFIÉ : best_apr_windows ────────────────────────────────────────────────
def best_apr_windows(history: dict, combo_key: str, symbol: str, now_ts: float) -> dict:
    combo = history.get(combo_key, {})
    samples = combo.get(symbol, [])

    def filter_samples(window_seconds: int) -> tuple:
        filtered = [
            s for s in samples
            if isinstance(s, dict)
            and isinstance(s.get("ts"), (int, float))
            and s["ts"] >= now_ts - window_seconds
        ]
        # Triées par timestamp croissant pour la régression de tendance
        filtered.sort(key=lambda s: s["ts"])
        return (
            [float(s.get("best_net_pct", 0)) for s in filtered],
            [float(s["ts"]) for s in filtered],
            [s.get("best_strategy") if isinstance(s.get("best_strategy"), str) else None for s in filtered],
        )

    vals_7d,  ts_7d,  strat_7d  = filter_samples(7  * 24 * 3600)
    vals_30d, ts_30d, strat_30d = filter_samples(30 * 24 * 3600)

    # On passe les timestamps à compute_stability pour la pondération exponentielle
    stability_7d  = compute_stability(vals_7d,  ts_7d,  strat_7d)
    stability_30d = compute_stability(vals_30d, ts_30d, strat_30d)

    return {
        "best_7d_apr_pct":  round(max(vals_7d),  3) if vals_7d  else None,
        "best_30d_apr_pct": round(max(vals_30d), 3) if vals_30d else None,
        "samples_7d":       len(vals_7d),
        "samples_30d":      len(vals_30d),
        "stability_7d":     stability_7d,
        "stability_30d":    stability_30d,
    }


def annualized_from_grvt(rate: float, interval_h: float) -> float:
    return rate * (8760 / interval_h)


def annualized_from_extended(rate_decimal: float, interval_h: float = 1.0) -> float:
    """
    rate_decimal : taux brut Extended au format décimal
                   (ex: -0.000192 == -0.0192% par heure)
    interval_h   : intervalle de funding en heures
    """
    rate_pct = rate_decimal * 100.0
    return rate_pct * (8760 / interval_h)


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


def compute_opp_for_history(side_a: dict, side_b: dict) -> dict:
    # Backtracking/stabilite: pour GRVT on force le taux settled historique.
    hist_a = dict(side_a)
    hist_b = dict(side_b)
    if hist_a.get("platform") == "grvt" and hist_a.get("annualized_rate_pct_settled") is not None:
        hist_a["annualized_rate_pct"] = float(hist_a.get("annualized_rate_pct_settled", hist_a.get("annualized_rate_pct", 0)))
    if hist_b.get("platform") == "grvt" and hist_b.get("annualized_rate_pct_settled") is not None:
        hist_b["annualized_rate_pct"] = float(hist_b.get("annualized_rate_pct_settled", hist_b.get("annualized_rate_pct", 0)))
    return compute_opp(hist_a, hist_b)

def is_side_live_and_available(side: Optional[dict]) -> bool:
    """
    Valide qu'un side correspond à un marché réellement disponible.
    Empêche d'afficher une carte si la paire n'existe pas (ou plus) sur une plateforme.
    """
    if not isinstance(side, dict):
        return False
    if side.get("source") != "live":
        return False

    instrument = side.get("instrument")
    if not isinstance(instrument, str) or not instrument.strip():
        return False

    mark_price = side.get("mark_price")
    try:
        if float(mark_price) <= 0:
            return False
    except (TypeError, ValueError):
        return False

    return True
	
async def fetch_grvt(instrument: str, client: httpx.AsyncClient) -> dict:
    try:
        settled_resp = await client.post(
            f"{GRVT_BASE}/full/v1/funding",
            json={"instrument": instrument, "limit": 1},
            timeout=8,
        )
        settled_resp.raise_for_status()
        entry = (settled_resp.json().get("result") or [])[0]

        settled_rate = float(entry.get("funding_rate", 0))
        interval_h = float(entry.get("funding_interval_hours", 8))
        annualized_settled = annualized_from_grvt(settled_rate, interval_h)
        funding_ns = entry.get("funding_time", 0)

        next_funding_time = None
        if funding_ns:
            next_ms = int(funding_ns) // 1_000_000 + int(interval_h * 3600 * 1000)
            next_funding_time = datetime.fromtimestamp(next_ms / 1000, tz=timezone.utc).isoformat()

        # Valeur live card (proche UI): tentative via endpoint ticker, fallback settled.
        live_rate = settled_rate
        annualized_live = annualized_settled
        try:
            ticker_resp = await client.post(
                f"{GRVT_UI_BASE}/full/v1/ticker",
                json={"instrument": instrument},
                timeout=6,
            )
            ticker_resp.raise_for_status()
            ticker_payload = ticker_resp.json().get("result")
            ticker = ticker_payload[0] if isinstance(ticker_payload, list) and ticker_payload else ticker_payload

            if isinstance(ticker, dict):
                annual_keys = [
                    "annualized_funding_rate_pct",
                    "funding_rate_annualized_pct",
                    "annualizedFundingRate",
                    "annualized_funding_rate",
                ]
                rate_keys = [
                    "current_funding_rate",
                    "next_funding_rate",
                    "current_funding_rate_pct",
                    "next_funding_rate_pct",
                    "funding_rate",
                    "fundingRate",
                ]

                annual_ui = next((ticker.get(k) for k in annual_keys if ticker.get(k) is not None), None)
                rate_ui = next((ticker.get(k) for k in rate_keys if ticker.get(k) is not None), None)

                if annual_ui is not None:
                    annualized_live = float(annual_ui)
                if rate_ui is not None:
                    live_rate = float(rate_ui)
                    if annual_ui is None:
                        annualized_live = annualized_from_grvt(live_rate, interval_h)
        except Exception as ticker_exc:
            log.info("GRVT ticker fallback to settled for %s: %s", instrument, ticker_exc)

        return {
            "platform": "grvt",
            "instrument": instrument,
            "funding_rate": round(live_rate, 8),
            "interval_hours": interval_h,
            "annualized_rate_pct": round(annualized_live, 4),
            "funding_rate_settled": round(settled_rate, 8),
            "annualized_rate_pct_settled": round(annualized_settled, 4),
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
            "funding_rate_settled": 0,
            "annualized_rate_pct_settled": 0,
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

            # Extended renvoie un taux décimal (pas un pourcentage).
            rate_decimal = float(stats.get("fundingRate", 0))
            # Intervalle fixe 1h pour tous les perps Extended
            interval_h = 1.0

            out[name] = {
                "platform": "extended",
                "instrument": name,
                "funding_rate": round(rate_decimal, 8),
                "interval_hours": interval_h,
                "annualized_rate_pct": round(annualized_from_extended(rate_decimal, interval_h), 4),
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

        if not is_side_live_and_available(side_a) or not is_side_live_and_available(side_b):
    		continue
			
        rows.append({
            "symbol":     pair["symbol"],
            "platform_a": platform_a,
            "platform_b": platform_b,
            "side_a":     side_a,
            "side_b":     side_b,
            "opportunity": compute_opp(side_a, side_b),
            "opportunity_history": compute_opp_for_history(side_a, side_b),
        })

    rows.sort(key=lambda item: item["opportunity"]["best_net_pct"], reverse=True)

    now_ts    = datetime.now(timezone.utc).timestamp()
    combo_key = f"{platform_a}__{platform_b}"

    history = load_history()
    combo_symbols = [pair["symbol"] for pair in PAIRS]
    history = add_history_samples(history, combo_key, rows, now_ts, all_symbols=combo_symbols)

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
