export default function BuildPage() {
  return (
    <>
      <div className="section-label">// 03 — BUILD</div>
      <h1 className="display-heading">How It&apos;s Built</h1>
      <p className="page-subtitle">Architecture, agents, and honest status</p>

      <p>
        Built solo over 2 months. Claude Code handled implementation — writing files, running
        TypeScript checks, managing the database schema. The architecture decisions, agent design,
        prompt engineering, and product calls were made by the builder. This is what it looks like
        to use AI properly: you still have to think. The AI removes the bottleneck between thinking
        and having something real.
      </p>

      <h2>The Pipeline</h2>

      <div className="diagram-block">
        <pre>{`INPUT
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
  queryable by Explainer · improvable by Learner`}</pre>
      </div>

      <h2>The Agents</h2>

      <div className="agent-block">
        <div className="agent-name">`learner`</div>
        <p className="agent-desc">
          Conversational KB builder. Has 6 behavioral states depending on where you are in the
          knowledge base journey: first session empty, first session with docs, returning to build,
          returning to fill gaps, established maintenance, wrong door (query routed to Explainer).
          Knows when to ask questions and when to stop.
        </p>
      </div>

      <div className="agent-block">
        <div className="agent-name">`explainer`</div>
        <p className="agent-desc">
          Query layer. Confidence-tiered responses: ≥70% gives a clean answer, 40–69% caveats it,
          &lt;40% redirects you to the Learner. Cross-product queries available from the Central
          Intelligence dashboard.
        </p>
      </div>

      <div className="agent-block">
        <div className="agent-name">`pkc-curator`</div>
        <p className="agent-desc">
          Validates extracted facts, detects conflicts between sources (e.g. two documents disagree
          on pricing). Writes to the PKB through a mutex lock so concurrent ingestion never causes
          data loss.
        </p>
      </div>

      <div className="agent-block">
        <div className="agent-name">`synthesizer`</div>
        <p className="agent-desc">
          Runs after every major action (ingestion, gap fill, recheck). Generates the product brief,
          personas, gaps list, suggested questions, and confidence score. Debounced 3 seconds to
          avoid thrashing.
        </p>
      </div>

      <div className="agent-block">
        <div className="agent-name">`gap-detector`</div>
        <p className="agent-desc">
          Walks the actual PKB schema field by field. Surfaces what&apos;s missing. Prioritizes critical
          gaps (things the system can&apos;t function without) vs. important gaps (things that would
          improve quality).
        </p>
      </div>

      <h2>Stack</h2>

      <table className="stack-table">
        <tbody>
          <tr><td>hosting</td><td>Railway</td></tr>
          <tr><td>database</td><td>Supabase PostgreSQL (pgbouncer, max 7 connections)</td></tr>
          <tr><td>storage</td><td>Supabase Storage (pkb-store + uploads buckets)</td></tr>
          <tr><td>auth</td><td>Google OAuth · Passport.js · PostgreSQL-backed sessions</td></tr>
          <tr><td>orm</td><td>Drizzle</td></tr>
          <tr><td>frontend</td><td>React · TanStack Query · Vite</td></tr>
          <tr><td>server</td><td>Express · esbuild</td></tr>
          <tr><td>realtime</td><td>SSE (server-sent events)</td></tr>
          <tr><td>ai</td><td>OpenAI API</td></tr>
        </tbody>
      </table>

      <h2>Known gaps / honest debt</h2>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        No rate limiting on OpenAI routes. No CI/CD (manual deploys). No structured logging. Large
        JS bundle (~1.5MB, 436KB gzipped, no code splitting yet).
      </p>
    </>
  );
}
