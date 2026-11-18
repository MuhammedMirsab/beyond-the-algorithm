"use client";

import { Camera, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { GAMES, type GameSlug } from "@/content/games";
import { GameGlyph } from "@/components/art/game-glyph";
import { GameArt } from "@/components/art/game-art";
import { SensorArt, type SensorId } from "@/components/art/sensor-art";

const SENSORS: SensorId[] = ["motion", "gps", "camera", "microphone", "light", "touch", "battery", "connection"];
import { Button, IconButton } from "@/components/ui/button";
import { Chip, ToggleChip } from "@/components/ui/chip";
import { ConfidenceBars } from "@/components/ui/meter";
import { Progress, StepDots } from "@/components/ui/progress";
import { Score, Stat } from "@/components/ui/score";
import { MachineLabel } from "@/components/ui/surface";
import { KeyHints } from "@/components/ui/key-hints";
import { Segmented, SliderRow, SwitchRow } from "@/components/ui/controls";
import { Modal } from "@/components/ui/dialog";
import { PhoneFrame } from "@/components/game/phone-frame";
import { CameraProblem } from "@/components/game/camera-notice";
import { NameEntry, Scoreboard } from "@/components/game/scoreboard";

const NEUTRALS = [
  ["canvas", "bg-canvas"],
  ["sunken", "bg-sunken"],
  ["surface", "bg-surface"],
  ["raised", "bg-raised"],
  ["overlay", "bg-overlay"],
] as const;

const TEXT = [
  ["fg", "text-fg"],
  ["fg-muted", "text-fg-muted"],
  ["fg-subtle", "text-fg-subtle"],
  ["fg-faint", "text-fg-faint"],
] as const;

export function DesignSystem() {
  const [score, setScore] = useState(420);
  const [open, setOpen] = useState(false);
  const [seg, setSeg] = useState<"easy" | "normal" | "hard">("normal");
  const [on, setOn] = useState(true);
  const [level, setLevel] = useState(60);
  const [game, setGame] = useState<GameSlug>("face-control");

  return (
    <div data-game={game} className="mx-auto flex max-w-[75rem] flex-col gap-16 px-4 py-12 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <MachineLabel>Design system · v1</MachineLabel>
        <h1 className="type-display-1">Beyond the Algorithm</h1>
        <p className="type-body-lg max-w-[40rem] text-fg-muted">
          Tokens, type and components for the arcade. Pick a game to see its colour flow through every component below.
        </p>
        <div className="flex flex-wrap gap-2">
          {GAMES.map((g) => (
            <ToggleChip key={g.slug} pressed={game === g.slug} onClick={() => setGame(g.slug)} icon={<GameGlyph slug={g.slug} />}>
              {g.short}
            </ToggleChip>
          ))}
        </div>
      </header>

      <section className="flex flex-col gap-6">
        <h2 className="type-title-1">Spectrum</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {GAMES.map((g) => (
            <div key={g.slug} data-game={g.slug} className="tile-surface grain flex aspect-[4/5] flex-col justify-between rounded-xl p-4">
              <GameGlyph slug={g.slug} className="relative z-[2] size-7" />
              <div className="relative z-[2] flex flex-col gap-1">
                <span className="type-label opacity-75">{g.skill}</span>
                <span className="type-title-3">{g.short}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          {NEUTRALS.map(([name, cls]) => (
            <div key={name} className={`${cls} flex h-20 items-end rounded-md p-3 shadow-ring`}>
              <span className="type-label text-fg-muted">{name}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-6">
          {TEXT.map(([name, cls]) => (
            <span key={name} className={`${cls} type-title-3`}>
              {name}
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="type-title-1">Type</h2>
        <div className="flex flex-col gap-5">
          <p className="type-display-1">Display one</p>
          <p className="type-display-2">Display two, game titles</p>
          <p className="type-title-1">Title one, 32</p>
          <p className="type-title-2">Title two, 24</p>
          <p className="type-title-3">Title three, 20</p>
          <p className="type-body-lg max-w-[60ch] text-fg-muted">Body large, 18. The lead paragraph under a title. Plain words, short sentences, written for a parent reading from two metres away.</p>
          <p className="type-body max-w-[60ch] text-fg-muted">Body, 16. Everything else people read. Mona Sans at weight 450 so it holds up on a projector.</p>
          <p className="type-small text-fg-subtle">Small, 14. Secondary details and helper text.</p>
          <p className="type-caption text-fg-subtle">Caption, 13. Metadata only.</p>
          <p className="type-label text-fg-subtle">Label · the machine&apos;s voice · 21 points · 30 fps</p>
          <Score value={score} label="Score" tone="game" />
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setScore((s) => s + 100)}>
            Add 100
          </Button>
          <Button variant="ghost" onClick={() => setScore(0)}>
            Reset
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="type-title-1">Actions</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" arrow>
            Start game
          </Button>
          <Button variant="game" size="lg" arrow icon={<Play />}>
            Play now
          </Button>
          <Button variant="secondary" size="lg">
            How it works
          </Button>
          <Button variant="ghost" size="lg">
            Skip
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="game" icon={<Camera />}>
            Turn on camera
          </Button>
          <Button variant="secondary" icon={<RotateCcw />}>
            Play again
          </Button>
          <Button variant="secondary" loading>
            Saving
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <Button size="sm">Small</Button>
          <IconButton label="Restart" icon={<RotateCcw />} />
          <IconButton label="Restart" icon={<RotateCcw />} variant="ghost" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip icon={<Camera />}>Camera</Chip>
          <Chip tone="game">Live</Chip>
          <Chip tone="success">Correct</Chip>
          <Chip tone="danger">Fooled</Chip>
          <Chip tone="warning">Low light</Chip>
          <KeyHints
            items={[
              { keys: ["A", "B"], label: "Pick a photo" },
              { keys: ["Space"], label: "Zoom" },
            ]}
          />
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h2 className="type-title-1">Controls</h2>
          <Segmented
            label="Difficulty"
            value={seg}
            onValueChange={setSeg}
            options={[
              { value: "easy", label: "Easy" },
              { value: "normal", label: "Normal" },
              { value: "hard", label: "Hard" },
            ]}
          />
          <SwitchRow label="Sound effects" description="Short beeps on each result." checked={on} onCheckedChange={setOn} />
          <SliderRow label="Sensitivity" value={level} onValueChange={setLevel} valueText={`${level}%`} />
          <Progress value={level / 100} label="Loading model" tone="game" />
          <StepDots total={6} current={2} label="Round" />
          <KeyHints
            layout="list"
            size="md"
            items={[
              { keys: ["←", "→"], label: "Roll" },
              { keys: ["Space"], label: "Jump" },
              { keys: ["1", "6"], label: "Pick an instrument", join: "to" },
              { keys: ["Shift", "R"], label: "Restart", join: "plus" },
            ]}
          />
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Open a modal
          </Button>
          <Modal
            open={open}
            onOpenChange={setOpen}
            title="Clear today's board?"
            description="This removes all 24 names and scores from this laptop. It can't be undone."
            footer={
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Keep the board
                </Button>
                <Button variant="danger" onClick={() => setOpen(false)}>
                  Clear board
                </Button>
              </>
            }
          />
        </div>
        <div className="flex flex-col gap-6">
          <h2 className="type-title-1">Readouts</h2>
          <ConfidenceBars
            rows={[
              { id: "rock", label: "Rock", value: 0.61 },
              { id: "paper", label: "Paper", value: 0.27 },
              { id: "scissors", label: "Scissors", value: 0.12 },
            ]}
          />
          <div className="flex flex-wrap gap-10">
            <Stat value="5 of 6" label="Correct" />
            <Stat value="41s" label="Time" />
            <Stat value="#3" label="Rank today" />
          </div>
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h2 className="type-title-1">Scoreboard</h2>
          <Scoreboard
            highlightId="b"
            entries={[
              { id: "a", name: "Aisha K.", score: 600, detail: "6 of 6 · 38s", at: 1 },
              { id: "b", name: "Muhammed Rayyan Abdulrahman", score: 500, detail: "5 of 6 · 44s", at: 2 },
              { id: "c", name: "Jo", score: 400, detail: "4 of 6 · 52s", at: 3 },
            ]}
          />
          <NameEntry onSubmit={() => {}} onSkip={() => {}} />
        </div>
        <div className="flex flex-col gap-6">
          <h2 className="type-title-1">Phone</h2>
          <div className="flex justify-center rounded-xl bg-sunken p-8">
            <PhoneFrame width={300}>
              <div data-game="phone" className="tile-surface grain flex size-full flex-col justify-end p-6 pb-[calc(var(--phone-safe-bottom)+16px)]">
                <span className="type-label relative z-[2] opacity-75">Sensor 1 of 8</span>
                <span className="type-title-2 relative z-[2]">Motion</span>
              </div>
            </PhoneFrame>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="type-title-1">Illustrations</h2>
        <p className="type-body max-w-[40rem] text-fg-muted">
          One per game, shared by the hub tile and the game&apos;s intro. Hover a panel to see its motion.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((g) => (
            <div key={g.slug} data-game={g.slug} className="group/tile tile-surface grain relative aspect-[4/3] overflow-hidden rounded-xl">
              <div className="absolute inset-0 z-[2]">
                <GameArt slug={g.slug} />
              </div>
            </div>
          ))}
        </div>
        <h3 className="type-title-2 pt-6">Sensors</h3>
        <div data-game="phone" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SENSORS.map((s) => (
            <div key={s} className="group/card flex flex-col gap-2 rounded-lg bg-surface p-4 shadow-ring">
              <SensorArt sensor={s} className="aspect-square" />
              <span className="type-label text-fg-subtle">{s}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="type-title-1">Camera states</h2>
        <div className="rounded-xl bg-sunken px-4 py-12">
          <CameraProblem issue="denied" onRetry={() => {}} alternative={<Button variant="ghost" size="lg">Play with keyboard</Button>} />
        </div>
      </section>
    </div>
  );
}
