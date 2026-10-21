export type DrawTeam = {
  id: string;
  name: string;
  club: string;
};

export type Placement = {
  team: DrawTeam;
  bracketIndex: number;
};

export type Draft = {
  eventName: string;
  bracketCount: number;
  teams: DrawTeam[];
};

export type ClubClash = {
  bracketIndex: number;
  club: string;
  count: number;
};

export type ClubTally = {
  club: string;
  count: number;
};

export const STORAGE_KEY = "bracket-draw-v1";
export const MIN_BRACKETS = 2;
export const MAX_BRACKETS = 16;
export const MAX_TEAMS = 200;

export function clampBracketCount(value: number): number {
  if (!Number.isFinite(value)) return 4;
  return Math.min(MAX_BRACKETS, Math.max(MIN_BRACKETS, Math.round(value)));
}

export function cleanLabel(value: string, max: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

export function clubKey(club: string): string | null {
  const cleaned = cleanLabel(club, 80);
  if (!cleaned) return null;
  return cleaned.toLocaleLowerCase();
}

export function createId(): string {
  return crypto.randomUUID();
}

export function cryptoRng(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 4294967296;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function unit(rng: () => number): number {
  const value = rng();
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 0.999999999999;
  return value;
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(unit(rng) * (i + 1));
    const current = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = current;
  }
  return arr;
}

function pickIndex(length: number, rng: () => number): number {
  if (length <= 1) return 0;
  return Math.min(length - 1, Math.floor(unit(rng) * length));
}

export function bracketLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export function bracketName(index: number): string {
  return `Bracket ${bracketLetter(index)}`;
}

export function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** Rotation that parks the middle of a segment under the top pointer. */
export function centeredRotation(
  segmentIndex: number,
  segmentCount: number,
): number {
  const slice = (Math.PI * 2) / segmentCount;
  return -((segmentIndex + 0.5) * slice);
}

export function segmentAtPointer(
  rotation: number,
  segmentCount: number,
): number {
  const slice = (Math.PI * 2) / segmentCount;
  const raw = mod(-rotation, Math.PI * 2) / slice;
  return Math.floor(raw + 1e-9) % segmentCount;
}

/** Spin forward and stop inside the chosen segment, a little off dead center. */
export function landingRotation(
  current: number,
  segmentIndex: number,
  segmentCount: number,
  rng: () => number,
): number {
  const slice = (Math.PI * 2) / segmentCount;
  const jitter = (unit(rng) - 0.5) * slice * 0.55;
  const desired = mod(-(segmentIndex + 0.5) * slice + jitter, Math.PI * 2);
  let delta = desired - mod(current, Math.PI * 2);
  if (delta <= 0) delta += Math.PI * 2;
  const turns = 4 + Math.floor(unit(rng) * 3);
  return current + turns * Math.PI * 2 + delta;
}

type ClubGroup = {
  key: string | null;
  teams: DrawTeam[];
};

/**
 * Deal teams into brackets.
 * Larger clubs go first so clubmates spread out before open spots fill.
 * A bracket is skipped when another bracket still has fewer teams from that
 * club, then fewer teams overall. Ties are random.
 */
export function planDraw(
  teams: readonly DrawTeam[],
  bracketCount: number,
  rng: () => number = cryptoRng,
): Placement[] {
  const count = clampBracketCount(bracketCount);
  if (teams.length === 0) return [];

  const byClub = new Map<string, DrawTeam[]>();
  const solos: DrawTeam[] = [];
  for (const team of teams) {
    const key = clubKey(team.club);
    if (!key) {
      solos.push(team);
      continue;
    }
    const list = byClub.get(key);
    if (list) list.push(team);
    else byClub.set(key, [team]);
  }

  let groups: ClubGroup[] = [
    ...[...byClub.entries()].map(([key, list]) => ({
      key,
      teams: shuffle(list, rng),
    })),
    ...solos.map((team) => ({ key: null, teams: [team] })),
  ];
  groups = shuffle(groups, rng);
  groups.sort((a, b) => b.teams.length - a.teams.length);

  const buckets: DrawTeam[][] = Array.from({ length: count }, () => []);
  const clubCounts = new Map<string, number[]>();

  for (const group of groups) {
    for (const team of group.teams) {
      let bestClub = Number.POSITIVE_INFINITY;
      let bestSize = Number.POSITIVE_INFINITY;
      const options: number[] = [];
      for (let index = 0; index < count; index++) {
        const same = group.key ? (clubCounts.get(group.key)?.[index] ?? 0) : 0;
        const size = buckets[index]!.length;
        if (same < bestClub || (same === bestClub && size < bestSize)) {
          bestClub = same;
          bestSize = size;
          options.length = 0;
          options.push(index);
        } else if (same === bestClub && size === bestSize) {
          options.push(index);
        }
      }
      const chosen = options[pickIndex(options.length, rng)]!;
      buckets[chosen]!.push(team);
      if (group.key) {
        const counts =
          clubCounts.get(group.key) ?? Array.from({ length: count }, () => 0);
        counts[chosen] = (counts[chosen] ?? 0) + 1;
        clubCounts.set(group.key, counts);
      }
    }
  }

  const placements: Placement[] = [];
  buckets.forEach((bucket, bracketIndex) => {
    for (const team of bucket) placements.push({ team, bracketIndex });
  });
  return placements;
}

export function findClashes(placements: readonly Placement[]): ClubClash[] {
  const map = new Map<string, ClubClash>();
  for (const placement of placements) {
    const key = clubKey(placement.team.club);
    if (!key) continue;
    const id = `${key}::${placement.bracketIndex}`;
    const prev = map.get(id);
    if (prev) prev.count += 1;
    else {
      map.set(id, {
        bracketIndex: placement.bracketIndex,
        club: cleanLabel(placement.team.club, 80),
        count: 1,
      });
    }
  }
  return [...map.values()]
    .filter((clash) => clash.count > 1)
    .sort(
      (a, b) => a.bracketIndex - b.bracketIndex || a.club.localeCompare(b.club),
    );
}

export function clubTallies(teams: readonly DrawTeam[]): ClubTally[] {
  const map = new Map<string, ClubTally>();
  for (const team of teams) {
    const key = clubKey(team.club);
    if (!key) continue;
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else map.set(key, { club: cleanLabel(team.club, 80), count: 1 });
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.club.localeCompare(b.club),
  );
}

export function overflowClubs(
  teams: readonly DrawTeam[],
  bracketCount: number,
): ClubTally[] {
  const count = clampBracketCount(bracketCount);
  return clubTallies(teams).filter((tally) => tally.count > count);
}

export function unaffiliatedCount(teams: readonly DrawTeam[]): number {
  return teams.filter((team) => clubKey(team.club) === null).length;
}

export function bracketSizeLabel(
  teamCount: number,
  bracketCount: number,
): string {
  if (teamCount === 0) return "Add teams to see group sizes";
  const count = clampBracketCount(bracketCount);
  const min = Math.floor(teamCount / count);
  const max = Math.ceil(teamCount / count);
  if (min === max) {
    return `${max} ${max === 1 ? "team" : "teams"} in each bracket`;
  }
  return `${min} or ${max} teams in each bracket`;
}

export function groupTeamsForList(
  teams: readonly DrawTeam[],
): { club: string; teams: DrawTeam[] }[] {
  const map = new Map<string, { club: string; teams: DrawTeam[] }>();
  const solos: DrawTeam[] = [];
  for (const team of teams) {
    const key = clubKey(team.club);
    if (!key) {
      solos.push(team);
      continue;
    }
    const prev = map.get(key);
    if (prev) prev.teams.push(team);
    else map.set(key, { club: cleanLabel(team.club, 80), teams: [team] });
  }
  const groups = [...map.values()].sort(
    (a, b) => b.teams.length - a.teams.length || a.club.localeCompare(b.club),
  );
  if (solos.length > 0) groups.push({ club: "", teams: solos });
  return groups;
}

export function parseBulkLines(text: string): { name: string; club: string }[] {
  const entries: { name: string; club: string }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let name = line;
    let club = "";
    if (line.includes("\t")) {
      const [first, ...rest] = line.split("\t");
      name = first ?? "";
      club = rest.join(" ");
    } else if (line.includes("|")) {
      const [first, ...rest] = line.split("|");
      name = first ?? "";
      club = rest.join("|");
    } else {
      const comma = line.lastIndexOf(",");
      if (comma !== -1) {
        name = line.slice(0, comma);
        club = line.slice(comma + 1);
      }
    }
    const cleanedName = cleanLabel(name, 80);
    if (!cleanedName) continue;
    entries.push({ name: cleanedName, club: cleanLabel(club, 80) });
  }
  return entries;
}

