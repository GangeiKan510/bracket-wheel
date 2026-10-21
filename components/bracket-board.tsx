"use client";

import { type Placement } from "@/lib/draw";
import { clubColor, textOn } from "@/lib/palette";

type BracketColumn = {
  index: number;
  letter: string;
  name: string;
  color: string;
};

type BracketBoardProps = {
  brackets: BracketColumn[];
  placements: Placement[];
  justPlacedId: string | null;
  done: boolean;
};

export function BracketBoard({
  brackets,
  placements,
  justPlacedId,
  done,
}: BracketBoardProps) {
  return (
    <div className="board">
      {brackets.map((bracket) => {
        const teams = placements.filter(
          (placement) => placement.bracketIndex === bracket.index,
        );
        return (
          <section
            key={bracket.index}
            className="bracket-column"
            aria-labelledby={`bracket-${bracket.index}`}
          >
            <header
              className="bracket-head"
              style={{ borderTopColor: bracket.color }}
            >
              <span
                className="bracket-badge"
                style={{
                  background: bracket.color,
                  color: textOn(bracket.color),
                }}
              >
                {bracket.letter}
              </span>
              <div>
                <h3 id={`bracket-${bracket.index}`}>{bracket.name}</h3>
                <p>
                  {teams.length} {teams.length === 1 ? "team" : "teams"}
                </p>
              </div>
            </header>
            {teams.length === 0 ? (
              <p className="slot-empty">
                {done ? "Empty" : "Waiting for the wheel"}
              </p>
            ) : (
              <ul className="team-cards">
                {teams.map((placement) => {
                  const fresh = placement.team.id === justPlacedId;
                  return (
                    <li
                      key={placement.team.id}
                      className={`team-card${fresh ? " is-new" : ""}`}
                    >
                      <span
                        className="club-dot"
                        style={{ background: clubColor(placement.team.club) }}
                        aria-hidden="true"
                      />
                      <span>
                        <span className="team-name">{placement.team.name}</span>
                        <span className="team-club">
                          {placement.team.club.trim() || "No club"}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
