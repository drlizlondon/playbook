---
name: reading-room
description: Turn the pile of Markdown your AI sessions generate — plans, specs, handovers, research notes — into ONE published, private "reading queue" you actually work through: a web page grouped by category and sortable by date, where each doc shows its full text inline and carries a Keep / Done / Delete control that syncs across every device. Content stays on disk; a small JSON manifest is the catalog; read-state lives in the published page's own database, so marking something read is a live write, never a republish. Use when someone has piles of Markdown they never read, wants a durable triage-able queue of their own docs, or says "build my reading room", "add this to my reading room", "publish my reading queue", or "I have piles of markdown I can't keep track of".
---

# The Reading Room

Every AI coding session leaves Markdown behind — plans, specs, handovers,
research notes, decision logs — and it piles up far faster than anyone reads
it. The documents are valuable. You never open them again. The Reading Room is
the system that fixes that: it turns a catalog of those files into **one
published, private web page** — a reading queue you work through like an inbox,
grouped by category, sortable by date, full text inline, with a
**Keep / Done / Delete** control on every doc that syncs across all your
devices. Tick something read on your phone; watch it collapse on your laptop.

It exists because the obvious version breaks. A hand-grown HTML "reading list"
conflates three things that must not live together — the document text, the
list of what's in the queue, and whether you've read each one — so *marking one
doc read* means regenerating and republishing the whole file, fighting the save
lock every single tick, and the moment the page gets big you start dropping or
duplicating text by hand. It's so much friction that you stop, and the pile
wins. The Reading Room's whole design is the fix: separate the three concerns
so the only frequent action — a tick — is a single database write from inside
the page, and a rebuild is rare.

## The design: three concerns, never conflated

| Concern | Lives in | Written by |
|---|---|---|
| **Content** (the full doc text) | on disk, at each doc's own path | whoever authored the doc — never moved, copied, or changed |
| **Catalog** (which docs; title, category, path) | a small JSON manifest | you, by hand, when a doc should join the queue |
| **State** (keep / done / delete, per doc) | the published page's own database | the page itself, live, from your tick |

Because read-state lives in the page's database, **a tick is one write from
inside the page — not a republish.** It never touches the publish/save lock,
and it syncs live to every signed-in view of that page. You only ever
regenerate and republish when the *catalog* changes (a doc added or removed),
or occasionally to shrink the page after you've read a batch. Reading one doc
costs nothing.

This is the same mechanical principle the rest of this playbook runs on: the
frequent action must be cheap and safe by construction, not by remembering to
be careful. Republishing-to-mark-read is a rule you'll eventually defeat; a
database write can't be defeated, because there's nothing to defeat.

## Prerequisites

- **Node.js** (any recent version) to run the generator — no install, no
  dependencies, one file.
- **A publishing host with a per-page database** to hold read-state and sync it
  across devices. This skill targets Claude Artifacts' `db` capability, which
  exists only on a *published* page; the cross-device sync is that database, not
  anything on your machine. Everything else (the generator, the page markup) is
  plain and portable.

## Procedure

### One-time setup

Copy `reading-room-manifest.example.json` to `reading-room-manifest.json`
somewhere durable (a git repo alongside the docs works well). Set `title` and
`subtitle`, replace `catOrder` with your own categories, and clear out the
sample `docs`.

### (a) Add a doc to the queue

Append one entry to `manifest.docs`:

```json
{ "id": "unique-stable-id", "title": "Title shown on the card", "cat": "One of catOrder", "path": "path/to/doc.md" }
```

- `id` — unique and **stable**. It is the database key for that doc's
  read-state (`docs/<id>`), so **never reuse or renumber an id** or you orphan
  its state. Duplicate ids fail the build.
- `cat` — one of `catOrder` (a doc in an unlisted category still renders under
  the Date view, it just gets no Category heading).
- `path` — absolute, `~/`-relative, or relative to the manifest's own
  directory. A `YYYY-MM-DD` anywhere in the filename becomes the doc's date for
  the Date view; otherwise the file's modified time is used.
- Do **not** record a word count — the build recomputes it live from the file
  every run, so it never goes stale.

### (b) Run the generator

From the directory holding the manifest:

```
node scripts/build.mjs [--manifest=reading-room-manifest.json] [--out=reading-room.html] [--read-state=state.json]
```

- Defaults: `--manifest=./reading-room-manifest.json`,
  `--out=./reading-room.html`.
- `--read-state` is a snapshot of the page database's current state, shaped
  `{"<id>": "keep"|"done"|"del"}`. It drives **drop-on-read**: any doc whose
  snapshot state is `done` or `del` is emitted as a metadata-only row (no body),
  so the page stays small as you read. **Omitting it is the fail-safe default —
  every doc embeds in full**, so no doc's text is ever dropped before its own
  database row says so.
- The build prints doc counts and byte/token size, and **refuses to write** on
  duplicate ids, missing manifest fields, or a shell that would double-wrap the
  page.

### (c) Publish / republish

**First publish:** publish the generated page and **grant it the database
capability** (for Claude Artifacts, `capabilities: { db: {} }`) — that is what
gives it the cross-device read-state. Keep the returned URL; it is the durable
link you bookmark on every device.

**Republish** (catalog changed, or to shrink after a reading batch):

1. Pull the current read-state from the page's database and save it as
   `{"<id>":"keep"|"done"|"del", ...}` to e.g. `state.json`.
2. Edit the manifest (add/remove docs) if needed.
3. `node scripts/build.mjs --read-state=state.json`
4. Publish to the **same URL**. On a redeploy the database capability carries
   forward — you don't re-declare it.

**Every ordinary tick needs no republish at all.** That is the whole point.

### (d) The read-state model (explain it to the reader)

- Each card has three states: **Keep** (unread — full text shown inline),
  **Done** (read and filed — collapses into the "Done" folder at the bottom),
  **Delete** (a flag for the reader only; the page never touches any file on
  disk).
- Ticking saves instantly to the page's database and syncs live to any other
  device viewing the same page.
- If the database is unavailable to a given view (not granted, or offline), the
  page still renders in full with everything defaulting to Keep, and a tick is
  remembered on that device only. It degrades; it never breaks.

## Robustness (built into the generator)

- A doc whose text contains a literal `</script` sequence would truncate its own
  embedded block; the build detects this and degrades that one doc to a
  metadata row (with a warning) rather than ship a corrupted page. The full text
  is still safe on disk.
- A missing source file becomes a metadata row with a warning, never a crash.
- The generated markup is deliberately **content-only** (no
  `<!doctype>`/`<html>`/`<head>`/`<body>`) because the publish step wraps the
  page once; the build aborts if its own shell would introduce those tags.
- First paint renders from whatever is physically embedded, before the database
  resolves — the room is never blank while state loads.

## Files

| Path | What it is |
|---|---|
| `scripts/build.mjs` | The generator. Reads the manifest + each doc's real file, decides per-doc whether to embed the full Markdown, writes one content-only HTML page. Zero dependencies; fails loudly (writes nothing) on any structural problem. |
| `reading-room-manifest.example.json` | An illustrative catalog. Copy it to `reading-room-manifest.json` and edit. |
| `sample-docs/` | Three tiny Markdown docs so the example builds out of the box. |

Requires Node 18+. No install step, no dependencies, no configuration.
