# Kaizen / Orchestral-AI — Codebase Audit (Diagnostic Pass)

**Scope:** Read-only diagnostic. No application code was modified. Every finding cites a file path + line range and is classified `confirmed` or `suspected`. Fix directions are one-liners, **not implemented**.

**Audited at:** repo `HEAD` = `8011a86 Add kaizen documentation site`.

---

## Part 1 — System Map (actual current architecture)

### Entry & wiring
- `server/index.ts` — Express app. `dotenv/config` first (✓), `trust proxy 1`, Postgres-backed session store (`connect-pg-simple`), Passport Google OAuth, then `registerRoutes()`. Vite dev middleware in dev, static serve in prod. Listens on `PORT` (default 5000).
- `server/auth.ts` — Passport Google strategy; `requireAuth` middleware (authentication only — **no authorization**).
- `server/routes.ts` — all `/api/*` routes (1468 lines). `app.use("/api", requireAuth)` gates everything except `/api/auth/me`.
- `server/db.ts` — Drizzle over `node-postgres` pool (max 5). `server/supabase-storage.ts` — Supabase client with **service key** (full storage admin), buckets `pkb-store` and `uploads`.

### Data flow (as actually coded)
```
upload (multer memory) ──► processUploadedFile ──► Supabase uploads bucket + addDocumentInput (PKB.meta.inputs)
fetch-url ──► fetchUrlContent (axios+cheerio) ──► storeUrlText (uploads bucket) + addUrlInput
        │
        ▼
POST /process (SSE):
  read stored docs/urls ──► chunkText(16k) ──► extractFromMultipleChunks (Information Extractor, gpt-4o, temp 0.2)
       ──► dedupe/merge ──► batchApplyUpdates (PKC curator, single modifyPKB lock)
       ──► runSynthesizer (deterministic score + 1 LLM call → brief/personas/gaps) [synchronous]
       ──► generateInitialSummary (LLM) ──► insert [INGESTION_COMPLETE:N] message ──► done
        │
        ▼
Learner chat  (/chat)   ──► processFounderResponse ──► applyProposedUpdate (per-fact) ──► scheduleSynthesizer(3s)
Explainer     (/explain)──► streamExplainProduct (tiered by confidence) ──► persists both turns
Fill gaps     (/fill-gaps)──► direct modifyPKB write (NO curator) ──► scheduleSynthesizer(3s)
CI chat       (/organisations/:id/chat) ──► explainCIChat (dashboard_chat | app_guide)
```

### PKB JSON schema as written by code
`shared/schema.ts` `pkbSchema`: `meta`, `facts` (core), `extensions.{b2b,b2c}`, `derived_insights`, `gaps.{current,history}`, `conflicts[]`, `personas[]`, `icps[]`, `review_inbox[]`. Facts are `FactField` wrappers `{value, sources[], quality_tag?, notes?, lifecycle_status?, sensitive?, approved?, ...}`. PKB stored at `pkb-store/product_{id}/pkb.json` + timestamped snapshots (cap 25). Downloads use 60 s signed URLs to bypass CDN cache.

### Mutex coverage
`withPKBLock`/`modifyPKB` (pkb-storage.ts) wrap: extractor batch writes, interviewer per-fact writes, synthesizer write-back, fill-gaps, inbox resolve, declined-fields, conflict resolve. **Org PKB writes do NOT use a lock** (`saveOrgPKB`/`updateOrgPKBFields`/`addOrgConflict` are plain load-modify-save) — see C-cluster / M11.

