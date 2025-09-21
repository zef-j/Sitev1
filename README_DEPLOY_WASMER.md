# Sitev1 — Wasmer Edge Deploy (Static Frontend)

This project has:
- Frontend (static): `client-demo/web` (portal + form)
- Backend (Node/Express): `client-demo/api` (host this anywhere with Node; not on Wasmer Edge)

> Important: set the API origin in `client-demo/web/form/api.js`:
> ```js
> const BASE = (window.__API_BASE) || "https://api.example.com"; // your API
> ```

## Option A — Deploy from CLI (recommended)
```bash
# from repo root (with wasmer.toml present)
wasmer login
wasmer deploy
# you'll get an URL like https://sitev1-web.wasmer.app/
```

## Option B — Deploy from Dashboard (upload YAML)
1. Go to your app → **Settings → YAML**.
2. Upload `app.yaml` from this bundle.
3. Click **Update app**.

## Static URLs
- Portal: `/portal/index.html`
- Form: `/form/app.html?id=<buildingId>&level=L1`

## API Hosting (separate from Wasmer)
Run the API on any Node host:
```bash
cd client-demo/api
npm ci
# Seed buildings (Excel supported)
node ./tools/seed-from-xlsx.mjs ../../fondation_et_batiment.xlsx
# Start API
npm run dev   # exposes http://localhost:3000 by default
```
Expose it on the Internet (e.g., https://api.example.com), then update `form/api.js` to point to it.

## CORS
Allow the Wasmer app origin (e.g., https://sitev1-web.wasmer.app) in the API’s CORS config.

## Notes
- `app.yaml` uses `__wasmer_root/client-demo/web` so the server serves the correct subfolder.
- If you want a favicon, place one at `client-demo/web/favicon.ico`.
