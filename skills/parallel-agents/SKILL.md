---
name: parallel-agents
description: A discipline for running multiple coding agents in parallel on one codebase without them colliding or drifting. Use when running two or more agents/sessions at once, coordinating a fan-out of concurrent work onto a shared repo, or when parallel work keeps producing merge pain, wrong-window edits, or broken shared state (migrations, lockfiles, generated files). Provides worktree isolation, packet discipline, an append-only work log as the single source of truth, and a hard "done" gate — plus the rule for the serial resources isolation cannot protect.
---

# Parallel agents

Running several agents at once is not "more speed" for free. It is a
concurrency problem, and concurrency problems are won by controlling three
things: **where work happens** (isolation), **what counts as done**
(a gate), and **where the truth lives** (one log). Get those right and the
number of agents stops mattering — two or twelve, the discipline is the same.

The failure mode this skill exists to prevent: the operator becomes the
bottleneck and the memory. You end up staring at N panes trying to remember
which one owns what and which one is waiting on you. That is a signal the
truth is living in your head instead of in the system. Move it into the
system.

## The three moves

### 1. Isolation — one worktree per agent

Give every agent its own git worktree on its own branch. Agents then
**physically cannot** edit each other's files, so the entire class of
wrong-window mistakes (pasting review notes into the wrong session, an agent
"fixing" a file another agent owns) disappears at the mechanism level rather
than by anyone remembering to be careful.

```
git worktree add ../work-a  -b stream/a
git worktree add ../work-b  -b stream/b
git worktree add ../work-c  -b stream/c
```

One agent per worktree. The pane, tab, or window is now **disposable** — it
is just a view onto a worktree, not a thing you have to keep straight in your
head. Losing track of a pane costs nothing because no state lives there.

Land the streams back onto one integration branch so there is a single spine,
not N diverging repos. Isolation is for *doing* the work; it is not where the
work accumulates.

### 2. Packets — the unit of parallel work

Do not hand an agent "a task." Hand it a **packet**: a self-contained unit
that is *built and then proven and then logged* before it counts. A good
packet is scoped so it can be verified on its own and merged without waiting
on another packet's internals.

A packet is finished only when it has:

- an implementation (the change itself),
- a **verification** it actually passed (not a claim that it should),
- a log entry recording both.

"I wrote the code" is not a finished packet. "I wrote the code, the gate is
green, and I logged it" is.

### 3. The log — the single source of truth

Keep **one append-only log** for the whole fan-out. Not a "who is doing what"
notes file — those rot within days because they track intent, and intent
changes faster than you can edit. Track **completed, proven state** instead.

Each finished packet appends one entry:

```markdown
## <date> — <packet id>: <one-line summary>

- Commit: `<hash or message>`
- Implementation: <what actually changed, 1–3 lines>
- Verification: <what gate ran and passed — the specific checks>
- State/next: <readiness signal, and the next packet this unblocks>
```

Because it is append-only and records what is *done and proven*, the log
answers the only questions that matter across parallel work — what is
finished, what is trustworthy, what is next — without you holding any of it in
your head. Read the log, not the panes.

## The gate — nothing is "done" until it is proven

Define one **hard, non-negotiable done-gate** and apply it to every packet
identically. Typical gate for a real codebase:

- type check passes,
- linter passes with no new warnings,
- the full test suite passes,
- **shared-state checks pass** (migrations apply cleanly, lockfile resolves,
  generated files regenerate to no diff),
- a production build succeeds.

The gate is the whole reason parallel agents become trustworthy instead of
chaotic. Without it, "done" is a vibe and six agents produce six vibes you
then have to audit by hand. With it, each packet arrives already proven and
your review is about *design*, not *did this even run*.

Run the gate inside the packet's own worktree, before merge. A packet that
cannot pass the gate is not done, regardless of how finished the code looks.

## The part isolation cannot protect: serial resources

This is the sharp edge, and the reason the gate is not optional.

Worktrees isolate **files**. They do nothing for the resources that are
genuinely **serial and shared** across the whole repo:

- database **migration chains** (a linear, ordered history),
- **lockfiles** (one resolved dependency graph),
- **generated/checked-in artifacts** built from a shared source of truth,
- anything with a single canonical ordering that every stream appends to.

Two agents can each be *locally correct* in their own worktree and still
collide here, because each independently appends to the one serial thing.
Migration chains desync (a revision goes wrong, later ones go missing).
Lockfiles fork. Generated files diverge. Isolation will never catch this,
because at no point did anyone touch anyone else's files — the collision only
exists at the seam where the streams merge.

**The gate is what catches it.** Because "done" requires the shared-state
checks (migrations apply, lockfile resolves, generated files are clean), a
serial collision fails a packet's gate before it ever ships. When it fires:

1. Stop treating the colliding packets as done.
2. Repair the serial resource to a single correct state (fix the chain,
   re-resolve the lock, regenerate the artifacts).
3. Regenerate the affected packets' contributions **against the repaired
   base**, not against their stale local view.
4. Re-run the gate. Only green counts.

Design to avoid it where you can: serialize the streams that touch a shared
serial resource, or funnel all migrations/lock changes through a single
stream. But assume you will miss one — and let the gate be the thing that
never does.

## Operating rhythm

1. Split the goal into packets that can each be verified alone.
2. Spin up one worktree per agent; assign one packet each.
3. Keep migration/lockfile/generated-file work on a single serialized stream
   where practical.
4. Each agent: build → run the full gate in its own worktree → append its log
   entry → merge to the spine.
5. You read the log, not the panes. You review *design*; the gate already
   reviewed *correctness*.
6. When the gate flags a serial collision, repair the shared resource once,
   regenerate against it, re-gate.

## Why it works

- **Isolation** removes the dumb, high-frequency mistakes (wrong window, files
  stepped on) at the mechanism level.
- **The gate** removes the subtle, low-frequency mistakes (serial collisions,
  untested "done") that isolation structurally cannot see.
- **The log** removes *you* as the bottleneck — the truth lives in the system,
  so adding agents adds throughput instead of adding things to remember.

Isolation for the parallel. A gate for the serial. One log for the state.
That combination is what makes N agents feel like leverage instead of load.
