# distill

A Claude Code skill that reads your past sessions and turns them into a rules file you can keep using.

Claude Code saves every session you've ever had on your disk as plain JSON. Distill reads through those files, finds the do's and don'ts you've told Claude over time, and writes them into one file called `whatiknow.md`.

You can ask Claude to review new work against that file, or add it to your CLAUDE.md so Claude reads it at the start of every session.

Runs on your existing Claude subscription. No API key, no extra cost.

→ [example output](./examples/whatiknow.md)

## Install

```sh
npx skills add nomanjack/distill
```

Or have Claude install it for you:

```sh
npx -y skills add nomanjack/distill --yes --agent claude-code
```

## Use it

Inside any Claude Code session, from the project directory whose history you want to read:

```
/distill
```

Or just ask in plain language. Things like "distill my sessions", "what have I been telling Claude lately", or "extract rules from my chat history".

The skill shows a one-line plan and asks you to pick `run`, `customize`, or `cancel`. Pick `run` for the defaults (last 6 months, 4 themes, output to `./whatiknow.md`). Pick `customize` to choose the time window, the themes, extend mode, or to seed it with anything you want emphasized.

## How it works

1. The skill's local Node script reads your `.jsonl` session files from `~/.claude/projects/<sanitized-cwd>/`
2. Filters your messages for the do's and don'ts (corrections, preferences, "don't" and "always" patterns)
3. Spawns 4 parallel Claude subagents (motion, visual, components, process) inside your Claude Code session
4. Combines their output into one `whatiknow.md`

All the heavy work happens inside your active Claude Code session through subagents. No Anthropic API calls, no extra cost beyond your subscription.

## How it differs from CLAUDE.md and memory

Three different things, three different jobs:

- **CLAUDE.md** is what *you* tell Claude. You write it by hand. Claude reads it at the start of every session.
- **Memory** is what *Claude* figured out. Claude writes notes to itself across conversations.
- **whatiknow.md** is what *you've actually been correcting Claude on*, distilled from your past sessions. A snapshot, not a live document.

They don't compete. The output of distill can become the start of your CLAUDE.md, sit alongside it, or stay separate as a personal taste doc.

## A note on v0.1

The default filter is tuned for design and craft feedback. If you mostly use Claude for backend or data work, pass `--filter generic` to skip the design-vocab requirement and capture broader feedback.

```
/distill --filter generic
```

Filter improvements are first on the v0.2 list. PRs welcome.

## License

MIT
