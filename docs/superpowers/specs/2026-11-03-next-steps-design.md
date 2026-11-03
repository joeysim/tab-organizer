# Next steps — Tab Organizer (post-2.4.3)

**Date:** 2026-11-03
**Status:** proposed, awaiting approval
**Baseline:** `main` at `8152131`, `dist` = `2.4.3-dev.8152131`, 130 tests, typecheck clean, verify-build PASS

---

## Where things actually stand

Released: **v2.4.3** (tag `v2.4.3`, zip attached, CWS-valid layout).

Unreleased on `main`, six commits past that tag:

- **AI plans** — capabilities exposed as tools, targeted by selector, preview → approve → undo
- **App windows** hidden by default, with an "Include app windows" setting
- **Work-based grouping prompt** — groups by project rather than by website, with a `why` line per group
- **The Lab** — bottom-center button, baked recipes, locally computed proposals, free-form composer

**What has not happened:** none of the above has been exercised in a real Chrome profile. Everything is verified by jsdom/unit tests, a headless harness with mocked `chrome.*`, and `verify-build`. That gap is the single biggest risk in this document.

---

## Open question that changes scope

**Does the Lab need conversation context?**
Today each request is standalone. The right pane had a thread that let "now do the same for figma" work; it was dropped when the Lab replaced it.

- *If yes:* the plan modal becomes multi-turn — the last N turns ride along in the planning prompt. ~1 day, and it makes follow-ups reliable.
- *If no:* say so and the Lab stays a menu. Cheaper, and the recipes cover the common cases.

**Recommendation:** yes, but not yet. Ship the released surface first, then add history inside the plan modal (not a persistent column) once the Lab has been used in anger.

---

## Work item 1 — Smoke test the unreleased surface

**Why:** six commits of UI have never met a real browser. Prior bugs in this project (settings modal unstyled, CSS missing, duplicate element IDs) were all invisible to tests and obvious on screen.

**Do:** load `dist/` unpacked; walk this list and record pass/fail in a comment on the release PR.

| # | check | expected |
|---|---|---|
| 1 | LAB button, bottom center | opens popover over the button, clip-path reveal |
| 2 | proposals | reflect actual tabs (duplicates, busy host, ungrouped count) |
| 3 | "Group tabs by project" | editable preview: drag between groups, `×`, rename, Ungrouped zone |
| 4 | "Close duplicate tabs" | plan preview → Approve → tabs close |
| 5 | Undo | bar appears, restores closed tabs and groups |
| 6 | Esc / click-outside in Lab | closes |
| 7 | Cmd/Ctrl+K | toggles Lab |
| 8 | Settings toggle "Include app windows" | PWA tabs vanish/return live |
| 9 | Grouping with real, messy tabs | names describe work, not sites |

**Acceptance:** every row passes, or the failure is filed with a screenshot.

**Estimate:** 30 minutes of clicking.

---

## Work item 2 — Default grouping model → `glm-5.3-flash`

**Why:** measured. On 20 labelled tabs both models scored ARI 1.000; `glm-5.3-flash` avoids the reasoning tokens that dominate latency and cost.

**Do:** change `LUNAROUTE_MODEL` in `src/lib/ai/lunaroute.ts`; re-run the live check against the gateway on two sets (ambiguous titles, same-domain sub-topics).

**Acceptance:** same groups as `muse-spark-open` on both sets; note the wall-clock difference in the commit message.

**Risk:** one experiment, 20 tabs. If quality drops on a real set, revert to `muse-spark-open` — it's a one-line change either way.

**Estimate:** 1 hour including verification.

---

## Work item 3 — Release v2.4.4

**Why:** v2.4.3 predates plans, the Lab, and the settings changes. Users on the released zip have none of it.

**Do:**
1. bump `package.json` + `src/manifest.json` to `2.4.4`
2. `pnpm test && pnpm typecheck && pnpm build:release && pnpm package`
3. inspect the zip: `manifest.json` at root, no `src/`, `version_name` = `2.4.4`
4. `git tag -a v2.4.4 && git push --tags`
5. `gh release create` with notes covering plans + Lab + grouping

**Acceptance:** zip at archive root, `verify-build` PASS, release notes list the three features, `dist` version reads `2.4.4`.

**Estimate:** 30 minutes, gated on work item 1.

---

## Work item 4 — Preserve the experiment harness

**Why:** the grouping investigations (embeddings, Readability+TF-IDF, decision-per-tab) live in `/tmp` and will vanish. The negative results are as valuable as the positive one — they stop us re-litigating.

**Do:** move to `docs/experiments/` with a short README stating what each script measures, the recorded numbers, and the caveats (small hand-labelled sets, single runs). Not wired into `pnpm test`; run manually.

**Acceptance:** `docs/experiments/README.md` reproduces the ARI table in this document.

**Estimate:** 1 hour.

---

## Explicitly not doing (with evidence)

Recorded so these do not come back without new information.

| idea | measured outcome | verdict |
|---|---|---|
| Embedding clustering via LunaRoute | no embedding-capable model exists; `/v1/embeddings` returns `model_not_embedding_capable` for every chat model, `model_not_found` for `text-embedding-*` | blocked |
| Readability + TF-IDF clustering | ARI −0.071 vs 0.143 for titles alone on same-domain tabs | worse |
| Raw page text into the prompt | shared domain vocabulary merges distinct projects (ARI −0.071) | harmful |
| Per-tab decision model | ARI 0.281–0.871 with 20 calls, 15–36s, vs 1.000 with 1 call, 2.8s | worse and 20× cost |
| Hand-rolled density extractor | 24% more tokens than Readability; +348% on a news page | not a substitute |
| Sending page content for grouping | not needed: URLs carry project identity (ARI 1.000) | skip |

**The one measured improvement** that remains unexploited: an LLM *summary* per tab raised ARI 0.143 → 0.737 on URL-opaque tabs. It is deliberately deferred — it costs a model call per tab and the cases it helps are detectable heuristically. Revisit only if real tabs show grouping failures that titles+URL cannot resolve.

---

## Known gaps, unscheduled

- **`moveToGroup` silently creates a missing group.** A plan that names a group that doesn't exist produces a new group instead of reporting the mismatch. Probably right, but unconfirmed — worth a decision.
- **Undo window is 20 seconds.** After that, closed tabs are recoverable only from history.
- **Grouping ignores pinned tabs' intent** — pins are not treated as a signal.
- **Proposals are heuristic only.** Duplicates, a busy host, ungrouped count. No handling of near-duplicate URLs (tracking params, `#fragments`).
- **No i18n, no keyboard map help screen.**

---

## Suggested order

1. **Smoke test** (work item 1) — everything else is guesswork until the UI has been seen
2. **Model switch** (2) — one line, immediate cost win
3. **Release 2.4.4** (3) — after 1 and 2
4. **Harness** (4) — anytime, no dependencies

The conversation-context question should be answered before the next feature cycle, not before this release.
