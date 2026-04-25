#!/usr/bin/env node
// Reads Claude Code session jsonl files for a given project,
// extracts user messages, filters for feedback signals,
// writes the filtered corpus to stdout (or a file).
// No LLM calls. No deps.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const FEEDBACK_SIGNALS =
  /\b(don'?t|never|stop|always|should|must|prefer|want|hate|dislike|wrong|broken|janky|clunky|ugly|weird|off|jarring|stiff|harsh|too (?:much|fast|slow|big|small|loud|sharp|dim|bright|many|aggressive|abrupt|long|short|wide|narrow|tight|loose))\b/i;

const DESIGN_VOCAB =
  /\b(animation|motion|transition|ease|easing|spring|bounce|fade|blur|scale|hover|tap|click|press|focus|font|weight|bold|italic|text|color|gradient|opacity|shadow|border|radius|padding|margin|gap|spacing|align|center|button|modal|drawer|tooltip|popover|dropdown|menu|tab|toggle|slider|input|polish|smooth|jank|snap|feel|micro|interaction|gesture|drag|swipe|stagger|duration|delay|fluid|tween|frame|crt|pixel|dither)\b/i;

const SHORT_CORRECTION =
  /\b(no|don'?t|stop|never|wrong|remove|kill|too |looks (off|wrong|bad|weird)|feels (off|wrong|bad|weird|janky|stiff|clunky|jarring))\b/i;

const NOISE = [
  /^Stop hook feedback:/i,
  /^<(system-reminder|local-command|command-name|command-message|command-args|local-command-stdout)/i,
  /^Caveat: The messages below were generated/i,
  /Pre(Tool)?Use hook/i,
  /Post(Tool)?Use hook/i,
  /^This session is being continued from a previous/i,
];

function sanitizeCwd(cwd) {
  // Claude Code sanitizes the cwd by replacing path separators with dashes.
  // On Unix that's `/`. On Windows the path may include `\` and a drive colon
  // like `C:\Users\foo` — handle both so the script works on either OS.
  return cwd.replace(/[/\\:]/g, "-");
}

function getProjectDir(cwd) {
  return join(homedir(), ".claude", "projects", sanitizeCwd(cwd));
}

function listSessions(projectDir) {
  return readdirSync(projectDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => join(projectDir, f));
}

function* extractUserMessages(filePath) {
  const content = readFileSync(filePath, "utf8");
  const sessionId = filePath.split("/").pop().replace(".jsonl", "");
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== "user" || entry.message?.role !== "user") continue;
    if (typeof entry.message.content !== "string") continue;
    const text = entry.message.content;
    if (!text.trim()) continue;
    yield { sessionId, content: text, timestamp: entry.timestamp };
  }
}

function isNoise(content) {
  const head = content.slice(0, 200);
  return NOISE.some((p) => p.test(head));
}

function isFeedback(c, filterMode) {
  const len = c.length;
  if (len < 8 || len > 4000) return false;
  if (isNoise(c)) return false;

  // Short messages with a clear corrective signal pass either way.
  if (len < 800 && SHORT_CORRECTION.test(c)) return true;

  if (filterMode === "generic") {
    // Generic mode: any feedback signal counts, no design vocab required.
    return FEEDBACK_SIGNALS.test(c);
  }
  // Default `design` mode: require both feedback signal AND design vocab
  // for longer messages, to avoid pulling in unrelated technical discussion.
  return FEEDBACK_SIGNALS.test(c) && DESIGN_VOCAB.test(c);
}

function parseSince(s) {
  if (!s || s === "all") return null;
  const m = s.match(/^(\d+)(d|w|mo|y)$/);
  if (!m) {
    throw new Error(
      `invalid --since value: ${s} (use 7d, 4w, 6mo, 1y, or all)`,
    );
  }
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const days = unit === "d" ? n : unit === "w" ? n * 7 : unit === "mo" ? n * 30 : n * 365;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function parseArgs(argv) {
  const opts = {
    cwd: process.cwd(),
    output: "-",
    json: false,
    sinceMs: null,
    sinceLabel: "all time",
    filter: "design",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") opts.cwd = argv[++i];
    else if (a === "--output" || a === "-o") opts.output = argv[++i];
    else if (a === "--json") opts.json = true;
    else if (a === "--since") {
      opts.sinceLabel = argv[++i];
      opts.sinceMs = parseSince(opts.sinceLabel);
    } else if (a === "--filter") {
      opts.filter = argv[++i];
      if (opts.filter !== "design" && opts.filter !== "generic") {
        throw new Error(
          `invalid --filter value: ${opts.filter} (use design or generic)`,
        );
      }
    } else if (a === "-h" || a === "--help") {
      console.log(
        `usage: extract.mjs [--cwd <path>] [--output <file|->] [--since <window>] [--filter <mode>] [--json]\n\n` +
          `defaults: --cwd <pwd>  --output -  --since all  --filter design  (- = stdout)\n` +
          `--since <window>: 7d, 30d, 4w, 6mo, 1y, or all\n` +
          `--filter <mode>: design (default, requires design/craft vocab on long messages) or generic (any corrective feedback)\n` +
          `--json: emit jsonl with {sessionId, content, timestamp} per line instead of plain corpus`,
      );
      process.exit(0);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = resolve(opts.cwd);
  const projectDir = getProjectDir(cwd);

  let sessionFiles;
  try {
    sessionFiles = listSessions(projectDir);
  } catch (e) {
    console.error(`couldn't read project dir: ${e.message}`);
    console.error(`expected sessions at: ${projectDir}`);
    process.exit(1);
  }

  const messages = [];
  for (const f of sessionFiles) {
    for (const m of extractUserMessages(f)) messages.push(m);
  }

  const inWindow = opts.sinceMs
    ? messages.filter((m) => {
        const t = Date.parse(m.timestamp);
        return Number.isFinite(t) && t >= opts.sinceMs;
      })
    : messages;

  const filtered = inWindow.filter((m) => isFeedback(m.content, opts.filter));

  const output = opts.json
    ? filtered.map((m) => JSON.stringify(m)).join("\n")
    : filtered.map((m) => m.content).join("\n---\n");

  const summary = {
    cwd,
    projectDir,
    sessionFiles: sessionFiles.length,
    messages: messages.length,
    inWindow: inWindow.length,
    filtered: filtered.length,
    since: opts.sinceLabel,
    filter: opts.filter,
  };

  if (opts.output === "-") {
    console.log(output);
    console.error(JSON.stringify(summary));
  } else {
    writeFileSync(opts.output, output);
    console.log(JSON.stringify(summary));
  }
}

main();
