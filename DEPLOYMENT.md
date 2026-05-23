# CM Calculator Deployment

This project is ready to run as a single web service. The Express server serves both the API and the built frontend.

## Render

1. Push this repository to GitHub.
2. In Render, create a new Blueprint or Web Service from the repository.
3. Use the included `render.yaml` or `Dockerfile`.
4. Keep Node at version 24 because the server uses `node:sqlite`.

Render will provide `PORT` automatically. The server reads `PORT` and binds to `0.0.0.0`, so it works outside localhost.

## Data

- `Input/` contains the source Excel files.
- `cm-calculator-web/data/manual-seed.json` contains current manual maintenance records.
- SQLite files are intentionally ignored and regenerated from `Input/` plus the manual seed on first boot.

For long-term production use, attach a persistent disk or move the database to a managed database. Without persistent storage, manual edits made on a hosted free service may be lost when the instance is rebuilt.
