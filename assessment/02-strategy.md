# Step 4 — Revamp Strategy, Acceptance Criteria & Trade-offs

Written before any application code was changed. The commit that introduces this file precedes
every implementation commit on this branch, and `git log` shows that order.

---

## The problem worth solving

Twelve defects were reproduced. Six are P0. But they are not twelve unrelated bugs — most of them
attack the same thing from different sides:

> **This product exists to turn an interview into a level a human can defend.
> Today it produces a number, hides how much that number is worth, and cannot say the same thing
> twice about the same evidence.**

That is the gap to the ideal condition. Everything else is a symptom.

A recruiter in Indonesia is not short of ways to rank candidates — job boards, ATS keyword filters
and multiple-choice psychometrics are commodities. The scarce thing is **evidence they can put in
front of a hiring manager and defend**: this quote, mapped to this behavioural anchor, at this level
of certainty. When the certainty signal collapses, the product falls back to being an expensive way
to produce an unsourced number, and the candidate — who never chose this and cannot opt out — is
ranked by it anyway.

## Scope of this change

**In:** P0-4 (session deadlock), P0-5 (confidence unreachable), P1-1 (non-determinism), and the
presentation of confidence in the assessor UI.

**Out, deliberately:** the 803-line audio middleware (see Constraint Signal), the schema-level
retention/consent work (P2-6), and the candidate-facing hardware gate (P0-6). Each is defensible
work; none fits in the window with tests I would stand behind. They are named in the report rather
than half-done in the branch.

---

## Options considered

### Option A — Repair the existing coverage machinery *(chosen)*

Keep the state ladder and the two-probe rule. Fix the three places where the implementation
contradicts its own design:

- `probe_count` keeps counting after a skill reaches `covered` (the **state** freezes, the
  **evidence count** should not), so `high` confidence becomes reachable.
- `all_covered?` stops allowing a courtesy discovery to block the end of the interview.
- Portfolio generation becomes deterministic for identical input.
- The UI gives confidence the same visual weight as the level.

**Product impact vs cost.** Buys back the confidence signal, ends the trapped-candidate case, and
makes two runs agree — the three things that decide whether a rating is defensible. Cost is roughly
three small backend edits and one component. Nothing else in the system has to move.

**Long-term maintainability.** Whoever owns coverage already understands this model; the change makes
the code match the PRD it claims to implement rather than introducing a second concept. Every edit is
a few lines and reverts cleanly.

**Failure modes.** `probe_count` is still a number the model reports about itself, so it remains a
proxy for depth rather than a measurement of it. Temperature 0 reduces variance but does not
guarantee a stable model version over time. This buys correctness within the existing design; it
does not make the design right.

**Contextual fit.** The defects are contradictions inside one small, pure, testable module. That is
the highest ratio of product impact to risk available in this codebase, and `StateEngine` and
`MapInjector` have no I/O, so the tests are fast and deterministic — which matters when there is no
CI and no existing suite to lean on.

### Option B — Replace `probe_count` with measured evidence

Stop asking the model how many times it probed. Derive depth from the transcript itself: attribute
candidate turns to skills, store the evidence spans, and compute confidence from how much
quotable material actually exists.

**Product impact vs cost.** This is the *right* answer — confidence would mean something instead of
proxying for something. Cost is a schema change (evidence spans), an analyzer rewrite, a migration
that must be safe against existing rows, and re-tuning the whole coverage prompt. Days, not hours.

**What it forecloses.** Nothing — Option A is a strict subset of the path toward it. Choosing A now
does not make B harder later; it makes B measurable, because A restores the signal you would compare
against.

**Failure modes.** A half-finished attribution model is worse than a working proxy: it would produce
confident-looking confidence with no evidence that it is better. Shipping this partially tested, in
this window, is how you get a disqualifier.

**Why rejected.** Correct, and out of reach. Recorded here as the recommended next step.

### Option C — Let the portfolio model self-report its own confidence

Drop `probe_count` from the formula and ask Gemini Pro to state how certain it is.

