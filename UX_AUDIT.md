# Kaizen — UX & User-Journey Audit

Method: booted the app locally (`npm run dev`), traced both onboarding journeys end-to-end through the actual page components and the server-rendered portfolio output, and evaluated against standard UX heuristics (visibility of system status, error prevention/recovery, match between system & real world, consistency, accessibility). Findings below are grouped by journey; each is marked **Fixed** (done in this pass) or **Noted** (follow-up).

---

## Journey A — Vibe Coder (creator)

`Landing → Welcome (choose Vibe Coder) → CreatorSetup (name + GitHub) → Creator Dashboard → portfolio`

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| A1 | After CreatorSetup the user landed on an **empty dashboard** even though they'd just typed their GitHub username — nothing happened until they hunted for the import button. Classic dead-end. | High | **Fixed** — dashboard auto-starts the GitHub import (once) when a username exists and there are no projects. |
| A2 | GitHub import gave **no terminal feedback** — success/failure only showed as a transient inline line. | High | **Fixed** — toasts on success/failure for both creator and org imports. |
| A3 | A bad GitHub username produced a **generic "Import failed."** | Medium | **Fixed** — backend validates the user up front and emits a `fatal` SSE event with a specific message ("user not found" / "rate limit"); frontends surface it. |
| A4 | Import progress was a text counter with **no visual progress**. | Medium | **Fixed** — progress bar + an "Reading your repositories…" reassurance card during the (minute-long) import. |
| A5 | **Resume-only dead-end**: a creator who skipped GitHub and only uploaded a resume had **no button to generate a profile** (the generate/regenerate control only appeared once projects existed). | High | **Fixed** — the control now appears when there are projects **or** sources, labelled "Generate profile" until one exists. |
| A6 | Three stacked prompts (connect panel + sources card + empty-state card) on first load felt cluttered/redundant. | Low | **Fixed** — removed the redundant empty-state card; connect + sources remain. |
| A7 | Icon-only **Regenerate** and source **delete (trash)** buttons had no labels/tooltips. | Medium (a11y) | **Fixed** — `aria-label` + `title` on both. |
| A8 | Adding a resume/site gave no confirmation. | Low | **Fixed** — toasts on source add/remove + error cases. |
| A9 | Portfolio/project pages were not visually verifiable in-app (auth-gated). | — | Verified by rendering real sample output to HTML and inspecting: hero/bio, featured, skills, project grid, connections graph, per-project pages all render; XSS-escaped; `javascript:` URLs blocked. |

## Journey B — Organisation

`Landing → Welcome (choose Organisation) → OrgSetup → Dashboard → products / GitHub import`

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| B1 | OrgSetup showed **"Step 2 of 3"** with a 3-segment bar, but there is no step 3 — the flow ends at setup. | Medium | **Fixed** — "Step 2 of 2" with a 2-segment bar. |
| B2 | **No way back** from OrgSetup to the Welcome chooser (couldn't switch to Vibe Coder after picking Organisation). CreatorSetup had a back button; OrgSetup didn't — inconsistent. | Medium | **Fixed** — Back button in create mode. |
| B3 | The **"Upload a company deck to auto-fill" button did nothing** — the handler was an empty stub (`onChange={() => {}}`). A button that silently no-ops is a broken-promise UX defect. | High | **Fixed** — hidden in create mode (no org id to extract into yet); **wired** in edit mode to `POST /:orgId/extract`, auto-filling the form + toast. |
| B4 | Org GitHub import ran the **creator profile synthesis** (wasted LLM call + an odd "Building your profile…" message for a team workspace). | Low | **Fixed** — profile synthesis is now gated to `kind='creator'`. |

## Cross-cutting

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| X1 | `npm run dev` **crashed on macOS** (`ENOTSUP` — `reusePort: true` is Linux-only), so no Mac dev could run the app. | High (DX) | **Fixed** — `reusePort` enabled only on Linux. |
| X2 | Login tagline said "Product knowledge platform" — stale now that creators are first-class. | Low | **Fixed** — "Context & portfolio platform for teams and builders". |
| X3 | No security headers / rate limiting (also audit S9). | Medium | **Fixed** earlier — helmet + per-IP + heavy-route limiters (verified live: `X-Frame-Options`, `RateLimit-Policy` headers present). |

---

## Noted for follow-up (not blocking)
- **Auth-gated visual QA**: the authenticated flows (Welcome chooser, dashboards, in-app portfolio links) couldn't be click-tested here without real Google OAuth + DB/Supabase. Recommend a manual pass once env is set.
- **Import latency**: even at 3-way concurrency, a large account (15 repos × extractor+synth) can take a minute+. Consider a background job + "we'll email/notify you" pattern for very large accounts.
- **Mobile**: layouts use responsive grids and flex-wrap and should hold up; verify the creator profile header button column and the SVG graph (horizontal-scrolls) on a real phone.
- **Toast consistency**: org-side product create/delete still use inline patterns; could adopt toasts for full consistency.
