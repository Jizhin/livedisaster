# LiveKerala — Real-time Disaster & Incident Reporting

A community-powered platform for reporting and tracking disasters, incidents, and alerts across Kerala in real time.

## What it does

- **Report incidents** — floods, accidents, road blocks, power cuts, and more
- **District-level tracking** — see what's happening in each of Kerala's 14 districts
- **Community verification** — users confirm or dispute reports
- **Live news polling** — auto-fetches relevant news and alerts
- **Admin panel** — manage reports, moderate content

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python), PostgreSQL, SQLAlchemy, Alembic |
| Frontend | React 18, TypeScript, Vite |
| Infrastructure | Docker, Docker Compose |

## Project Structure

```
livekerala/
├── backend/          # FastAPI app, DB models, API routes
│   ├── app/
│   │   ├── api/      # Route handlers
│   │   ├── models/   # SQLAlchemy models
│   │   ├── schemas/  # Pydantic schemas
│   │   ├── crud/     # Database queries
│   │   └── services/ # News poller, business logic
│   └── alembic/      # DB migrations
├── frontend/         # React + TypeScript UI
│   └── src/
│       ├── pages/    # HomePage, DistrictPage, AdminPanel
│       ├── components/
│       └── api/
└── database/         # Schema reference
```

## Getting Started (Local Development)

### Prerequisites
- [Docker](https://www.docker.com/get-started) and Docker Compose
- Git

### Run with Docker (recommended)

```bash
git clone https://github.com/Jizhin/livedisaster.git
cd livedisaster/backend
docker compose up --build
```

This starts:
- PostgreSQL on port `5432`
- FastAPI backend on `http://localhost:8000`
- React frontend on `http://localhost:5173`

Migrations and seed data run automatically on first start.

### API Docs

Once running, visit `http://localhost:8000/docs` for the interactive Swagger UI.

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Some good starting points:
- Browse open [Issues](https://github.com/Jizhin/livedisaster/issues)
- Look for issues tagged `good first issue`

## License

MIT
