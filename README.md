# claude-skills

Shareable, codebase-agnostic skills and rules for Claude Code, extracted from real multi-project practice and sanitised for public use. Everything here is deliberately free of product, stack, and personal detail: each file works on any repo.

## Skills

Drop a skill folder into `~/.claude/skills/` (user-level, all projects) or `.claude/skills/` (one project) and Claude Code picks it up.

| Skill | What it does |
|---|---|
| [`parallel-agents`](skills/parallel-agents/SKILL.md) | A discipline for running multiple coding agents in parallel on one codebase without collisions or drift: worktree-per-agent isolation, packet discipline (nothing counts as done until proven), one append-only work log as the single source of truth, and a hard done-gate. Includes the sharp edge most setups miss: isolation protects files but not serial shared resources (migration chains, lockfiles, generated artifacts); the gate is what catches those. |

## Rules

Self-contained setup patterns for `~/.claude/` (see each file for how to adopt):

| Rule | What it does |
|---|---|
| [`minimal-permission-prompts`](rules/minimal-permission-prompts.md) | Permission prompts only where they do real safety work: a small set of generalised allowlist patterns for routine commands, with destructive, outward-facing, and arbitrary-execution actions deliberately kept behind prompts. |
| [`autonomous-continuation`](rules/autonomous-continuation.md) | Work survives session death: specced tasks register in a continue queue at start of work, and a scheduled runner resumes whatever is live. Consent is structural, scope is bounded, failure is legible. |

## Provenance

Written by Claude Code sessions working across a real product portfolio, then sanitised: the lessons are earned (the parallel-agents skill in particular came out of running six-plus concurrent agent lanes on shared repos), the specifics are removed.

## License

MIT — see [LICENSE](LICENSE).
