---
name: distill
description: Read past Claude Code sessions for the current project and synthesize a rules document (whatiknow.md) from the user's accumulated feedback — corrections, preferences, "don't"/"always" patterns. Use this skill whenever the user types `/distill`, asks to "distill my sessions", "extract rules from my chat history", "turn my Claude history into a rules file", "create a CLAUDE.md from past conversations", "summarize what I've been telling Claude", "surface my preferences", or any similar ask about turning accumulated chat feedback into a structured rules document. Also trigger when the user wants to capture their own taste or recurring feedback patterns into a reusable file. Runs entirely on the user's Claude subscription — never call the Anthropic API directly.
---

# distill

Turn the current project's Claude Code chat history into a rules file the user can keep using.

The user has been correcting Claude across many sessions ("don't use scale on hover", "max font weight is 600", "no em dashes"). All of that lives in `~/.claude/projects/<sanitized-cwd>/*.jsonl` as session transcripts. This skill reads those transcripts, filters them down to the user's actual feedback, and synthesizes a structured rules file called `whatiknow.md`.

## Critical: never use the Anthropic API

All synthesis happens inside the active Claude Code session via `Agent` tool calls (subagents). The user's Claude subscription pays for it.

**Never call the Anthropic API directly. Never read `ANTHROPIC_API_KEY`. Never import `@anthropic-ai/sdk`. Never fetch `api.anthropic.com`.** This is the user's hard rule. The whole reason this is a skill (not a CLI) is to stay on the subscription.

## Flow

1. **Preview** — run the extract script with sensible defaults to get summary stats.
2. **Confirm or customize** — show the user a one-line plan and three options (`y` / `customize` / `cancel`).
3. **Customize (only if asked)** — ask 4 questions, possibly re-run the extract with new flags.
4. **Synthesize** — spawn 4 parallel subagents (one per theme).
5. **Write** — combine sections into `whatiknow.md`.
6. **Report** — one short message with counts and next steps.

## Step 1: Preview

Find the script. Skill installs vary in location, so try in order:

1. `${HOME}/.claude/skills/distill/scripts/extract.mjs` (global, the default `npx skills add` location)
2. `$(pwd)/.claude/skills/distill/scripts/extract.mjs` (project-level install)
3. `${HOME}/.skills/distill/scripts/extract.mjs` (canonical multi-agent install)

```bash
SCRIPT="${HOME}/.claude/skills/distill/scripts/extract.mjs"
[ ! -f "$SCRIPT" ] && SCRIPT="$(pwd)/.claude/skills/distill/scripts/extract.mjs"
[ ! -f "$SCRIPT" ] && SCRIPT="${HOME}/.skills/distill/scripts/extract.mjs"
```

Run with default time window (6 months) and the default filter (`design`). The user's `--cwd` and `--filter` flags override the defaults.

```bash
node "$SCRIPT" --cwd "<user-cwd>" --since 6mo --filter design --output /tmp/distill-corpus.txt
```

If the user passed `--filter generic` to the slash command, use that instead. Generic mode keeps any message with a feedback signal (corrections, preferences) without requiring design vocabulary, so it works better for backend, data, or general-purpose feedback.

The script prints a JSON summary line:

```json
{"cwd":"...","projectDir":"...","sessionFiles":85,"messages":1925,"inWindow":1896,"filtered":365,"since":"6mo"}
```

Capture this. Counts go in the final rules file header and the user-facing report.

If the script errors with "couldn't read project dir", the user has no Claude Code sessions for that directory. Tell them which path was checked and stop.

Also check whether `whatiknow.md` (or whatever the user passed to `--output`) already exists. The presence of an existing file changes the customize flow (extend vs replace).

## Step 2: Show the plan and ask to confirm

Present this exact summary, with the live values filled in:

```
Found {sessionFiles} sessions, {messages} messages, {filtered} candidates after filtering.

Plan:
- Window: last {window}
- Themes: motion, visual, components, process (4 themes)
- Output: {output_path}{existing_note}

Run with these defaults?
```

Where `{existing_note}` is `" (will replace existing file)"` if a file is already there, otherwise empty.

Use the `AskUserQuestion` tool with three choices:

- `Run` — proceed with defaults, go to Step 4.
- `Customize` — go to Step 3.
- `Cancel` — stop, send a one-line "okay, didn't generate anything" message.

## Step 3: Customize (only if user picked Customize)

Ask the questions below in order. Use `AskUserQuestion` for each. Keep the multiple-choice options short and clear.

### Q1: Time window

**Question:** "How far back should I look?"

Options:
- `Last week` → re-run extract with `--since 7d`
- `Last month` → `--since 30d`
- `Last 6 months` (default) → `--since 6mo`
- `All time` → `--since all`

