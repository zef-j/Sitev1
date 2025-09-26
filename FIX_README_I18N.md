
# What I changed

1) **Translations 404** – Added a top-level `/i18n/` folder with `de.json`, `fr.json`, and `en.json` so that requests to `/i18n/<lng>.json` resolve in production. The i18n loader also tries `./i18n/` next to each page first to avoid 404 noise.

2) **Favicon 404** – Added a `favicon.ico` to the project root, `/client-demo/web/portal/`, and `/client-demo/web/form/`. Injected `<link rel="icon" href="./favicon.ico">` into the portal pages so browsers don't fall back to `/favicon.ico` automatically.

3) **Loader ergonomics** – Enhanced `client-demo/web/form/i18n.js` so you can optionally call `setI18nBase('/portal/i18n/')` or `setI18nBase('/form/i18n/')` before `initI18n()` if you ever want to pin a base path; otherwise it keeps the auto-discovery behavior.

## Deploying

- Upload the contents of `client-demo/web/` **and** the new top-level `i18n/` and `favicon.ico` to your web root.
- If your site lives under a subfolder, the loader now prefers `./i18n/` relative to each page so translations will still load.
- To completely remove the Tailwind CDN warning, switch to a PostCSS build; see `NOTE_add_to_app_head.css.snippet` for guidance.
