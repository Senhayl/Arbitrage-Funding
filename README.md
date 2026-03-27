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

Si le build Front affiche `npm: not found`, c'est que Railway a detecte Python au lieu de Node.
Dans ce cas, utilise les Dockerfiles dedies ci-dessous.

### Service 1: API Python

- Source: ce repo
- Start command: deja gere par `Procfile`
- Runtime: `runtime.txt`
- Dependencies: `requirements_v2.txt`

Alternative robuste:

- Builder: Dockerfile
- Dockerfile path: `Dockerfile.backend`

Persistance des donnees backend (positions + historique APR 7j/30j):

- Cree un Railway Volume et monte-le sur `/data` dans le service Backend.
- Variable env recommandee sur le Backend: `DATA_DIR=/data`
- Option avancee: tu peux definir explicitement:
	- `POSITIONS_FILE_PATH=/data/positions.json`
	- `FUNDING_HISTORY_FILE_PATH=/data/funding_history.json`

Sans volume, les donnees sont ephemeres et seront perdues a chaque redeploy/restart.

### Service 2: Frontend Vite

- Build command: `npm install && npm run build`
- Start command: `npm run preview -- --host 0.0.0.0 --port $PORT`
- Variable env: `VITE_API_URL=<url-du-service-python>`
- Important: utilise uniquement `VITE_API_URL` (pas `vite_api_url`) pour eviter les ambiguities.

Alternative robuste:

- Builder: Dockerfile
- Dockerfile path: `Dockerfile.frontend`

Cette option evite les erreurs de detection runtime quand le meme repo contient a la fois Python et Node.

Avec `Dockerfile.frontend`, le conteneur echoue volontairement au demarrage si `VITE_API_URL` est vide, pour rendre l'erreur visible tout de suite dans les logs.

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