If the user picks something different from the default, re-run the extract script with the new `--since` value and capture the new summary numbers.

### Q2: Extend or replace (only if existing file)

If `whatiknow.md` (or the chosen output path) already exists, ask: "There's already a file at `{output_path}`. Extend it (add new rules only) or replace it (start fresh)?"

Options:
- `Extend (add new rules only)` → set `mode = "extend"`. Read the existing file's content; pass it to each subagent so they skip rules that are already there.
- `Replace (start fresh)` → set `mode = "replace"`. Ignore the existing file.

If no existing file, skip this question.

### Q3: Filter mode (only ask if filtered count looks low)

If the candidate count is below ~50 and the user's project doesn't look design-heavy, ask: "Most of your candidates got filtered out. Try the generic filter instead?" Default = no.

If they say yes, re-run extract with `--filter generic`.

Skip this question if the design filter already produced plenty of candidates (≥50).

### Q4: Themes

**Question:** "Which themes should the rules file cover?"

Options:
- `All four (motion, visual, components, process)` — default behavior, no detection.
- `Auto-detect from my sessions` — quickly scan the corpus to pick the most relevant 3-5 themes, then synthesize those.
- `Let me pick` — ask a follow-up `AskUserQuestion` with multi-select (motion, visual, components, code-patterns, copy, process). The expanded theme list is in the table below.

For auto-detect: read the corpus headers (first ~5KB) yourself in the main session. Look at the keyword density — design vocabulary (`hover`, `easing`, `font`, `color`) suggests motion/visual themes; backend vocabulary (`API`, `database`, `endpoint`, `schema`) suggests code-patterns/process themes. Pick the top 3-5 themes that match. Brief — don't read more than 5KB.

### Q5: Anything to emphasize?

This is free text, not multiple choice. Send a plain message:

> Anything specific you want me to make sure captures? (Type it, or just say "no thanks".)

Wait for the user's response. If they answer with anything other than "no", "no thanks", "nope", or similar, treat the response as an emphasis hint and pass it to every subagent prompt as an extra paragraph: "The user specifically asked you to make sure to capture: {hint}".

Skip this question entirely if the user wants to move fast — but default to asking it. Most users have at least one thing they care about that pure pattern-matching might miss.

## Step 4: Synthesize

Use the `Agent` tool with `subagent_type: "general-purpose"`. Send all theme calls in a single message so they run concurrently.

Each subagent prompt follows this template, with `{THEME_NAME}`, `{THEME_SCOPE}`, `{THEME_HEADER_EXAMPLES}`, `{EMPHASIS_HINT}`, and `{EXISTING_RULES_BLOCK}` filled in:

```
You are extracting design and craft rules from a user's accumulated Claude Code feedback.

Read the corpus at /tmp/distill-corpus.txt. It's filtered user messages joined with "---".

Your scope: extract rules about **{THEME_NAME}** — {THEME_SCOPE}.

Look for:
- Negative feedback ("don't", "no", "stop", "too fast/slow", "feels janky", "remove the X")
- Positive guidance ("always", "should", "prefer", "make it more X")
- Specific values mentioned (durations in ms, easing curves, spring stiffness/damping, hex codes, weight numbers)
- Patterns that appear multiple times across different messages

{EMPHASIS_HINT}

{EXISTING_RULES_BLOCK}

Output format: a flat markdown list of 20-50 concise rules. Each rule should be:
- One sentence in imperative form ("Use X" / "Never Y" / "Prefer X over Y")
- Optional **Why:** one-line follow-up if there's a non-obvious reason from the feedback
- Grouped under bold sub-headers like {THEME_HEADER_EXAMPLES}

Don't invent rules. Only extract what's actually grounded in the user's feedback. Consolidate duplicates. Preserve specific values when given. Skip anything ambiguous.

Return the markdown only — no preamble, no summary at the end. Start directly with the first sub-header.
```

Substitutions:

- `{EMPHASIS_HINT}`: if the user provided one in Q4, insert "The user specifically asked you to make sure to capture: {hint}". Otherwise leave blank.
- `{EXISTING_RULES_BLOCK}`: if mode is `extend`, insert the relevant existing section's rules with the line "Skip any rules that already appear below:\n\n{existing_section_content}". Otherwise leave blank.

### Theme parameters

