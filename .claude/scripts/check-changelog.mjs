#!/usr/bin/env node
// Claude Code PreToolUse hook: ensure changelog is updated before git tag
// Reads the hook payload as JSON from stdin. If the Bash command creates a
// version tag (git tag vX.Y.Z), verify that version exists in ChangelogView.vue.
//
// Exit codes: 0 = allow, 2 = block (stderr is fed back to Claude).
//
// Implemented in Node rather than bash on purpose: on Windows `bash` on PATH
// resolves to the WSL launcher, which rejects the CRLF line endings that
// core.autocrlf=true writes into the working tree.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const CHANGELOG_FILE = 'src/views/ChangelogView.vue';

// Must be read asynchronously: readFileSync(0) does not reliably drain a pipe
// on Windows, which would silently turn every check into a no-op.
async function readStdin() {
  const chunks = [];
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) chunks.push(chunk);
  return chunks.join('');
}

// Strip a leading BOM: some Windows shells prepend one when piping.
const raw = (await readStdin()).replace(/^﻿/, '');
if (!raw.trim()) process.exit(0);

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  // Malformed payload: never block on a hook parse failure.
  process.exit(0);
}

if (payload.tool_name !== 'Bash') process.exit(0);

const command = payload.tool_input?.command;
if (typeof command !== 'string') process.exit(0);

// Match `git tag` only where a command can actually start -- line start or
// after a separator. A bare substring search also fires on prose that merely
// mentions the command, e.g. a commit message documenting this very hook.
// Capture only that invocation's arguments so a version named elsewhere in the
// command line cannot be mistaken for the tag being created.
const invocation = command.match(/(?:^|[;&|(]|&&|\|\|)[ \t]*git[ \t]+tag\b([^\n;&|]*)/m);
if (!invocation) process.exit(0);

// Only version tags (v1.2.3) are guarded; flags may precede the tag name.
const match = invocation[1].match(/\bv\d+\.\d+\.\d+\b/);
if (!match) process.exit(0);

const version = match[0];
const changelogPath = resolve(payload.cwd ?? process.cwd(), CHANGELOG_FILE);

if (!existsSync(changelogPath)) {
  console.error('BLOCKED: ChangelogView.vue not found. Please create the changelog page first.');
  process.exit(2);
}

if (!readFileSync(changelogPath, 'utf8').includes(version)) {
  console.error(
    `BLOCKED: Version ${version} not found in ChangelogView.vue. ` +
      `Please add the changelog entry for ${version} and commit before tagging.`
  );
  process.exit(2);
}

process.exit(0);
