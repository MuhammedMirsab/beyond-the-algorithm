# Beyond the Algorithm

Nine short games that show what AI can work out about you. Built by IISJ Computer Science students for **EDEX 2026** at International Indian School Jeddah (19 and 20 November 2026).

| Group | Game | Route | What the AI does |
| --- | --- | --- | --- |
| It predicts you | Can AI read your mind? | `/mind-reader` | Binary search |
| | Rock, paper, scissors | `/rock-paper-scissors` | Learns your habits, locks its move first |
| It sees you | Face Control | `/face-control` | 478 face landmarks become a controller |
| | AirWrite | `/airwrite` | 21 hand landmarks write; an on-device matcher reads the letters |
| | Viewfinder | `/viewfinder` | Two-hand tracking frames a live lens |
| It learns from you | Train the machine | `/train-the-machine` | Pose classification from your examples |
| | See how AI learns | `/how-ai-learns` | Transfer learning on MobileNet |
| It's already around you | Real or AI? | `/real-or-ai` | Spot the AI-edited photo |
| | Your phone knows more than you think | `/phone` | Phone sensors and what apps infer |

Curators: Mirsab (Grade 10) and Dilshaan (Grade 9).

## Run it

```bash
bun install
bun run dev
```

Open http://localhost:3000. Camera games need `localhost` or HTTPS.

Other scripts: `bun run build`, `bun run start`, `bun run typecheck`, `bun run lint`, `bun test`.

## Environment

Nothing is required. Every game runs in the browser with self-hosted models, so the arcade works offline once it has loaded.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Optional. Absolute base for share images; Vercel sets its own URL automatically. |

## How it's built

- Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind CSS 4, Bun.
- `DESIGN.md` is the design system; `/design` shows it live. `AGENTS.md` has the rules for working in the repo.
- Every camera game runs MediaPipe in the browser from self-hosted files in `public/mediapipe` (`bun run sync:mediapipe` refreshes them). Video never leaves the device.
- Scoreboards are stored per device in the browser, so the booth never depends on the venue Wi-Fi.

```
src/app/                 routes: the arcade hub, one folder per game, API routes
src/games/<slug>/        each game: engine (logic from the original app) and UI
src/components/ui/       design-system primitives
src/components/game/     shared game chrome: shell, intro, results, camera states
src/components/art/      illustrations and the isometric phone
src/content/games.ts     the registry of games
```

## At the booth

- Open the arcade full screen (F11). Each game has a **Next player** button that clears everything; intro and result screens also reset after about 90 seconds of no input.
- On the laptop, the phone game shows a QR code so visitors can play it with their own phone's sensors.
- Test the camera games with the real webcam and lighting before doors open.
