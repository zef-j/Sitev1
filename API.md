# API.md — Minimal Backend API (v1)

> One backend **per Client**. JWT-based auth (username/password).  
> Storage recommended: **PostgreSQL** with **JSONB** for template & building data.

---

## 0) Conventions
- **Auth**: `Authorization: Bearer <token>`
- **ETag / Concurrency**: responses include `ETag: <dataVersion>`; clients must send `If-Match: <dataVersion>` on write.
- **Content types**: `application/json` for API payloads.
- **IDs**: UUID v4 recommended.

---

## 1) Auth
### POST /auth/login
Request:
```json
{ "username": "john@acme.com", "password": "secret" }
```
Response:
```json
{ "token": "<jwt>", "user": { "id": "u_...", "role": "L1" | "L2", "fondationId": "f_..." } }
```

---

## 2) Fondations & Buildings

### GET /fondations
- Returns fondations visible to the authenticated user (L1 limited to their own; L2 can see all for the client).

Response:
```json
{
  "items": [
    { "id": "f_1", "name": "Fondation Alpha", "buildingsCount": 12 },
    { "id": "f_2", "name": "Fondation Beta", "buildingsCount": 7 }
  ]
}
```

### GET /fondations/:id/buildings
- Returns building cards for a fondation.

Response:
```json
{
  "fondation": { "id": "f_1", "name": "Fondation Alpha" },
  "items": [
    {
      "id": "b_1",
      "name": "Bâtiment A",
      "progress": { "l1": 42, "l2": 18 },   // admin sees split; client may see { "l1": 42 }
      "lastUpdatedAt": "2025-09-20T10:10:00Z",
      "lastUpdatedBy": { "id": "u_2", "displayName": "Marie" },
      "status": "in-progress"               // "complete" | "attention-needed"
    }
  ]
}
```

---

## 3) Templates

### GET /templates/active
Response:
```json
{ "version": "2025.09.20-1430", "template": { /* JSON per TEMPLATE_SCHEMA */ } }
```

### POST /templates/activate (admin)
Request:
```json
{ "version": "2025.10.01-0900", "template": { /* JSON per TEMPLATE_SCHEMA */ } }
```
Response:
```json
{ "ok": true, "impact": { "added": 12, "removed": 3, "renamed": 2, "affectedBuildings": 87 } }
```
- Server runs **template validation** and computes an **impact report**.
- Activation stores historical versions and sets the new one active for subsequent renders.

---

## 4) Building Form Lifecycle

### GET /buildings/:id/form
Response headers: `ETag: "<dataVersion>"`
```json
{
  "building": { "id": "b_1", "name": "Bâtiment A", "fondation": { "id": "f_1", "name": "Fondation Alpha" } },
  "templateVersion": "2025.09.20-1430",
  "template": { /* active template JSON */ },
  "dataVersion": "W/\"c0a8017e:0001\"",
  "data": { /* section.subsection.field data per TEMPLATE_SCHEMA canonical layout */ }
}
```

### POST /buildings/:id/review
Headers: `If-Match: <dataVersion>`  
Request:
```json
{
  "templateVersion": "2025.09.20-1430",
  "proposedData": { /* same canonical layout */ }
}
```
Response (review/diff):
```json
{
  "confirmNeeded": true,
  "conflicts": false,
  "changes": {
    "added":    [ { "path": "audit.sismique.details", "new": "..." } ],
    "changed":  [ { "path": "production.pv.puissance-crete", "old": 10, "new": 12 } ],
    "emptied":  [ { "path": "audit.incendie.commentaire", "old": "text", "new": "" } ]
  },
  "warnings": [
    { "type": "destructive", "path": "audit.incendie.commentaire", "message": "Value will be cleared." }
  ],
  "confirmToken": "ctok_abc123"       // present only if confirmNeeded = true
}
```

### POST /buildings/:id/publish
Headers: `If-Match: <dataVersion>`  
Request:
```json
{
  "templateVersion": "2025.09.20-1430",
  "proposedData": { /* canonical layout */ },
  "confirmToken": "ctok_abc123"
}
```
Possible responses:
- **200 OK** (commit successful):
```json
{
  "ok": true,
  "dataVersion": "W/\"c0a8017e:0002\"",
  "publishedVersion": 17,
  "progress": { "l1": 55, "l2": 22 }
}
```
- **409 Conflict** (stale dataVersion):
```json
{
  "error": "conflict",
  "message": "Data changed on server.",
  "server": {
    "dataVersion": "W/\"c0a8017e:0003\"",
    "diff": {
      "changed": [ { "path": "audit.amiante.details", "old": "a", "new": "b" } ]
    }
  }
}
```

