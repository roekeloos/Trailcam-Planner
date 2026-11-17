# Trail Camera Settings Optimiser

This is the static frontend from the published calculator (source revision 4489ddf). It includes the latest timelapse capture settings checkbox. All four files in `dist/` are required. The calculator has no build step or package dependencies.

## Run locally

From the extracted project directory, run:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8080/. Serve the files over HTTP because the page loads JavaScript modules.

## Handoff prompt for development Codex

> Deploy this calculator to my VPS using its existing deployment conventions. Inspect the reverse proxy and hosting setup first. Serve `dist/` as the web root over HTTPS. Ensure that `.mjs` files are served with a JavaScript MIME type such as `text/javascript`. Verify that the page and both JavaScript modules load and that changing settings updates the forecast. The current hosted calculator is private, so apply equivalent access controls on the VPS before exposing it, unless I specify a different audience.
>
> Add lightweight database-backed named presets and a multi-preset comparison. Reuse the project's existing backend stack if present. On a single VPS, SQLite is a reasonable default. Keep the database in a persistent directory outside the web root, with a backup path. Serve the presets API on the same origin, behind the same access control as the calculator. If there are multiple users, scope each preset to its owner unless I ask for sharing.
>
> Let me save a named snapshot of the full calculator settings, including file-size assumptions, reload a preset into the form, and select multiple saved presets for side-by-side comparison. Compare daily photo and video counts, daily storage, and storage-limited runtime. Save the settings as the source of truth and compute forecasts using the existing pure calculation module. Validate incoming settings and preserve the latest Hybrid and timelapse behaviour, including independent motion trigger rates. Keep the preset save action explicit. Verify save, load, comparison, and persistence after a restart.

## Source map

- `dist/index.html` contains the page structure.
- `dist/style.css` contains the responsive styles.
- `dist/app.mjs` handles the form, results, and browser autosave. It currently saves one baseline under the same browser storage key as the live form.
- `dist/calculate.mjs` exports the default settings and pure calculation functions.

Browser storage is tied to the site's origin. Existing drafts and the baseline on the ChatGPT Site will need to be re-entered on the VPS or migrated explicitly. This archive contains source files, with no saved user settings or credentials.
