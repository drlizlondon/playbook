# Night Shift

*A ritual for running coding agents unattended overnight (or through any stretch where the operator is unreachable). Developed in production across a multi-product portfolio; sanitised for public use. Pairs with the `autonomous-continuation` rule in this repository.*

## The problem

Unattended agent runs fail in two boring ways. Either the agent hits a permission prompt or a clarifying question at 2am and the whole night stalls behind it, or the agent barrels through decisions it should never have made alone. Both are solved by the same insight: **the boundary between "ask" and "act" must be drawn while the operator is still awake, not discovered at the moment of need.**

## The three phases

### Phase 1 — Setup (operator awake)

On a start trigger ("going to bed", "start the night shift"), before the operator leaves, the agent does one batched pass:

1. **The night manifest** — state what will be worked on tonight, so the operator can redirect while redirection is still cheap.
2. **Derive the permission surface** — the exact command patterns the planned work needs (which package manager, which test runner, which scripts).
3. **Pre-load the allowlist** — add the safe, *exact-form* patterns to the permission config. Never interpreter wildcards (`python3 *`, `bash *`): an exact form like `npx tsc --noEmit *` is a tool; a wildcard interpreter is arbitrary code execution wearing a permission's clothes.
4. **Smoke-test one command per new pattern** while the operator is there to approve, so the approval persists.
5. **Surface the gated actions as ONE explicit batch** — anything outbound (push, publish, deploy, send) stays gated by default; ask once, now, which if any are pre-authorised for the night. This is the only place a batch of permission questions is allowed.

### Phase 2 — Autonomous (operator unreachable)

From the operator's "good night" until morning:

- **Never ask, never wait.** A clarifying question is itself the overnight blocker. Take the strongest reasonable assumption, *record it*, and proceed.
- **Act-and-record, not ask-and-wait.** Genuine human decisions go to a `DECISIONS_REQUIRED` file — the decision, the options, a recommendation, the consequence of waiting, and what was completed meanwhile — then that branch of work is parked and the agent moves to the next most valuable task. A parked decision is never revisited unless new information resolves it.
- **No outbound actions** except those pre-authorised in Phase 1. Publishing, deploying, sending, purchasing, destructive deletion: prepared, never executed.
- **Keep the record live.** An overnight log, the decisions file, and the morning report are updated as work happens, so an abrupt cutoff still leaves a coherent handover. (Queue-on-start, from the `autonomous-continuation` rule, is the same idea: a dead session cannot write its own handoff after the fact.)
- **Verify before trusting old plans.** Check current state before continuing anything stale; a plan that was true yesterday is a hypothesis today.

### Phase 3 — Morning (operator returns)

Present the morning report: what is materially better, what was discovered, the decisions that need the operator, and what is blocked. A briefing, not an activity log. The test of a good night is that the operator wakes to *decisions*, not archaeology.

## What always stays gated, even overnight

Push to main · publish or deploy to live · send email/messages · post publicly · purchase · destructive deletion · exposing secrets. These are prepared for review, never executed autonomously. No exceptions for confidence.

## Lessons that cost a night each to learn

- **The flow-killer is any question, not just permission dialogs.** One well-meaning "should I…?" at midnight stops the line exactly as dead as a blocked command.
- **The supervisor needs its own heartbeat.** If the orchestrating session only wakes on notifications, a quiet stretch becomes an idle stretch. Schedule a periodic self-wake.
- **Workers must write output to disk early.** A session that dies holding its findings in conversation memory loses them; the deliverable's skeleton goes on disk in the first ten minutes, refinement after.
- **Agents ignore prohibitions but follow vocabularies.** "Don't use X" fails under pressure; "use exactly these allowed forms" works. Every dispatch carries the permitted-command list.
- **Toolchains rot silently.** A system package upgrade can break a critical script for weeks unnoticed. The setup phase smoke-tests the night's actual tools, not just its permissions.
