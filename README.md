# AI RPG

A mobile-first text RPG built with React + TypeScript and an Express backend.

## Features

- Email/password login and account creation
- Upload-driven game flow from `.zip` files containing game `.json` and optional `.webp` assets
- Two-player setup form stored in SQLite for each uploaded game
- JSON scene engine with exit vectors, hint command (`HINT`), and random-group scene support
- Text-based RPG gameplay powered by Venice.ai
- Mobile-first viewport layout
- Navbar with logout link

## Project structure

- `frontend/` - React app (Vite)
- `backend/` - Express API (TypeScript, SQLite, JWT auth)

## Setup

### 1) Backend environment

Copy and edit:

```bash
cd backend
cp .env.example .env
```

Set at least:

- `JWT_SECRET` (16+ chars)
- `VENICE_API_KEY`

### 2) Install deps

```bash
cd backend && npm install
cd ../frontend && npm install
```

## Run locally

Open two terminals:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api` to backend `http://localhost:4000`.

## Sample game definition

- A minimal one-scene game JSON is available at `sample-games/one-scene/game.json`.
- Put that file (and optional `.webp` images referenced by `backgroundImage`) into a `.zip`, upload it in the app, then complete the player setup form.
