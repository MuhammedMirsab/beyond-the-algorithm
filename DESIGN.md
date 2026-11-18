# Beyond the Algorithm: design system

The arcade for EDEX 2026 (IISJ Computer Science). Nine short games, each showing one thing AI can work out about a person. This file is the source of truth for how every screen looks, moves and reads. The live reference is `/design`.

## 1. Who it's for and what they should leave with

- **Visitors:** parents, students from Grade 1 to 12, teachers, Jeddah's Indian community. Many read English as a second language. Most have never thought about how AI works.
- **Where:** a loud exhibition room. A booth laptop on a projector (mouse, keyboard, webcam), and visitors' own phones through a QR code.
- **Time:** 2 to 5 minutes per game, a queue behind them, no instructions from anyone.
- **The takeaway:** AI isn't magic and it isn't only chatbots. It finds patterns in numbers: points on your face, your past choices, examples you show it. After each game they should be able to say *how* it did it.

Every screen is judged against that. If a pixel doesn't help someone play, understand, or feel the moment, it goes.

## 2. Concept

**An arcade of AI experiments.** The hub is a game-select screen; each game is a cartridge with its own colour.

The visual language plays two layers against each other:

1. **The human layer:** warm, colourful, tactile game UI. Saturated cartridge colours, glossy tiles with grain, chunky expanded type.
2. **The machine layer:** what the AI actually sees. Dots, landmarks, dot-matrix numerals and small mono readouts. It appears only where the machine is "talking": scores, confidences, model facts, the globe of dots.

That tension is the exhibition's message, so the decoration carries meaning.

## 3. Colour

Dark "console" base so the cartridge colours carry the colour. One neutral ramp does 85% of the work. The default Tailwind palette is **switched off**: only the tokens below exist as utilities (`bg-*`, `text-*`, `ring-*`, ...).

| Token | Use |
| --- | --- |
| `canvas` | page background |
| `sunken` | wells behind video, inputs, art frames |
| `surface` | cards and panels |
| `raised` | buttons (secondary), modals |
| `overlay` | hover on raised |
| `line`, `line-strong` | dividers in dense lists only; prefer space |
| `fg` | primary text, the neutral primary button |
| `fg-muted` | body copy, secondary text |
| `fg-subtle` | captions, helper text (still 4.5:1 on canvas) |
| `fg-faint` | placeholders and disabled only, never information |
| `success`, `danger`, `warning` | real states only (correct, fooled, low light) |
| `white`, `black` | camera overlays, QR codes |

### The spectrum: one hue per game

| Game | Hue | Feeling |
| --- | --- | --- |
| Mind reader | pink 355 | the mind |
| Finger frame | coral 30 | a photo frame |
| Real or AI? | amber 62 | caution, inspect |
| Rock, paper, scissors | yellow 98 | arcade |
| Face Control | lime 130 | play |
| Train the machine | mint 165 | growth |
| See how AI learns | cyan 205 | study |
| AirWrite | sky 238 | air |
| Your phone | blue 262 | device |

No purple anywhere (it is the most recognisable AI-generated look).

Inside a game, wrap everything in `data-game="<slug>"` (GameShell does it). These scoped tokens then resolve:

- `game`: the solid colour. Buttons, highlights, the current step, the top prediction.
- `game-deep`: the darker end of the tile gradient.
- `game-ink`: text and icons **on** the game colour (always dark: every game colour is light enough for dark ink).
- `game-soft`: 16% tint for soft backgrounds (number bubbles, icon wells).

Rules:

- One filled `game` (or `fg`) action per view. Peers are `secondary` or `ghost`.
- Colour never carries meaning alone: correct and wrong also get a word and an icon.
- Text never sits on a gradient without checking the darkest spot. On game colour, text is `game-ink` (6:1 or better on every palette, both gradient ends) or `game-ink/80` at the lightest (4.6:1). Never lower: 70% ink fails on pink, coral and blue.

## 4. Type

Three families, each with one job.

| Family | Role |
| --- | --- |
| **Mona Sans** (variable, width 75 to 125) | Everything people read. Display sizes run expanded (width 108 to 112) for a game-title feel. |
| **Martian Mono** | The machine's voice: readouts, model facts, coordinates. `type-label` only, in sentence case. Never headings, never sentences. |
| **Doto** (dot matrix, rounded) | Scoreboard numerals, 40px and up. Never words below 32px. |

Use the role utilities, never ad-hoc sizes:

