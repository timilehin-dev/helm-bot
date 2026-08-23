# Quorum v2 — Builder Loop Spec (Graph + Verification Loop)

This is the canonical execution discipline for the **automated builder** (the automation that
runs 3× daily and pushes deliverables to `main`). It combines **graph engineering** (the
structural backbone) with **loop engineering** (the cognitive verify-fix cycle).

> The automation MUST follow this spec on every run. The build is "done" only when the
> verification gate passes — never when the model merely "feels done."

## Why graph-first (with embedded verification loops)

Autonomous coding reliability is gated by **validation, not model capability**. Two compounding
problems are addressed by this spec:

1. **Compounding per-step error** — a workflow with N sequential steps that each have reliability
   `r` succeeds end-to-end only with probability `r^N`. A 10-step workflow at 85%/step collapses
   to ~20% success. The fix is **durable checkpoints + retries + acyclic splitting**.
2. **Self-confirmation bias** — a single agent that both writes and "checks" code will tend to
   declare its own work correct (or weaken tests to pass). The fix is a **separate verifier**:
   the build/typecheck run as an *independent gate*, not a self-assessment.

So: **graph = the skeleton (deterministic, checkpointed, idempotent nodes), loop = the muscle
(bounded generate→verify→fix at the implementation node).**

## The execution graph (fixed DAG, run every build)

Nodes execute **in order**. Each node has one responsibility. Each completed node is a durable
checkpoint (a git commit or a written state). Re-running a node must be safe (idempotent).

```
[1 READ] -> [2 PLAN] -> [3 IMPLEMENT] -> [4 VERIFY] -> [5 REVIEW] -> [6 COMMIT+PUSH] -> [7 RECORD]
                        ^                 |
                        +---- fix loop ---+   (bounded, max 3 iterations)
```

### Node 1 — READ (context checkpoint)
- Read `BUILD_LOG.md` top-to-bottom (prior deliverables, verification, "Next").
- Read `docs/ARCHITECTURE.md` and this file (`docs/BUILDER_LOOP.md`).
- Determine the **current phase** and the **single next deliverable**.
- **Do not proceed** until the state is understood. This is the anti-drift checkpoint.

### Node 2 — PLAN (deterministic, idempotent)
- Decompose the deliverable into **atomic sub-tasks** (each independently verifiable).
- Write a short `PLAN` block (into the upcoming commit message or a scratch note):
  what changes, which files, and the **explicit "done" criterion** (almost always: build+typecheck green).
- Keep the plan **acyclic**: no sub-task depends on a later sub-task's side effect.

### Node 3 — IMPLEMENT (inner verification loop)
- Implement sub-tasks **sequentially**, one atomic unit at a time.
- After each unit, run the relevant verifier immediately (see Node 4).
- **Bounded inner loop**: on failure, read the exact error, fix the *cause* (not the verifier),
  retry. Max **3 fix iterations** per sub-task.
- **Never weaken tests, typechecks, or lint rules to pass.** If a check is genuinely wrong,
  document that decision explicitly in the commit — do not silently delete it.

### Node 4 — VERIFY (independent gate — the heart of the spec)
- Run the **real** verification commands, not an LLM self-assessment:
  - `npm run build` (must compile clean)
  - `npm run typecheck` (`tsc --noEmit`, zero errors)
  - any project tests that exist (`npm test` if configured)
- The build is **not done** until these pass. A green build is the only accepted success signal.
- If verification fails, return to Node 3 with the exact error text (this is the outer-loop critique).

### Node 5 — REVIEW (self-review against plan, adversarial)
- Diff against `main` and check: plan fully implemented? no secrets committed? no `node_modules`
  or large binaries? `.gitignore` correct? no throwaway duplicate files? no broken imports?
- **Adversarial check (Quorum DNA):** before committing, argue *against* the change — does it
  actually satisfy the "done" criterion, or is it a stub dressed as a deliverable? Reject stubs.
- If the review finds issues, loop back to Node 3.

### Node 6 — COMMIT + PUSH (checkpoint to git)
- Atomic, well-described commit(s) — one logical change per commit.
- Push directly to `main` (no PRs). The remote already has push access.
- Each commit is a **durable checkpoint**: the repo state at any commit must be replayable.

### Node 7 — RECORD (state handoff for the next run)
- Append a `BUILD_LOG.md` entry using the exact required format (Delivered / Files / Verified / Next).
- Update the "## Current status" section to reflect the new phase/progress.
- The `Next:` line is the **handoff checkpoint** that lets the next run resume deterministically.

## Global budgets (prevent runaway loops within the timeout)

- **Sub-task fix budget:** 3 iterations per sub-task (Node 3→4 loop).
- **Deliverable budget:** if a deliverable cannot reach green after all sub-task budgets are
  exhausted, **stop and record a blocker** in `BUILD_LOG.md` (what failed, exact error, what the
  next run should try). Do not loop indefinitely.
- **Scope discipline:** one deliverable per run. Do not start a second deliverable if the first
  isn't green. Ship quality over volume.

## Durable execution & idempotency rules

- Mutating operations (file writes, git commits) are **intent-then-act**: write the change, verify,
  then commit. A commit that fails to push is safe to retry.
- Prefer **sequential** nodes for side-effectful work; only parallelize *independent, idempotent*
  sub-tasks (e.g., generating candidate files) when a later merge is deterministic.
- Never rewrite/delete prior `BUILD_LOG.md` entries — history is the memory. Append only.

## Success definition (non-negotiable)

A build run is **successful** iff:
1. The verification gate (Node 4) passed on the real commands, **and**
2. The deliverable was committed + pushed to `main`, **and**
3. `BUILD_LOG.md` was updated with a truthful entry (including any blockers).

A run that pushes "code that probably works" without a green build is a **failure**, even if it
produced files. Verification is the contract.
