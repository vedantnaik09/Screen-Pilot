# Screen-Pilot — Backend

This document describes the backend for the Screen-Pilot project (server side only). It includes a short overview, how to run the service locally, where logs and captured HTML snippets are stored, and a demonstration link.

## Demo

Embedded demo (YouTube):
</br>
[<img src="https://img.youtube.com/vi/H4oogFkRUfA/hqdefault.jpg" width="560" height="315" />](https://www.youtube.com/embed/H4oogFkRUfA)

Or open the demo directly on YouTube:

https://www.youtube.com/watch?v=H4oogFkRUfA

## Overview

The backend is a Node.js server that provides APIs used by the browser extension and internal automation services. It coordinates browser automation sessions, stores HTML snippets and screenshots to `logs/` and `screenshots/`, and connects to LLM services for processing tasks.

Key entry points and folders:

- `index.js` — server entry point
- `src/routes/api.js` — core API endpoints
- `src/routes/extension-api.js` — endpoints used by the browser extension (not covered here)
- `src/services/` — application services (BrowserSessionManager, LLMService, TaskAutomation, etc.)
- `logs/html-snippets/` — saved HTML captures produced by the automation
- `uploads/` and `screenshots/` — uploaded assets and screenshots

## Prerequisites

- Node.js (recommended v16+)
- npm (or yarn)

## Install

From the `backend` folder run:

```powershell
npm install
```

## Environment

Copy `.env.example` to `.env` and update values as needed. The server reads runtime configuration from `.env` (API keys, LLM endpoints, ports, etc.).

```powershell
cp .env.example .env
# then edit .env with your preferred editor
```

On Windows PowerShell you can copy with:

```powershell
Copy-Item .env.example .env
```

## Run (development)

Start the server:

```powershell
npm start
```

If you use a development tool such as `nodemon`, add a script in `package.json` (optional) and run `npm run dev`.

## Logs & Captured HTML

Captured HTML snippets are written to `logs/html-snippets/` with timestamped filenames. Use these files to inspect the raw HTML produced by the automation flows.

Example:

```
backend/logs/html-snippets/2025-11-28T14-33-31.503Z.html
```

## Services (quick summary)

- `BrowserSessionManager.js` — manages browser sessions and their lifecycle
- `LLMService.js` / `OllamaLLMService.js` — interfaces to language model providers
- `TaskAutomation.js` and `automation/BrowserAutomation.js` — orchestrate automation tasks executed against web pages

## API Notes

The server exposes REST endpoints under the routes defined in `src/routes/`. Look at `src/routes/api.js` for the main endpoints used by external clients.

## Development Notes

- Keep `.env` values out of version control; `.env.example` demonstrates required variables.
- Use the `logs/` directory to debug automation runs and to replay captured HTML if needed.
