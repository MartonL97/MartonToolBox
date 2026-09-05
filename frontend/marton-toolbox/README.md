# MartonToolBox Frontend

Standalone Angular 19 application providing the UI and browser-side tool implementations.

## Structure

- `src/app/core` — auth, models, and shared services.
- `src/app/features/dashboard` — tool registry landing page.
- `src/app/features/login`, `register`, `account` — authentication flows.
- `src/app/features/csv-cleaner` — client-side CSV cleaning tool.
- `src/app/features/image-resizer` — client-side image resizing tool.
- `src/app/features/screenshot-beautifier` — client-side screenshot beautifier tool.

All three implemented tools process files locally in the browser; nothing is uploaded except through the optional CSV server-side route reserved for future large-file processing.

## Run locally

Requires Node 22+ (Node 26 also works for installing dependencies).

```bash
npm install
npm start
```

Serves on [http://localhost:4200](http://localhost:4200). The dev server proxies API calls per `proxy.conf.json`, so run the backend (see `../../backend/README.md`) alongside it.

## Build

```bash
npm run build
```

Outputs to `dist/marton-toolbox`.

## Test

```bash
npm test
```
