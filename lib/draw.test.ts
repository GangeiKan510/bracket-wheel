import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bracketSizeLabel,
  centeredRotation,
  clubKey,
  findClashes,
  formatResults,
  formatResultsCsv,
  resultsFileBase,
  landingRotation,
  mulberry32,
  overflowClubs,
  parseBulkLines,
  parseDraft,
  planDraw,
  segmentAtPointer,
  type DrawTeam,
} from "./draw.ts";
import { SAMPLE_TEAMS, SEED_TEAMS } from "./sample.ts";

function teamsFrom(entries: { name: string; club: string }[]): DrawTeam[] {
  return entries.map((entry, index) => ({
    id: `t${index}`,
    name: entry.name,
    club: entry.club,
  }));
}

function assertFair(teams: DrawTeam[], bracketCount: number, seed: number) {
  const placements = planDraw(teams, bracketCount, mulberry32(seed));
  assert.equal(placements.length, teams.length);
  const seen = new Set(placements.map((placement) => placement.team.id));
  assert.equal(seen.size, teams.length);

  const sizes = Array.from({ length: bracketCount }, () => 0);
  const clubCounts = new Map<string, number[]>();
  for (const placement of placements) {
    assert.ok(
      placement.bracketIndex >= 0 && placement.bracketIndex < bracketCount,
    );
    sizes[placement.bracketIndex] = (sizes[placement.bracketIndex] ?? 0) + 1;
    const key = clubKey(placement.team.club);
    if (!key) continue;
    const counts =
      clubCounts.get(key) ?? Array.from({ length: bracketCount }, () => 0);
    counts[placement.bracketIndex] = (counts[placement.bracketIndex] ?? 0) + 1;
    clubCounts.set(key, counts);
  }

  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  assert.ok(max - min <= 1, `sizes ${sizes.join(",")} differ by more than 1`);

  for (const [club, counts] of clubCounts) {
    const total = counts.reduce((sum, value) => sum + value, 0);
    const cap = Math.ceil(total / bracketCount);
    const highest = Math.max(...counts);
    assert.ok(
      highest <= cap,
      `${club} stacked ${highest} high, cap is ${cap} (${counts.join(",")})`,
    );
  }
}

describe("planDraw", () => {
  it("splits HARAYA across brackets in the test seed", () => {
    assert.ok(SEED_TEAMS.some((team) => team.club === "HARAYA"));
    assert.ok(SEED_TEAMS.some((team) => team.club !== "HARAYA"));
    const teams = teamsFrom(SEED_TEAMS);
    assertFair(teams, 4, 3);
    const haraya = planDraw(teams, 4, mulberry32(3)).filter(
      (placement) => clubKey(placement.team.club) === "haraya",
    );
    assert.equal(haraya.length, 4);
    assert.equal(
      new Set(haraya.map((placement) => placement.bracketIndex)).size,
      4,
    );
  });

  it("splits the sample cup so no club shares a bracket", () => {
    const teams = teamsFrom(SAMPLE_TEAMS);
    const placements = planDraw(teams, 4, mulberry32(7));
    assert.equal(findClashes(placements).length, 0);
    assertFair(teams, 4, 7);
    const sizes = [0, 0, 0, 0];
    for (const placement of placements) sizes[placement.bracketIndex] += 1;
    assert.deepEqual(sizes, [4, 4, 4, 4]);
  });

  it("treats club names as the same regardless of case", () => {
    const teams = teamsFrom([
      { name: "A", club: "Apex" },
      { name: "B", club: "apex" },
    ]);
    const placements = planDraw(teams, 2, mulberry32(1));
    assert.notEqual(placements[0]?.bracketIndex, placements[1]?.bracketIndex);
    assert.equal(findClashes(placements).length, 0);
  });

  it("lets teams without a club share a bracket", () => {
    const teams = teamsFrom([
      { name: "A", club: "" },
      { name: "B", club: "   " },
      { name: "C", club: "" },
    ]);
    const placements = planDraw(teams, 2, mulberry32(3));
    assert.equal(findClashes(placements).length, 0);
    assertFair(teams, 2, 3);
  });

  it("spreads an oversized club as evenly as the bracket count allows", () => {
    const teams = teamsFrom([
      { name: "A", club: "West End" },
      { name: "B", club: "West End" },
      { name: "C", club: "West End" },
      { name: "D", club: "West End" },
      { name: "E", club: "West End" },
    ]);
    const placements = planDraw(teams, 4, mulberry32(4));
    const counts = [0, 0, 0, 0];
    for (const placement of placements) counts[placement.bracketIndex] += 1;
    assert.deepEqual(
      counts.slice().sort((a, b) => a - b),
      [1, 1, 1, 2],
    );
    assert.equal(overflowClubs(teams, 4).length, 1);
    assert.equal(overflowClubs(teams, 4)[0]?.club, "West End");
  });

  it("stays fair across random fields", () => {
    for (let seed = 1; seed <= 80; seed++) {
      const rng = mulberry32(seed);
      const clubCount = 1 + Math.floor(rng() * 7);
      const clubs = Array.from(
        { length: clubCount },
        (_, index) => `Club ${index}`,
      );
      const teamCount = 2 + Math.floor(rng() * 36);
      const teams: DrawTeam[] = [];
      for (let index = 0; index < teamCount; index++) {
        const blank = rng() < 0.12;
        teams.push({
          id: `s${seed}-t${index}`,
          name: `Team ${index}`,
          club: blank
            ? ""
            : (clubs[Math.floor(rng() * clubs.length)] ?? "Club 0"),
        });
      }
      const bracketCount = 2 + Math.floor(rng() * 7);
      assertFair(teams, bracketCount, seed + 1000);
    }
  });

  it("changes the draw when ties can break either way", () => {
    const teams = teamsFrom(SAMPLE_TEAMS);
    const first = JSON.stringify(planDraw(teams, 4, mulberry32(1)));
    const differed = Array.from({ length: 24 }, (_, index) =>
      JSON.stringify(planDraw(teams, 4, mulberry32(index + 2))),
    ).some((value) => value !== first);
    assert.equal(differed, true);
  });

  it("repeats the same draw for the same seed", () => {
    const teams = teamsFrom(SAMPLE_TEAMS);
    assert.deepEqual(
      planDraw(teams, 4, mulberry32(11)),
      planDraw(teams, 4, mulberry32(11)),
    );
  });
});