export function formatResults(
  placements: readonly Placement[],
  bracketCount: number,
  eventName: string,
): string {
  const count = clampBracketCount(bracketCount);
  const lines: string[] = [];
  const title = cleanLabel(eventName, 80);
  if (title) lines.push(title, "");
  for (let index = 0; index < count; index++) {
    lines.push(bracketName(index));
    const group = placements.filter(
      (placement) => placement.bracketIndex === index,
    );
    if (group.length === 0) {
      lines.push("  (empty)");
    } else {
      for (const placement of group) {
        const club = cleanLabel(placement.team.club, 80);
        lines.push(
          club
            ? `  ${placement.team.name} (${club})`
            : `  ${placement.team.name}`,
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function sanitizeTeams(value: unknown): DrawTeam[] {
  if (!Array.isArray(value)) return [];
  const teams: DrawTeam[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name =
      typeof record.name === "string" ? cleanLabel(record.name, 80) : "";
    if (!name) continue;
    const club =
      typeof record.club === "string" ? cleanLabel(record.club, 80) : "";
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id
        : createId();
    teams.push({ id, name, club });
  }
  return teams.slice(0, MAX_TEAMS);
}

export function parseDraft(raw: string): Draft | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const record = data as Record<string, unknown>;
    return {
      eventName:
        typeof record.eventName === "string"
          ? cleanLabel(record.eventName, 60)
          : "",
      bracketCount: clampBracketCount(
        typeof record.bracketCount === "number" ? record.bracketCount : 4,
      ),
      teams: sanitizeTeams(record.teams),
    };
  } catch {
    return null;
  }
}

export function overflowSentence(
  tally: ClubTally,
  bracketCount: number,
): string {
  const count = clampBracketCount(bracketCount);
  const most = Math.ceil(tally.count / count);
  return `${tally.club} has ${tally.count} teams and there are ${count} brackets, so the closest split puts ${most} in a bracket.`;
}
