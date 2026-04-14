# CC Prompt — Kaizen Documentation Site (Full Build)

## What you're building

A 5-page static documentation site called **"kaizen — documentation"**. This is NOT a product marketing site. It is a **builder's public product report** — honest, specific, written like a case study or build log. The reader is a founder or technical person who might want to work with Dev (the builder). The site's job: in 2 minutes, they understand what Kaizen is, how it was built, and that Dev thinks clearly about AI products.

Deploy target: **Vercel**. Build as a **Next.js 14 app** (App Router) with Tailwind CSS. All 5 pages share one layout. No backend, no API routes needed — pure static.

---

## Aesthetic Direction

**Inspiration sources (do not copy, use as feel reference):**
- Claude Code documentation site: dark background, clean left sidebar nav, monospace accents, terracotta/orange accent color
- ContextCon by Crustdata: dark, editorial, slightly textured, confident typography, pixel art tree element used decoratively

**Commit to this specific direction:**
- Background: `#0D0D0D` (near black, not pure black)
- Subtle grain texture overlay on the background (CSS noise or SVG filter)
- Primary accent: `#DE7356` (terracotta — matches the Kaizen app)
- Secondary text: `#888` (muted)
- Border/divider color: `#1E1E1E`
- Font pairing:
  - Display/headlines: **Playfair Display** (serif, imported from Google Fonts) — unexpected in a docs context, gives editorial weight
  - Body: **IBM Plex Mono** (monospace) — reinforces the "documentation / build log" feel
  - Labels/nav/tags: **IBM Plex Mono** at small sizes
- One pixel-art cherry blossom tree SVG (simple, hand-crafted, not photorealistic) placed decoratively on the `/story` page left side — tasteful, not dominant
- Status indicators use dot notation: `✓` green for live, `○` muted for planned

**Layout:**
- Fixed left sidebar (240px) with nav — like Claude Code docs
- Main content area scrolls independently
- Max content width: 720px, centered in the content area
- Generous line height (1.8) and paragraph spacing
- Section labels in small monospace caps above headings (e.g. `// 01 — WHAT IS KAIZEN`)

---

## File Structure

```
/app
  layout.tsx          ← shared layout with sidebar
  page.tsx            ← "/" What is Kaizen
  /why/page.tsx       ← "/why"
  /build/page.tsx     ← "/build"
  /story/page.tsx     ← "/story"
  /roadmap/page.tsx   ← "/roadmap"
/components
  Sidebar.tsx         ← fixed left nav
  StatusTable.tsx     ← reusable live/planned status component
/styles
  globals.css         ← CSS variables, grain texture, base styles
```

---

## Sidebar Nav (Sidebar.tsx)

Top label: `kaizen — documentation` in small monospace, terracotta color

Nav links (with section numbers):
```
01  what is kaizen     → /
02  why                → /why
03  build              → /build
04  story              → /story
05  roadmap            → /roadmap
```

Active link: terracotta color + left border `#DE7356`
Inactive: `#888`, hover → `#ccc`

Bottom of sidebar (quiet, small):
```
by Dev Saxena
devvbuilds@gmail.com
linkedin ↗
```
LinkedIn URL: https://www.linkedin.com/in/dev-saxena-650a27207/

---

## Page 1: `/` — What is Kaizen

**Section label:** `// 01 — WHAT IS KAIZEN`

**Opening line** (Playfair Display, large ~48px, not bold):
> "Your AI tools are only as smart as the context you give them."

**Body paragraph:**
Most product teams carry their knowledge in scattered places — pitch decks, Slack threads, onboarding docs that are 18 months out of date, and people's heads. When someone new joins, a senior person spends days transferring what they know. When you use an AI tool, you paste context manually, every time, and it's never saved.

Kaizen is a structured product knowledge base. You feed it your materials — documents, URLs, or just a conversation — and it extracts, organizes, and maintains what it learns about your product. Not a wiki. Something both humans and AI systems can actually use.

**Three capabilities** (displayed as a simple 3-row table or card row, not bullet points):

| | |
|---|---|
| **Ingest** | Upload a PDF, DOCX, or paste a URL. Kaizen chunks it, extracts 25–35 structured facts per document, detects conflicts between sources. |
| **Converse** | Describe your product in chat. The Learner agent asks follow-up questions, fills gaps, and builds the knowledge base from your answers. |
| **Query** | Ask anything about your product. The Explainer agent gives confidence-tiered answers — clean when it's sure, caveated when it's not. |