**Product impact vs cost.** Cheapest possible change — a prompt edit.

**Failure modes, which are fatal.** We measured this model giving two different levels for identical
input (P1-1). Asking that same model to grade its own certainty replaces a broken *deterministic*
proxy with an *unfalsifiable* one. There would be no way to write a test that catches a regression,
which fails the brief's first baseline standard outright.

**Why rejected.** It makes the number look better while making it less accountable. That is the
opposite of the problem.

---

## Self-derived acceptance criteria

Written before implementation. Each is a test, not a wish.

### AC-1 · Evidence depth keeps accumulating after a skill is covered

| Input | Expected |
|---|---|
| Skill `covered`, `probe_count 2`, analyser reports another meaningful exchange | `probe_count → 3`, state stays `covered` |
| Skill `covered`, analyser proposes a state change | State unchanged — `covered` is terminal |
| Analyser reports an inflated jump (`probe_count 9`) | Increment capped at +1 per run |
| Analyser reports a lower count than stored | Stored count never decreases |
| Skill `covered` at `probe_count 3` | Portfolio may award `high` |

Rationale: the sliding-window cap exists to stop double-counting, and freezing on `covered` exists to
stop the same window re-inflating a finished skill. Both are right. Freezing the *count* along with
the *state* is what is wrong.

### AC-2 · A discovered skill never traps the candidate

| Input | Expected |
|---|---|
| All configured `covered`, one discovered `initiated` | `all_covered? == true` |
| All configured `covered`, no discovered rows | `all_covered? == true` |
| One configured `partial`, all discovered `covered` | `all_covered? == false` |
| No skills configured at all | `all_covered? == false` (never end an empty session) |

Rationale: PRD 01 defines a discovery as a brief courtesy probe, explicitly not the agenda. The
agenda is what the assessor configured, and only the agenda decides when the interview is done.

### AC-3 · Identical input produces an identical rating

| Input | Expected |
|---|---|
| Same transcript + coverage map, generated twice | Same level and confidence per skill |
| Generation config | `temperature: 0`, explicitly set, not defaulted |

Rationale: comparability across candidates is the product's premise. A rating that moves on re-run
cannot support "Gap −1".

### AC-4 · Confidence is legible before the level is believed

| State | Expected |
|---|---|
| `low` confidence | Visually distinct at a glance; the card must not read as settled |
| Any confidence | Rendered at the same visual weight as the level badge, not as a footnote |
| `low` confidence with a confident narrative | The caveat is adjacent to the level, not buried under evidence |
| Long `competency_summary` (>1000 chars) | Wraps and remains readable; no overflow |
| `evidence: []` | Renders an explicit empty state, not a blank gap |
| Narrow viewport (360 px) | Level, confidence and caveat all remain visible without horizontal scroll |

Rationale: `probe_count` and `ai_confidence` already exist in the payload. Showing a level in a
coloured block at `text-base` while showing its reliability in `text-xs` teaches the reader to ignore
the reliability.

### AC-5 · Edge cases named in the brief

| Case | Expected |
|---|---|
| Skill never assessed (`not_yet`, no portfolio row) | Reported as not assessed; never rendered as a level |
| Missing / null `ai_confidence` | Treated as `low`, never as `high` |
| Model call fails during analysis | Coverage keeps its previous state; nothing is invented |
| Model returns unparseable JSON | Analysis is a no-op; the interview continues |
| Model proposes a state outside the vocabulary | Ignored; current state retained |
| `probe_count` returned as a string or `nil` | Coerced safely; never crashes, never decreases |
| Two generations race | Second must not silently destroy the first's assessor overrides |

---

## What "done" means for this branch

1. Every acceptance criterion above has a spec.
2. Each behavioural fix has a spec that was **watched failing before the fix existed** — the red run
   is recorded in the report.
3. A seeded fault on a scratch branch proves the suite catches a regression, and the history of that
   branch stays visible.
4. No test assertion is weakened to make anything pass.
5. Nothing in `api/config/application.yml`, `.env`, or any key reaches a commit.