### GET /buildings/:id/versions?limit=20&cursor=...
Response:
```json
{
  "items": [
    {
      "version": 17,
      "createdAt": "2025-09-20T11:22:00Z",
      "user": { "id": "u_2", "displayName": "Marie" },
      "summary": { "changed": 4, "emptied": 1, "added": 2 }
    }
  ],
  "nextCursor": null
}
```

---

## 5) Uploads (optional v1)
If implementing uploads early:
- `POST /uploads` (multipart/form-data) →
```json
{ "name": "rapport.pdf", "size": 123456, "type": "application/pdf", "url": "/uploads/rapport_abc.pdf" }
```
Then store the returned object in the field value and include it in `proposedData`.

---

## 6) Errors
- `400 Bad Request` — validation errors (template or data payload)
- `401 Unauthorized` — missing/invalid token
- `403 Forbidden` — access denied for role/fondation
- `404 Not Found` — resource doesn’t exist
- `409 Conflict` — ETag mismatch; server returns latest `dataVersion` and diff
- `422 Unprocessable Entity` — rule/visibility violation
- `500` — unhandled

Error format:
```json
{ "error": "string-code", "message": "Human readable details", "details": { } }
```

---

## 7) Progress Recalculation
Server can expose:
### GET /buildings/:id/progress
```json
{ "l1": 64, "l2": 21, "templateVersion": "2025.09.20-1430" }
```
Or include progress in `/buildings/:id/form` and after publish.

## Phase 2 — Versioning & Review/Publish

### GET /buildings/:id/review?since=<dataVersion>
Returns a diff between the latest **committed** data and the **current working** data.

**Response**
```json
{
  "since": 3,
  "dataVersion": 4,
  "added": [{ "path": "audit.amiante.rapport", "old": null, "new": "Oui" }],
  "removed": [{ "path": "energie.cecb.note", "old": "C", "new": null }],
  "changed": [{ "path": "informations-generales.batiment.nom", "old": "Ancien", "new": "Nouveau" }],
  "committed": { "...": "snapshot of committed data" },
  "current": { "...": "current working data" }
}
```

### POST /buildings/:id/publish
Publish (commit) the current working data.

**Headers**
- `If-Match: "W/\"<dataVersion>\"" ` — must match the current ETag.

**Body**
```json
{ "data": { /* current working data */ }, "dataVersion": 4 }
```

**Responses**
- `200 OK` — `{ "ok": true, "dataVersion": 5, "previous": 4 }`
- `412 Precondition Failed` — `{ "error": "Precondition Failed", "currentDataVersion": 5 }`

**Notes**
- Server maintains a simple `versions[]` history per building (timestamp, dataVersion, author, diff, snapshot).
- ETags map to the current `dataVersion` and are used for optimistic concurrency.


### PATCH /buildings/:id/working
Save a working (draft) snapshot without publishing.

**Headers**
- `If-Match: W/"<dataVersion>"` (required)

**Body**
```json
{ "data": { /* current UI state */ } }
```

**Responses**
- `200 OK` — `{ "ok": true, "dataVersion": 4 }` (ETag remains `W/"4"`)
- `412 Precondition Failed` — `{ "error": "Precondition Failed", "currentDataVersion": 5 }`


## Phase 3 Endpoints (Filesystem)

- `GET /buildings` → returns registry `DATA_ROOT/buildings.json`.
- `GET /buildings/:id/form` → reads `current.json`; initializes if missing. Returns `{ building, templateVersion, template, dataVersion, data }`. Exposes `ETag: W/"<dataVersion>"`.
- `POST /buildings/:id/save` → body `{ data, reason? }`. Increments `dataVersion`, writes `current.json`, snapshots under `versions/<ts-id>/snapshot.json`, logs event. Returns `{ ok:true, dataVersion }` and `ETag`.
- `POST /buildings/:id/publish` → like save, but requires `If-Match: W/"<dataVersion>"`. On mismatch `412 { current: { dataVersion } }`.
- `GET /buildings/:id/versions` → list folder names in `versions/` with `meta.json` ({ versionId, createdAt, dataVersion }).
- `GET /buildings/:id/versions/:versionId` → returns snapshot.json.
- `POST /buildings/:id/restore` → body `{ versionId }`. Replaces `current.json` with snapshot and bumps `dataVersion`. Logs event. Returns `{ ok:true, dataVersion }`.
- `POST /buildings/:id/upload` (multipart: `file`, `fieldPath`) → stores under `files/`, updates `filesIndex[fieldPath]`. Returns `{ ok:true, file }`.
- `GET /buildings/:id/files/:storedName` → streams file.

**Config**: `DATA_ROOT` (default `./data`), `CLIENT_ID` (default `main`).

**Logs**: NDJSON in `logs/events.log` per building with `{ ts, evt, dataVersion, by, meta }`.
