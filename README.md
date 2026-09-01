# The Playbook

I run a portfolio of products with AI coding agents — multiple agents working the same codebases, often while I sleep. That only works because of a small set of operational systems, and this repository gives them away: battle-tested, MIT-licensed, LLM-agnostic (developed in production with Claude Code; the patterns work with any coding agent).

Everything here is sanitised for public use — free of product, stack, and personal detail — but nothing here is theoretical. Each pattern exists because its absence broke something real.

## The four patterns

| Pattern | What it does | Born from |
|---|---|---|
| [**The Worktree Protocol**](patterns/worktree-protocol/README.md) | Two tiny git hooks that make it structurally impossible for parallel agents to corrupt each other's branches: main only advances by ff-only merge, and every checkout is claimed by exactly one branch. | A real mid-commit branch switch between two concurrent sessions. Zero collisions across ~15 agent lanes since. |
| [**Autonomous Continuation**](rules/autonomous-continuation.md) | The queue contract that means a crashed or rate-limited agent's work never evaporates: specced work registers in a continue queue *at the start* of work, and a scheduled runner resumes whatever is live. | The realisation that a dead agent cannot write its own handoff — so the handoff must exist before the work begins. |
| [**Minimal Permissions**](rules/minimal-permission-prompts.md) | The allowlist doctrine: a small set of generalised exact-form patterns pre-approve everything routine, while destructive, outward-facing, and arbitrary-execution actions deliberately keep their prompts. | An audit that found over a thousand sleepily-accumulated one-off grants — including `git push` pre-approved in five repos. Now a curated pattern set and near-zero prompts. |
| [**Night Shift**](patterns/night-shift.md) | The ritual for unattended overnight agent runs: front-load every approval while you're awake, act-and-record while you sleep, wake to decisions instead of archaeology. | Nights lost to a single 2am clarifying question — and the discovery that the ask/act boundary must be drawn before the operator leaves. |

## Install

Claude Code users can install everything as a plugin, with updates included:

```
/plugin marketplace add drlizlondon/playbook
/plugin install playbook@playbook
```

Or take any piece by hand: copy a skill folder into `~/.claude/skills/` (user-level) or `.claude/skills/` (per-project), and adopt the patterns by following each one's own instructions. The documents work as prompts for any capable agent.

## Skills

| Skill | What it does |
|---|---|
| [`parallel-agents`](skills/parallel-agents/SKILL.md) | The full discipline the Worktree Protocol anchors: worktree-per-agent isolation, packet discipline (nothing counts as done until proven), one append-only work log, and a hard done-gate — including the sharp edge isolation cannot protect: serial shared resources (migration chains, lockfiles, generated artifacts). |
| [`marketing-angles`](skills/marketing-angles/SKILL.md) | Evidence-grounded marketing angles and hooks for any product: researches real customer language, clusters it into themes with counter-signals, and ranks by breadth of evidence rather than repetition. Ships a zero-dependency compiler that derives every count, enforces the prevalence rule (forum chatter can never support a "most people" claim), and refuses runs that store identities or verbatim quotes. |
| [`safe-deploy`](skills/safe-deploy/SKILL.md) | The Calm Release procedure: ship a big backlog to a live product without fear — a verified backup, a mechanical block on data-destroying migrations, staged backend-then-frontend deploys, verification against the system's own gate rather than any report, and the human on every irreversible button. Born from a release where a live product had sat a month and tens of thousands of lines behind, shipped in a single session with the backup never needed. |

## The thread that connects everything

Constraints must be mechanical, not textual. Any rule an agent can satisfy while defeating its purpose eventually will be, and any rule that lives only in a prompt eventually falls out of context. So: git hooks instead of instructions, allowlists instead of vigilance, queue files instead of memory, compilers that refuse dishonest input instead of style guides that request honesty. The agents change; the mechanisms hold.

## License

MIT — see [LICENSE](LICENSE). If you're running agents on real products and want to compare notes, find me via the profile this repo belongs to.
