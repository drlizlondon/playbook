# Architecture notes — storage layer

A sample doc that includes a fenced code block, so you can see code rendering.

## The idea

Split three concerns that usually get conflated in one file:

- **Content** — lives on disk, untouched.
- **Catalog** — a small JSON manifest.
- **State** — read/unread, kept in the page's own database.

```js
// A tick is one database write from inside the page —
// never a republish.
await db.doc("docs/" + id).set({ state: "done", updatedAt: new Date().toISOString() });
```

Because a tick is a database write rather than a republish, marking something read is instant and never fights a save-lock.
