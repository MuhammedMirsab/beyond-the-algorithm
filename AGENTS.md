# Working in this repo

Beyond the Algorithm: one Next.js 16 app (App Router, Turbopack, React 19, TypeScript strict, Tailwind 4, Bun) holding ten AI games for the EDEX 2026 exhibition. Read `DESIGN.md` first; it decides how everything looks, moves and reads.

## Next.js version

This is Next.js 16.4. APIs and conventions differ from older versions. Check `node_modules/next/dist/docs/` before using an API you're unsure of. `next/dynamic` with `ssr: false` only works inside a Client Component.

## Commands

- `bun install`, then `bun run dev` (port 3000; the shared dev server for this session runs on 3100).
- `bun run typecheck`, `bun run lint`, `bun test <path>`.
- `bun run sync:mediapipe` re-copies the MediaPipe wasm and downloads missing models into `public/mediapipe`.
- This machine runs Node 20: keep `tailwindcss` and `@tailwindcss/postcss` pinned to 4.3.3 (4.3.5 pulls an ESM-only dependency that Node 20 can't `require`).

## Layout

```
src/app/page.tsx                 the arcade hub
src/app/(games)/<slug>/page.tsx  one route per game (server component, sets metadata)
src/app/api/<slug>/...           route handlers a game needs (server only)
src/games/<slug>/                everything game-specific: engine/ (copied logic), ui/, game.tsx
src/components/ui/               design-system primitives
src/components/game/             shared game chrome (shell, intro, results, camera states, scoreboard, phone frame)
src/components/art/              illustrations and glyphs
src/content/games.ts             the registry: titles, hooks, groups, needs
src/lib/                         storage, leaderboard, idle, sound, mediapipe paths, cn
public/mediapipe/                self-hosted wasm + .task models (shared by every camera game)
public/games/<slug>/             a game's own images and data
```

## Rules for game code

1. **Own your folder.** A game only writes inside `src/games/<slug>/`, `src/app/(games)/<slug>/`, `src/app/api/<slug>/` and `public/games/<slug>/`. Shared files (`package.json`, `globals.css`, `layout.tsx`, `next.config.ts`, `src/components/**`, `src/lib/**`, `src/content/**`) change only through the owner of the design system.
2. **Copy logic, rewrite UI.** Engines, trackers, data and audio from the original apps are copied and typed, not reinvented. Every visible element is rebuilt with the design system.
3. **Client boundaries.** Anything touching `window`, camera, audio, canvas, MediaPipe, Phaser or TF.js is client-only. Import heavy libraries lazily (`await import(...)`) or load the game with `next/dynamic({ ssr: false })` from a client wrapper. No module-scope `window` access.
4. **MediaPipe** paths come from `@/lib/mediapipe` (`MEDIAPIPE_WASM`, `MEDIAPIPE_MODELS`). Never a CDN URL.
5. **Clean up.** Stop camera tracks, cancel animation frames, close landmarkers, destroy Phaser, dispose TF tensors on unmount. StrictMode mounts twice in development; code must survive it.
6. **Tokens only.** The default Tailwind palette is disabled: `text-zinc-400` silently does nothing. Use `fg`, `fg-muted`, `surface`, `game`, `game-ink`... and the `type-*` roles.
7. **No new dependencies** without asking. Everything the games need is installed.
8. **Strict TypeScript.** No `any` (use `unknown` and narrow), no `@ts-ignore`, no `.js`/`.jsx` files.
9. **Copy** follows DESIGN.md §9. **Booth behaviour** follows DESIGN.md §10.
