# NEET PG Prep

Electron desktop app for NEET-PG / INI-CET preparation.

- `electron/` main process and preload
- `server/` local API (OAuth, research)
- `dist/` built frontend
- `docs-stitch-brief.md` design brief for the Stitch redesign

The React/Vite source was not in the original package; `dist/` is the built output.

## Redesign (Stitch, Clinical Focus)

- `stitch-export/` raw Stitch output; `tools/convert.mjs` converts it to `src/screens/*.jsx` and regenerates `tailwind.config.js`.
- `npm run dev` / `npm run build` (outputs `dist-new/`; the legacy `dist/` is untouched).
- Routes (hash): /library /ai /index /practice /test /mistakes /progress /highlights /browser /settings /search. Sidebar links route by label in `src/App.jsx`.
- Screens are still static mockups: content is Stitch placeholder data, not wired to `/api/*` yet.
