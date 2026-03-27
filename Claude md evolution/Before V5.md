# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Orchestral-AI** is an AI-powered product knowledge platform (PKB/PKC system). An Organisation is the top-level container (the "Central Intelligence") — it holds a shared org PKB inherited by all products inside it. Each product has its own PKB, personas, documents, and inbox. Chat sessions are personal per user but draw from both the shared org PKB and the product PKB.

---

## Build & Development Commands

```bash
npm run dev      # Development server with hot reload (port 5000)
npm run build    # Production build (esbuild + Vite)
npm start        # Run production build
npm run check    # TypeScript type checking
npm run db:push  # Push Drizzle schema to PostgreSQL
```

## Environment Setup

Copy `.env.example` to `.env` and configure:
- `OPENAI_API_KEY` - Your OpenAI API key
- `DATABASE_URL` - PostgreSQL connection string (Docker: `orchestral-ai` database, port **5431** not 5432)
- `PORT` - Server port (default: 5000)

**Critical:** `import 'dotenv/config'` must be the **first line** of `server/index.ts`.

---

## Architecture

### Tech Stack
- **Frontend:** React 18, Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui
- **Backend:** Node.js, Express 5.x, TypeScript ES modules
- **Database:** PostgreSQL via Drizzle ORM
- **PKB Storage:** File-based JSON with snapshots (not in database)
- **AI:** OpenAI GPT-4o

---

## Frontend Design System (Canonical — V4 Redesign)

The frontend is being replaced with a Lovable-prototype-derived design system. All new UI work must follow these rules. Do not deviate without explicit instruction.

