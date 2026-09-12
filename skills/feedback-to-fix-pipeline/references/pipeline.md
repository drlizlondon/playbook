# Part 2 — the fix-flow runner contract

This is the contract for the agent that turns captured feedback into gated fixes.
Run it as a scheduled task (e.g. every few hours) **or** let whatever coordinator
agent session is live run it — the register (below) is the deconfliction point
either way, so the two never collide.

Adapt the router and the ship policy to your own repos. Keep the guardrails.

## Flow

```
inbox file (## Open)  →  route  →  classify  →  [bug] dispatch branch-only fix agent
                                             →  [else] record the right status
                      →  update the register  →  coordinator gates  →  human ships
```

## Mode (start here)

- **AUTO_SHIP = OFF (fix-and-hold).** The loop auto-*dispatches* fix agents and
  *gates* their branches, but it does **not deploy**. A human ships. Flip AUTO_SHIP
  → ON only after you have watched one full clean cycle, and only for the narrow
  allowlist below. Rationale: a brand-new loop triggered by a phone message must
  not have "unsupervised production deploy" as an available first move.

## Router (keyword → repo)

Define a keyword→repo map for your own projects, e.g.:

```
planner / calendar / schedule   → ~/code/planner
shop / checkout / cart          → ~/code/store
<health / money / auth repos>   → MARK HUMAN-ONLY, never auto-dispatch
unclear                         → record "needs your decision" (ask, don't guess)
```

Route by the clearest keyword; if two match, prefer the more specific. If nothing
matches, do not guess a repo — record it for a human.

## Classification (decides what happens)

- **bug** — a clear defect with reproducible wrong behaviour → dispatch a fix agent.
- **UX / visual** — layout, legibility, sizing, spacing → record "needs your eye."
  **Visual work never auto-codes and never auto-ships** — green tests ≠ looks right.
- **feature** — a new capability → record "needs your decision" (don't build on a
  one-line request).
- **question** — answer it and record the answer.
- **needs-repro** — a bug you can't reproduce from the text → record it and ask for
  a repro or screenshot.

## Dispatch policy (per clear bug)

- One fix agent per item, in its **own worktree off the deploy branch** — never the
  shared checkout, never a blanket `git add -A` (stage intended paths only).
- **Branch-only.** Gate on the repo's real exit bar and read the **unpiped** exit
  code (`$?`), not a piped pipeline's.
- The agent fixes the bug and **surfaces anything ambiguous; it never redesigns.**
- Record `🔧 agent-dispatched → 🧪 fix-drafted (branch + commit)` in the register.

## Ship policy

- **Auto-ship allowlist (only when AUTO_SHIP = ON):** a short list of low-risk repos
  (e.g. a static site, a hobby app) — and **only** for a *functional bug-fix with a
  passing test* that clears the coordinator's own re-run of the canonical gate.
- **Hold-for-human always:** anything with live payments, real user data, health
  data, owner-gated access, or a manual publish step. Deploys there are a human
  click.
- **Visual / UX changes NEVER auto-ship**, even in an allowlisted repo.

## Guardrails (hard)

- **Re-run the canonical gate yourself** before trusting any fix — never ship on a
  subagent's "tests are green." A subagent can pass a direct test runner while
  bypassing the repo's real exit-bar; run the repo's own gate command and read its
  unpiped exit code.
- **Single-executor:** check the register **before** dispatching — never
  double-dispatch an item already `🔧`/`🧪`. When a coordinator session is live it
  owns triage; the scheduled runner is the fallback for when none is.
- **No destructive or outward actions, ever:** no deletes, emails, posts, purchases,
  DNS/domain changes, live SQL, or provider deploys from the runner. Credentials
  stay the human's.
- **Sensitive repos are human-only** — never auto-dispatched.
- **Never touch uncommitted changes you don't recognise** — pause and record a
  blocker instead.

## Runner steps (each cycle)

1. Read the inbox `## Open` items. For each not already in the register: add a row,
   route it, classify it.
2. For each clear **bug** in an eligible repo not already in flight: dispatch one
   branch-only fix agent; mark `🔧`.
3. For **UX / feature / question / needs-repro / unclear**: record the right status;
   do **not** code.
4. Update the register; write a one-line summary of what changed. If nothing is new,
   stop immediately (don't churn).
5. **Never auto-ship while AUTO_SHIP = OFF.** When ON, ship only per the ship policy,
   after re-running the canonical gate yourself.
