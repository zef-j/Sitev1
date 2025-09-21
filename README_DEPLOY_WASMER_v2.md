# Wasmer Edge Deploy (Packaged Static Frontend)

This bundles `client-demo/web` into the runtime package so the static server can find it.

## Files
- `wasmer.toml` — copies `client-demo/web` into the package and starts static-web-server from `.`
- `app.yaml` — tells Wasmer to run the package built from this repo (`package: .`)

## Deploy (Dashboard → Git app)
1) Commit both files at the **repo root**.
2) In Wasmer Dashboard → your app → **Settings → YAML**, paste `app.yaml` (edit owner/name if needed).
3) Click **Update app** → **Deploy**.

## Deploy (CLI alternative)
```bash
wasmer login
wasmer deploy
```

## Open
- `https://<your-app>.wasmer.app/portal/index.html`
- (Optional) add a small `/index.html` at repo root to redirect to the portal.)

## API reminder
In `client-demo/web/form/api.js`, set your public API origin:
```js
const BASE = (window.__API_BASE) || "https://YOUR_API_DOMAIN";
```
and allow your Wasmer domain in your API CORS.
