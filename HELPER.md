# HELPER.md — AI Development Helper (Starter)

This document keeps the **current project map**, exported functions, and next steps.  
**Always update this file** when adding or changing code. The model will rely on it to stay oriented.

---

## 1) Project Structure (target)

```
/client-<name>/
  api/
    src/
      auth/
        login.controller.ts
      controllers/
        fondations.controller.ts
        buildings.controller.ts
        templates.controller.ts
      services/
        template.service.ts
        data.service.ts
        versioning.service.ts
        migration.service.ts
        progress.service.ts
      models/
        prisma/ (or sql/)
      middlewares/
        auth.middleware.ts
        error.middleware.ts
      utils/
        diff.util.ts
        visibility.util.ts
        validation.util.ts
    tests/
    .env
  web/
    form/
      index.html            # current polished UI (reference)
      renderer.js           # render from template + data
      progress.js           # L1/L2 split progress
      scrollspy.js          # chips highlight + precise scrolling
      api.js                # thin client for the API
    dashboard/
      buildings.html
      buildings.js
  docs/
    TEMPLATE_SCHEMA.md
    API.md
    HELPER.md
    TEMPLATE_CHANGELOG.md
```

**Backend**: Node.js + TypeScript + Express (suggested), PostgreSQL + Prisma (or Knex).  
**Frontend**: vanilla JS + Tailwind (CDN) for form; can evolve to modules as needed.

---

## 2) Shared Conventions
- **IDs**: use slugs for section/subsection/field (a–z0–9 and `-`).
- **Data shape**: `data[sectionId][subsectionId][fieldId] = value`.
- **Template**: must follow `TEMPLATE_SCHEMA.md`; validate in CI before activation.
- **ETag** (`dataVersion`): required on write; server replies `409` if stale.
- **Diff**: deep diff at field paths (`section.subsection.field`).
- **Visibility**: evaluate rules on every change; progress counts **visible** fields only.

---

## 3) Key Modules & Functions

### 3.1 template.service.ts
- `getActiveTemplate(clientId): Template`
- `validateTemplate(t: any): TemplateValidationResult`
- `computeImpact(prev: Template, next: Template): ImpactReport`
- `activateTemplate(clientId, next: Template): ActivationResult`

### 3.2 data.service.ts
- `getBuildingForm(buildingId): { template, templateVersion, data, dataVersion }`
- `reviewChanges(buildingId, proposedData, dataVersion): ReviewPayload`
- `publishChanges(buildingId, proposedData, dataVersion, confirmToken, user): PublishResult`

### 3.3 versioning.service.ts
- `createVersion(buildingId, oldData, newData, diff, user): { version }`
- `listVersions(buildingId, limit, cursor): { items, nextCursor }`
- `restoreVersion(buildingId, version): RestoreResult`

### 3.4 progress.service.ts
- `computeProgress(data, template): { l1: number, l2: number }`
  - Counts only **visible** fields; respects field `level`.

### 3.5 migration.service.ts
- `migrateData(oldData, prevTemplate, nextTemplate): { newData, report }`
- Handles add/remove/rename with retention (90 days).

### 3.6 utils
- `diff.util.ts`: `diff(oldData, newData): DiffOutput`
- `visibility.util.ts`: `isVisible(field, data, template, level): boolean`
- `validation.util.ts`: field-level validation (min/max/pattern/required)

---

## 4) API Contracts (summary)
See `API.md` for full bodies.
- `POST /auth/login` → JWT
- `GET /fondations`
- `GET /fondations/:id/buildings`
- `GET /buildings/:id/form`
- `POST /buildings/:id/review`
- `POST /buildings/:id/publish`
- `GET /buildings/:id/versions`
- `GET /templates/active`
- `POST /templates/activate`

Headers to honor on writes: `If-Match: <dataVersion>`

---

## 5) Frontend Integration Plan

### 5.1 Form Renderer
- Input: `{ template, data, level }`
- Build sections/subsections/fields dynamically.
- Wire conditional visibility (Rapport/Amiante) using `visibilityRules`.
- Progress bar:
  - Client: L1 only
  - Admin: stacked L1 + L2
- Save flow:
  - `POST /buildings/:id/review` → render side-by-side diff
  - If destructive → ask confirmation
  - `POST /buildings/:id/publish`

### 5.2 Dashboard
- Fetch buildings list; render cards with progress and status.

### 5.3 Reuse existing UI
- Keep `index.html` style (chips, AOS, scroll, spacing).

---

## 6) Step‑by‑Step TODO (Phase 0 → 2)

- **P0**: Backend scaffold (Express), Prisma models, `POST /auth/login`, `GET /templates/active`, `GET /buildings/:id/form` (mock data).
- **P1**: Front form renderer (read-only), progress engine, visibility rules.
- **P2**: Review + Publish flow: diff service, destructive confirmation, versioning table, ETag conflicts.

