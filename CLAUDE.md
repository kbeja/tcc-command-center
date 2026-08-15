# TCC Command Center

React/Vite/Supabase app running Kristen's Etsy POD shop, "The Current Chapter." Kristen is the sole user/developer working with Claude Code.

## Working across chats/worktrees

Every new chat gets its own isolated git worktree + branch (`.claude/worktrees/<name>`, branch `claude/<name>`), created from wherever `master` is at that moment. **Worktrees do not share uncommitted changes with each other** — a new chat cannot see work still sitting uncommitted in another chat's worktree, even though every worktree is a clone of the same repo.

**Commit and push checkpoints regularly during any multi-hour or multi-file implementation stretch — don't wait for a whole phase/feature to finish.** A commit on a branch is visible from any worktree via `git log`/`git fetch`; uncommitted working-tree changes are visible only from inside that one worktree. This isn't about merging to `master` early — only merge finished, verified work — it's about never letting substantial work exist in exactly one uncommitted place.

**If you're picking up work described in another chat**, or asked to check whether some prior work still exists: before concluding anything is missing or needs to be rebuilt, run `git worktree list`, `git log --all --oneline -20`, and `git branch -a`, and check every worktree's actual files directly. A prior incident (2026-08-13) had one session conclude a whole phase's implementation was permanently lost and write that conclusion into project memory — it wasn't lost, it was committed and pushed on a different worktree's branch the entire time. Don't report code as lost without verifying every worktree, not just the one you're sitting in.

**When Kristen deliberately moves to a new chat mid-task** (e.g. the old one got too long): the cleanest handoff is committing + pushing in the old chat first, then telling the new chat which branch to pull in (`git fetch origin && git merge origin/claude/<old-branch-name>`, or check it out directly once the old worktree is closed) rather than starting from stale `master` and re-deriving everything from a pasted summary alone.

**`netlify dev` (and `netlify functions:list`) silently resolve to the wrong checkout from inside a linked worktree.** Confirmed 2026-08-15: netlify-cli's own repo-root detection lands on the *main* checkout's directory even when invoked from a worktree with cwd set correctly (`git rev-parse --show-toplevel` itself is fine — this is a netlify-cli bug, not a git one). The practical effect is silent and easy to miss: the local dev server serves the main checkout's `netlify/functions/*` files — stale or entirely missing versions of whatever this worktree branch added or edited — while the Vite frontend correctly serves the worktree's own `src/`. A brand-new function in the worktree 404s with "Function not found"; an edited one silently runs its pre-edit body. Fix: pass an explicit relative functions dir, `-f netlify/functions` (relative resolves against the real process cwd, not netlify-cli's confused internal one) — already wired into `.claude/launch.json`'s `tcc-netlify-dev` config, so `preview_start({name: "tcc-netlify-dev"})` picks it up automatically. If function changes ever seem to have no effect in the local preview, or `netlify functions:list` shows fewer functions than actually exist in `netlify/functions/`, this is almost certainly why — verify with `npx netlify functions:list -f netlify/functions` before assuming the code itself is broken.

## Standing engineering rules (28-phase BI roadmap, Phases 11+)

Full phase-by-phase history and current status lives in Claude's memory (`tcc_phase11_28_roadmap.md`), not here. Rules that apply to every phase:
- Work phases strictly in order, one at a time — not multiple phases in one pass.
- Keep Evidence/Interpretation/Decision/Hypothesis/Learning conceptually separate — never collapse them into one field or concept.
- No AI-hallucinated evidence. Hypotheses are fine; fabricated trend/sales/demand numbers are not.
- No silent writes — every durable database write needs human approval. No auto-merging, no auto-creating records, no automatic SEO changes.
- Migrations are hand-written SQL files under `supabase/migrations/`, never auto-applied — always handed to Kristen to run manually in the Supabase SQL Editor.
- Inspect existing systems before building anything new; ask when something is unclear rather than assume.
