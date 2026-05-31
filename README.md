# WelthTradeBench — Client

A faithful, working clone of the **TradingView chart page**: drawing tools,
indicators, watchlist, compare, split-screen, options order ticket, and
real-time market data.

- **Stack:** React + TypeScript + Vite + Zustand, with
  [lightweight-charts](https://github.com/tradingview/lightweight-charts) v5
  and a custom drawing-tools / indicator layer on top.
- Talks to the **backend** ([WelthTradeBench_Server](https://github.com/rudreshtiwari10/WelthTradeBench_Server))
  for market data — Vite proxies `/api`, `/auth`, and `/ws` to it.

## Prerequisites
- **Node.js 18+** and npm
- The **backend running on `http://localhost:8000`** (see the server repo).
  Without it, the chart has nothing to load.

## Run it
```bash
# 1. install dependencies
npm install

# 2. start the dev server (http://localhost:5173)
npm run dev
```
Open **http://localhost:5173**.

> Start the **backend first** (port 8000). The app works on realistic mock data
> out of the box; add Upstox credentials in the backend's `.env` for live data.

## Other scripts
```bash
npm run build       # production build → dist/
npm run preview     # preview the production build
npm run typecheck   # tsc --noEmit
```

## Notes
- The backend URL/port is configured in `vite.config.ts` (`server.proxy`). If
  your backend runs elsewhere, change the proxy targets there.
- No secrets live in this repo.
