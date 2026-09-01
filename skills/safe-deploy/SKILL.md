---
name: safe-deploy
description: Safely ship accumulated changes to a live product — the "Calm Release" procedure, drawn from a real release where a production version had sat frozen for a month with ~65,000 lines of finished work behind it, shipped in a single session with nothing broken. Take a verified backup, block irreversible data loss, deploy in staged verified steps, trust the system's own "done" gate over any report, and keep the human on the irreversible buttons. Use whenever deploying to production, shipping a backlog or a database migration, merging a big drifted branch, doing a first go-live, releasing AI-built work you didn't fully re-check, or whenever someone says "deploy this", "ship it", "safe deploy", "release to production", "go live", or is nervous about a live update.
---

# Safe Deploy — the Calm Release procedure

Shipping a big pile of changes to a live product is only scary when there's no
system. This is the system: five rules, in order, that make a giant release
calm because nothing can go wrong that you can't undo. It comes from a real
release — a live product frozen for a month, tens of thousands of lines of
finished work stacked behind it — shipped in a single session, with a backup
that was never needed.

## The prime directive (read before anything)

**The tools prepare and verify everything; a human presses the irreversible
buttons.** The backup, the production deploy, the migration apply, the push —
anything that leaves the machine or can't be undone — is a command a human runs.
The assistant drafts the exact command, watches the result, and confirms each
green checkpoint before the next. Never run an irreversible step autonomously,
even when asked to "just do it" — prepare it and hand it over.

## Before you start — establish ground truth (verify, never assume)

State these in one line each before touching anything:

1. **What's live vs what you're shipping.** The deployed version vs the target
   (e.g. production commit vs `main`): how many commits, how many lines, what
   span. Real numbers, measured — not estimated.
2. **Does it touch a production database?** List every new migration. Open each
   one's SQL and classify it (step 2 below). This decides whether it's an
   ordinary deploy or a governed one.
3. **How this project deploys.** Some hosts auto-deploy on push; a separate
   backend is often a manual step; migrations may run at container startup.
   Know the actual mechanism for *this* repo before you plan the order — read
   its deploy doc, don't guess.

If you can't answer these, stop and find out. A deploy planned on assumptions is
how the frontend ends up live against a backend that lacks its routes.

## The five rules (in order — do not skip, do not reorder)

### 1. Take a photo first (the human's gate)

If the deploy touches persistent data, take a **fresh** backup and **prove it
restores** before anything else moves.

- Draft the exact dump command for the human to run (they hold the credentials).
- Verify the backup isn't empty or blurry: list its contents / count them. A
  tiny count means it captured the wrong or an empty database — a backup that
  "succeeds" silently against the wrong target is the classic trap.
- Do not proceed past an unverified or empty backup.
- Skip this rule only when the deploy genuinely touches no persistent data.

### 2. Guard the one door you can't reopen

Before shipping any migration, inspect every new migration's SQL.

- **Additive only** (add table/column, new index, nullable field) → safe to
  ship on the ordinary path.
- **Destructive** (`DROP TABLE/COLUMN`, `TRUNCATE`, `ALTER … DROP`,
  `SET NOT NULL` on a populated column, a top-level `DELETE`/`UPDATE`
  backfill) → **STOP.** This needs the governed path: a restore-rehearsed
  backup, staged read-mode/compat handling, and explicit human sign-off — not
  a normal deploy. Most mistakes are recoverable; destroying real data is the
  one that isn't, so put a mechanical block in front of it (a CI check that
  fails the build on destructive DDL beats relying on vigilance).

### 3. One step at a time, in order

- Prepare locally and run the project's **real gates green first**: typecheck,
  build, lint, tests. Gate on the **unpiped exit code** (`$?`), never on piped
  output — `| tail` has produced false greens.
- Deploy the **data/backend tier first** (so the frontend never calls routes or
  columns the backend doesn't have yet); confirm it's healthy.
- Then deploy the **frontend**.
- A release done as one leap hides its failures; the same release as a sequence
  surfaces them one at a time, while they're cheap.

### 4. Trust the checklist, not the vibe

"It looks done" is not "it passed" — and a subagent's or teammate's "tests
green" is only as good as the command they actually ran.

- Run the project's **own exit-bar command** yourself (its full test / preflight
  suite), don't relay someone else's runner output.
- **Read** the failures. A git-hygiene "unpushed commits" failure is *expected*
  before you push and clears on push — not a defect. A new-test-file "not
  claimed by a suite" error means the tests were run a way that skipped the real
  gate — fix the registration, don't wave it through.
- Verify the live result against the system's **own signal** — a health
  endpoint returning ok, a real page/route responding — never against a claim
  that it worked.

### 5. Keep your hands on the irreversible buttons

The tools prepare everything — build, stage, verify, and draft the exact
commands. The human presses the deploy, the migration apply, the push, the
publish. Preparation is delegated; irreversibility is not.

## Smooth the human's terminal steps

The gated commands are the human's, and the terminal is often the fiddly part —
make it painless:

- **One command at a time**, each with "here's what success looks like" before
  the next.
- **Anticipate the specific snag** rather than reacting: wrong folder, a
  tool-version mismatch, a full disk, a connection string that only works from
  inside the host's private network.
- **Long values split on paste** — put a long secret (a database URL) into a
  variable with `read -r VAR` (they paste it, press Enter), then use `"$VAR"` in
  short commands. This also keeps the secret out of the visible command line.
- **Confirm the target before anything irreversible** ("this is production,
  the `api` service — yes?").
- **Expect a credential to land in the chat** during database work; remediate
  afterwards (close the public access that was only opened for the backup).

## Honesty rules (non-negotiable)

- State what actually ran and what's still owed; never fake a gate or a number.
- If a step can't be verified (no test DB access, no backup path), say so and
  record it **owed** — don't paper over it.
- Report the real scale (commits, lines, migrations) measured from the repo, not
  guessed. Impressive-but-true beats vague-and-grand.

## Done means

Production equals the shipped version, confirmed against the system's own signal
(health check + a real live route), the backup preserved, and every gate green
on the unpiped command. Record what shipped.
