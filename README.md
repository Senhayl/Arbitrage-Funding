# Arbitrage Funding

Projet simplifie pour comparer les taux de funding entre GRVT et Extended, avec une page React (Vite) et une API FastAPI.

## Structure

- `src/`: frontend React
- `server.py`: backend FastAPI
- `positions.json`: stockage local des positions suivies
- `Procfile`: commande de demarrage Railway

## Lancer en local

### 1) Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements_v2.txt
uvicorn server:app --reload --port 8000
```

### 2) Frontend

```bash
npm install
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:8000

Le frontend appelle par defaut `http://localhost:8000` en dev.

## Variable d'environnement frontend

- `VITE_API_URL`: URL publique du backend (ex: `https://mon-backend.up.railway.app`)

Le frontend utilise cette logique:

- en local: `http://localhost:8000` automatiquement
- en prod: `VITE_API_URL` si defini
- sinon: meme domaine que le frontend (appels relatifs `/api/...`)

## Deploy Railway (recommande: 2 services)

### Service 1: API Python

- Source: ce repo
- Start command: deja gere par `Procfile`
- Runtime: `runtime.txt`
- Dependencies: `requirements_v2.txt`

### Service 2: Frontend Vite

- Build command: `npm install && npm run build`
- Start command: `npm run preview -- --host 0.0.0.0 --port $PORT`
- Variable env: `VITE_API_URL=<url-du-service-python>`

### Eviter la config manuelle a chaque deploy

Option recommandee en 2 services Railway:

- Dans le service Frontend, cree `VITE_API_URL` via une reference de variable vers le service Backend (depuis l'UI Railway, pas en dur).
- Ainsi, si tu redesployes, tu n'as rien a recoller a la main.

Option zero variable:

- Heberger frontend et backend sur le meme service/domaine.
- Dans ce cas, le frontend appelle automatiquement `/api/...`.

## Endpoints utiles

- `GET /health`
- `GET /api/platforms`
- `GET /api/funding?platform_a=extended&platform_b=grvt`
- `GET /api/positions`
- `POST /api/positions`
- `DELETE /api/positions/{position_id}`
