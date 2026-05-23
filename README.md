# CM Calculator

CM Calculator is a local/hostable web app for freight contribution margin simulation.

It supports:

- Freight revenue simulation from OFT and surcharge tariffs.
- Variable cost calculation from terminal handling, feeder/trucking, agent commission, and container cost data.
- Local SQLite persistence for imported Excel data and manual maintenance edits.
- Render/Docker deployment through the included `Dockerfile` and `render.yaml`.

## Project Layout

- `cm-calculator-web/`: React frontend and Express API.
- `Input/`: Source Excel tariff and cost files.
- `cm-calculator-web/data/manual-seed.json`: Manual maintenance records restored before Excel import.
- `DEPLOYMENT.md`: Hosting notes.

## Local Run

Requires Node.js 24+.

```powershell
cd cm-calculator-web
npm run install:all
npm run build
npm run start
```

Then open `http://localhost:4000`.

## Deploy

Use the included `render.yaml` or `Dockerfile`. The server reads the hosting platform `PORT` and serves both the API and frontend from one process.
