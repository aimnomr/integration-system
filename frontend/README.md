# AMR Console — React frontend

Browser-based fleet console for the AMR Integration System. Talks to the
FastAPI gateway over REST, subscribes to Mosquitto over MQTT-over-WebSockets
for low-frequency telemetry, and opens its own rosbridge WebSocket per robot
for the high-frequency lanes (camera + teleop).

## Stack

| Layer       | Choice                                                 |
|-------------|---------------------------------------------------------|
| Build       | Vite ^6                                                 |
| UI          | React ^19 + TypeScript                                  |
| Routing     | react-router-dom ^7                                     |
| Styling     | Tailwind CSS ^4 (utility) + MUI ^7 (complex widgets)    |
| State       | TanStack Query (server cache)                           |
| Realtime    | `mqtt` (browser) + `roslib` (per-robot rosbridge)       |
| Data + chart| `@mui/x-data-grid` + `@mui/x-charts` (admin / OEE)      |

Tailwind has `important: 'html'` set so its utilities win against MUI's
component-internal styles. Both libraries source colours / sizes from
`src/branding/branding.ts` — change a single file to rebrand.

## Running locally

```bash
cd frontend
cp .env.example .env.local      # adjust if FastAPI / MQTT live elsewhere
npm install
npm run dev                     # http://localhost:5173
```

The Vite dev server proxies `/api/*` → `VITE_API_URL` (default
`http://localhost:8000`), so the React app can call same-origin paths in
development. In production the bundle calls `VITE_API_URL` directly; CORS on
the backend handles that case.

Other scripts:

```bash
npm run build        # tsc + Vite production build into dist/
npm run preview      # serve the production bundle locally
npm run typecheck    # tsc --noEmit, no Vite
```

## Project layout

```
src/
  main.tsx, App.tsx, router.tsx     entry + route table
  index.css                         tailwind + scrollbar
  branding/branding.ts              app name, colours, layout sizes
  components/
    providers/AppProviders.tsx      QueryClient + MUI Theme + BrowserRouter
    layout/{AppShell,AppBar,LeftNav}.tsx
    common/{StatusPill,Loading}.tsx
  pages/
    Dashboard, RobotDetail, Dispatch, Orders, OEE, Teleop, Health, NotFound
    admin/{Maps, Locations, Robots, FleetConfig}.tsx
```

Phase 2 will add `api/`, `realtime/`, `hooks/`, `types/`, and wire the health
pills + dashboard to live data. The placeholders you see today exist so the
router, layout, and branding can be reviewed before the data wiring goes in.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | FastAPI base URL — REST + dev proxy target |
| `VITE_MQTT_WS_URL` | `ws://localhost:9001` | Mosquitto WebSocket listener |
| `VITE_API_KEY` | _(empty)_ | If set, sent as `X-API-Key` on every REST call |
| `VITE_APP_NAME` | _(empty → "AMR Console")_ | Override the app name in the AppBar |

## Conventions

- Angles are **degrees at the UI layer**; only converted to quaternion at the
  rosbridge boundary (see `src/helper/angleHelper` once added in Phase 3).
- All goals use `header.frame_id = 'map'`.
- Teleop velocity defaults (inherited from the old interface):
  `LINEAR_SPEED = 0.3 m/s`, `ANGULAR_SPEED = 0.5 rad/s`, 100 ms repeat.
- Robot pose source for the map arrow: AMCL primary, EKF fallback if AMCL
  is silent for > 2 s.

## Branding

Everything visual flows out of `src/branding/branding.ts`. Tailwind reads it
at build time (`tailwind.config.ts`), MUI reads it at runtime
(`AppProviders.tsx`). Swap the values and the whole UI updates.