| Utility | Size / line height / weight | For |
| --- | --- | --- |
| `type-display-1` | 44 to 96 / 0.94 / 800, width 112 | the hub hero only |
| `type-display-2` | 36 to 68 / 0.98 / 800, width 110 | game titles, result verdicts |
| `type-title-1` | 32 / 1.08 / 760 | section titles |
| `type-title-2` | 24 / 1.15 / 740 | card titles, modal titles |
| `type-title-3` | 20 / 1.25 / 700 | small headings |
| `type-body-lg` | 18 / 1.55 / 450 | lead paragraphs |
| `type-body` | 16 / 1.55 / 450 | default text |
| `type-small` | 14 / 1.45 / 480 | helper text |
| `type-caption` | 13 / 1.4 / 500 | metadata only |
| `type-label` | 13 mono, sentence case | machine readouts |
| `type-score` | 48 to 104 Doto | the number that matters |

- No italics, anywhere. `em` and `i` are reset to normal. Emphasis is one weight step.
- Body is weight 450 so it holds up on a projector.
- `tabular-nums` on anything that counts, times or lines up.
- Line length 60 to 75 characters (`max-w-[34rem]` to `max-w-[40rem]`).
- Inputs stay 16px or larger (iOS zoom).

## 5. Shape and space

- **Radii:** `rounded-xs` 6 (keys), `sm` 10, `md` 14 (rows, icon wells), `lg` 20 (cards), `xl` 28 (tiles, big panels), `2xl` 36, `rounded-full` for every button and chip.
- **Nested corners:** outer radius = inner radius + padding.
- **Spacing:** Tailwind's 4px scale. Gaps between groups are at least twice the gaps inside them (8 inside, 16 to 24 between, 40+ between sections).
- **Gutters:** 16px phone, 24px tablet, 32px desktop. Content max width 1200px; game content 1100px.
- **Hit areas:** 44px minimum on touch; booth buttons are `size="lg"` (56px).

## 6. Surfaces

- `shadow-ring`: a 1px white hairline at 8%. The default edge for cards.
- `shadow-float`: hairline plus a soft drop shadow, for modals and popovers only.
- Never a border plus a shadow on the same thing.
- `tile-surface grain`: the cartridge look. Game colour gradient (oklab, 155deg) with a soft top-left light and film grain. Only for game tiles, the intro art panel and celebration moments. Children of a `grain` element need `relative z-[2]` to sit above the grain.
- `dot-field`: a faint dotted background, for machine-view panels only.
- No glassmorphism, no glows, no gradient orbs, no pulsing badges, no sparkles.

## 7. Motion

Every animation needs a job: feedback, where something came from, a state change, or bridging a jump.

| Token | Value |
| --- | --- |
| `ease-out` (enter, exit, surfaces) | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `ease-in-out` (moving across the screen) | `cubic-bezier(0.77, 0, 0.175, 1)` |
| `ease-drawer` (bottom sheets) | `cubic-bezier(0.32, 0.72, 0, 1)` |

- Press: scale 0.97, 120 to 160ms. Built into Button.
- Hover colour: 150ms. Hover motion only under `(hover: hover) and (pointer: fine)`.
- Modal: 250ms in, 150ms out, from scale 0.96. Bottom sheet: 400ms in, 250ms out.
- Text swaps 150ms; panels 400ms in, 350ms out. Everything else under 300ms. Exits faster than entrances. Never ease-in, never from scale 0, never `transition: all`.
- Springs: `{ type: "spring", duration: 0.35, bounce: 0 }`. Bounce (0.2 to 0.3) only for rare moments: a win, a reveal.
- Stagger 40ms, first five items only, never on things people see every minute.
- The delight budget is spent on rare moments: the reveal of a guess, a round result, the final score. Navigation, hover and lists stay quiet.
- `MotionConfig reducedMotion="user"` is global. Under reduced motion, movement goes and opacity stays. Canvas and WebGL loops must check `prefers-reduced-motion` themselves.
- Server-rendered HTML never starts invisible. Anything that can be on a page's first paint takes `initial={entrance({ opacity: 0 })}` (`@/lib/entrance`): no fade on the first paint, the usual fade on every later step. On slow venue Wi-Fi a plain `initial={{ opacity: 0 }}` is a blank screen until the JavaScript arrives.
- Page motion without JavaScript: `.enter` rises in once on load (stagger with `--enter-delay`), `.reveal` eases in as it scrolls into view where scroll-driven animations exist (stagger a row with `--reveal-shift`: 0%, 12%, 24%...). Neither ever hides content where it can't run.

## 8. Components

`src/components/ui`:

