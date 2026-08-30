# The Worktree Protocol

Two tiny git hooks that make it structurally impossible for parallel coding agents (or absent-minded humans) to corrupt each other's branches in a shared repository.

## The incident this comes from

Two agent sessions were working the same checkout. Mid-commit, one session switched the checkout's branch; the other session's commit landed on a branch it had never heard of, and the work had to be recovered by cherry-pick archaeology. The fix was not "be more careful" — instructions decay, and an agent that has forgotten the rule is indistinguishable from one that never knew it. The fix was to make the mistake mechanically impossible. Zero collisions across roughly fifteen concurrent agent lanes since.

## The two rules the hooks enforce

1. **Main never takes a direct commit.** Main advances only by `git merge --ff-only <task-branch>`, run in the checkout that holds main. An ff-only merge creates no commit, so it passes the hook; anything else is blocked with instructions.
2. **Every checkout is claimed by exactly one branch.** The first branch a fresh worktree checks out becomes its claim (written to `EXPECTED-BRANCH` inside the git dir, automatically, by the `post-checkout` hook). If HEAD ever differs from the claim at commit time — the signature of a concurrent session switching branches under you — the commit is blocked before any damage is done.

The working discipline these support: one agent, one worktree, one branch.

```
git worktree add ../myrepo-task-a -b task-a   # agent A works here
git worktree add ../myrepo-task-b -b task-b   # agent B works here
# finished work lands from the main checkout:
git merge --ff-only task-a
```

## Install

Copy both files into your repository's hooks directory and make them executable:

```
cp pre-commit post-checkout /path/to/repo/.git/hooks/
chmod +x /path/to/repo/.git/hooks/pre-commit /path/to/repo/.git/hooks/post-checkout
```

Worktrees share the same hooks automatically (they live in the common git dir), and each worktree gets its own `EXPECTED-BRANCH` claim, which is the point.

To adopt via `core.hooksPath` instead, put them in a tracked `.githooks/` directory and run `git config core.hooksPath .githooks` — then the protocol travels with the repo.

## Escape hatch, deliberately manual

`git commit --no-verify` bypasses the guard. The protocol's rule is that no agent ever uses it without the repository owner's explicit say-so — the friction is the feature.

## Why hooks and not instructions

Any rule an agent can satisfy while defeating its purpose eventually will be, and any rule that lives only in a prompt eventually falls out of context. Constraints should be mechanical: the hook does not care how confident the agent is, how long the session has run, or what the prompt said. See the companion `parallel-agents` skill in this repository for the full discipline (packets, done-gates, one log) that these hooks anchor.
