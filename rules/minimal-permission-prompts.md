# Rule: Minimal permission prompts

*A self-contained rule for Claude Code setups. Adopt by copying the settings pattern; share freely.*

## The rule

Permission prompts should fire only where they do real safety work: destructive actions, outward-facing actions, and arbitrary code execution. Everything routine — reading, testing, linting, browsing, editing files in the workspace, committing locally — is pre-approved, so the human is interrupted only when the interruption means something.

## Why ad-hoc "Always allow" clicks don't achieve this

Each click saves the *exact* command — `python3 script.py 153:171` never matches again — so the allowlist grows forever while the prompts keep coming. The fix is a small number of **generalised patterns**, set once in settings.

## The settings pattern

In `~/.claude/settings.json` (global) or a project's `.claude/settings.json`:

```json
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm test *)",
      "Bash(npx tsc --noEmit *)",
      "Bash(npx playwright test *)",
      "Bash(npx vitest run *)",
      "Bash(npx eslint *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git mv *)",
      "Bash(git init)",
      "Bash(git checkout -b *)",
      "Bash(mkdir *)",
      "Bash(npm install *)",
      "Bash(npm create *)",
      "Bash(npm run dev)",
      "Bash(npm run build)",
      "Bash(pnpm build *)",
      "Bash(pnpm typecheck *)",
      "Bash(pnpm format:check)"
    ]
  }
}
```

- `"defaultMode": "acceptEdits"` — file edits inside the workspace stop prompting. This removes the single largest prompt source in build-heavy sessions.
- The `allow` list pre-approves your actual high-frequency verbs. Derive yours from real usage (the `/fewer-permission-prompts` skill scans your transcripts and proposes a ranked list); read-only browser/preview MCP tools are usually the top scorers and are safe to add wholesale.
- Note git read-only commands (`status`, `log`, `diff`, …), `ls`/`cat`/`grep`-class commands, and `gh` read subcommands never prompt at all — don't waste entries on them.

## What stays behind a prompt, deliberately

- **Destructive**: `rm`, `pkill`, force-pushes, resets, deletions of any kind.
- **Outward-facing**: `git push`, `curl`/network sends, emails, posts, publishing, purchases — anything that leaves the machine.
- **Arbitrary execution**: never allowlist interpreter or runner wildcards — `python3 *`, `node *`, `npx *`, `npm run *`, `bash *`. Any of these is equivalent to approving every possible command, including ones injected by malicious content a session happens to read. Exact safe forms (`npx tsc --noEmit *`) are fine; the wildcard interpreter is not.

The remaining prompts are the system working. If one specific safe command still nags, add its exact form — never widen the pattern to make the prompt go away.

## Effects and limits

Settings apply from the **next session** — an already-running conversation keeps its loaded rules. Project-level settings merge with global ones; a project can also add its own entries without touching the global file.
