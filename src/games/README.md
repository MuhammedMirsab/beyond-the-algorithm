One folder per game. See AGENTS.md for the rules.

Each game folder holds:
- engine/ (or data/): logic copied from the original app, typed
- ui/: React components for this game only
- game.tsx: the client entry rendered by src/app/(games)/<slug>/page.tsx
- tsconfig.check.json: fast, isolated typecheck for this folder
