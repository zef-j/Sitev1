# Admin Editor – Buildings & Foundations

This adds a safe editor mode to manage foundation and building **names** and **entries** from a secret page. All changes are validated, backed up, atomic, and audited.

## What’s included
```
client-demo/
  api/
    adminConfig.js      # resolve DATA_ROOT and important paths
    adminFs.js          # locking, backups, atomic writes, validation, audit, data-archive
    adminRouter.js      # Express routes under /admin/api/*
  admin-ui/
    index.html          # the editor page (open at /admin/ with secret)
    app.js              # UI logic
```

> We keep using **JavaScript/Node** to match your project.

---

## Install / Wire-up

1) **Copy these files into your repo** (same relative paths).
   - Place the `client-demo/api/*.js` files next to your existing API.
   - Place the `client-demo/admin-ui/*` folder at that path.

2) **Mount the routes & static in your API server** (Express).  
   In your server bootstrap (where `app` is created), add:
   ```js
   // --- Admin Editor wiring ---
   const path = require('path');
   const express = require('express');
   const adminRouter = require('./adminRouter')(); // path relative to the compiled file; adjust if needed
   // serve the UI
   app.use('/admin', express.static(path.join(__dirname, '../admin-ui')));
   // serve the API
   app.use('/admin/api', adminRouter);
   // --- end ---
   ```
   > If your project builds to `dist/`, ensure the relative paths still point to `../admin-ui` from the compiled server file, or copy the UI into your static root at deploy time.

3) **Create the admin secret** (one time, on the server):
   ```bash
   DATA_ROOT=/srv/customer/var/se-cpval/data
   mkdir -p "$DATA_ROOT/_admin" "$DATA_ROOT/_locks" "$DATA_ROOT/_backups/registry" "$DATA_ROOT/_backups/data"
   openssl rand -hex 24 > "$DATA_ROOT/_admin/secret.txt"
   chmod 700 "$DATA_ROOT/_admin" "$DATA_ROOT/_locks" "$DATA_ROOT/_backups"
   chmod 600 "$DATA_ROOT/_admin/secret.txt"
   ```

4) **Reload your API** (if needed):
   ```bash
   # pm2 reload <your-api-name>
   # or
   # systemctl restart <your-service>
   ```

5) **Open the editor**:
   - URL: `https://<your-domain>/admin/`
   - Click **Set Secret** and paste the value from `secret.txt`. (It is stored only per session.)

---

## What each action does

- **Rename foundation**: updates `foundationName` for all entries with that `foundationId` (IDs unchanged).  
- **Rename building**: updates the building’s `name` (ID unchanged).  
- **Add building**: appends an entry. Auto-generates a unique `id` as `<foundationId>-<slug(buildingName)>`.  
- **Add foundation**: creates a foundation by adding its first building; auto-slugifies `foundationId` if omitted.  
- **Delete building**: removes the registry entry. Optionally archives and **deletes** corresponding data folders (found by searching under `DATA_ROOT/**/foundations/<fid>/buildings/<bid>`).  
- **Delete foundation**: removes all entries with that `foundationId`. Optionally archives and deletes all matching data folders.  
- **Restore**: replaces `buildings.json` with a selected backup. (Data archives are separate.)

All writes:
- take an exclusive lock,
- create a timestamped backup of `buildings.json`,
- validate the entire registry,
- write atomically,
- append to an audit log.

---

## Important notes / assumptions

- Registry file: `$DATA_ROOT/buildings.json` (created as `[]` if missing).  
- Foundations are **derived** from registry (no separate file).  
- The API rereads the registry for every request (no restart needed after edits). If your runtime caches, reload the process.  
- Data directory layout may vary; to avoid accidental data loss the delete operation first **searches** for directories that end with `foundations/<fid>/buildings/<bid>` under common roots and shows a **dry-run** preview.  
- We do **not** allow changing IDs from the UI (lowest-risk).

---

## Troubleshooting

- **403 Forbidden** on /admin/api/* → Missing or wrong secret. Set it via the **Set Secret** button.  
- **503** with "Admin secret not set" → Create `$DATA_ROOT/_admin/secret.txt` with a random token as above.  
- **Another edit is in progress…** → Someone else is saving; try again in a few seconds.  
- **Validation error** → The registry has duplicates or inconsistent foundation names. Fix or restore a backup.

---

## Optional: CI/deploy note
If your API compiles to `dist/`, either:
- Copy `client-demo/admin-ui` to your deploy’s static folder, or
- Serve it via the paths shown above relative to your compiled server file.

