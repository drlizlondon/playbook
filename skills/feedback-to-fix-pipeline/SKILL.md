---
name: feedback-to-fix-pipeline
description: >-
  A phone-to-fix loop for a solo founder or small team: fire feedback from your
  phone into a plain file, and an agent runner routes it, classifies it,
  dispatches a branch-only fix, and keeps a visible problems→solved ledger — with
  a human on the ship button. Two parts: (1) the capture pipeline, (2) the
  automatic fix flow.
---

# Feedback → Fix pipeline

**The problem this solves.** You are using your own product on your phone, you hit
a bug or think of an improvement, and the thought evaporates before you get back
to a keyboard. Or it lands in a chat thread and is never seen again. Meanwhile the
fix is small and an agent could do it — but nothing connects "I noticed something"
to "it got fixed."

**The pattern.** A tiny capture bot turns a phone message into a line in a plain
text file. A scheduled (or coordinator-run) agent reads that file, works out which
repo it's about and whether it's a real bug, dispatches a **branch-only** fix
agent, and records every item's journey in a ledger. You stay on the ship button.

**Origin.** Built for a founder who lived on her phone and kept losing feedback to
the gap between noticing and fixing. The first version captured text only, and the
day it silently dropped a batch of screenshots-with-captions taught the load-bearing
rule below (**never drop a message silently**). It has since carried real bugs from
"typed on a train" to "shipped" with a visible trail.

It is deliberately two loosely-coupled halves. You can adopt Part 1 alone (just
stop losing feedback) and add Part 2 later.

---

## When to reach for this

The AI-fixes-the-code part is commodity — any coding agent will take an issue and
draft a branch-only fix. What this pattern adds is the connective tissue and the
safety policy around it, which pays off in specific situations:

- **You run more than one product.** With several repos, this routes each piece of
  feedback to the right one automatically — you stop carrying "which repo is this,
  where's its context" in your head.
- **You notice things away from your dev machine — on your phone, using your own
  product.** The bug thought arrives while you're a *user*, not at a keyboard. This
  captures it (text or screenshot) in three seconds, before it evaporates. That gap
  between *noticing* and *recording* is the real leak, and no coding agent can watch
  your phone.
- **You want fixes drafted while you're doing something else.** Fire the feedback
  and walk away; the runner dispatches the fix agent on a schedule and hands you a
  green branch to review later — instead of you sitting there driving it live.
- **You want unattended, but not *unsafe*.** The value is the encoded policy:
  branch-only, gate-on-the-real-exit-bar, single-executor, **fix-and-hold (it never
  deploys)**, sensitive repos human-only. A raw "go fix things while I sleep" prompt
  has none of those rails — this makes "the human stays on every irreversible step"
  structural rather than a hope.
- **You want a memory of what you reported.** The register answers "what did I flag,
  and what happened to it?" — nothing drops silently.

It's built for a **solo founder or small team shipping several products and living on
their phone.** That is exactly the shape of person it was born for, and exactly who
gets the most out of it.

---

## Part 1 — Capture: phone → a plain file

**What it is:** `capture-bot.py` — a ~200-line, **Python-standard-library-only**
(no `pip install`) bot that long-polls the Telegram Bot API and appends each
message to a Markdown inbox file. It runs on your own machine as a background
service. There is **no webhook, no public port, no server to host** — the bot
reaches *out* to Telegram's `getUpdates` endpoint, so nothing inbound is ever
exposed.

**Why Telegram:** a real bot API with a free, first-class file/photo channel, no
business verification, and it stays in "development" mode for a single user
forever (your own chat is the only allowed sender). (The transport is the swappable
layer — the same shape works over any messaging API that offers polling + a
send-reply; Telegram is just the cheapest path to a working loop.)

**What it captures:**
- **Text messages** → the message text.
- **Screenshots with a caption** → the caption becomes the feedback text and the
  image is downloaded next to the inbox and referenced in the line. This matters:
  a screenshot with "this button is cut off" is often the *clearest* bug report.
- Anything it can't capture (voice notes, stickers) is **never silently dropped** —
  the bot replies telling you how to send it in a captured form. That reply is the
  whole point: silence is how feedback dies.

**Safety built in:**
- **One allowed `chat_id`.** A stranger who finds the bot's username cannot inject
  fake feedback — messages from any other chat are ignored.
- **The token lives only in `config.local.json`**, which is gitignored. It is never
  logged, never committed, never echoed. Copy `config.example.json`, never edit it
  in place.
- **Offset persistence** (`offset.local.txt`) means a restart never re-logs an old
  message.
- **`--selftest`** exercises all the file/offset/parsing logic offline, with no
  token and no network, and never touches your real inbox.

### Setup (about 10 minutes)

1. **Create the bot.** In Telegram, message **@BotFather**, send `/newbot`, give it
   a name and a `…bot` username. It replies with a **token** (a long
   `digits:letters` string). Keep it off any chat/commit — you'll paste it into the
   local config only.