Each PR must update **HELPER.md** with new files/functions and any public contracts changed.

---

## 7) Packaging Rules for the AI
- Always return **only changed/new files** in a `.zip` preserving paths from project root.
- Do **not** re-send large static assets unless changed.
- Update **HELPER.md** with:
  - file tree delta,
  - new/changed function signatures,
  - any new env vars or config,
  - brief test plan.

---

## 8) Acceptance Criteria Snapshot (v1)
- Auth; fondations list; buildings list with progress.
- Form renders from template; Rapport/Amiante logic works.
- Save → Review (side-by-side) → Publish (destructive confirm).
- Versions & 90‑day backups.
- Conflict detection with `409` on stale `dataVersion`.
---

### Phase 1 Fixes (bundle)
- `renderer.js`: fixed TDZ (`progressTimer`), ensured default select options, preserved styles and animations.
- `visibility.js`: Admin (L2) sees all levels; only `visibilityRules` affect visibility.
- `app.html`: restored non-diagnostic page; `app.diag.html` kept for debugging.

Known check:
- If a template shows fields that the reference `index.html` hides, confirm corresponding `visibilityRules` in the template for those fields (renderer does not hardcode any special cases).

## New files (Phase 2)

- `client-demo/web/form/diff.js` — Review Changes panel + Publish flow (If-Match handling, conflict dialog).
- `client-demo/api/src/server.ts` — adds `/buildings/:id/review` and `/buildings/:id/publish` with in-memory versioning.
- `client-demo/web/form/api.js` — client methods: `getReview(id, since)`, `publish(id, data, dataVersion, etag)`; also exposes `window.__buildingMeta`.

### Function signatures
- `openReviewPanel()` — open the diff panel and render server diff for **visible** fields.
- `publishWithConfirm()` — publish current working data; shows a conflict dialog on 412.

### Test plan (Phase 2)
- **Concurrency**: open 2 tabs, publish in A, then try publish in B → B gets 412 → conflict dialog → reload → review works.
- **Diff**: change text/select values → review shows changed/added/removed with before/after.
- **Publish**: after publish, header badge shows new dataVersion (e.g., `v5`).
- **Progress**: stacked progress bar shows L1% (main) and L2% (thin overlay).
- **Visibility carryover**: Amiante + Normes Handicapées follow rules — no duplicates; uploads only on Oui; `avant1990 = Non` hides the rest.


### Phase 2 additions
- `api.saveWorking(id, data, dataVersion, etag)` — saves working draft with If-Match (no version bump).
- `publishWithConfirm()` — shows publish confirmation (and destructive list when applicable).
- Save button (`#save-btn`) is wired in `diff.js`.


### Review baseline
- On page load, baseline is set from `GET /buildings/:id/review` → `committed`.
- Local drafts (from `localStorage`) are merged **after** baseline setup, so Revue shows changes vs **published** even after a refresh.
- On successful publish, baseline is updated to the newly published data and local draft is cleared.


### Phase 3 — Functions & Wiring

- Backend FS helpers: `getBuildingMeta`, `getBuildingDir`, `ensureCurrent`, `logEvent`, `getActiveTemplate`.
- Frontend API: 
  - `api.save(id, data, reason?)` — saves & versions.
  - `api.publish(id, data, dataVersion, etag)` — If-Match guarded publish.
  - `api.listVersions(id)`, `api.getVersion(id, versionId)` — versions browser.
  - `api.uploadFile(id, fieldPath, file)` — uploads & stores metadata.
- Diff view now supports an override baseline via `window.__reviewBaselineOverride` (used by Versions → “Diff → courant”).

**Test plan (Phase 3)**

1. Fill form → **Sauvegarder** → `dataVersion` increments, `data/current.json` updated, snapshot created.
2. Upload file → appears in `files/`, metadata in `filesIndex`, filename shown next to the input.
3. Open **Versions** → list renders; click “Diff → courant” on any entry to review differences.
4. **Publier** with stale tab → 412; conflict dialog prompts to reload & review.
5. Call `/restore` manually → version bumps; reload page shows restored data.
6. Check `logs/events.log` for `save`, `publish`, `upload`, `restore` lines.


### Portal usage
- Open `client-demo/web/portal/index.html` → list foundations. Click into a foundation to see buildings and completion %. Click a building to open its form.
- To seed `DATA_ROOT/buildings.json` from your Excel:  
  `cd client-demo/api && npm i && node ./tools/seed-from-xlsx.mjs ../../fondation_et_batiment.xlsx`
- To wipe per-building data:  
  `cd client-demo/api && node ./tools/reset-data.mjs`
