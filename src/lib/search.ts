import type { Attendee } from "./types";

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Typed words, split the same way names are so "O'Neil" and "Mary-Kate" match. */
export const queryTokens = (query: string) => normalize(query).split(/[\s'’-]+/).filter(Boolean);

/**
 * Every typed word has to start a word in the name, organization or email.
 * Results that match the first or last name from the start rank first.
 */
export function searchAttendees(roster: Attendee[], query: string): Attendee[] {
  const tokens = queryTokens(query);
  const byName = (a: Attendee, b: Attendee) =>
    normalize(a.lastName).localeCompare(normalize(b.lastName)) ||
    normalize(a.firstName).localeCompare(normalize(b.firstName));

  if (!tokens.length) return [...roster].sort(byName);

  const scored: { a: Attendee; score: number }[] = [];
  for (const a of roster) {
    const first = normalize(a.firstName);
    const last = normalize(a.lastName);
    const nameWords = `${first} ${last}`.split(/[\s'’-]+/).filter(Boolean);
    const otherWords = `${normalize(a.company)} ${normalize(a.email).replace(/[@.]/g, " ")}`.split(/\s+/).filter(Boolean);

    let score = 0;
    let ok = true;
    for (const t of tokens) {
      if (nameWords.some((w) => w.startsWith(t))) continue;
      if (otherWords.some((w) => w.startsWith(t))) {
        score += 2;
        continue;
      }
      ok = false;
      break;
    }
    if (!ok) continue;
    if (!first.startsWith(tokens[0]) && !last.startsWith(tokens[0])) score += 1;
    scored.push({ a, score });
  }
  return scored.sort((x, y) => x.score - y.score || byName(x.a, y.a)).map((s) => s.a);
}