2. **Get your `chat_id`.** Open a chat with your new bot, send it any message, then
   fetch `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and read
   `result[0].message.chat.id`. That number is your `allowed_chat_id`.
3. **Configure.** `cp config.example.json config.local.json` and fill in
   `bot_token`, `allowed_chat_id`, and `inbox_path` (the Markdown file to append
   to; it must contain a `## Open` heading). Never commit `config.local.json`.
4. **Test.** `python3 capture-bot.py --selftest` should print all PASS and end
   "Real inbox untouched."
5. **Run it in the background.** On macOS, a LaunchAgent (template in this folder)
   keeps it alive and restarts it if it dies; on Linux, a `systemd --user` service
   or a `tmux`/`screen` session does the same. Then send your bot a message and
   watch the line appear in your inbox file, with a `Logged ✓` reply on your phone.

The inbox file is intentionally boring: a Markdown file with a `## Open` section.
New items land as `- 🆕 <ISO timestamp> · <text> [· 📎 screenshot: <path>]`. You can
read and edit it by hand; it is the single source of truth Part 2 consumes.

---

## Part 2 — The automatic fix flow

**What it is:** an **agent runner** (scheduled, or run by whatever coordinator
session is live) that reads new inbox items and moves each one along a visible
`problems → solved` ledger. The full contract is in
[references/pipeline.md](references/pipeline.md); the ledger shape is in
[references/register-template.md](references/register-template.md). The shape:

```
capture (Part 1) → inbox file → RUNNER: route → classify → dispatch fix agent
                                → REGISTER (ledger) → coordinator gates → you ship
```

**Each cycle the runner:**
1. Reads the inbox `## Open` items not already in the register; for each, adds a
   row, **routes** it to a repo (a keyword→repo map you define), and **classifies**
   it.
2. **Classification** decides what happens:
   - **bug** (a clear, reproducible wrong behaviour) → dispatch a fix agent.
   - **UX / visual** (layout, legibility, sizing) → record "needs your eye" —
     *never* auto-code visual work; green tests ≠ looks right.
   - **feature** ("we need an annual view") → record "needs your decision."
   - **question** → answer and record.
   - **needs-repro** (can't be reproduced from the text) → ask for a repro/screenshot.
3. For a clear bug in an eligible repo, dispatches **one branch-only fix agent** in
   its own worktree off the deploy branch. The agent fixes the bug and surfaces
   anything ambiguous; **it never redesigns.**
4. Updates the register (`🔧 dispatched → 🧪 fix-drafted (branch + commit)`), writes
   a one-line summary, and stops if there's nothing new.

**The load-bearing safety choice — fix-and-hold, not auto-ship.** The default is
`AUTO_SHIP = OFF`: the loop auto-*dispatches* and *gates* fixes, but it does **not
deploy**. A human (you, or the coordinator) clicks ship. The first action of a loop
triggered by a phone message must not be an unsupervised production deploy. Turn
auto-ship on only after you've watched a full clean cycle, and only for a narrow
allowlist of low-risk repos, and only for a functional bug-fix with a passing test.

**Guardrails (hard, in the pipeline contract):**
- **The coordinator re-runs the repo's real exit-bar itself** before trusting any
  fix — never ship on a subagent's word that tests are "green" (a subagent can pass
  a direct runner while bypassing the repo's canonical gate).
- **Single-executor:** check the register *before* dispatching — never
  double-dispatch an item already in flight.
- **No destructive or outward actions, ever:** no deletes, emails, posts, purchases,
  DNS, live SQL, or provider deploys from the runner. Credentials stay yours.
- **Sensitive repos are human-only:** anything touching health data, money, real
  users, or owner-gated access is never auto-dispatched — it's recorded for a human.
- **Worktree discipline:** each fix agent works in its own worktree off the deploy
  branch, branch-only, never the shared checkout, never a blanket `git add -A`.
- **Never touch uncommitted changes you don't recognise** — pause and record a
  blocker.

---

## What you actually get

- **You stop losing feedback.** The thought becomes a durable line the moment you
  type it, screenshot and all.
- **Small bugs fix themselves to the branch stage** while you're doing something
  else, and you review a green branch instead of starting from a bug report.
- **A visible ledger** answers "what did I report and what happened to it?" without
  you holding anything in your head.
- **The human stays on the irreversible steps** — shipping, anything outward,
  anything sensitive — by construction, not by good intentions.

## Adapting it

- **Transport:** swap Telegram for any polling messaging API; keep the "reply so
  nothing is ever silently dropped" rule.
- **Router/classification:** the keyword→repo map and the classes are yours to
  define — start with your real repos and the real shapes of feedback you get.
- **Runner cadence:** a scheduled task every few hours, or triggered by whatever
  agent session is already live. The register is the deconfliction point either way.
- **Ledger:** a Markdown table is enough. Don't build a database until the loop has
  earned it.

Files in this skill: `capture-bot.py` (Part 1, generalized, stdlib-only),
`config.example.json`, `references/pipeline.md` (Part 2 runner contract),
`references/register-template.md` (the ledger).
