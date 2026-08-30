# Rule: Conversations continue autonomously

*A self-contained rule for Claude Code setups. Adopt by copying the three pieces below; share freely.*

## The rule

Work does not die when a session does. Any session that begins executing a **specced task** — a work package with written acceptance criteria — registers it in a continue queue *at the start of the work*, and clears it only when the acceptance test passes. A scheduled runner sweeps the queue every few hours and resumes whatever is live. Rate limits, crashes, and closed laptops therefore pause work; they never lose it.

Only specced work runs unattended. Conversational, planning, and exploratory sessions queue nothing — autonomy is earned by having acceptance criteria, not assumed.

## The three pieces

**1. The queue file** — `~/.claude/continue-queue.md`:

- An `## Active` section of entries: repo path; task reference; the acceptance test that means done; a Progress line.
- A `## Done` section entries move to when complete.
- A written contract at the top: the runner takes only the first Active entry, obeys the target repo's own rules, never starts unlisted work, never adds entries itself, never reverts changes it doesn't recognise, and writes blockers instead of improvising.

**2. The standing instruction** — in `~/.claude/CLAUDE.md` (auto-loaded by every session):

> When you BEGIN executing a specced work package, add or update its queue entry immediately — queue on start, clear on completion — so interrupted work resumes automatically. Conversational/planning/exploratory sessions queue nothing.

Queue-on-start is the load-bearing detail: a session killed by a rate limit cannot write a handoff at the end, so the handoff must already exist before the work begins.

**3. The scheduled runner** — a Claude Code scheduled task (cron `0 */6 * * *`) whose prompt is, in essence:

> Read the queue. Empty → stop immediately, one line of output. Otherwise take the first Active entry, read the target repo's CLAUDE.md and session protocol, check `git status`, and continue the task exactly as specced — implement, don't redesign. Commit per the repo's protocol. Update Progress; move to Done when the acceptance test passes. Never queue new work, never push to remotes, never take outward-facing actions (emails, posts, purchases, publishing). If blocked, write the blocker and stop.

## The safety properties (why this is sane)

- **Consent is structural**: only what enters the queue runs unattended, and the human can veto any entry by deleting it or saying "don't auto-continue this."
- **Scope is bounded**: the runner inherits each repo's own standing rules; one task per run; no outward-facing side effects, ever.
- **Failure is legible**: blockers are written down, not improvised around.

## Known limits

Scheduled tasks run while the Claude app is open (a missed slot fires on next launch) — leave the app running for overnight progress. Each run consumes normal usage from your plan's window.
