# CM Calculator Web

Local web app for CM simulation and maintenance.

## Structure

- `frontend/`: React UI
- `server/`: Express API, SQLite storage, Excel import logic
- `data/cm-calculator.sqlite`: generated local database

## Run

```bash
npm install
npm run install:all
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`

Production build:

```bash
npm run build
npm run start
```

## Input Data

- By default the app reads from the sibling `..\Input` folder.
- You can change the Input folder from the `Input Settings` section in the UI, and the new path is persisted in the local app database.
- `Reload Input` re-imports Excel data into SQLite.
- Manual edits made in the maintenance UI are stored in SQLite and take precedence over matching rows from Excel on the next reload.
- If the Input path is invalid, the app still starts so the path can be corrected from the UI.
