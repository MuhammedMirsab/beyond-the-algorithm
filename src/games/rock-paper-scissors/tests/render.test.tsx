/**
 * Every play and result state renders, with a real match played through the
 * engine: the scoreboard through the chant, the AI's sealed then revealed
 * guess, the round tape, the results and How it works. Server rendering only
 * (no DOM), so this catches crashes and wrong copy, not layout.
 */
import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { RpsArt } from "@/components/art/games/rps-art";
import { createInitialLearningSnapshot } from "../engine/aiLearningManager";
import { createNewMatchState, prepareAndLockRound, resolveRoundWithValidatedGesture, setCountdownStep } from "../engine/gameStateManager";
import type { Gesture, PredictionBreakdown, RoundRecord } from "../engine/types";
import type { Beat, MatchView } from "../match-controller";
import { ActionBar } from "../ui/action-bar";
import { AiPanel } from "../ui/ai-panel";
import { MatchHeader } from "../ui/match-header";
import { ResultsView } from "../ui/results-view";
import { RoundStrip } from "../ui/round-strip";
import { ThrowPad } from "../ui/throw-pad";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const noop = () => undefined;

/** Plays rounds through the real engine, the way the controller does, keeping the sealed guesses. */
function playMatch(moves: Gesture[], { renderLive = false }: { renderLive?: boolean } = {}) {
  let match = createNewMatchState("first_to_five", "normal", "render");
  let learning = createInitialLearningSnapshot();
  const history: RoundRecord[] = [];
  const guesses: PredictionBreakdown[] = [];
  const view = (extra: Partial<MatchView> = {}): MatchView => ({
    match,
    learning,
    history: [...history],
    guesses: [...guesses],
    inputMode: "keys",
    missed: false,
    pendingThrow: null,
    beat: null,
    ...extra,
  });
  const live: { beat: Beat; html: string; ai: string }[] = [];
  for (const move of moves) {
    if (match.phase === "match_complete") break;
    match = prepareAndLockRound(match, history, learning, () => 0.9);
    for (const beat of ["lock", "rock", "shoot"] as const) {
      if (beat === "rock") match = setCountdownStep(match, 3);
      if (beat === "shoot") match = setCountdownStep(match, "SHOOT");
      if (!renderLive) continue;
      live.push({
        beat,
        html: renderToString(<MatchHeader view={view({ beat })} cameraMode={false} touch={false} />),
        ai: renderToString(<AiPanel view={view({ beat })} />),
      });
    }
    const guess = match.sealedCommitment!.breakdown;
    const result = resolveRoundWithValidatedGesture(match, move, learning, history);
    match = result.nextMatch;
    learning = result.nextLearning;
    history.push(result.roundRecord!);
    guesses.push(guess);
  }
  return { view: view(), live };
}

const ROCKY: Gesture[] = Array.from({ length: 40 }, (_, i) => (i % 4 === 3 ? "paper" : "rock"));

describe("The arena renders every state", () => {
  it("before the first round", () => {
    const { view } = playMatch([]);
    expect(text(renderToString(<MatchHeader view={view} cameraMode touch={false} />))).toContain("Round 1");
    const ai = text(renderToString(<AiPanel view={view} />));
    expect(ai).toContain("It hasn't seen you play");
    expect(ai).toContain("Picks when the round starts");
    const action = text(renderToString(<ActionBar view={view} ready touch={false} onStart={noop} onSeeResults={noop} />));
    expect(action).toContain("Start round");
    expect(text(renderToString(<RoundStrip rounds={[]} />))).toContain("Your rounds show up here.");
  });

  it("through the lock, the chant and Shoot, without giving the sealed move away", () => {
    const { live } = playMatch(ROCKY.slice(0, 3), { renderLive: true });
    const lock = live.find((s) => s.beat === "lock")!;
    expect(text(lock.html)).toContain("Locked in");
    expect(text(live.find((s) => s.beat === "rock")!.html)).toContain("Rock");
    expect(text(live.find((s) => s.beat === "shoot")!.html)).toContain("Shoot");
    for (const state of live) {
      const ai = text(state.ai);
      expect(ai).toContain("Its guess is sealed");
      expect(ai).not.toContain("It expected");
    }
  }, 30_000);

  it("after a reveal and at the end of the match", () => {
    const { view } = playMatch(ROCKY);
    expect(view.match.phase).toBe("match_complete");
    const ai = text(renderToString(<AiPanel view={view} />));
    expect(ai).toMatch(/It expected (rock|paper|scissors)/);
    expect(ai).toMatch(/Why /);
    expect(ai).toMatch(/Guessed right \d+ of \d+/);
    const header = text(renderToString(<MatchHeader view={view} cameraMode={false} touch={false} />));
    expect(header).toMatch(/(You won the match|The AI won the match)/);
    const action = text(renderToString(<ActionBar view={view} ready touch={false} onStart={noop} onSeeResults={noop} />));
    expect(action).toContain("See results");
    const pad = renderToString(<ThrowPad enabled={false} shoot={false} selected={null} thrown="rock" onThrow={noop} touch layout="column" />);
    expect(text(pad)).toContain("Scissors");
  }, 30_000);

  it("the results and How it works use the visitor's own numbers", () => {
    const { view } = playMatch(ROCKY);
    const html = text(renderToString(<ResultsView view={view} difficulty="normal" onRematch={noop} onNextPlayer={noop} />));
    const rounds = view.match.matchRounds.length;
    const correct = view.match.matchRounds.filter((r) => r.wasPredictionCorrect).length;
    expect(html).toContain(`${correct} of ${rounds}`);
    expect(html).toContain("What it noticed about you");
    expect(html).toContain("How the AI did it");
    expect(html).toContain(`Your ${view.history.length} throws are all it knows about you`);
    expect(html).toMatch(/it guessed right \d+ of \d+ times this match/);
    expect(html).not.toMatch(/[–—!]/);
  }, 30_000);
});

describe("The illustration", () => {
  it("renders the tile and the intro loop", () => {
    expect(renderToString(<RpsArt mode="tile" />)).toContain("<svg");
    expect(renderToString(<RpsArt mode="intro" />)).toContain("<svg");
  });
});