**What Kaizen produces** — a simple ASCII-style or clean diagram showing the flow:

```
docs / URLs / chat
       ↓
  extraction + conflict detection
       ↓
  structured PKB
  ├── product identity
  ├── value proposition  
  ├── target users + personas
  ├── competitive positioning
  ├── key message pillars
  └── gaps (critical / important)
       ↓
  confidence score + health indicator
```

Style this as a styled `<pre>` block with terracotta arrows, monospace font, dark box.

**Current Status** (StatusTable component):

Title: `// CURRENT BUILD STATUS` in small monospace

```
✓  Document ingestion (PDF, DOCX, TXT, MD)     live
✓  URL ingestion + text extraction              live
✓  Conversational KB building (Learner)         live
✓  Knowledge querying (Explainer)               live
✓  Gap detection + guided gap fill              live
✓  Confidence scoring (deterministic)           live
✓  Multi-product dashboard                      live
✓  Review inbox (conflict / stale / sensitive)  live
○  Website crawler                              in progress
○  Fact editing                                 planned
○  Source deletion                              planned
○  PKB export / programmatic API                planned
○  Role enforcement                             planned
```

Green dots for live (`#4CAF50`), muted `#555` for in progress/planned. Monospace font throughout.

**Closing CTA** (small, quiet, at bottom of page):
```
Built solo over 2 months. Still building.

If you're working on something where structured product
context matters — or just want to talk about this problem —

devvbuilds@gmail.com
```

---

## Page 2: `/why` — The Problem

**Section label:** `// 02 — WHY`
**Page heading** (Playfair Display): `The Problem Worth Solving`
**Subtitle** (monospace, muted): `On onboarding tax, context rot, and why your AI outputs are generic`

**Body — write this as flowing prose, 4–5 paragraphs:**

**Para 1 — The onboarding tax:**
When a new hire joins a product team, someone senior disappears for two or three days. Not because onboarding is poorly designed — but because the knowledge that matters most was never written down. It lives in a Slack thread from eight months ago, in the deck that was "good enough at the time," in the judgment calls that shaped the product roadmap but never made it into a doc. The transfer happens, but it's lossy. Every time.

**Para 2 — The AI version of the same problem:**
Now the same thing is happening with AI tools. Every time you use one, you paste in context — what your product is, who it's for, how it compares. The model gives you a generic answer because it doesn't know your specific context. You get something useful but not quite right. So you add more context. Manually. Every time. And none of it is saved.

**Para 3 — The thesis:**
The companies that win with AI won't necessarily have the best models. They'll have the best context. Structured, maintained, reusable product knowledge that any agent — or any new hire — can pull from on day one.

**Para 4 — Why Kaizen:**
Kaizen (改善) is a Japanese concept meaning continuous improvement. The name reflects the actual bet: product knowledge isn't something you capture once and forget. It decays, it conflicts with itself, it gaps over time as the product evolves. The right model isn't a one-time import — it's a living layer that improves every time you interact with it.

**Para 5 — The origin:**
This problem became real through two experiences: working on internal employee onboarding flows at a startup, and getting close to HyperVerge — a company that solves the *external* version of this problem (customer identity onboarding via AI). Both experiences pointed at the same gap: onboarding friction, whether for a customer or a new hire, is fundamentally a knowledge transfer problem. The tools to solve it properly didn't exist. So this is an attempt at one.

---

## Page 3: `/build` — How It's Built

**Section label:** `// 03 — BUILD`
**Page heading** (Playfair Display): `How It's Built`
**Subtitle** (monospace, muted): `Architecture, agents, and honest status`

**Intro paragraph:**
Built solo over 2 months. Claude Code handled implementation — writing files, running TypeScript checks, managing the database schema. The architecture decisions, agent design, prompt engineering, and product calls were made by the builder. This is what it looks like to use AI properly: you still have to think. The AI removes the bottleneck between thinking and having something real.

**The Pipeline** — styled code block / diagram:

```
INPUT
  PDF / DOCX / TXT / MD / URL / chat message
       ↓
TEXT EXTRACTION
  pdfjs-dist (PDF) · mammoth (DOCX) · fetch + parse (URL)
       ↓
CHUNKING
  16KB chunks · cross-chunk context preserved
       ↓
LLM EXTRACTION  [information-extractor agent]
  25–35 structured facts per content-rich document
  explicit field_path mapping to PKB schema
       ↓
PKC CURATOR  [validation agent]
  conflict detection · fact deduplication
  batch write to PKB via withPKBLock (mutex)
       ↓
SYNTHESIZER  [runs automatically after every major action]
  product brief · personas (max 3) · gaps · suggested questions
  deterministic confidence score: field coverage (70pts)
    + quality modifier (20pts) + source diversity (10pts)
       ↓
PKB  [structured knowledge base, stored in Supabase]
  queryable by Explainer · improvable by Learner
```

**The Agents** — one section per agent, monospace label + prose description:

**`learner`** — Conversational KB builder. Has 6 behavioral states depending on where you are in the knowledge base journey: first session empty, first session with docs, returning to build, returning to fill gaps, established maintenance, wrong door (query routed to Explainer). Knows when to ask questions and when to stop.

**`explainer`** — Query layer. Confidence-tiered responses: ≥70% gives a clean answer, 40–69% caveats it, <40% redirects you to the Learner. Cross-product queries available from the Central Intelligence dashboard.

**`pkc-curator`** — Validates extracted facts, detects conflicts between sources (e.g. two documents disagree on pricing). Writes to the PKB through a mutex lock so concurrent ingestion never causes data loss.

**`synthesizer`** — Runs after every major action (ingestion, gap fill, recheck). Generates the product brief, personas, gaps list, suggested questions, and confidence score. Debounced 3 seconds to avoid thrashing.

**`gap-detector`** — Walks the actual PKB schema field by field. Surfaces what's missing. Prioritizes critical gaps (things the system can't function without) vs. important gaps (things that would improve quality).

**Stack** — clean two-column or inline list:
```
hosting      Railway
database     Supabase PostgreSQL (pgbouncer, max 7 connections)
storage      Supabase Storage (pkb-store + uploads buckets)
auth         Google OAuth · Passport.js · PostgreSQL-backed sessions
orm          Drizzle
frontend     React · TanStack Query · Vite
server       Express · esbuild
realtime     SSE (server-sent events)
ai           OpenAI API
```

**Known gaps / honest debt** (small section, muted):
No rate limiting on OpenAI routes. No CI/CD (manual deploys). No structured logging. Large JS bundle (~1.5MB, 436KB gzipped, no code splitting yet).

---

## Page 4: `/story` — How It Started

**Section label:** `// 04 — STORY`
**Page heading** (Playfair Display): `How It Started`
**Subtitle** (monospace, muted): `From onboarding flows to a knowledge layer — a 2-month build log`

**PIXEL ART TREE:** Place a simple pixel-art cherry blossom tree SVG on the left side of this page (like the ContextCon aesthetic). Keep it subtle — maybe 200px wide, partially overlapping the left margin, low opacity or just gentle pink on dark. Hand-code a simple SVG pixel grid approximating a cherry blossom tree. It should feel decorative and crafted, not AI-generated clip art.

**Body — written in Dev's voice, first person, honest:**

**Section: The First Thread**
It started at Betterplace, a startup working on workforce management. The work was in onboarding flows — specifically, the experience of getting a new employee up to speed on how the product actually worked. What became clear quickly: the bottleneck wasn't process. It was knowledge. The information that someone needed to truly understand the product wasn't in any single place. It was distributed across the people who'd built it.

**Section: The HyperVerge Signal**
Around the same time, I got close to joining HyperVerge — a company that solves the external version of this problem. They use AI to make customer KYC onboarding frictionless. Getting deep into how they thought about it reinforced the same pattern from a different angle: onboarding friction, in almost any context, is a knowledge transfer problem. The moment that knowledge is structured and accessible, the friction drops.

**Section: The First Idea Was Wrong**
The original product was called Orchestral AI. The idea: an agent orchestration layer for sales workflows. Agents coordinating across tasks, handing off context between each other. The "Orchestral" metaphor made sense — multiple agents playing in sync.

Building it revealed the real problem. The agents kept producing poor output — not because the orchestration logic was broken, but because they didn't have good context to work from. Product knowledge was missing, scattered, or wrong. The orchestration was fine. The intelligence was thin.

**Section: The Flip**
Once that was clear, the product reoriented completely. The question stopped being "how do we orchestrate agents better?" and became "what is the knowledge layer that agents need to work from?" That question led to a structured product knowledge base — not a wiki, not a document store, but something that extracts, validates, maintains, and makes product knowledge queryable.

