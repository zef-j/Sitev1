# Hotfix: boot.js (parameterized building id)

This file keeps your original rendering pipeline **unchanged**, and just switches the fetch to use the `?id=` from the URL (or `window.__buildingMeta.id`), instead of the hard-coded `'b_1'`.

## What changed
- `fetchFormDirect()` now takes `buildingId` and calls `/buildings/<id>/form`.
- In `main()`, we compute `buildingId` from the URL and call `api.getBuildingForm(buildingId)` (or `fetchFormDirect(buildingId)` if the API module isn't available).

## Quick test
1) Open the form with a real building link, e.g. `app.html?id=<yourBuildingId>&level=L1&diag=1`  
2) You should see the form render as before, and saves should now go under the correct foundation.

If you still don't see the form, try with `&diag=1` to surface the inline diagnostics overlay.