### Drift vs intended architecture (flagged)
- **2 agents + 2 pipelines:** matches (Learner=interviewer, Explainer, Extractor, Synthesizer). ✓
- **Deterministic confidence:** field-coverage + source-diversity are deterministic; **quality modifier is degenerate** because `lifecycle_status` is never written (D/H6).
- **Per-product mutex on all PKB writes:** mostly true for product PKB; **fill-gaps and org PKB partially bypass** the intended safety (M1, M11).
- **Sensitive-field hard gate + lifecycle state machine + review inbox:** **declared in schema but not implemented** (H6, H7, H8).
- **Docs stale:** CLAUDE.md claims `PKBMeta` fields are cast `any` (now declared, schema.ts:317-321) and that deprecated `/api/sessions` routes exist (they don't). (L3, L4)

---

## Part 2 — Findings

### A. Gap detection & fill (highest priority)

**A1 · HIGH · Gap detection has no deterministic enforcement — false positives & non-determinism · `server/agents/synthesizer-function.ts:329-334, 384-404, 466-525` · confirmed**
Gaps are produced entirely by the LLM. The `FIELD STATUS MAP` and "NEVER generate a gap for populated fields" rule are *prompt instructions only* — there is **no code that filters gaps whose `field_path` is in the `populated` set**. The synthesizer runs at `temperature: 0.2` (not 0), so the same PKB can yield different gaps run-to-run, and the model can (and will) emit gaps for already-filled fields.
*Why it matters:* this is the "known-suspect" subsystem — it directly causes gaps reported for knowledge that already exists and gaps that re-appear after fill.
*Fix direction:* after the LLM returns, drop any gap whose normalized `field_path` is in `populated` before writing `gaps.current`.

**A2 · HIGH · Conflict-resolution gaps are silently wiped by the next synthesis · `server/services/pkc-curator.ts:240-246` vs `server/agents/synthesizer-function.ts:496-525` · confirmed**
When the curator detects a value conflict it pushes a `gap_conflict_<id>` (severity `critical`) into `gaps.current`. The synthesizer **replaces `gaps.current` wholesale** (archiving to history) with LLM-generated gaps. Because `scheduleSynthesizer` fires 3 s after any write, the conflict-resolution gap disappears from the UI within seconds and is never regenerated (the LLM is not told about `conflicts[]`).
*Why it matters:* conflicting facts silently lose their "please resolve" surface; the conflict persists in `pkb.conflicts` but the user is never prompted.
*Fix direction:* re-derive conflict gaps from `pkb.conflicts` (unresolved) on every synthesis and merge them into `gaps.current`.

**A3 · HIGH · Re-ingesting documents fabricates "conflict" critical gaps on array fields · `server/services/pkc-curator.ts:113-125, 207-254` · confirmed**
`valuesConflict` JSON-stringifies and compares. For array fields (`features`, `use_cases`, `pricing.tiers`, …) any second ingestion with a *different* array (the normal case) is treated as a conflict → a `critical` gap + `conflicts[]` entry is created instead of merging. Cross-chunk merge in `deduplicateUpdates` only protects within a single `/process`; a *second* uploaded doc bypasses it.
*Why it matters:* every multi-document product accumulates spurious "I found conflicting information about features…" critical gaps, inflating `criticalGapsCount` and blocking the Learner's session-end condition.
*Fix direction:* for known array field paths, merge/union arrays instead of routing through conflict detection.

**A4 · MEDIUM · `do_not_ask` carry-forward over-suppresses unrelated gaps · `server/agents/synthesizer-function.ts:505-521` · confirmed**
Carry-forward matches on **last path segment** as a fuzzy fallback. Marking `facts.pricing.model` as do-not-ask also suppresses any future gap ending in `model` (e.g. `extensions.b2c.monetization.model`).
*Why it matters:* real missing knowledge (false negative) is hidden after the user skips a same-named field.
*Fix direction:* drop the last-segment fuzzy match; carry forward on full `field_path` only (or section-qualified path).

**A5 · MEDIUM · Declined fields are not passed to gap generation · `server/agents/product-interviewer.ts:332-341` vs `server/agents/synthesizer-function.ts:370-382` · confirmed**
Learner refusals are stored in `meta.inputs.declined_fields`, but the synthesizer's skip list reads only `gaps.current[].do_not_ask`. Declined fields are therefore re-proposed as gaps on the next synthesis.
*Why it matters:* user explicitly declined info keeps coming back as gaps.
*Fix direction:* include `meta.inputs.declined_fields` in the synthesizer's `SKIPPED BY USER` block (and filter them post-LLM).

**A6 · MEDIUM · Field-status map ignores extensions · `server/agents/synthesizer-function.ts:275` · confirmed**
`buildFieldStatusMap` only walks `pkb.facts`. B2B/B2C extension fields are absent from both the "populated" and "empty" lists, so the LLM has zero guidance about extension coverage even though the confidence score weights those fields.
*Why it matters:* false-positive gaps for already-filled extension fields; missed gaps for empty ones.
*Fix direction:* also walk `pkb.extensions.b2b`/`.b2c` into the status map.

**A7 · MEDIUM · `/fill-gaps` bypasses the curator — no validation, no conflict detection, can corrupt arrays · `server/routes.ts:1070-1100` · confirmed**
Gap answers are written via raw `setNestedValue` into a hand-built `FactField`. This skips `validateProposedUpdate`, conflict detection, org-conflict detection, and source rules. If a gap targets an array field (`features`, etc.), the answer string overwrites the entire array with a scalar `FactField`, and any existing value is silently overwritten with no conflict raised.
*Why it matters:* data corruption / silent overwrite of evidenced facts during gap fill.
*Fix direction:* route gap answers through `applyProposedUpdate`/`batchApplyUpdates` (or at least array-aware merge + conflict check).

**A8 · LOW · Gap IDs are non-deterministic (`Date.now()`) · `server/agents/synthesizer-function.ts:221` · confirmed**
Contradicts the "deterministic gap" intent; harmless in practice because fill-gaps keys on `field_path`, not `gap_id`. Worth noting for the conflict-gap filter in `resolveConflict` which matches `gap_id.includes(conflictId)` (pkc-curator.ts:398-401).

### B. Agent system prompts (quality audit)

**Learner (`product-interviewer.ts`)**
- Role clarity: **good.** Scope ("never enumerate gaps", "one topic", refusal handling) is explicit (lines 142-187).
- State fidelity: all 6 modes present and reachable via `computeLearnerMode` (base-agent.ts:104-114). Transition logic is coherent. **B1 · LOW:** `wrong_door` requires `triggeredBy === "teammate"`, but `SessionContext.triggeredBy` is hardcoded `"founder"` (base-agent.ts:90) — `wrong_door` is currently **unreachable**. (`confirmed`, gated on auth/roles per design.)
- Grounding: strong ("never ask about known facts", existing facts injected). 
- Output contract: JSON shape enforced via `parseJSONResponse`; falls back to a safe canned reply on parse failure (lines 290-296). ✓
- **B2 · LOW · Dead `[INGESTION_COMPLETE]` instruction · `product-interviewer.ts:150-153` + `base-agent.ts:228,239` · confirmed:** the prompt tells the Learner how to react to `[INGESTION_COMPLETE: N gaps found]`, but `buildConversationHistory` filters any `[INGESTION_COMPLETE:\d+]` message out of history before the LLM sees it. The instruction can never fire. (Also a wording mismatch: stored format is `[INGESTION_COMPLETE:3] …`, prompt expects `[INGESTION_COMPLETE: N gaps found]`.)

**Explainer (`product-explainer.ts`)**
- Confidence tiering: encoded and matches code thresholds (`getAnswerMode` 73-77 ↔ CLAUDE three-tier). ✓
- Guide/Knowledge surfaces: clear, well-separated prompts. ✓
- Grounding: "answer only from KB" present. **B3 (see H8)**: no sensitive-field gating — the prompt is happy to answer from pricing/roadmap/etc. because those values are rendered into context unfiltered.
- Output contract: `<suggested_questions>` block parsed by `ChatTab.parseSuggestedQuestions` (ChatTab.tsx:47-53). ✓ consistent.

**Cross-component consistency**
- **B4 · MEDIUM · Severity vocabularies diverge · `synthesizer-function.ts:27` / `shared/schema.ts:220` · confirmed:** synthesizer LLM emits `critical|standard`; gap schema enum is `critical|important|nice_to_have`; `mapToGap` maps `standard→important`. Works, but `criticalGapsCount` (base-agent.ts:70) only counts `critical`, so all standard gaps are invisible to Learner mode logic and the session-end trigger. Intentional? (also Open Q).

### C. PKB write integrity & concurrency

**C1 · CRITICAL · Transient load failure wipes the entire PKB · `server/services/pkb-storage.ts:42-53, 152-166` · confirmed**
`loadPKB` catches **all** errors and returns `null` (162-165). `modifyPKB` treats `null` as "doesn't exist" and **reinitializes an empty PKB, then saves it** (47-48), destroying every captured fact, persona, gap and conflict. Any transient Supabase/network error during a download — which `downloadJSON` throws on for non-404 (lines 82, 91) — therefore silently overwrites a populated PKB with an empty one. The recovery also hardcodes `"b2b"` (48), corrupting the product type.
*Why it matters:* total, silent product-knowledge loss on a flaky read. Highest-impact bug in the codebase.
*Fix direction:* distinguish "not found" (→ null/initialize) from "load error" (→ throw and abort the mutation); never auto-initialize inside `modifyPKB` on error.

**C2 · MEDIUM · `withPKBLock` leaks map entries under contention · `server/services/pkb-storage.ts:16-30` · confirmed**
The map stores `existing.then(() => gate)` for chained callers, but cleanup checks `locks.get(productId) === gate`. For any caller after the first, that comparison is false, so the entry is never deleted (only the single-uncontended-caller case cleans up). One stale resolved promise leaks per product that ever saw concurrent writes.
*Why it matters:* slow unbounded growth of the locks map over process lifetime; minor.
*Fix direction:* compare against the actually-stored tail promise, or delete unconditionally when the chain drains.

**C3 · MEDIUM · Org PKB writes are unsynchronized (read-modify-write race) · `server/services/pkb-storage.ts:323-371` · confirmed**
`addOrgConflict`, `resolveOrgConflict`, `updateOrgPKBFields` all do `loadOrgPKB → mutate → saveOrgPKB` with no lock. Concurrent org-conflict detection (fired per accepted fact in `batchApplyUpdates`, pkc-curator.ts:317-330) plus a PATCH can lose writes.
*Fix direction:* add an org-scoped lock analogous to `withPKBLock`, keyed by `org_{id}`.

**C4 · HIGH · Confidence "quality modifier" is degenerate because `lifecycle_status` is never written · `server/services/pkc-curator.ts:256-261`, `server/routes.ts:1074-1083`, `server/agents/synthesizer-function.ts:154-171` · confirmed**
No write path ever sets `FactField.lifecycle_status` (grep confirms it's only *read* in scoring/inbox and only *set* on personas). So `qualityScores` always uses the `0.6` default (synthesizer-function.ts:164), making the 20-pt quality modifier a constant `12` for every product regardless of evidence. The V1 lifecycle state machine (`asserted→evidenced` on second source, `disputed`, `stale`) is entirely unimplemented.
*Why it matters:* a third of the confidence formula's design is inert; "evidenced" vs "inferred" never affects score; staleness never detected.
*Fix direction:* set `lifecycle_status` when writing facts (curator + fill-gaps), and implement the second-source→`evidenced` upgrade in the merge branch (pkc-curator.ts:208-219).

### D. LLM pipelines (Extractor & Synthesizer)

**D1 · MEDIUM · Synthesizer is non-idempotent in a user-visible way · `server/agents/synthesizer-function.ts:471-526` · confirmed**
Each run (a) fully replaces `personas` with `status:"candidate"` / `lifecycle_status:"inferred"` (mapToPersona 207-217), discarding any confirmation state a user set, and (b) regenerates gaps from an LLM at temp 0.2. Re-running synthesis on an unchanged PKB therefore mutates persona status and can change gaps.
*Why it matters:* founder persona confirmations are wiped on the next KB write; "established" KBs churn.
*Fix direction:* merge personas by stable key, preserving `status`/`lifecycle_status` for ones the user touched.

**D2 · MEDIUM · Extractor/Synthesizer parsing relies on greedy regex fallback · `server/agents/base-agent.ts:249-265` · suspected**
`parseJSONResponse` falls back to `/\{[\s\S]*\}/` (first `{` … last `}`). For JSON-mode calls (extractor, synthesizer) this is safe; for any text-mode call that happens to contain braces it can mis-parse. Failures return `null` and the caller aborts/returns canned text — generally handled, but silent.
*Fix direction:* prefer `response_format: json_object` everywhere structured output is required (already done for these two) and log raw output on parse failure (already partially done).

**D3 · LOW · Extractor temperature/model OK; Synthesizer maxTokens 4096 may truncate large PKBs · `synthesizer-function.ts:409-413` · suspected**
A content-rich PKB rendered via `formatPKBForContext` + 3-paragraph brief + ≤3 personas + gaps can approach the 4096 completion cap, producing truncated JSON → parse failure → whole synthesis returns `null` (no brief/score written).
*Fix direction:* monitor `finish_reason: "length"`; raise cap or split persona/gap generation.

### Broader sweep

**S1 · CRITICAL · Broken access control / IDOR across nearly all routes · `server/routes.ts` (319, 416, 446, 519, 692, 734, 804, 864, 956, 1047, 1192, 1217, 1260, 1313, 1423) · confirmed**
`requireAuth` only checks `req.isAuthenticated()` (auth.ts:91-96). **No route verifies the user is a member/owner of the product or org it operates on** (except `DELETE /products/:id` which checks `owner_id`, and the two list/read endpoints that join through `productMembers`/`organisationMembers`). Any logged-in user can, for arbitrary `:productId`/`:orgId`: read the full PKB (`GET /products/:id`), upload/ingest, run `/process`, chat, `/fill-gaps`, read/resolve the inbox, **PATCH another org's record** (`PATCH /organisations/:orgId`), read any org PKB, and resolve org conflicts. `POST /products` accepts an arbitrary `orgId` in the body with no membership check (271-292) → create products in other orgs.
*Why it matters:* complete tenant isolation failure; the app is being prepped for public deploy.
*Fix direction:* add an authorization middleware that asserts membership for `:productId`/`:orgId` (join `product_members`/`organisation_members` on `req.user.id`) and validate `orgId` ownership on product creation.

**S2 · HIGH · Conversation history loads the OLDEST 20 messages, not the most recent · `server/routes.ts:900-906, 1007-1014` · confirmed**
Both `/chat` and `/explain` do `.orderBy(messages.created_at).limit(20)` — ascending, so for any conversation longer than 20 messages the LLM only ever receives the **first** 20 messages and never sees recent turns. `buildConversationHistory` then walks those backward. CLAUDE.md says "last 20."
*Why it matters:* multi-turn context silently breaks in longer conversations — the documented headline feature is wrong.
*Fix direction:* `.orderBy(desc(messages.created_at)).limit(20)` then reverse, or order by `id` for stable tie-breaking.

**S3 · CRITICAL · Default `SESSION_SECRET` · `server/index.ts:48` · confirmed (deploy-conditional)**
`secret: process.env.SESSION_SECRET || "dev-secret-change-in-production"`. If the env var is unset in production, session cookies are signed with a public, hardcoded secret → any actor can forge a session and impersonate any user.
*Fix direction:* fail fast (throw) at boot if `SESSION_SECRET` is unset in production.

**S4 · HIGH · Review-inbox population is dead code · `server/services/inbox-populator.ts` (entire file) · confirmed**
`populateInbox` is never imported or called anywhere (grep confirms). Therefore `pkb.review_inbox` is never populated; the product inbox (`GET /products/:id/inbox`, routes.ts:734-747) is always empty. Consequence cluster:
- Sensitive-field approval never surfaces (also nothing sets `sensitive:true`).
- Detected `conflicts[]` are never surfaced to the product inbox.
- Persona/ICP confirmation never offered — *and* the trigger condition (`persona.status === "active"`, inbox-populator.ts:129) can never match synthesizer output, which sets `status:"candidate"` (mapToPersona).
*Fix direction:* call `populateInbox` after synthesis/curation, and fix the persona status predicate.

**S5 · HIGH · Sensitive-field hard gate unimplemented · `server/services/pkc-curator.ts:256-261`, `server/agents/product-explainer.ts:285-465` · confirmed**
CLAUDE governance: pricing / customer_names / security_claims / roadmap must "NEVER auto-commit, NEVER expose without approval." In reality the extractor proposes pricing, the curator commits it as an ordinary `FactField` (no `sensitive`/`approved` flags ever set), and `formatPKBForContext` renders **all** facts — including pricing — straight into the Explainer's context for any caller.
*Why it matters:* the documented governance boundary does not exist; sensitive data is auto-committed and exposed.
*Fix direction:* tag sensitive field paths on write (`sensitive:true, approved:false`), exclude unapproved-sensitive from `formatPKBForContext`, and surface them via the inbox (S4).

**S6 · MEDIUM · SSRF in URL fetch / crawl · `server/services/ingestion-service.ts:70-138, 156-304` · confirmed (code-level)**
`fetchUrlContent` and `crawlWebsite` request arbitrary user-supplied URLs with no allowlist or block of private/link-local ranges (`127.0.0.1`, `10/8`, `169.254.169.254`, `localhost`, internal hostnames). On a cloud host this can reach the metadata endpoint and internal services.
*Fix direction:* resolve + validate the target IP is public before fetching; reject private/loopback/link-local; restrict redirects.

**S7 · MEDIUM · Unsupported file types are read as UTF-8 and fed to the LLM · `server/services/ingestion-service.ts:24-25` · confirmed**
`extractTextFromFile`'s default branch `fs.readFileSync(filePath, "utf-8")` handles any unknown extension by treating binary bytes as text. Multer's `fileFilter` (routes.ts:160-175) admits a file if **either** mimetype or extension matches, and the org `/extract` path also uses `extractTextFromFile`. A mislabeled/binary file produces garbage facts rather than a clean rejection.
*Fix direction:* whitelist parseable extensions in `extractTextFromFile`; throw on unknown types.

**S8 · MEDIUM · Full response bodies (incl. PKB content & user email) logged to stdout · `server/index.ts:108-132` · confirmed**
The logger appends `JSON.stringify(capturedJsonResponse)` for every `/api` response — including `/api/auth/me` (email), full PKB payloads, and org data.
*Why it matters:* PII / proprietary product data in plaintext logs; relevant to the data-protection obligations the project operates under.
*Fix direction:* log status + duration only, or redact/limit the body.

**S9 · MEDIUM · No rate limiting / hardening (Phase 5 incomplete) · `package.json`, `server/index.ts` · confirmed**
No `express-rate-limit`, `helmet`, or CORS config present (grep). Both PG pools use `ssl: { rejectUnauthorized: false }` (db.ts:13, index.ts:39) — accepts any certificate (MITM exposure). CLAUDE.md lists rate limiting as a deploy phase that isn't done.
*Fix direction:* add rate limiting on auth + LLM routes; add helmet; pin/verify DB TLS.

**S10 · MEDIUM · "First Explainer use" wow-moment can never trigger for Explainer-first conversations · `server/routes.ts:986-1002` + `client/.../ChatTab.tsx:169-194` · suspected**
`isFirstExplainerUse` = "user has zero conversations with `mode='explainer'` for this product." But `newConvMutation` creates the conversation with the current toggle `mode`; if the user is on the Explainer toggle, the new conversation is already `mode:"explainer"`, so the count is ≥1 and the suggested-question chips never render.
*Fix direction:* base "first use" on message count / a dedicated flag, not conversation mode.

**S11 · LOW · Optimistic chat messages are clobbered by refetch · `client/.../ChatTab.tsx:128-131, 201-224` · suspected**
`useEffect(... setLocalMessages([...convMessages]) , [selectedConvId, convMessages])` resets local state on every messages refetch. Combined with `invalidateQueries` after send, optimistic UI can briefly flicker/duplicate. Low impact because the server persists before `done`.

**S12 · LOW · `streamInterviewerResponse` is dead and drops history · `server/agents/product-interviewer.ts:391-404` · confirmed**
Not used by `/chat` (which calls `processFounderResponse` directly with history then word-streams itself). The dead generator also calls `processFounderResponse` with no `conversationHistory`. Safe to delete.

**S13 · LOW · Message ordering keys are inconsistent · `server/routes.ts:854` (by `id`) vs `:904/1012` (by `created_at`) · confirmed**
History for the LLM orders by `created_at` (default `now()`), which can tie within the same second and scramble user/assistant order; the messages GET uses `id`. Use `id` consistently.

**S14 · LOW · Upload / URL-cache name collisions overwrite · `server/services/ingestion-service.ts:366, 396-400` · confirmed**
`safeName` sanitization + `upsert:true` means two differently-named files that sanitize alike overwrite each other; URL slug truncated to 120 chars collides for long shared-prefix URLs.

**S15 · LOW · Doc drift · `CLAUDE.md` · confirmed**
(a) Claims `PKBMeta` synthesizer fields are cast `any`/undeclared — they're declared (schema.ts:317-321). (b) Claims deprecated `/api/sessions` routes exist in `routes.ts` — none present. Update the debt list.

---

## Part 3 — Prioritized Backlog

| Rank | ID | Sev | Subsystem | File:line | One-line |
|------|----|-----|-----------|-----------|----------|
| 1 | C1 | Critical | PKB integrity | pkb-storage.ts:42-53,162 | Transient load error reinitializes & overwrites PKB → total data loss |
| 2 | S1 | Critical | Auth/routes | routes.ts (many) | No authorization — any user reaches any product/org (IDOR) |
| 3 | S3 | Critical | Auth/config | index.ts:48 | Hardcoded fallback `SESSION_SECRET` → forgeable sessions in prod |
| 4 | S2 | High | Chat history | routes.ts:900,1008 | Loads oldest 20 msgs, not most recent → multi-turn context broken |
| 5 | A2 | High | Gaps | curator:240 / synth:525 | Synthesis wipes conflict-resolution gaps |
| 6 | A3 | High | Extractor/curator | pkc-curator.ts:113,207 | Re-ingest fabricates conflict gaps on array fields |
| 7 | A1 | High | Gaps | synthesizer:466-525 | No code enforcement → false-positive / non-deterministic gaps |
| 8 | C4 | High | Confidence | curator:256 / synth:164 | `lifecycle_status` never written → quality modifier is constant |
| 9 | S4 | High | Inbox | inbox-populator.ts (all) | `populateInbox` never called → inbox/approval/persona-confirm dead |
| 10 | S5 | High | Governance | curator:256 / explainer:285 | Sensitive-field gate unimplemented → auto-commit + exposure |
| 11 | D1 | Medium | Synthesizer | synthesizer:471-526 | Non-idempotent: wipes persona confirmations each run |
| 12 | A7 | Medium | Fill-gaps | routes.ts:1070-1100 | Bypasses curator; silent overwrite / array corruption |
| 13 | C3 | Medium | Org PKB | pkb-storage.ts:323-371 | Org PKB writes unsynchronized (RMW race) |
| 14 | A5 | Medium | Gaps | interviewer:332 / synth:370 | Declined fields not excluded from gap generation |
| 15 | A6 | Medium | Gaps | synthesizer:275 | Field-status map ignores extensions |
| 16 | A4 | Medium | Gaps | synthesizer:509-521 | `do_not_ask` last-segment fuzzy match over-suppresses |
| 17 | S6 | Medium | Ingestion | ingestion:70,156 | SSRF — no private-IP/metadata guard on URL fetch/crawl |
| 18 | S7 | Medium | Ingestion | ingestion:24 | Unknown file types read as UTF-8 garbage |
| 19 | S8 | Medium | Logging | index.ts:108-132 | Full response bodies (PII/PKB) logged |
| 20 | S9 | Medium | Hardening | index.ts/db.ts | No rate-limit/helmet; DB TLS unverified |
| 21 | B4 | Medium | Cross-agent | synth:27 / schema:220 | Severity vocab divergence; standard gaps uncounted |
| 22 | C2 | Medium | Concurrency | pkb-storage.ts:16-30 | `withPKBLock` map leaks under contention |
| 23 | S10 | Medium | Explainer | routes.ts:986 | First-use suggested-question chips can't trigger |
| 24 | D2 | Medium | Parsing | base-agent.ts:249 | Greedy JSON fallback fragile (suspected) |
| 25 | D3 | Low | Synthesizer | synthesizer:409 | 4096 cap may truncate large-PKB synthesis (suspected) |
| 26 | B1 | Low | Learner | base-agent.ts:90 | `wrong_door` mode unreachable (triggeredBy hardcoded) |
| 27 | B2 | Low | Learner | interviewer:150 | `[INGESTION_COMPLETE]` instruction is dead (filtered out) |
| 28 | A8 | Low | Gaps | synthesizer:221 | Non-deterministic gap IDs (`Date.now()`) |
| 29 | S11 | Low | Frontend | ChatTab.tsx:128 | Optimistic messages clobbered by refetch (suspected) |
| 30 | S12 | Low | Dead code | interviewer:391 | `streamInterviewerResponse` unused + drops history |
| 31 | S13 | Low | History | routes.ts:854 vs 904 | Inconsistent message ordering keys |
| 32 | S14 | Low | Ingestion | ingestion:366,396 | Filename / URL-slug collisions overwrite |
| 33 | S15 | Low | Docs | CLAUDE.md | Stale debt entries (PKBMeta `any`, `/api/sessions`) |

---

## Part 4 — Open Questions (need author input)

1. **Roles & tenant model (S1):** Is per-route authorization intentionally deferred until role enforcement, or is membership-scoping expected now? It blocks public deploy either way — confirm the intended cutover.
2. **Standard gaps (B4):** Should `standard`/`important` gaps count toward the Learner's `criticalGapsCount` and session-end logic, or are they intentionally invisible to Learner mode? Currently only `critical` counts.
3. **Lifecycle state machine (C4/S5):** Is the V1 lifecycle/`evidenced`/sensitive governance meant to be live now, or shelved? Half the confidence formula and the entire inbox depend on the answer.
4. **Inbox (S4):** Was `populateInbox` ever wired and later removed, or never connected? Confirms whether the inbox UI is expected to function in this build.
5. **Conflict UX (A2/A3):** Should value conflicts surface as gaps, as inbox items, or both? The two mechanisms currently fight each other and array fields conflict constantly.
6. **Persona confirmation (D1):** What is the intended persona status lifecycle (`candidate`→`active`) and who promotes? Current synthesis resets it every run.
7. **SSRF (S6):** Is outbound fetch expected to reach only public web content? If internal fetches are ever legitimate, an allowlist approach changes.

---

### Console summary

**Findings by severity:** Critical 3 · High 6 · Medium 14 · Low 10 — **33 total.**

**Top 5 to fix first:**
1. **C1** — `modifyPKB`/`loadPKB` reinitializes & overwrites a populated PKB on any transient load error (silent total data loss).
2. **S1** — No authorization on product/org routes; any authenticated user can read/modify/delete any tenant's data (IDOR).
3. **S3** — Hardcoded fallback `SESSION_SECRET` → forgeable sessions if unset in production.
4. **S2** — Conversation history loads the oldest 20 messages instead of the most recent; multi-turn context is broken.
5. **A2/A3** — Gap engine: conflict-resolution gaps are wiped by the next synthesis, and document re-ingestion fabricates spurious conflict gaps on array fields.

*No code was changed. Report only.*