- `Button`, `ButtonLink`: variants `primary` (white), `game`, `secondary`, `ghost`, `danger`, `on-game`; sizes `sm` 36, `md` 44, `lg` 56; `arrow` adds the round arrow chip for the main action; `loading` keeps the label.
- `IconButton`: requires `label`.
- `Chip` (static info) and `ToggleChip` (filters). A chip never looks clickable.
- `Card`, `Kbd` (a real key cap, `sm` or `md`), `MachineLabel`, `StatusDot`.
- `KeyHints`: the one way to show keyboard controls, as a row (HUDs, under intro buttons) or a list (settings, help). Keys as glyphs: ←, →, Space, R.
- `Progress` (transform-only bar), `StepDots`.
- `ConfidenceBars`: how every game shows what the model thinks.
- `Score` (Doto, NumberFlow; animates only on real changes), `Stat`.
- `Modal`: Base UI dialog; bottom sheet on phones, centred on desktop. Actions in `footer`.
- `Segmented`, `SwitchRow`, `SliderRow`.

`src/components/game`:

- `GameShell`: header with the way back, the game mark and title, an actions slot and the sound switch. `immersive` floats the header over full-bleed camera views.
- `GameIntro`: the first screen of every game: skill, title, lead, 2 to 3 steps, one big button, requirement chips, small print, art on the game colour. Pass `<GameArt slug mode="intro" />`: the intro art plays a short looping breakdown of how the game works without any hover, pauses off screen, and holds a still frame under reduced motion. Below desktop the art is a banner capped at 42% of the screen height, so the title and button stay in view. `keys` puts the game's KeyHints right under the buttons, on devices with a mouse only.
- `HowItWorks`: the reveal, numbered steps. Every game ends with one. Cards share rows (subgrid), so pictures, titles and text line up.
- `NextPlayerButton` (header) and `NextPlayerIcon` (result screens): the one look for Next player across the arcade.
- `ResultPanel`, `Notice`. ResultPanel always carries `FeedbackPrompt` next to its actions: a QR code to `/feedback?game=<slug>` on the booth laptop, a plain link on touch screens. That QR is the only way into the feedback form; the hub never links to it. Answers go to the Firestore `feedback` collection. The rules let anyone add one and nobody read them from the site; read them in the Firebase console.
- `CameraPrompt`, `CameraWaiting`, `ModelLoading`, `CameraProblem`, `cameraIssueFrom()`, `CAMERA_ISSUE_COPY`, `PRIVACY_LINE`.
- `Scoreboard`, `NameEntry` (skip always works) with `useBoard()` (shared in Firestore, top 20 live).
- `PhoneFrame`: a modern iPhone at true proportions. `PhoneHandoff`: QR code to continue on a phone.

`src/components/hub` (the arcade's front page):

- `SpectrumMark`: the logo, nine dots in hue order on a 3 x 3 grid. Also the favicon and the share image.
- `Globe`: the world as a few thousand points with the visitor pinned on it ("You are here" and a locating ping, CSS-anchored to cobe's marker). It sways gently around the visitor's dot; spin it away and it swings back to find you.
- `WatchingMark`: the logo drawn large in the footer. Its dots open their eyes when it scrolls into view, follow the pointer and blink now and then; on touch screens they glance around. Still under reduced motion.
- `GameTile`: one link per game, art on the game colour, hover moves the art.

## 9. Writing

The rules from `humanizer` and the interface guidelines, applied:

- Sentence case everywhere, including labels, buttons, chips and text drawn on canvas. Never all caps: whole words in capitals read as generated filler. Short sentences. Concrete nouns. Second person.
- Buttons start with a verb and name the result: "Start game", "Turn on camera", "Play again", "Next player", "Back to arcade".
- Errors say what happened and what to do, next to the problem. No "Oops", no blame, no exclamation marks.
- No em or en dashes in interface text. Use a comma, colon or full stop.
- Banned words: delve, leverage, unlock, empower, elevate, seamless, cutting-edge, revolutionary, magic, journey, harness, robust, crucial, pivotal, showcase, vibrant, "in today's world".
- No made-up precision ("99.8% certainty", "neural frequency", "Sampling 76,800 pixels"). Every number on screen is real or it isn't there.
- No mystical framing ("reading your brainwaves"). The point is that it's *not* magic.
- No emoji in the interface. Icons come from lucide (stroke 2) or `GameGlyph`.
- Explain AI with what the visitor just did: "You answered 7 questions. Each one cut the possible numbers in half."

## 10. Booth behaviour

- Every game has a one-tap **Next player** that resets everything: state, scores in memory, camera, model memory (the RPS opponent forgets you).
- Intro and result screens reset themselves after about 90 seconds idle (`useIdle`). Camera-only play never triggers idle resets.
- Nothing about a visitor is stored except what they type into a scoreboard or the feedback form. No photos, no frames, no downloads.
- Scoreboards are shared through Firestore (`useBoard`, `src/lib/firebase.ts`) and update live on every screen. Its local cache keeps them showing on bad Wi-Fi. Security rules are in `firestore.rules`.
- Models and runtimes are self-hosted under `/mediapipe` and `/models`. Nothing loads from a CDN.
- Keyboard shortcuts on the laptop, big touch targets on phones.
