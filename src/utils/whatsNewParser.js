// Issue #108: extract the user-facing "What's New" blurb from a GitHub issue body.
// Convention: everything under a `## What's New` heading (until the next heading
// or end of body) is the announcement copy. Falls back to null when the section
// is absent — the generator then uses the issue title.
// Pure function: shared by scripts/generate-whats-new.mjs (build tooling) and tests.

export function extractWhatsNewSection(body) {
  if (!body) return null;
  // Match "## What's New" (any heading level ≥ 2, case-insensitive, straight or curly apostrophe)
  const match = String(body).match(/^#{2,}\s*what[’']s\s+new\s*$/im);
  if (!match) return null;

  const start = match.index + match[0].length;
  const rest = String(body).slice(start);
  // Section ends at the next markdown heading or the end of the body.
  const next = rest.search(/^#{1,}\s/m);
  const section = (next === -1 ? rest : rest.slice(0, next)).trim();
  return section || null;
}