| Theme key | Theme name | Scope | Header examples |
|-----------|------------|-------|-----------------|
| motion | Motion & Animation | easing curves, durations, transitions, hover/tap states, drag and gestures, drawer/modal motion, stagger and sequencing, page transitions, spring physics, blur-fade vs morph, what feels janky vs smooth | `**Easing & timing**`, `**Hover & tap states**`, `**Drag & gestures**`, `**Drawer/modal motion**`, `**Stagger & sequencing**`, `**Page transitions**`, `**Blur-fade vs morph**`, `**Spring physics**` |
| visual | Visual Craft | typography, colors, gradients, shadows, borders, radius, spacing, alignment, image/video treatment, copy/voice/punctuation | `**Typography**`, `**Color & palette**`, `**Borders & radius**`, `**Shadows & elevation**`, `**Spacing**`, `**Alignment**`, `**Imagery & video**`, `**Copy & writing tone**` |
| components | Components | buttons, sliders, tabs, modals, drawers, tooltips, popovers, dropdowns, toggles, inputs, scrollbars, navigation, toolbars, panels, cards | `**Buttons**`, `**Tabs & toggles**`, `**Sliders**`, `**Modals & drawers**`, `**Tooltips & popovers**`, `**Inputs & controls**`, `**Navigation & toolbars**`, `**Cards & panels**`, `**Layout**` |
| process | Implementation & Process | library and framework preferences, asset handling, performance, scope discipline, commit hygiene, verification, response style, things never to do without permission | `**Libraries & frameworks**`, `**Assets**`, `**Performance**`, `**Scope & commits**`, `**Verification**`, `**Response style**`, `**Never without permission**` |
| code-patterns | Code Patterns | API design, data shapes, error handling, function structure, types, libraries used | `**API design**`, `**Data shapes**`, `**Error handling**`, `**Types**` |
| copy | Copy & Voice | writing tone, banned words, capitalization, punctuation, tweet structure, marketing avoidance | `**Voice**`, `**Banned vocabulary**`, `**Capitalization**`, `**Punctuation**` |

Use only the themes the user picked (or auto-detect chose). Don't pad with empty sections.

## Step 5: Combine and write `whatiknow.md`

When all subagents return, combine the sections into one file. The structure depends on mode:

### Replace mode (or no existing file)

```markdown
# What I know

A rules document distilled from {N_SESSIONS} Claude Code sessions and {N_MESSAGES} user messages ({N_FILTERED} matched the feedback filter, window: {window}).

Project: `{CWD}`
Generated: {YYYY-MM-DD}

---

## {Theme 1 Name}

{theme 1 subagent output}

---

## {Theme 2 Name}

{theme 2 subagent output}

---

(... etc for each theme)
```

### Extend mode

Don't replace the file. Append a new dated section to the end:

```markdown
---

## Added {YYYY-MM-DD}

(new rules from each theme that weren't in the existing file, grouped by theme as sub-sub-sections)
```

If extend mode produces zero new rules across all themes (because everything was already captured), tell the user "no new rules found in the {window} window" and don't modify the file.

Write to the path the user specified. Default: `./whatiknow.md` in their pwd. Create parent directories if they don't exist.

## Step 6: Report

Send a single short message to the user. Three sentences max:

- One sentence: counts (sessions, messages, candidates, window).
- One sentence: what was written and where.
- One sentence: what to do next.

Example:

> Read 85 sessions and 1,925 messages from the last 6 months — 365 matched the feedback filter. Wrote 47 rules across 4 themes to `./whatiknow.md`. Read it, edit anything that looks wrong, and drop it in your project's CLAUDE.md if you want it to apply automatically.

For extend mode, frame it differently:

> Found 12 new rules in the last 30 days that weren't already in your `whatiknow.md`. Appended them under "Added 2026-04-26". Same advice — review and trim before committing.

Don't narrate the steps. Don't list each subagent finishing. Don't dump the corpus. The user just wants the file.

## What not to do

- Never call the Anthropic API directly (covered above, but it's important enough to repeat).
- Don't write any file other than `whatiknow.md` and the temp corpus at `/tmp/distill-corpus.txt`.
- Don't commit, push, or modify git state.
- Don't extend rules with content not grounded in the user's feedback. If a theme produces nothing, omit it.
- Don't dump corpus messages back to the user. They're noisy.
- Don't ask the customize questions if the user picked `Run`. Defaults are good for the common case.
- Don't ask the emphasize question (Q4) if the user is moving fast or has already answered the previous questions tersely. Read the room.

## Edge cases

**No sessions found.** Script errors because `~/.claude/projects/<sanitized-cwd>/` doesn't exist. Tell the user the path that was checked and suggest they `cd` into a project that has Claude Code history. Stop.

**Very few filtered messages (<20).** Synthesis produces thin output. Run anyway, but flag in the report: "rules file is sparse — will improve as you accumulate more sessions."

**Very large corpus (>300KB).** Spawn subagents anyway. Mention in the report that synthesis may have missed some patterns and they can re-run with `--themes` narrowed.

**User overrides output path to a non-existent directory.** Create the parent directory, then write. Don't error.

**Empty Q4 response or "skip"/"no"/"nope".** Treat as no emphasis. Don't pass anything extra to subagents.
