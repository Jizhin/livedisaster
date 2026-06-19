# Contributing to LiveKerala

Thank you for your interest in contributing! Here's everything you need to know.

## How to contribute

### 1. Fork the repository

Click the **Fork** button on the top-right of the [GitHub page](https://github.com/Jizhin/livedisaster). This creates your own copy.

### 2. Clone your fork

```bash
git clone https://github.com/YOUR_USERNAME/livedisaster.git
cd livedisaster
```

### 3. Create a branch

Always work on a new branch — never directly on `main`.

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 4. Set up the project locally

```bash
cd backend
docker compose up --build
```

Frontend runs at `http://localhost:5173`, backend at `http://localhost:8000`.

### 5. Make your changes

- Keep changes focused — one feature or fix per PR
- Test your changes before submitting
- Follow the existing code style

### 6. Commit your changes

Write clear commit messages that describe what you did and why:

```bash
git add .
git commit -m "Add flood report severity filter"
```

### 7. Push and open a Pull Request

```bash
git push origin feature/your-feature-name
```

Then go to your fork on GitHub and click **Compare & pull request**.

In the PR description, explain:
- What you changed
- Why you made this change
- How to test it

---

## Guidelines

### What we welcome
- Bug fixes
- Performance improvements
- New district features
- UI/UX improvements
- Better mobile experience
- Documentation improvements
- Tests

### What to avoid
- Large refactors without prior discussion — open an Issue first
- Changes to the database schema without a migration
- Breaking changes to the API

### Backend changes
- Any model change needs an Alembic migration: `alembic revision --autogenerate -m "description"`
- New routes go in `backend/app/api/routes/`
- Keep business logic in `backend/app/services/`, not in route handlers

### Frontend changes
- Components go in `frontend/src/components/`
- Pages go in `frontend/src/pages/`
- API calls go in `frontend/src/api/client.ts`

---

## Reporting bugs

Open an [Issue](https://github.com/Jizhin/livedisaster/issues/new) and include:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Screenshots if relevant

## Questions?

Open an Issue with the `question` label. Happy to help.
