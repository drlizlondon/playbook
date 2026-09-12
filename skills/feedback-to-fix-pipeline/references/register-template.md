# Feedback Register — problems in → solved out

The ledger for the feedback loop. Every captured item becomes a row here with an ID
and a status, so the path from "I hit a problem" to "it shipped" is visible and
nothing is dropped. The runner ([pipeline.md](pipeline.md)) reads new inbox items,
routes + classifies them, and updates this file. A human gates + ships.

Keep it a plain Markdown table. Don't build a database until the loop has earned it.

**Status legend:** 🆕 new · 🔀 triaged · 🔧 agent-dispatched · 🧪 fix-drafted (branch, gated) · 🟡 needs-your-decision · ✅ shipped · ⏸ needs-repro

## Open

| ID | Date | Product | Type | Item | Status | Where |
|----|------|---------|------|------|--------|-------|
| FB-001 | 09-01 | planner | bug | Login lands on the homepage, not the calendar | ✅ shipped | abc1234 → main |
| FB-002 | 09-01 | planner | UX | Feedback widget takes too much space | 🟡 needs-your-decision | — |
| FB-003 | 09-02 | planner | feature | Add an annual view | 🟡 needs-your-decision | — |
| FB-004 | 09-02 | store | bug | Cart total wrong when a coupon is removed | 🔧 agent-dispatched | fix-cart-total worktree |
| FB-005 | 09-02 | store | needs-repro | "Checkout froze once" — not reproducible from the text | ⏸ needs-repro | asked for steps/screenshot |

## Meta / non-issues (no work)

- 09-01 "hi" — channel test.

## Shipped

<!-- Move ✅ rows here as they ship, newest first, so the Open table stays short. -->
