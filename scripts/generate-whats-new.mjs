#!/usr/bin/env node
// Issue #108: generate public/whats-new.json from GitHub issues.
//
// Pulls issues labeled `whats-new` in the given milestone, extracts each one's
// `## What's New` section (issue title as fallback), and writes the banner JSON.
// Run by .github/workflows/whats-new.yml when a milestone closes (GITHUB_TOKEN
// is provided automatically there), or locally:
//
//   GITHUB_TOKEN=$(gh auth token) node scripts/generate-whats-new.mjs "Milestone Title"
//
import { writeFileSync } from 'node:fs';
import { extractWhatsNewSection } from '../src/utils/whatsNewParser.js';

const REPO = process.env.GITHUB_REPOSITORY || 'jstallin/backhaul-matcher';
const TOKEN = process.env.GITHUB_TOKEN;
const milestoneTitle = process.argv[2];

if (!TOKEN) { console.error('GITHUB_TOKEN is required'); process.exit(1); }
if (!milestoneTitle) { console.error('Usage: generate-whats-new.mjs "<milestone title>"'); process.exit(1); }

const gh = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json();
};

// Resolve the milestone number from its title (closed or open — manual runs may
// regenerate for an already-closed milestone).
const milestones = await gh(`/repos/${REPO}/milestones?state=all&per_page=100`);
const milestone = milestones.find((m) => m.title === milestoneTitle);
if (!milestone) {
  console.error(`Milestone not found: "${milestoneTitle}"`);
  process.exit(1);
}

// All whats-new-labeled issues in the milestone (any state — a closed milestone's
// issues are closed; state filter kept broad so a manual pre-close run also works).
const issues = await gh(
  `/repos/${REPO}/issues?milestone=${milestone.number}&labels=whats-new&state=all&per_page=100`
);

const items = issues
  .filter((i) => !i.pull_request) // issues only, not PRs
  .map((i) => ({
    title: i.title,
    body: extractWhatsNewSection(i.body) || i.title,
    issue: i.number, // internal reference only — the banner does not render links
  }));

if (items.length === 0) {
  console.error(`No issues labeled 'whats-new' found in milestone "${milestoneTitle}" — nothing to write.`);
  process.exit(1);
}

const out = {
  version: milestone.title,
  date: new Date().toISOString().slice(0, 10),
  items,
};

writeFileSync(new URL('../public/whats-new.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote public/whats-new.json — "${out.version}", ${items.length} item(s)`);