The name changed to Kaizen. 改善. Continuous improvement. Because the bet is that product knowledge isn't a one-time capture — it's something that should improve every time you interact with it.

**Section: How It Was Built**
The entire system was built solo over 2 months. Claude Code wrote the implementation files. Every architectural decision, every agent design, every prompt, every product call was made by the builder. That division matters: AI as execution layer, human as the thinking layer. That's the pattern Kaizen itself is built around — and the pattern used to build it.

**Closing line** (italic, Playfair Display):
*"The product is still being built. This page will be out of date soon. That's the point."*

---

## Page 5: `/roadmap` — What's Next

**Section label:** `// 05 — ROADMAP`
**Page heading** (Playfair Display): `What's Next`
**Subtitle** (monospace, muted): `Current state, in progress, and what's being planned`

**Important note at top** (styled callout box, amber border):
```
⚠  This page reflects the honest build state as of April 2026.
   Items marked "live" are working end-to-end in production.
   Items marked "planned" are not started.
```

**Section: What's Live Now**

Display as a clean checklist — green checkmark + description:

```
✓  Google OAuth login + secure session management
✓  Org setup (name, industry, competitors, business model, website)
✓  Product creation — B2B / B2C / Hybrid types
✓  Document ingestion — PDF, DOCX, TXT, MD (up to 50MB)
✓  URL ingestion with text extraction and caching
✓  Conversational KB building (Learner agent, 6 behavioral states)
✓  SSE streaming for all AI responses
✓  Structured PKB with 9 fact categories + lifecycle status tracking
✓  Gap detection + guided gap-fill dialog
✓  Confidence scoring (deterministic, field coverage based)
✓  Synthesizer — product brief, personas, key pillars, gaps
✓  Knowledge tab — health indicator, facts, personas, gaps
✓  Explainer agent — confidence-tiered query responses
✓  Cross-product query dashboard (Central Intelligence)
✓  Review inbox — conflicts, sensitive, stale (org level)
✓  Conversation history + persistence
✓  3 themes — dark, light, minimal
```

**Section: In Progress**

```
○  Website crawler — backend exists, frontend not wired
○  Source deletion — UI present, no backend handler
○  Product-level review inbox — UI present, not populating
○  Persona confirmation / rejection UI
○  CI chat history persistence
```

**Section: Planned**

```
○  Fact editing UI
○  PKB export API — structured access for external AI tools
○  Role enforcement — admin vs member access control
○  Real-time collaboration / presence
○  Knowledge graph visualization
○  Rate limiting on AI routes
○  CI/CD pipeline
```

**Section: The North Star** (Playfair Display, large quote style):
> "Every company building with AI will need a product intelligence layer. Kaizen is an early attempt at that."

**Final CTA** (quiet, at bottom):
```
Currently exploring what to build next.
If this is relevant to something you're working on —

devvbuilds@gmail.com
linkedin.com/in/dev-saxena-650a27207
```

---

## Technical Requirements

1. **Next.js 14 App Router** — `npx create-next-app@latest kaizen-docs --typescript --tailwind --app`
2. **Google Fonts** — import Playfair Display + IBM Plex Mono in `layout.tsx`
3. **Grain texture** — CSS SVG filter or `background-image` noise on `body` or a fixed overlay `div`
4. **Active nav state** — use `usePathname()` from `next/navigation` in Sidebar
5. **No external UI libraries** — vanilla Tailwind + custom CSS only
6. **Pixel tree** — hand-coded SVG on `/story` page only, approximately 200x300px
7. **Mobile** — sidebar collapses to a top hamburger menu on <768px
8. **No animations needed** — clean and static is correct for this aesthetic. Subtle fade-in on page load only.
9. Run `npx tsc --noEmit` before considering done — zero TypeScript errors
10. All pages must be navigable from sidebar with correct active state highlighting

## Vercel Deployment

After build, initialize git repo and connect to Vercel via `vercel` CLI or GitHub import. The site should deploy with zero config (Next.js is auto-detected by Vercel).

---

## Do Not

- Do not add any "Get started" or "Sign up" buttons
- Do not use Inter, Roboto, or system fonts
- Do not use purple gradients or generic SaaS color schemes  
- Do not make this look like a product landing page — it is a builder's document
- Do not invent features or capabilities not listed in this prompt
- Do not mark anything as "live" that isn't in the live list above
- Do not add testimonials, pricing, or social proof sections
