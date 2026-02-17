# Implementation Approach: PBR/Studio Mode

## Communication Model: File-Based

All inter-agent communication uses **files on disk**, not conversation text.
This keeps proposals and reviews out of the main context window.

**Working directory**: `/tmp/studio/phase-N/` (created per phase)

| File | Written by | Read by |
|------|-----------|---------|
| `worker-1.md` .. `worker-4.md` | Workers | Architect, Quality |
| `architect-review.md` | Architect | Main Agent, Quality, Workers (if revisions needed) |
| `quality-review.md` | Quality | Main Agent, Workers (if revisions needed) |

**Main Agent context rules:**
- NEVER read full proposal files into conversation — workers write them, reviewers read them directly
- Only read verdict summaries (first ~20 lines of review files)
- Apply changes by re-reading the relevant proposal file section-by-section

**Progress tracking**: `memory/phase-progress.md` tracks completed phases and
current status. Updated after each phase gate. Survives context compaction.

---

## Roles

### Main Agent (Coordinator)
The main agent orchestrates the entire process. It is the ONLY agent that writes
to the codebase.

**Responsibilities:**
- Break each phase into discrete, parallelizable tasks (up to 4)
- Distribute tasks to Worker agents with clear scope and context
- Collect proposals from all Workers before triggering review
- Forward Architect and Quality feedback to Workers for revision
- Apply final approved code to the codebase (the ONLY agent that edits files)
- Track phase progress and gate transitions between phases
- Ensure no phase begins until the previous phase is fully complete and merged

**Rules:**
- Never apply code that has not passed both Architect and Quality review
- Never skip a review stage, even for "trivial" changes
- If a Worker's task turns out to be empty (no changes needed), document why
  and skip it — no review needed for empty tasks

### Worker (up to 4 in parallel)
Workers produce implementation proposals. They do NOT write to the codebase
directly — they write proposals to files on disk.

**Responsibilities:**
- Read the design doc (PBR_RENDER_MODE_PLAN.md) section relevant to their task
- Read existing source files they need to modify
- Write a complete proposal to their assigned file (e.g., `/tmp/studio/phase-N/worker-1.md`)
- Respond to Architect and Quality feedback with revised proposals (overwrite the same file)

**Rules:**
- Proposals must follow the design doc precisely — no creative departures
- If the design doc is ambiguous or contradictory, flag it to the Main Agent
  rather than guessing
- Each proposal must be self-contained: another agent must be able to apply it
  without additional context
- Proposals must include only the changes for the assigned task — no scope creep
- Workers must not propose changes to files outside their assigned scope without
  explicit approval from the Main Agent

**Proposal format** (written to file):
```
## Task: <task name>
## Phase: <phase number>
## Files Modified: <list>
## Files Created: <list>

### Rationale
<brief explanation of approach and design doc alignment>

### Changes

#### <file path>
```typescript
// OLD (lines X-Y)
<existing code>

// NEW
<proposed replacement>
```

#### <file path> (NEW FILE)
```typescript
<complete file contents>
```

### Design Doc References
<which sections of PBR_RENDER_MODE_PLAN.md this implements>
```

### Architect (Design Compliance Reviewer)
The Architect ensures all proposals conform to the design document and
architectural patterns of the codebase.

**Responsibilities:**
- Read ALL Worker proposal files for a phase and review them as a batch
- Verify proposals match PBR_RENDER_MODE_PLAN.md specifications exactly
- Verify proposals follow existing codebase patterns and conventions
- Check for cross-task conflicts (e.g., two Workers editing the same function)
- Check for missing pieces (design doc requirements not covered by any proposal)
- Provide specific, actionable feedback (not vague suggestions)
- Write review to `/tmp/studio/phase-N/architect-review.md`

