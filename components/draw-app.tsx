"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BracketBoard } from "@/components/bracket-board";
import { Wheel } from "@/components/wheel";
import { playLand, warmAudio } from "@/lib/audio";
import {
  STORAGE_KEY,
  bracketLetter,
  bracketName,
  bracketSizeLabel,
  centeredRotation,
  clampBracketCount,
  cleanLabel,
  clubKey,
  clubTallies,
  createId,
  cryptoRng,
  formatResults,
  groupTeamsForList,
  landingRotation,
  MAX_BRACKETS,
  MAX_TEAMS,
  MIN_BRACKETS,
  parseBulkLines,
  parseDraft,
  planDraw,
  type Draft,
  shuffle,
  unaffiliatedCount,
  type Placement,
} from "@/lib/draw";
import { bracketColor, clubColor, textOn } from "@/lib/palette";

type Phase = "setup" | "spinning" | "between" | "done";

const SPIN_DURATION_MS = 5000;

const EMPTY_DRAFT: Draft = { eventName: "", bracketCount: 4, teams: [] };

function subscribeDraft() {
  return () => {};
}

function readDraft() {
  return window.localStorage.getItem(STORAGE_KEY);
}

function serverDraft() {
  return null;
}

function usePersistedDraft(): [Draft, (next: Draft) => void] {
  const raw = useSyncExternalStore(subscribeDraft, readDraft, serverDraft);
  const stored = useMemo(() => (raw ? parseDraft(raw) : null), [raw]);
  const [override, setOverride] = useState<Draft | null>(null);
  const draft = override ?? stored ?? EMPTY_DRAFT;
  const commit = useCallback((next: Draft) => {
    setOverride(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);
  return [draft, commit];
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DrawApp() {
  const [draft, commitDraft] = usePersistedDraft();
  const { eventName, bracketCount, teams } = draft;
  const [nameInput, setNameInput] = useState("");
  const [clubInput, setClubInput] = useState("");
  const [formError, setFormError] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [phase, setPhase] = useState<Phase>("setup");
  const [placed, setPlaced] = useState<Placement[]>([]);
  const [queue, setQueue] = useState<Placement[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [result, setResult] = useState<Placement | null>(null);
  const [justPlacedId, setJustPlacedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rotationRef = useRef(centeredRotation(0, 4));
  const spinningRef = useRef(false);
  const soundRef = useRef(true);
  const phaseRef = useRef<Phase>("setup");
  const runIdRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const queueRef = useRef<Placement[]>([]);
  const indexRef = useRef(0);
  const bracketCountRef = useRef(4);
  const spinAtRef = useRef<(index: number) => void>(() => {});
  const nameRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    bracketCountRef.current = bracketCount;
  }, [bracketCount]);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  const brackets = useMemo(
    () =>
      Array.from({ length: bracketCount }, (_, index) => ({
        index,
        letter: bracketLetter(index),
        name: bracketName(index),
        color: bracketColor(index),
      })),
    [bracketCount],
  );

  const wheelLabels = useMemo(
    () => brackets.map((bracket) => bracket.letter),
    [brackets],
  );
  const wheelColors = useMemo(
    () => brackets.map((bracket) => bracket.color),
    [brackets],
  );
  const tallies = useMemo(() => clubTallies(teams), [teams]);
  const grouped = useMemo(() => groupTeamsForList(teams), [teams]);
  const noClub = unaffiliatedCount(teams);
  const busy = phase === "spinning" || phase === "between";

  function setPhaseBoth(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function cancelMotion() {
    runIdRef.current += 1;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    spinningRef.current = false;
  }

  function dismissResult() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setResult(null);
  }

  function spinAt(index: number) {
    const runId = runIdRef.current;
    if (spinningRef.current) return;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const placement = queueRef.current[index];
    if (!placement) {
      spinningRef.current = false;
      setResult(null);
      setPhaseBoth("done");
      setAnnouncement("Draw complete.");
      return;
    }

    setResult(null);
    setPhaseBoth("spinning");
    const from = rotationRef.current;
    const count = bracketCountRef.current;
    const to = landingRotation(from, placement.bracketIndex, count, cryptoRng);
    const duration = prefersReducedMotion() ? 220 : SPIN_DURATION_MS;
    const started = performance.now();
    spinningRef.current = true;

    const frame = (now: number) => {
      if (runId !== runIdRef.current) return;
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 4;
      rotationRef.current = from + (to - from) * eased;
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      rotationRef.current = to;
      spinningRef.current = false;
      rafRef.current = null;
      if (soundRef.current && !prefersReducedMotion()) playLand();
      indexRef.current = index + 1;
      const nextPlaced = queueRef.current.slice(0, index + 1);
      setPlaced(nextPlaced);
      setJustPlacedId(placement.team.id);
      setAnnouncement(
        `${placement.team.name} placed in ${bracketName(placement.bracketIndex)}.`,
      );
      setResult(placement);
      if (index + 1 >= queueRef.current.length) {
        setPhaseBoth("done");
        return;
      }
      setPhaseBoth("between");
    };
    rafRef.current = requestAnimationFrame(frame);
  }

  useEffect(() => {
    spinAtRef.current = spinAt;
  });

  function startDraw() {
    if (teams.length === 0 || phaseRef.current === "spinning") return;
    cancelMotion();
    const planned = shuffle(
      planDraw(teams, bracketCountRef.current, cryptoRng),
      cryptoRng,
    );
    const runId = runIdRef.current;
    queueRef.current = planned;
    indexRef.current = 0;
    setQueue(planned);
    setPlaced([]);
    setResult(null);
    setAnnouncement("");
    if (soundRef.current) warmAudio();
    // Show the next name before the wheel moves, and leave it there while spinning.
    setPhaseBoth("between");
    const leadIn = prefersReducedMotion() ? 0 : 700;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (runId !== runIdRef.current) return;
      spinAtRef.current(0);
    }, leadIn);
  }

  function returnToSetup() {
    cancelMotion();
    queueRef.current = [];
    indexRef.current = 0;
    setQueue([]);
    setPlaced([]);
    setResult(null);
    rotationRef.current = centeredRotation(0, bracketCountRef.current);
    setAnnouncement("");
    setPhaseBoth("setup");
  }

  function activateWheel() {
    if (teams.length === 0 || result) return;
    if (phaseRef.current === "between") {
      spinAtRef.current(indexRef.current);
      return;
    }
    if (phaseRef.current === "setup" || phaseRef.current === "done")
      startDraw();
  }

  function addTeam() {
    const name = cleanLabel(nameInput, 80);
    if (!name) {
      setFormError("Enter a team name.");
      nameRef.current?.focus();
      return;
    }
    if (teams.length >= MAX_TEAMS) {
      setFormError(`The draw holds ${MAX_TEAMS} teams.`);
      return;
    }
    commitDraft({
      ...draft,
      teams: [
        ...teams,
        { id: createId(), name, club: cleanLabel(clubInput, 80) },
      ],
    });
    setNameInput("");
    setClubInput("");
    setFormError("");
    nameRef.current?.focus();
  }

  function addBulk() {
    const parsed = parseBulkLines(bulkText);
    if (parsed.length === 0) {
      setBulkError("Add one team per line, with the club after a comma.");
      return;
    }
    const room = MAX_TEAMS - teams.length;
    if (room <= 0) {
      setBulkError(`The draw holds ${MAX_TEAMS} teams.`);
      return;
    }
    const next = parsed.slice(0, room);
    setBulkError(
      parsed.length > next.length
        ? `Only the first ${MAX_TEAMS} teams were kept.`
        : "",
    );
    commitDraft({
      ...draft,
      teams: [
        ...teams,
        ...next.map((entry) => ({
          id: createId(),
          name: entry.name,
          club: entry.club,
        })),
      ],
    });
    setBulkText("");
    if (parsed.length <= next.length) setBulkOpen(false);
  }

  function removeTeam(id: string) {
    commitDraft({
      ...draft,
      teams: teams.filter((team) => team.id !== id),
    });
  }

  function clearTeams() {
    if (busy) return;
    if (teams.length > 0 && !window.confirm("Remove every team from the list?"))
      return;
    cancelMotion();
    queueRef.current = [];
    setQueue([]);
    setPlaced([]);
    setResult(null);
    commitDraft({ ...draft, teams: [] });
    setAnnouncement("");
    setPhaseBoth("setup");
  }

  async function copyResults() {
    const text = formatResults(placed, bracketCount, eventName);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimerRef.current != null)
        window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setAnnouncement(
        "Could not copy the results. Select the brackets and copy them instead.",
      );
    }
  }

  useEffect(() => {
    if (phase === "setup") {
      rotationRef.current = centeredRotation(0, bracketCount);
    }
  }, [bracketCount, phase]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!result) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    const spinNext =
      dialog.querySelector<HTMLButtonElement>("[data-spin-next]");
    const close = dialog.querySelector<HTMLButtonElement>(
      "[data-close-result]",
    );
    (spinNext ?? close)?.focus();
  }, [result]);

  useEffect(() => {
    if (!justPlacedId) return;
    const timeout = window.setTimeout(() => setJustPlacedId(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [justPlacedId]);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      if (copyTimerRef.current != null)
        window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const hub = useMemo(() => {
    // placed only grows after a spin stops, so this name stays put while the wheel turns.
    const upcoming =
      phase === "spinning" || phase === "between"
        ? queue[placed.length]
        : undefined;
    if (upcoming) {
      return {
        kicker: "Next",
        title: upcoming.team.name,
        sub: upcoming.team.club.trim() || "No club",
        accent: undefined as string | undefined,
      };
    }
    if (phase === "done") {
      return {
        kicker: "Draw complete",
        title: eventName.trim() || "All set",
        sub: bracketSizeLabel(teams.length, bracketCount),
        accent: undefined as string | undefined,
      };
    }
    return {
      kicker: teams.length ? `${teams.length} ready` : "Add teams",
      title: eventName.trim() || "Spin",
      sub: `${bracketCount} brackets`,
      accent: undefined as string | undefined,
    };
  }, [bracketCount, eventName, phase, placed.length, queue, teams.length]);

  const canActivate =
    teams.length > 0 &&
    result === null &&
    (phase === "setup" || phase === "done" || phase === "between");

  return (
    <div className="page-shell">
      <header className="top no-print">
        <div>
          <p className="eyebrow">Round robin draw</p>
          <h1>{eventName.trim() || "Bracket Draw"}</h1>
          <p className="lede">Spin every team into a bracket.</p>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-pressed={soundOn}
          onClick={() => setSoundOn((current) => !current)}
        >
          {soundOn ? "Sound on" : "Sound off"}
        </button>
      </header>

      <div className="layout">
        <section className="wheel-column no-print" aria-label="Spinning wheel">
          <Wheel
            labels={wheelLabels}
            colors={wheelColors}
            rotationRef={rotationRef}
            spinningRef={spinningRef}
            soundRef={soundRef}
            spinning={phase === "spinning"}
            clickable={canActivate}
            onActivate={activateWheel}
            hubKicker={hub.kicker}
            hubTitle={hub.title}
            hubSubtitle={hub.sub}
            hubAccent={hub.accent}
          />
          <p className="announcement" aria-live="polite">
            {announcement || "The name in the center is who gets drawn next."}
          </p>
          {busy || phase === "done" ? (
            <div className="wheel-meta">
              <div className="progress" aria-hidden="true">
                <span
                  style={{
                    width: `${teams.length === 0 ? 0 : (placed.length / teams.length) * 100}%`,
                  }}
                />
              </div>
              <p className="progress-label">
                {placed.length} of {teams.length} placed
              </p>
              {phase === "between" ? (
                <div className="inline-actions">
                  <button
                    type="button"
                    className="btn-gold"
                    onClick={() => spinAtRef.current(indexRef.current)}
                  >
                    Spin next
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="panel no-print" aria-label="Teams">
          <label className="field">
            Event name
            <input
              value={eventName}
              onChange={(event) =>
                commitDraft({
                  ...draft,
                  eventName: event.target.value.slice(0, 60),
                })
              }
              placeholder="Summer Cup"
              disabled={busy}
              maxLength={60}
            />
          </label>

          <div className="stepper">
            <div>
              <p className="field-label">Brackets</p>
              <p className="hint">
                {bracketSizeLabel(teams.length, bracketCount)}
              </p>
            </div>
            <div className="stepper-controls">
              <button
                type="button"
                className="step"
                onClick={() =>
                  commitDraft({
                    ...draft,
                    bracketCount: clampBracketCount(bracketCount - 1),
                  })
                }
                disabled={phase !== "setup" || bracketCount <= MIN_BRACKETS}
                aria-label="Fewer brackets"
              >
                −
              </button>
              <input
                className="step-value"
                aria-label="Number of brackets"
                type="number"
                min={MIN_BRACKETS}
                max={MAX_BRACKETS}
                value={bracketCount}
                disabled={phase !== "setup"}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next))
                    commitDraft({
                      ...draft,
                      bracketCount: clampBracketCount(next),
                    });
                }}
              />
              <button
                type="button"
                className="step"
                onClick={() =>
                  commitDraft({
                    ...draft,
                    bracketCount: clampBracketCount(bracketCount + 1),
                  })
                }
                disabled={phase !== "setup" || bracketCount >= MAX_BRACKETS}
                aria-label="More brackets"
              >
                +
              </button>
            </div>
          </div>

          <form
            className="add-form"
            onSubmit={(event) => {
              event.preventDefault();
              addTeam();
            }}
          >
            <label className="field">
              Team / player
              <input
                ref={nameRef}
                value={nameInput}
                onChange={(event) => {
                  setNameInput(event.target.value);
                  if (formError) setFormError("");
                }}
                placeholder="Night Owls"
                disabled={phase !== "setup"}
                maxLength={80}
              />
            </label>
            <label className="field">
              Club
              <input
                value={clubInput}
                onChange={(event) => setClubInput(event.target.value)}
                placeholder="Apex"
                disabled={phase !== "setup"}
                maxLength={80}
              />
            </label>
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <button
              type="submit"
              className="btn-ghost"
              disabled={phase !== "setup"}
            >
              Add to the draw
            </button>
          </form>

          <button
            type="button"
            className="text-btn"
            onClick={() => setBulkOpen((open) => !open)}
            aria-expanded={bulkOpen}
            disabled={phase !== "setup"}
          >
            {bulkOpen ? "Hide paste box" : "Paste a list"}
          </button>
          {bulkOpen ? (
            <div className="bulk">
              <label className="field">
                One team per line
                <textarea
                  value={bulkText}
                  onChange={(event) => setBulkText(event.target.value)}
                  placeholder={
                    "Night Owls, Apex\nDay Hawks, Apex\nStorm | Metro"
                  }
                  rows={5}
                  disabled={phase !== "setup"}
                />
              </label>
              <p className="hint">
                Use a comma, a vertical bar, or a tab before the club.
              </p>
              {bulkError ? (
                <p className="form-error" role="alert">
                  {bulkError}
                </p>
              ) : null}
              <button
                type="button"
                className="btn-ghost"
                onClick={addBulk}
                disabled={phase !== "setup"}
              >
                Add lines
              </button>
            </div>
          ) : null}

          <div className="list-head">
            <h2>Teams · {teams.length}</h2>
            <button
              type="button"
              className="text-btn"
              onClick={clearTeams}
              disabled={busy || teams.length === 0}
            >
              Clear
            </button>
          </div>

          {tallies.length > 0 || noClub > 0 ? (
            <div className="chips">
              {tallies.map((tally) => (
                <span key={tally.club} className="chip">
                  <i
                    style={{ background: clubColor(tally.club) }}
                    aria-hidden="true"
                  />
                  {tally.club}
                  <b>{tally.count}</b>
                </span>
              ))}
              {noClub > 0 ? (
                <span className="chip is-muted">
                  No club
                  <b>{noClub}</b>
                </span>
              ) : null}
            </div>
          ) : null}

          {teams.length === 0 ? (
            <p className="empty-copy">
              Add each team with the club they play for.
            </p>
          ) : (
            <div className="team-list">
              {grouped.map((group) => (
                <div
                  key={clubKey(group.club) ?? "no-club"}
                  className="club-group"
                >
                  <p className="club-group-label">
                    <i
                      style={{ background: clubColor(group.club) }}
                      aria-hidden="true"
                    />
                    {group.club || "No club"} · {group.teams.length}
                  </p>
                  <ul>
                    {group.teams.map((team) => (
                      <li key={team.id}>
                        <span>{team.name}</span>
                        <button
                          type="button"
                          onClick={() => removeTeam(team.id)}
                          disabled={phase !== "setup"}
                          aria-label={`Remove ${team.name}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {phase === "done" ? (
            <div className="actions">
              <button type="button" className="btn-gold" onClick={startDraw}>
                Spin again
              </button>
              <button type="button" className="btn-ghost" onClick={copyResults}>
                {copied ? "Copied" : "Copy results"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={returnToSetup}
              >
                Edit teams
              </button>
            </div>
          ) : null}
        </section>
      </div>

      <section className="results" id="draw-results" aria-label="Brackets">
        <div className="results-head">
          <h2>Brackets</h2>
          <p className="hint print-only">
            {eventName.trim() || "Bracket Draw"}
          </p>
        </div>
        <BracketBoard
          brackets={brackets}
          placements={placed}
          justPlacedId={justPlacedId}
          done={phase === "done"}
        />
      </section>

      <dialog
        ref={dialogRef}
        className="result-modal no-print"
        aria-labelledby="result-title"
        onClose={dismissResult}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) dismissResult();
        }}
      >
        {result ? (
          <ResultDialog
            result={result}
            finished={phase === "done"}
            onSpinNext={() => {
              dismissResult();
              spinAtRef.current(indexRef.current);
            }}
            onClose={dismissResult}
          />
        ) : null}
      </dialog>
    </div>
  );
}

function ResultDialog({
  result,
  finished,
  onSpinNext,
  onClose,
}: {
  result: Placement;
  finished: boolean;
  onSpinNext: () => void;
  onClose: () => void;
}) {
  const color = bracketColor(result.bracketIndex);
  const club = result.team.club.trim();

  return (
    <>
      <p className="result-kicker">{finished ? "Draw complete" : "Placed"}</p>
      <p id="result-title" className="result-name">
        {result.team.name}
      </p>
      <p className="result-club">{club || "No club"}</p>
      <p className="result-bracket">
        <span
          className="bracket-badge"
          style={{ background: color, color: textOn(color) }}
        >
          {bracketLetter(result.bracketIndex)}
        </span>
        {bracketName(result.bracketIndex)}
      </p>
      <div className="result-actions">
        {finished ? null : (
          <button
            type="button"
            className="btn-gold"
            data-spin-next=""
            onClick={onSpinNext}
          >
            Spin next
          </button>
        )}
        <button
          type="button"
          className="btn-ghost"
          data-close-result=""
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </>
  );
}