describe("wheel math", () => {
  it("stops inside the segment it was aiming for", () => {
    for (const count of [2, 4, 7, 16]) {
      for (let segment = 0; segment < count; segment++) {
        assert.equal(
          segmentAtPointer(centeredRotation(segment, count), count),
          segment,
        );
        let rotation = 0.4;
        const rng = mulberry32(segment * 17 + count);
        for (let spin = 0; spin < 5; spin++) {
          rotation = landingRotation(rotation, segment, count, rng);
          assert.equal(segmentAtPointer(rotation, count), segment);
        }
      }
    }
  });
});

describe("entry parsing", () => {
  it("reads team and club from commas, pipes, and tabs", () => {
    const parsed = parseBulkLines(`
      Night Owls, Apex
      Red, Blue Pandas, Harbor
      Storm | Metro
      Thunder\tMetro

      Lone Wolf
    `);
    assert.deepEqual(parsed, [
      { name: "Night Owls", club: "Apex" },
      { name: "Red, Blue Pandas", club: "Harbor" },
      { name: "Storm", club: "Metro" },
      { name: "Thunder", club: "Metro" },
      { name: "Lone Wolf", club: "" },
    ]);
  });

  it("describes even and uneven brackets", () => {
    assert.equal(bracketSizeLabel(0, 4), "Add teams to see group sizes");
    assert.equal(bracketSizeLabel(16, 4), "4 teams in each bracket");
    assert.equal(bracketSizeLabel(15, 4), "3 or 4 teams in each bracket");
  });

  it("formats a copyable result without an empty club suffix", () => {
    const text = formatResults(
      [
        {
          team: { id: "1", name: "Night Owls", club: "Apex" },
          bracketIndex: 0,
        },
        {
          team: { id: "2", name: "Drift", club: "" },
          bracketIndex: 1,
        },
      ],
      2,
      "Club Cup",
    );
    assert.equal(
      text,
      [
        "Club Cup",
        "",
        "Bracket A",
        "  Night Owls (Apex)",
        "",
        "Bracket B",
        "  Drift",
      ].join("\n"),
    );
  });

  it("writes the finished brackets as csv and a safe file name", () => {
    const csv = formatResultsCsv(
      [
        {
          team: { id: "1", name: 'Red, "Blue" Pandas', club: "Harbor" },
          bracketIndex: 0,
        },
        {
          team: { id: "2", name: "Drift", club: "" },
          bracketIndex: 1,
        },
      ],
      3,
    );
    assert.equal(
      csv,
      [
        "Bracket,Team,Club",
        'Bracket A,"Red, ""Blue"" Pandas",Harbor',
        "Bracket B,Drift,",
        "Bracket C,,",
      ].join("\n"),
    );
    assert.equal(resultsFileBase("ACE ZONE!"), "ace-zone");
    assert.equal(resultsFileBase("---"), "bracket-draw");
    assert.equal(resultsFileBase("  "), "bracket-draw");
  });

  it("rejects a saved draft that is not a team list", () => {
    assert.equal(parseDraft("not json"), null);
    const draft = parseDraft(
      JSON.stringify({
        eventName: "  Cup  ",
        bracketCount: 99,
        teams: [
          { id: "a", name: "  Owls  ", club: " Apex " },
          { name: "   ", club: "Nope" },
        ],
      }),
    );
    assert.equal(draft?.eventName, "Cup");
    assert.equal(draft?.bracketCount, 16);
    assert.deepEqual(draft?.teams, [{ id: "a", name: "Owls", club: "Apex" }]);
  });
});
