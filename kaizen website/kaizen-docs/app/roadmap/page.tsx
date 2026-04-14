export default function RoadmapPage() {
  return (
    <>
      <div className="section-label">// 05 — ROADMAP</div>
      <h1 className="display-heading">What&apos;s Next</h1>
      <p className="page-subtitle">Current state, in progress, and what&apos;s being planned</p>

      <div className="roadmap-callout">
        <span>⚠</span>{'  '}This page reflects the honest build state as of April 2026.
        <br />
        {'   '}Items marked &ldquo;live&rdquo; are working end-to-end in production.
        <br />
        {'   '}Items marked &ldquo;planned&rdquo; are not started.
      </div>

      <h2>What&apos;s Live Now</h2>

      <ul className="checklist">
        {[
          'Google OAuth login + secure session management',
          'Org setup (name, industry, competitors, business model, website)',
          'Product creation — B2B / B2C / Hybrid types',
          'Document ingestion — PDF, DOCX, TXT, MD (up to 50MB)',
          'URL ingestion with text extraction and caching',
          'Conversational KB building (Learner agent, 6 behavioral states)',
          'SSE streaming for all AI responses',
          'Structured PKB with 9 fact categories + lifecycle status tracking',
          'Gap detection + guided gap-fill dialog',
          'Confidence scoring (deterministic, field coverage based)',
          'Synthesizer — product brief, personas, key pillars, gaps',
          'Knowledge tab — health indicator, facts, personas, gaps',
          'Explainer agent — confidence-tiered query responses',
          'Cross-product query dashboard (Central Intelligence)',
          'Review inbox — conflicts, sensitive, stale (org level)',
          'Conversation history + persistence',
          '3 themes — dark, light, minimal',
        ].map((item) => (
          <li key={item}>
            <span className="check-live">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <h2>In Progress</h2>

      <ul className="checklist">
        {[
          'Website crawler — backend exists, frontend not wired',
          'Source deletion — UI present, no backend handler',
          'Product-level review inbox — UI present, not populating',
          'Persona confirmation / rejection UI',
          'CI chat history persistence',
        ].map((item) => (
          <li key={item}>
            <span className="check-planned" style={{ color: '#888' }}>○</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <h2>Planned</h2>

      <ul className="checklist">
        {[
          'Fact editing UI',
          'PKB export API — structured access for external AI tools',
          'Role enforcement — admin vs member access control',
          'Real-time collaboration / presence',
          'Knowledge graph visualization',
          'Rate limiting on AI routes',
          'CI/CD pipeline',
        ].map((item) => (
          <li key={item}>
            <span className="check-planned">○</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <h2>The North Star</h2>

      <blockquote className="roadmap-quote">
        &ldquo;Every company building with AI will need a product intelligence layer. Kaizen is an early
        attempt at that.&rdquo;
      </blockquote>

      <div className="cta-section">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
          Currently exploring what to build next.
          <br />
          If this is relevant to something you&apos;re working on —
        </p>
        <p style={{ fontSize: '0.8rem', marginBottom: 0 }}>
          <a href="mailto:devvbuilds@gmail.com">devvbuilds@gmail.com</a>
          <br />
          <a
            href="https://www.linkedin.com/in/dev-saxena-650a27207/"
            target="_blank"
            rel="noopener noreferrer"
          >
            linkedin.com/in/dev-saxena-650a27207
          </a>
        </p>
      </div>
    </>
  );
}