**Review criteria:**
1. **Design compliance**: Does the code implement what the plan specifies?
2. **Naming**: Do identifiers match the plan's naming decisions?
3. **Architecture**: Does the code follow existing patterns in the codebase?
4. **Completeness**: Are all requirements for this phase covered across all tasks?
5. **Cross-task consistency**: Do the proposals work together without conflicts?
6. **No scope creep**: Does the code stay within the phase's stated scope?
7. **Forward compatibility**: Do the changes align with what subsequent phases
   expect? The Architect must read ahead in the design doc to verify that
   interfaces, data structures, and extension points introduced now will work
   for later phases without requiring rework. Examples:
   - Types defined in Phase 1 must support what Phase 4/5 will need
   - Tab switching logic in Phase 2 must accommodate the enter/leave hooks
     Phase 5 will add
   - Environment manager API in Phase 3 must support the Studio mode
     integration Phase 5 will build on

**Review file format:**
```
## Verdict: APPROVED | CHANGES REQUIRED

## Summary
<2-3 sentence overall assessment>

## Per-Task Verdicts
### Worker 1: <APPROVED | CHANGES REQUIRED>
<issues if any>
### Worker 2: ...

## Required Changes (if any)
<numbered list of specific changes needed>
```

**Verdict options:**
- **APPROVED**: All proposals pass. Proceed to Quality review.
- **CHANGES REQUIRED**: List specific issues per task. Workers must revise.
  After revision, the Architect reviews again (full cycle, no shortcuts).

**Rules:**
- The Architect does NOT propose alternative implementations — only identifies
  issues against the design doc and codebase patterns
- The Architect reviews ALL proposals together, never individually
- The Architect must reference specific design doc sections when raising issues

### Software Quality Agent (Code Quality Reviewer)
The Quality agent reviews code for correctness, safety, and maintainability.
Runs AFTER the Architect has approved.

**Responsibilities:**
- Read ALL Worker proposal files and the Architect review file
- Check for bugs, edge cases, and error handling gaps
- Check TypeScript type safety (no `any` leaks, correct generics)
- Check for resource leaks (GPU resources, event listeners, timers)
- Check for performance issues (unnecessary allocations in hot paths, etc.)
- Verify disposal/cleanup paths are complete
- Check for consistency in code style across all proposals
- Write review to `/tmp/studio/phase-N/quality-review.md`

**Review criteria:**
1. **Correctness**: Will the code work as intended? Edge cases handled?
2. **Type safety**: Proper TypeScript types, no unsafe casts?
3. **Resource management**: GPU textures, materials, listeners disposed?
4. **Performance**: No obvious bottlenecks or unnecessary work?
5. **Style consistency**: Matches existing code style in the repo?
6. **Error handling**: Failures handled gracefully, no silent swallowing?

**Review file format:** Same as Architect review format.

**Verdict options:**
- **APPROVED**: All proposals pass. Main Agent may apply to codebase.
- **CHANGES REQUIRED**: List specific issues per task. Workers must revise.
  After revision, the Quality agent reviews again (Architect does NOT re-review
  unless the changes are structural).

**Rules:**
- The Quality agent does NOT check design compliance (that's the Architect's job)
- The Quality agent reviews ALL proposals together, never individually
- The Quality agent must provide concrete fixes or patterns, not abstract advice

---

## Process

