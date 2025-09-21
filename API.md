

### New endpoints (Phase 3 Portal)
- `GET /foundations` → derives distinct foundations from `buildings.json` (shape: `{ id, name }[]`).  
  Use `GET /buildings` to list all buildings and filter by `foundationId` on the client.

_No server changes are required for progress – the portal computes % client‑side using `progress.js`._
