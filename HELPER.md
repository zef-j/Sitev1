

## Portal (Fondations → Bâtiments → Formulaire)
- Open `client-demo/web/portal/index.html` on the static server to see all fondations.
- Click a fondation to view its buildings and their completion % (computed with `progress.js`, same logic as the form header).
- Click a building to open the form (`form/app.html?id=<buildingId>&level=L1`).
- In the form, the top-left title is set to `{FondationName} - {BuildingName}` and a small **← Accueil** link takes you back (history.back with a fallback to the portal landing).

### Seeding & Reset
- Seed buildings from Excel (French headers supported – “Support juridique”, “Dénomination du bâtiment”):
  ```bash
  cd client-demo/api
  node ./tools/seed-from-xlsx.mjs ../../fondation_et_batiment.xlsx
  ```
- Reset all per-building data (keeps registry & template):
  ```bash
  node ./tools/reset-data.mjs
  ```