### Primary Accent Color
- **#DE7356** (terracotta orange). This replaces the previous red primary entirely.
- CSS variable: `--primary: 14 65% 60%` (approximate HSL for #DE7356)
- Used for: CTAs, active states, focus rings, progress fills, brand marks.
- **Never** used for confidence indicators or status signals.

### Typography
- **Space Grotesk** — headings, labels, product names, numerical displays (`font-heading`)
- **Inter** — all body text, UI copy, inputs, descriptions (`font-sans`, default)
- Manrope and DM Sans are removed. Do not import or reference them.

### Semantic Color System
All status and state colors are semantically anchored. Do not use these colors for decoration.

| Color | Semantic meaning | Examples |
|-------|-----------------|---------|
| **Emerald** (`hsl(160 84% 44%)`) | Confirmed / healthy / high confidence | High confidence badge, "Active" state, evidenced facts |
| **Amber** (`hsl(38 92% 60%)`) | Warning / inferred / stale | Onboarding state, inferred facts, stale PKB fields |
| **Red** (`hsl(0 72% 51%)`) | Conflict / disputed / low confidence | Conflicts badge, disputed facts, low confidence indicator |
| **Blue** (`hsl(217 91% 60%)`) | Informational / neutral data | Source counts, "New" state, general informational pills |
| **Orange (#DE7356)** | Primary action only | Buttons, active tabs, brand |

### Confidence Indicators
- **High confidence (≥70%):** emerald color (`text-glow-emerald`, `bg-glow-emerald`)
- **Medium confidence (40–69%):** amber color
- **Low confidence (<40%):** red color
- The primary orange (`#DE7356`) is **never** used for confidence bars or badges.

### Theme Modes
- **Dark** (default): near-black background (`hsl(0 0% 4%)`), full particle background, semantic glow colors active.
- **Light**: inverted palette, same semantic color system, particles adapt.
- **Minimal mode**  High-contrast monochrome view — strips away decorative elements (gradients, particle background), uses clean icons instead, and delivers a serious, professional aesthetic focused purely on content and structure.

### Surface Layering (preserve exactly)
```
--surface-outer:    0 0% 2%    ← page background
--surface-inner:    0 0% 7%    ← inner panels / workspace container
--surface-elevated: 0 0% 10%   ← cards
--surface-hover:    0 0% 13%   ← card hover state
```
Utility classes: `.outer-frame`, `.inner-panel`, `.surface-card` — use these, do not inline equivalent bg colors.

### Removed from Prototype (do not implement)

- Four-font system — reduced to Space Grotesk + Inter.
- Hardcoded emoji-per-product-name map (`productEmojis`).
- Conversation count progress bar widget in chat sidebar.
- Decorative glow orbs may be kept only if very subtle (opacity < 0.15).

---

### Directory Structure
```
client/src/           # React frontend
  components/         # UI components
  lib/                # queryClient, utils
server/               # Express backend
  agents/             # AI agents (5 specialized + base-agent)
  services/           # pkb-storage, pkc-curator, ingestion-service
  routes.ts           # API endpoints
shared/               # Isomorphic types and Zod schemas
  schema.ts           # Database tables + validation
pkb_store/            # File-based PKB JSON (per product)
uploads/              # Uploaded documents (per product)
```

### Core Mental Model

```
Organisation (Central Intelligence)
  ├── Org PKB → pkb_store/org_{orgId}/pkb.json (shared, read by all products)
  ├── Org inbox (conflict queue only)
  ├── Central Intelligence chat (cross-product, on dashboard)
  └── Products[]
        ├── Product PKB → pkb_store/product_{productId}/pkb.json
        ├── Personas + ICP (shared across team)
        ├── Documents (shared across team)
        ├── Product inbox
        └── Conversations[] (personal per user)
              └── Messages[]
```

### Navigation Flow

```
Landing Page
  → Organisation Setup (one-time form)
      → Dashboard (hero + central intelligence chat + product grid)
          → Product Workspace
                ├── Chat tab (default)
                ├── Knowledge tab
                ├── Personas tab
                └── Documents tab
                + Inbox overlay (bell icon)
```

---

## Multi-Agent Pipeline

Located in `server/agents/`:

| Agent | File | Purpose |
|-------|------|---------|
| Base Agent | `base-agent.ts` | Shared utilities: `callLLM()`, `streamLLM()`, `parseJSONResponse()` |
| Information Extractor | `information-extractor.ts` | Parse documents/URLs into structured facts with source tracking |
| Product Synthesizer | `product-synthesizer.ts` | Generate insights and product briefs |
| Gap Identifier | `gap-identifier.ts` | Analyze PKB completeness, prioritize missing info |
| Product Interviewer | `product-interviewer.ts` | Conversational interviews to fill knowledge gaps |
| Product Explainer | `product-explainer.ts` | Answer questions using PKB knowledge |
| Persona Extractor | `persona-extractor.ts` | Extract structured persona and ICP objects from PKB |

### Data Flow

1. User uploads documents or provides URLs
2. **Ingestion Service** (`server/services/ingestion-service.ts`) extracts text
3. **Information Extractor** identifies facts with source tracking
4. **PKC Curator** (`server/services/pkc-curator.ts`) validates and stores in PKB
5. **Product Synthesizer** generates insights
6. **Gap Identifier** finds missing info → **Product Interviewer** fills gaps via chat
7. **Persona Extractor** runs after each ingestion batch, updates personas + ICP

---

## Product State Machine

Products (not sessions) have lifecycle state. State runs once per product, not per chat.

`product_type_selection` → `onboarding` → `learning` → `persona_extraction` → `founder_review` → `ready`

- `product_type_selection` — set once when product is created
- `onboarding` — first ingestion pass
- `learning` — ongoing ingestion and gap filling
- `persona_extraction` — runs automatically after each ingestion batch
- `founder_review` — inbox populated, team resolves critical items
- `ready` — requires: no unresolved Critical inbox items + at least 1 confirmed persona + no pending sensitive fields + at least 1 ICP defined. Can regress if new conflicts detected.

New chat sessions inside a product always start in `learning` or `ready` state — onboarding never repeats.

**Chat Modes:**
- **Learner:** Builds knowledge, asks gap-filling questions
- **Explainer:** Answers questions from stored PKB knowledge

---

## Storage Architecture

- **PKB:** File-based JSON at `pkb_store/product_{id}/pkb.json` with timestamped snapshots
- **Conversations:** PostgreSQL, linked to both `product_id` and `user_id`
- **Database:** PostgreSQL for users, products, product_members, conversations, messages

---

## PKB Schema (Product-Type Aware)

**Core sections (implemented):**
`product_identity`, `value_proposition`, `target_users`, `use_cases[]`,
`features[]`, `pricing`, `differentiation`, `proof_assets`,
`constraints_assumptions`

- **B2B products** get enterprise fields (sales cycles, decision-makers, procurement)
- **B2C products** get consumer fields (user acquisition, retention, viral loops)
- **Hybrid** gets both

**Per-fact fields:**
- `source_type`, `source_ref`, `evidence`, `captured_at`
- Quality tags: `strong`, `ok`, `weak`
- `lifecycle_status`: `asserted` | `evidenced` | `inferred` | `disputed` | `stale`
- `sensitive`: boolean
- `approved`: boolean — defaults `true` for non-sensitive, `false` for sensitive
- `locked`: boolean
- `do_not_ask`: boolean
- `last_verified`: ISO timestamp
- `audit_trail`: mutation log entry array

**Top-level PKB additions:**
- `personas[]` — structured persona objects
- `icps[]` — structured ICP objects
- `mappings` — persona-to-fact relevance + persona-to-gap index
- `review_inbox[]` — pending team decisions

---

## Confidence Scoring

- **HIGH:** 75-100% of required fields populated
- **MEDIUM:** 40-74%
- **LOW:** 0-39%

---

## Database Schema

### Tables

**`products`**
- `id` serial PK
- `name` text NOT NULL
- `owner_id` varchar → references `users.id` (UUID)
- `product_type` text nullable (`b2b` | `b2c` | `hybrid`)
- `state` text default `product_type_selection`
- `confidence_score` integer default 0
- `created_at` / `updated_at` timestamp

**`product_members`**
- `id` serial PK
- `product_id` integer → references `products.id`
- `user_id` varchar → references `users.id`
- `role` text default `member` (`owner` | `member`)
- `joined_at` timestamp

**`conversations`**
- `id` serial PK
- `product_id` integer → references `products.id`
- `user_id` varchar → references `users.id`
- `title` text nullable
- `mode` text default `learner`
- `created_at` / `updated_at` timestamp

> Note: `owner_id` and `user_id` are `varchar` not `integer` because `users.id` is a UUID.

---

## API Routes

All routes are under `/api/products/`. The old `/api/sessions/` routes still exist in `routes.ts` but are deprecated — marked with `DEPRECATED V1 SESSION ROUTES — DO NOT USE`. Safe to delete in a future cleanup pass.

`GET /api/products` accepts an optional `?orgId=` query param — if present, filters by `org_id`. If absent, returns all products (backward compatible).

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/products` | List all products for current user |
| `POST` | `/api/products` | Create product |
| `GET` | `/api/products/:productId` | Get product |
| `POST` | `/api/products/:productId/type` | Set product type |
| `POST` | `/api/products/:productId/upload` | Upload document |
| `POST` | `/api/products/:productId/fetch-url` | Fetch URL |
| `POST` | `/api/products/:productId/process` | Run ingestion pipeline |
| `GET` | `/api/products/:productId/conversations` | List conversations (user-scoped) |
| `POST` | `/api/products/:productId/conversations` | Create new conversation |
| `POST` | `/api/products/:productId/conversations/:conversationId/chat` | Learner chat |
| `POST` | `/api/products/:productId/conversations/:conversationId/explain` | Explainer chat |
| `POST` | `/api/products/:productId/recheck-gaps` | Re-run gap analysis |
| `POST` | `/api/products/:productId/fill-gaps` | Process gap fill answers |
| `GET` | `/api/products/:productId/inbox` | Get inbox |
| `POST` | `/api/products/:productId/inbox/:itemId/resolve` | Resolve inbox item |

---

## Frontend Component Map

### Pages
- `client/src/pages/dashboard.tsx` — org gate (setup vs dashboard), hero section (starfield canvas, org name, CI chat bar), product grid with sticky header, org setup form
- `client/src/pages/product-workspace.tsx` — tabbed container with persistent header

### Key Components (current)
- `product-header.tsx` (inside workspace) — name, confidence bar, inbox bell, new chat button
- `knowledge-tab.tsx` — Summary / Facts / Gaps sub-tabs
- `chat-tab.tsx` — personal chat with conversation history list
- `personas-tab.tsx` — shared personas + ICP view
- `documents-tab.tsx` — shared documents list
- `review-inbox.tsx` — overlay panel, triggered by bell icon
- `gap-fill-dialog.tsx` — gap filling modal
- `confidence-bar.tsx` — reusable confidence progress bar
- `chat-interface.tsx`, `chat-input.tsx`, `chat-message.tsx` — chat UI primitives

### Deprecated / Unused (do not modify, safe to delete later)
- `home.tsx` — old V1 home page, no longer routed
- `session-sidebar.tsx` — replaced by dashboard + in-tab chat history

---

## Key Patterns

### Agent JSON Responses
Use `parseJSONResponse()` from `base-agent.ts` for all agent responses.

### Source Tracking
Every fact links back to its origin with evidence quotes and timestamps.

### Refusal Handling
Tracks declined fields — system will not ask about them again.

### Confidence Write-back
`confidence_score` on the `products` table is updated after: `process`, `recheck-gaps`, and `fill-gaps` endpoints.

---

## V1 Governance Rules (Complete — Do Not Modify)

### Sensitive Fields (Hard Gate)
- pricing, customer_names, security_claims, roadmap
- Can be extracted and proposed, NEVER auto-committed, NEVER exposed without approval

### Lifecycle State Transitions
- `asserted` → `evidenced`: a second source confirms the same claim
- `any` → `disputed`: new source contradicts existing claim on same field_path
- `any` → `stale`: `last_verified` exceeds staleness threshold
- `disputed` → `asserted/evidenced`: team member resolves conflict
- `stale` → `asserted`: team member re-confirms value

> **"Evidenced" rule:** assigned only when a second source *confirms* an existing claim — NOT at ingestion time based on source type alone.

### Staleness Thresholds (days)
- pricing: 30, roadmap: 30, competitor_names: 60
- security_claims: 90, positioning: 90, customer_names: 180

### Persona Rules
- Max 3 active personas at any time
- Founder/team confirms or demotes — never creates manually
- Every persona must match one of 5 bounded types
- Ranked by: evidence strength → decision power → frequency

### V0 Migration (Lazy Upgrade)
Existing V0 PKB files upgraded on first access:
- Facts with no `lifecycle_status` → default by source type
- Facts with no sensitivity flag → run classifier
- Facts with no `approved` flag → `true` for non-sensitive, `false` for sensitive

---

## Known Remaining Items (Technical Debt)

- `founderSessionSchema.session_id` and `proposedUpdateSchema.metadata.session_id` in `shared/schema.ts` — intentionally kept; these track individual interview sessions and update provenance, so `session_id` is semantically correct here
- `session-store.ts`, `session-sidebar.tsx`, `session-naming-dialog.tsx` — still referenced by the old `home.tsx` (V1); safe to delete once `home.tsx` is removed
- `home.tsx` — old V1 home page, no longer routed to, safe to delete
- `npm run check` — zero errors
- 5 AgentContext construction sites in `routes.ts` each do an extra DB query to get `org_id` — should be derived from the already-loaded product record instead. Minor inefficiency, safe to clean up in a future pass.
- Org conflict detection field path mapping may fire infrequently — the extractor uses `differentiation.alternatives` and `product_identity.category` but the mapping watches for `differentiation.competitors` and `product_identity.industry`. Conflicts will only trigger when the LLM produces those exact paths. Revisit if conflict detection turns out to be too quiet in practice.

---

## Onboarding Flow (Complete)

First-time users (no org exists) see a two-screen onboarding flow before reaching the dashboard. The trigger is: `GET /api/organisations` returns `{ organisation: null }`.

### Screens

**Screen 1 — WelcomeScreen**
- Full-screen dark page with static (non-animated) starfield background
- Badge, headline, subline, three feature-pillar cards, orange CTA button, step dots
- "Get started" advances to Screen 2

**Screen 2 — OrgSetup (wrapped)**
- Same `OrgSetup` component with unchanged fields, validation, and submission handler
- Wrapped with an OnboardingLayout header: step badge ("Step 2 of 3"), title, subtitle, collapsible callout ("💡 Why are we asking this?")
- Footer note above the submit button: "You can update these details anytime from your settings."

### Step indicator
- Fixed top bar with 3 pill segments (separated, not a continuous bar)
- WelcomeScreen: segment 1 orange, 2+3 dim
- OrgSetup: segments 1+2 orange, 3 dim
- Disappears entirely once user reaches the dashboard (org exists)

### Managed by
`Dashboard` default export holds `onboardingStep: "welcome" | "setup"` state. When no org: renders `<OnboardingStepBar>` + either `<WelcomeScreen>` or `<OrgSetup>`. Once the org is created, the query invalidation causes `data.organisation` to become non-null and the flow exits naturally to `<OrgDashboard>`.

### Static starfield
`StaticStarfield` — canvas that draws once on mount, no `requestAnimationFrame`. Distinct from the animated `Starfield` used on the authenticated dashboard hero.

---

## V3 — Organisation Layer (Complete)

V3 is complete. It introduced an Organisation layer above products — the "Central Intelligence." One organisation contains multiple products. The org PKB is shared and inherited by all products. The UI has a new landing experience (hero + central intelligence chat) above the product dashboard.

### Build Phases (do one at a time, review before proceeding)

- **Phase 1: DB Schema** ✓ — `organisations` and `organisation_members` tables added, `org_id` added to `products`
- **Phase 2: Org PKB + Setup Form** ✓ — org PKB storage functions built, constrained extraction route built, all org API routes built
- **Phase 3: Dashboard Redesign** ✓ — hero section built, org setup gate, starfield canvas, central intelligence chat, sticky header, product grid
- **Phase 4: Agent Context Update** ✓ — all 6 agents updated, org PKB injected into all system prompts, loadCombinedContext helper added
- **Phase 5: Org Inbox** ✓ — conflict detection in ingestion pipeline, org inbox API routes, conflict resolution UI on dashboard

### Status
Complete ✓ — all 5 phases shipped

---

## V3 Detailed Spec

### The New Mental Model

```
Organisation (Central Intelligence)
  ├── Organisation PKB (shared, read by all products)
  ├── Org-level inbox (conflict queue only)
  ├── Central Intelligence chat (cross-product, on dashboard)
  └── Products[]
        ├── Product PKB (own + inherits org PKB)
        ├── Personas + ICP
        ├── Documents
        ├── Product inbox (everything incl. org-conflict triggers)
        └── Conversations[] (personal per user)
```

### Navigation Flow

```
Landing Page
  → Organisation Setup (one-time form)
      → Dashboard (hero + central intelligence + product grid)
          → Product Workspace (Chat / Knowledge / Personas / Documents)
```

---

### Organisation Setup

One-time form. Editable by admins at any time after setup. No gap-filling pipeline.

**Fields:**

| Field | Type |
|-------|------|
| Organisation name | Text |
| One-line description | Text |
| Industry / sector | Text |
| Founded year | Number |
| Number of products | Number |
| Location of operation | Multi-select (India, Southeast Asia, Europe, Global, etc.) |
| Company-wide competitors | Text / tags |
| Business model | Select (b2b / b2c / both) |
| Website URL | URL |

**Document upload (optional):**
Clearly labelled — *"Upload a company deck or document to auto-fill this form. Only organisation-level fields will be extracted — everything else is ignored. Any fields not found will be left blank for you to fill manually."*
Runs a constrained extraction via the information extractor agent, scoped to org PKB fields only. No gap-filling, no ingestion pipeline, no inbox items generated.

---

### Dashboard

**Hero section (full viewport):**
- Organisation name, large
- "Access Central Intelligence" chat bar below it
- Interactive starry background

**On scroll:**
- Organisation name anchors as sticky header
- Product grid appears (existing card design)
- "+ Add Product" button

**Central Intelligence chat:**
- Queries organisation PKB + roll-up of all product PKBs the user has access to
- Explainer mode only — read/query, not teach
- Lives on dashboard, not a separate page

---

### Organisation PKB

Populated via setup form + optional document extraction. Editable field-by-field by admins. No ingestion pipeline after initial setup.

**Inheritance rule:** All product agents have read access to the org PKB. Product-level facts take precedence within product scope. No automatic write-back from product to org level.

**Conflict detection:** When a product-level fact contradicts an org-level fact, it surfaces in the org-level inbox as a suggested update. Admin resolves — either updates the org PKB or dismisses. Product fact is never blocked or changed by this process.

**Storage:** `pkb_store/org_{orgId}/pkb.json` — same file-based pattern as products.

**No snapshots** — org PKB is a simple flat record edited by admins, no pipeline, no rollback needed.

**`loadOrgPKB` auto-initializes** — never returns null. If no file exists, it creates one. Org PKB is always expected to exist after org creation.

**Extract route** caps input text at 12,000 chars before sending to LLM. Single-pass extraction (no chunking needed — only 9 fields). Validates `business_model` value — only saves if one of `b2b`, `b2c`, `both`. Uploaded files kept at `uploads/org_{orgId}/`.

---

### Org-Level Inbox

Lightweight conflict queue only — not a full inbox. Single trigger: a product fact contradicts an org PKB fact. Admin reviews and either updates the org PKB or dismisses.

---

### Roles

Scaffolded now, enforced later. For now the single user is treated as admin everywhere. No enforcement logic until team features are needed.

| Role | Access |
|------|--------|
| Admin | Full — Learner + Explainer, inbox resolution, document upload, org PKB editing, member management. Sees all fields including sensitive. |
| Member | Explainer only — query knowledge, view documents, view personas. No ingestion, no inbox, no sensitive fields visible. |
| Global Member | Member-level access across all products in the org automatically. |

`role` field already exists in `product_members`. `org_role` field scaffolded in `organisation_members` — no enforcement logic yet.

---

### Database Schema Changes

**New table: `organisations`**
```typescript
organisations {
  id:              serial PK
  name:            text NOT NULL
  owner_id:        varchar → references users.id
  description:     text
  industry:        text
  founded_year:    integer
  num_products:    integer
  locations:       text[]
  competitors:     text[]
  business_model:  text  (b2b | b2c | both)
  website_url:     text
  created_at:      timestamp default now()
  updated_at:      timestamp default now()
}
```

**New table: `organisation_members`**
```typescript
organisation_members {
  id:        serial PK
  org_id:    integer → references organisations.id
  user_id:   varchar → references users.id
  org_role:  text default 'admin'  (admin | member | global_member)
  joined_at: timestamp default now()
}
```

**Updated: `products`**
```typescript
// ADD:
org_id: integer → references organisations.id  // required
```

---

### Agent Context Changes

All agents currently receive `productId` in context. Add `orgId` alongside it. Agents load org PKB + product PKB together when reasoning. Org PKB is strictly read-only to agents — they cannot propose writes to it (conflict detection only, surfaced to org inbox).

`AgentContext` interface update:
```typescript
interface AgentContext {
  orgId: number      // NEW
  productId: number
  // ...rest unchanged
}
```

---

### API Routes — Org Layer

**Built (Phase 2):**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/organisations` | Get current user's org (returns `{ organisation, pkb }` or `{ organisation: null, pkb: null }` — never 404) |
| `POST` | `/api/organisations` | Create organisation — inserts DB row, initializes org PKB, inserts owner as admin member |
| `GET` | `/api/organisations/:orgId` | Get org by ID — returns `{ organisation, pkb }` as **separate objects** (not merged — DB record has Date objects, PKB has ISO strings) |
| `PATCH` | `/api/organisations/:orgId` | Update org fields — updates DB + syncs to org PKB |
| `POST` | `/api/organisations/:orgId/extract` | Constrained doc extraction — extracts only org-level fields, saves to org PKB, does NOT trigger gap filling or inbox |
| `POST` | `/api/organisations/:orgId/chat` | Central Intelligence chat — non-streaming, single Q&A, loads org PKB as context, returns `{ response }` |
| `GET` | `/api/organisations/:orgId/inbox` | Get org conflict queue — returns pending conflicts from org PKB |
| `POST` | `/api/organisations/:orgId/inbox/:itemId/resolve` | Resolve org conflict — resolution: 'resolved' or 'dismissed', optional updatedValue updates org PKB field |

---

### What Does NOT Change in V3

- All agent logic (receives additional org context but core logic untouched)
- Product PKB schema
- All V1/V2 governance rules
- Confidence scoring (stays product-level only)
- Product workspace UI
- All existing `/api/products/` routes

---

### Out of Scope for V3

- Role enforcement (scaffolded only)
- Confidence scoring at org level
- Org-level personas or ICP
- Multi-organisation support (one org per user for now)
- Org-level document library

---

### Data Migration

Complete. Clean slate applied during Phase 1 schema push — existing test rows with null org_id were dropped (RESTART IDENTITY CASCADE). Database is fresh.

---

## V2 Deferred — Not Yet Built

These items were planned for V2 but intentionally deferred. Do not implement without explicit instruction.

### Role-Based Inbox Permissions
- Owner vs member distinction for inbox resolution
- Currently all team members can resolve all items
- Deferred: out of scope for V2

### Real-Time Collaboration / Presence
- Live cursors, presence indicators, concurrent editing awareness
- Deferred: infrastructure complexity

### PKC Query API (Phase 4 from V1)
- Structured query interface for agents to retrieve PKB facts programmatically
- Deferred: still pending design

### Dead Code Audit + Staleness Detection
- Automated detection of stale PKB facts based on `last_verified` + thresholds
- UI surface for surfacing stale items proactively (beyond inbox)
- Deferred from V1, still unbuilt

### Mixed Chat Model for Gap Filling
- Remaining gap-filling flows that blend Learner and Explainer modes
- Currently handled as separate modes; mixed model not yet designed or built

### Parallel Chat Threads
- Multiple simultaneous conversations per user per product
- Currently: one active conversation at a time
- Deferred: UX complexity

### Richer Knowledge Tab
- Visualizations, knowledge graph view, fact timeline
- Currently: text-based Summary / Facts / Gaps
- Deferred: post-redesign consideration

### `pkb.meta.session_id` Field Rename
- Rename stored field from `session_id` to `product_id` in PKB JSON
- Cosmetic/hygiene only, deferred

## V5 — Agent Architecture Overhaul (In Progress)

Do not treat V4 agent structure as current. V5 is actively being built. Do not add features that assume the old agent structure without checking first.

---

### What V5 is doing

Consolidating 6 agents into 2 real agents + 2 utility functions:

| V4 | V5 |
|---|---|
| Product Interviewer | → Learner Agent (rebuilt) |
| Gap Identifier | → Retired, absorbed into Learner |
| Product Explainer | → Explainer Agent (being rebuilt next) |
| Product Synthesizer | → Synthesizer Function (post-processing only) |
| Information Extractor | → Extractor Function (dumb parser, no context needed) |
| Persona Extractor | → Retired, absorbed into Synthesizer |

---

### What has been built (Steps 1–2c complete)

**Step 1 — Agent Context Payload**
- `buildAgentContext(context, productPKB, orgPKB)` added to `base-agent.ts`
- Returns enriched context with: `productName`, `orgName`, `kb` health object, `session` object
- `kb` fields: `confidenceScore`, `stage` (empty/building/established), `criticalGapsCount`, `totalGapsCount`, `hasIngested`, `factCount`
- `session` fields: `isFirstProductSession`, `userRole` (hardcoded "owner" until auth), `triggeredBy`
- `computeLearnerMode()` helper returns 6-state enum (see below)
- `addFounderSession()` now called on every chat turn (dedup guard prevents duplicate writes)
- DB query in chat route updated to fetch `productName` and `orgName` via left join on organisations

**Step 2a — Ingestion wiring + gap bridge**
- `/process` SSE pipeline now called automatically after every upload (DocumentsTab) and URL fetch (ChatTab + DocumentsTab)
- SSE stream read via `fetch()` + ReadableStream (POST endpoint, not EventSource)
- SSE events emitted by backend: `status`, `confidence`, `product_name`, `content`, `summary`, `done`, `error`
- `done` event carries `{ has_gaps: boolean, confidence: string }` — gap count read from PKB after refetch
- Gap dialog state lifted from KnowledgeTab to ProductWorkspace: `gapDialogOpen`, `selectedGap`, `openGapFill()`, `closeGapFill()`
- `processingState` added to ProductWorkspace: `{ isProcessing, progress, statusMessage, completedAt, gapsFound, error }`
- `ProcessingOverlay` now wired to `isProcessing`
- Post-processing: PKB query refetched automatically when processing completes
- `ingestion_complete` message type added to chat — auto-injected when processing finishes, shows gap count + "Fill gaps →" button
- `pendingIngestionMessage` stored in ProductWorkspace state so it survives tab switches

**Step 2b — Gap dialog rebuilt**
- `GapFillDialog` rebuilt as a two-column stepped form
- Left column: scrollable gap list sidebar with severity badges and answered/skipped indicators
- Right column: active gap with full question, rationale, field path, free-text textarea
- Session state: `answeredInSession`, `skippedInSession`, `activeGapPath`, `currentAnswer` — resets on every dialog open
- Auto-advances to next unanswered gap after saving
- Completion state shown when all gaps answered
- "Done" submits all answers at once via POST `/fill-gaps` then triggers fresh `/process`
- `/fill-gaps` backend updated to accept array payload `{ answers: [{ field_path, answer }] }`
- Cmd/Ctrl+Enter submits textarea
- Auto-saves draft answer when navigating between gaps in sidebar
- Gap cards in KnowledgeTab unchanged — still call `openGapFill(gap)`, now opens new dialog pre-selected to that gap

**Step 2c — Learner Agent prompt rewritten**
- Full system prompt rewritten in `product-interviewer.ts`
- Learner now receives: `learnerMode`, `productName`, `orgName`, full KB health, `existingFacts`, gap counts (not gap details)
- Learner never asks gap questions in chat — directs founder to Fill Gaps dialog instead
- `[SESSION_START]` trigger: empty message normalised to `[SESSION_START]` in route, Learner generates opening message
- `chatSchema.message` validation changed from `.min(1)` to `.min(0)` to allow empty opening messages
- Bug fixed: `criticalGapsCount` was filtering by `g.priority` — corrected to `g.severity`
- `currentGaps` parameter kept in `processFounderResponse` signature for compatibility but no longer used in prompt (dead weight — add to future cleanup)

---

### Learner 6-state behavioral model

| Mode | Trigger condition | Behaviour |
|---|---|---|
| `first_session_empty_kb` | First session + no ingestion + stage=empty | Warm intro, ask for doc/URL |
| `first_session_has_docs` | First session + docs already ingested | Acknowledge captured content, surface gaps |
| `returning_building` | Returning + stage=building | Brief progress recap, stay available |
| `returning_gap_fill` | Returning + confidence ≥ 50 | "Almost there", direct to gaps |
| `established_maintenance` | Stage=established + owner | Offer to update or review, no interview |
| `wrong_door` | Stage=established + teammate | Redirect to Explainer tab |

---

### Step 3 — Explainer Agent (Complete ✓)

**Three surfaces, one agent — context-switched by surface field:**

**product_chat** — inside a product workspace
- Tiered answer behaviour based on confidenceScore:
  - < 40%: answer briefly + one-time tip to use the Learner to add more
  - 40–69%: answer fully + one caveat max if area has no data: "I don't have detail on that yet — it hasn't been captured in the knowledge base"
  - ≥ 70%: answer cleanly, no hedging, KB treated as authoritative
- First use wow moment: surfaces 3 suggested questions from `pkb.meta.suggested_questions` — dormant until Synthesizer populates them
- `isFirstExplainerUse` currently hardcoded false — real check added in Step 4

**dashboard_chat** — Central Intelligence on dashboard
- Answers across all product PKBs, always attributes to specific product
- Missing data stated clearly: "[Product name] — this hasn't been captured yet"
- No tiering, no funneling — query surface only
- Fixed to `answer_clean` mode regardless of individual product confidence scores

**app_guide** — default mode when CI chat loads
- Static app knowledge injected, no PKB loaded
- Answers navigation and usage questions about Orchestral-AI itself
- Two-segment pill toggle in CI chat bar switches between Guide and Knowledge modes
- Tooltips on each segment explain what each mode does
- Switching modes clears the conversation and starts fresh

**Dead weight introduced:**
- `overrideEnabled` param on `streamExplainProduct`/`explainProduct` — superseded by `answerMode` tiering, add to dead code audit

---

### Step 4 — Synthesizer Function (Next)

Single post-processing function that replaces three separate agents. Fires after every KB write via a per-productId debounce (3 second wait after last write).

**Retires:**
- `gap-identifier.ts` — gap analysis absorbed into Synthesizer
- `persona-extractor.ts` — persona derivation absorbed into Synthesizer
- `product-synthesizer.ts` — replaced entirely

**Produces in one LLM call:**
- `productBrief` — 3 paragraph narrative
- `personas[]` — max 3, derived from KB signals
- `confidenceReasoning` — one sentence explaining why the score is what it is
- `kbStage` — empty / building / established
- `suggestedQuestions[]` — exactly 3, feeds Explainer wow moment
- `gapAnalysis` — critical and standard gaps with field_path, question, rationale, severity

**Confidence score is NOT LLM-generated — deterministic formula in code:**
- 70% weight — field coverage (populated fields / all fields, weighted by importance)
- 20% weight — quality modifier (evidenced=100%, asserted=80%, inferred=50%, disputed/stale=0%)
- 10% weight — source diversity (3+ types=10pts, 2 types=6pts, 1 type=3pts)
- B2B and B2C products use different field weight maps — product_type aware
- LLM receives the computed score and uses it only to write accurate `confidenceReasoning`
- Same PKB always returns same score — fully auditable

**Writes to PKB:**
- `pkb.meta.product_brief`
- `pkb.meta.kb_health_narrative`
- `pkb.meta.kb_stage`
- `pkb.meta.suggested_questions[]`
- `pkb.personas[]` (full replacement)
- `pkb.gaps.current[]` (full replacement)

**Writes to DB:**
- `products.confidence_score`
- `products.updated_at`

**Also fixes in this step:**
- `isFirstExplainerUse` — real check against conversations table (mode=explainer, productId, userId)
- Personas staleness after `/fill-gaps` — Synthesizer runs after all KB writes so personas always stay current
- `/recheck-gaps` route updated to call `runSynthesizer` instead of `gap-identifier` directly

---

### Confidence Scoring (V5 — updated)

Old system was LLM-generated — non-deterministic, same PKB could return different scores on consecutive calls. Replaced with deterministic formula.

| Component | Weight | How calculated |
|---|---|---|
| Field coverage | 70% | Sum of weights of populated fields / sum of all field weights |
| Quality modifier | 20% | Based on lifecycle_status of each fact |
| Source diversity | 10% | Number of distinct source types that contributed |

**Lifecycle status quality weights:**
- `evidenced` → 100%
- `asserted` → 80%
- `inferred` → 50%
- `disputed` / `stale` → 0%

**Stage thresholds (unchanged from V4):**
- empty: score = 0
- building: score 1–69
- established: score ≥ 70

---

### Known debt introduced in V5

- `currentGaps` parameter in `processFounderResponse` — unused, remove in dead code audit
- `overrideEnabled` param on Explainer functions — unused, remove in dead code audit
- `gap_id` references in fill-gaps migrated to `field_path` — audit any other references to `gap_id`
- `INITIAL_SUMMARY_PROMPT` and `generateInitialSummary` — not called from current routes, likely dead code
- `returning_gap_fill` threshold set at confidence ≥ 50 — may need tuning after real usage
- PKB question quality improvement is a major deferred workstream — requires richer PKB gap schema with priority tiers, question framing, and dependency chains. Do not attempt without explicit planning session.
- 5 AgentContext construction sites in `routes.ts` each do an extra DB query to get `org_id` — should be derived from already-loaded product record. Minor inefficiency, clean up in future pass.