```
┌─────────────────────────────────────────────────────────────┐
│                    Phase N Start                            │
│                                                             │
│  1. Main Agent reads design doc for Phase N                 │
│  2. Main Agent creates /tmp/studio/phase-N/                 │
│  3. Main Agent breaks phase into tasks (1-4)                │
│  4. Main Agent launches Worker agents in parallel            │
│     (Workers write proposals to /tmp/studio/phase-N/)       │
│                                                             │
│         ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐             │
│         │ W1   │  │ W2   │  │ W3   │  │ W4   │             │
│         │  ↓   │  │  ↓   │  │  ↓   │  │  ↓   │             │
│         │ file │  │ file │  │ file │  │ file │             │
│         └──────┘  └──────┘  └──────┘  └──────┘             │
│                                                             │
│  5. Barrier — wait for all workers                          │
│                                                             │
│  6. Architect reads proposal files → writes review file     │
│     Main Agent reads ONLY verdict (first lines)             │
│              ┌──────────┴──────────┐                        │
│         APPROVED            CHANGES REQUIRED                │
│              │              Workers revise files → step 6   │
│              ▼                                              │
│  7. Quality reads proposal files → writes review file       │
│     Main Agent reads ONLY verdict (first lines)             │
│              ┌──────────┴──────────┐                        │
│         APPROVED            CHANGES REQUIRED                │
│              │              Workers revise files → step 7   │
│              ▼                                              │
│                                                             │
│  8. Main Agent reads proposal files, applies to codebase    │
│  9. Main Agent verifies build succeeds                      │
│ 10. Update memory/phase-progress.md                         │
│ 11. Phase N complete → proceed to Phase N+1                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Step Details

**Step 1-3: Task breakdown**
The Main Agent reads the phase description in PBR_RENDER_MODE_PLAN.md and splits
it into independent tasks. Creates the working directory. Tasks should have
minimal file overlap. If file overlap is unavoidable, the Main Agent must
specify which sections each Worker owns.

**Step 4: Worker execution**
Workers run in parallel as background agents. Each receives:
- Their specific task description
- The relevant section(s) of PBR_RENDER_MODE_PLAN.md (by reference, not inline)
- Which source files to read (by path, not inline content)
- The output file path to write their proposal to
- Any cross-task context (e.g., "Worker 2 is adding interface X to types.ts")

Workers MUST write their proposal to the assigned file using the Write tool.

**Step 5: Barrier**
The Main Agent waits for ALL Workers to complete before proceeding. No partial
reviews.

**Step 6: Architect review**
The Architect is launched as an agent. It reads ALL proposal files from disk
and the design doc. It writes its review to `architect-review.md`. The Main
Agent reads only the verdict line and required changes list — NOT the full
review text. If changes are required, affected Workers are re-launched to
revise their files.

**Step 7: Quality review**
Same file-based pattern. The Quality agent reads proposal files and the
architect review file. Writes to `quality-review.md`. If Quality requests
structural changes that alter the design, the Architect must re-review after
revision.

**Step 8-9: Apply and verify**
The Main Agent reads each proposal file and applies the changes to the codebase
using Edit/Write tools. Then runs the build (`npm run build`) to verify
compilation. If the build fails, the Main Agent fixes the issue directly (no
need to re-enter the review cycle for build fixes like missing imports).

**Step 10-11: Phase gate and progress**
The Main Agent confirms the phase deliverable (as stated in the plan) is met.
Updates `memory/phase-progress.md` with the completed phase, files changed,
and any notes. This file survives context compaction and allows resuming work
in a new session.

---

## Constraints

1. **No deviation from design doc**: The PBR_RENDER_MODE_PLAN.md is the source
   of truth. If implementation reveals a design issue, pause and discuss with
   the user before changing the plan.

2. **No skipping reviews**: Every line of code must pass Architect → Quality
   before being applied. No exceptions for "simple" changes.

3. **No direct codebase writes by Workers**: Workers propose, Main Agent applies.
   This ensures a single point of control and auditability.

4. **Phase ordering**: Phases execute sequentially (1 → 2 → 3/4 → 5 → 6 → 7).
   Phases 3 and 4 may run in parallel as noted in the plan.

5. **Build verification**: Every phase must end with a successful build.

6. **This process is mandatory**: It applies to all implementation work on the
   Studio mode feature, across all sessions, even after context clearing or
   compaction. See MEMORY.md for the enforcement reference.

7. **File-based communication**: Proposals and reviews live on disk, not in
   conversation. The Main Agent never reads full proposal text into the
   conversation — it reads proposal files section-by-section when applying.
