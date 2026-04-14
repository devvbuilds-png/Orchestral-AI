export default function Home() {
  return (
    <>
      {/* ── SECTION 1: OPENING ── */}
      <div className="section-label">// 01 — WHAT IS KAIZEN</div>

      <h1 className="display-heading" style={{ fontSize: '3.25rem', marginBottom: '1.75rem' }}>
        Every AI tool you use is only as good as the context you give it. Kaizen builds the context layer.
      </h1>

      {/* ── TLDR BOX ── */}
      <div style={{
        border: '1px solid #2a2a2a',
        borderLeft: '3px solid #DE7356',
        background: '#0f0f0f',
        padding: '28px 32px',
        marginBottom: '4.5rem',
        borderRadius: '2px',
        maxWidth: '640px',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono), IBM Plex Mono, monospace',
          fontSize: '11px',
          letterSpacing: '0.1em',
          color: '#DE7356',
          marginBottom: '16px',
        }}>
          TLDR
        </div>
        <p style={{
          margin: 0,
          fontFamily: 'var(--font-mono), IBM Plex Mono, monospace',
          fontSize: '14px',
          lineHeight: 1.8,
          color: '#e8e8e8',
        }}>
          A product knowledge base that learns. Feed it your docs, talk to it,
          and it builds a structured understanding of everything your company
          makes. New hire joins? Ask Kaizen. Need a sales pitch? Kaizen generates
          it. No more knowledge living in someone&apos;s head. Your AI tools and your
          team always have accurate context about your product.
        </p>
        <p style={{
          margin: '20px 0 0',
          fontFamily: 'var(--font-mono), IBM Plex Mono, monospace',
          fontSize: '12px',
          color: '#555',
        }}>
          Built solo &middot; 2 months &middot; Live in production
        </p>
      </div>

      {/* ── SECTION 2: THE PROBLEM ── */}
      <div className="section-label">// THE PROBLEM</div>

      <p>
        AI tools are commoditizing fast. Everyone has access to the same models. The question is no
        longer whether your team uses AI — it&apos;s whether the AI actually understands your business.
      </p>

      <p>
        Most of the time, it doesn&apos;t. Product knowledge lives in people&apos;s heads, in Slack threads,
        in decks that were &ldquo;good enough at the time.&rdquo; Every AI interaction starts from zero. You
        paste context manually. You get something generic.
      </p>

      <div style={{
        borderLeft: '3px solid #DE7356',
        paddingLeft: '1.5rem',
        margin: '2rem 0 4.5rem',
        maxWidth: '600px',
      }}>
        <p style={{
          fontFamily: 'var(--font-lora), Lora, serif',
          fontSize: '1.75rem',
          fontStyle: 'italic',
          color: '#DE7356',
          lineHeight: 1.45,
          margin: 0,
          fontWeight: 400,
        }}>
          &ldquo;The companies that win with AI won&apos;t have the best models. They&apos;ll have the best
          context.&rdquo;
        </p>
      </div>

      {/* ── SECTION 3: WHY IT'S HARD ── */}
      <div className="section-label">// WHY THIS IS HARD</div>

      <p style={{ marginBottom: '1.5rem' }}>
        The hardest part wasn&apos;t ingestion. It was structure.
      </p>

      <div
        className="comparison-grid"
        style={{
          display: 'flex',
          gap: '24px',
          justifyContent: 'center',
          marginBottom: '4.5rem',
        }}
      >
        {/* Left card */}
        <div style={{
          flex: '0 0 300px',
          maxWidth: '300px',
          background: '#0f0f0f',
          border: '1px solid #1e1e1e',
          padding: '20px',
          borderRadius: '4px',
        }}>
          <div style={{
            fontSize: '0.65rem',
            color: '#666',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono), IBM Plex Mono, monospace',
            marginBottom: '1.25rem',
          }}>
            WITHOUT STRUCTURE
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {[
              'Documents contradict each other',
              'Positioning drifts across teams',
              'Context is implicit, never written',
              'AI outputs are generic',
              'New hires take weeks to ramp',
            ].map((item) => (
              <li key={item} style={{
                fontSize: '0.82rem',
                color: '#666',
                fontFamily: 'var(--font-mono), IBM Plex Mono, monospace',
                padding: '0.35rem 0',
                display: 'flex',
                gap: '0.6rem',
              }}>
                <span style={{ color: '#444', flexShrink: 0 }}>✗</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Right card */}
        <div style={{
          flex: '0 0 300px',
          maxWidth: '300px',
          background: '#0f0f0f',
          border: '1px solid #1e1e1e',
          padding: '20px',
          borderRadius: '4px',
        }}>
          <div style={{
            fontSize: '0.65rem',
            color: '#DE7356',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono), IBM Plex Mono, monospace',
            marginBottom: '1.25rem',
          }}>
            WITH KAIZEN
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {[
              'Conflicts detected and flagged',
              'Single source of truth per product',
              'Gaps surfaced and filled explicitly',
              'AI has structured context to work from',
              'Knowledge queryable from day one',
            ].map((item) => (
              <li key={item} style={{
                fontSize: '0.82rem',
                color: '#B0B0B0',
                fontFamily: 'var(--font-mono), IBM Plex Mono, monospace',
                padding: '0.35rem 0',
                display: 'flex',
                gap: '0.6rem',
              }}>
                <span style={{ color: '#DE7356', flexShrink: 0 }}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── SECTION 4: WHAT IT DOES ── */}
      <div className="section-label">// WHAT KAIZEN DOES</div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Three ways to feed it. One place it all goes.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '4.5rem', maxWidth: '640px' }}>
        {[
          {
            label: 'INGEST DOCUMENTS',
            body: 'Upload PDF, DOCX, TXT, or paste a URL. Kaizen chunks the content and runs extraction — pulling 25–35 structured facts per document. Conflicts between sources are detected, not ignored.',
          },
          {
            label: 'CONVERSE',
            body: 'No documents? Just talk. The Learner agent asks follow-up questions, fills gaps from your answers, and builds the knowledge base from conversation. It has six behavioral states — it knows when to push and when to stop.',
          },
          {
            label: 'QUERY',
            body: "Ask anything about your product. The Explainer gives confidence-tiered answers — clean when it's certain, caveated when it's not. Cross-product queries available from the central dashboard.",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="capability-card"
          >
            <div style={{
              fontSize: '0.65rem',
              color: '#DE7356',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-mono), IBM Plex Mono, monospace',
              marginBottom: '0.75rem',
            }}>
              {card.label}
            </div>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#B0B0B0', lineHeight: 1.9 }}>
              {card.body}
            </p>
          </div>
        ))}
      </div>

      {/* ── SECTION 5: OUTPUT DIAGRAM ── */}
      <div className="section-label">// OUTPUT</div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        Every ingestion runs a full synthesis pipeline.
      </p>

      <div style={{
        background: '#0a0a0a',
        border: '1px solid #1e1e1e',
        borderRadius: '4px',
        padding: '24px',
        marginBottom: '4.5rem',
        overflowX: 'auto',
        maxWidth: '640px',
      }}>
        <pre
          style={{
            margin: 0,
            fontSize: '0.78rem',
            lineHeight: 1.8,
            fontFamily: 'var(--font-mono), IBM Plex Mono, monospace',
            whiteSpace: 'pre',
            color: '#DE7356',
          }}
          dangerouslySetInnerHTML={{ __html:
`  <span style="color:#9A9A9A">docs / URLs / conversation</span>
          │
          ▼
  ┌─────────────────────────────────────────┐
  │   text extraction + chunking            │
  └──────────────────┬──────────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────────┐
  │   LLM extraction     <span style="color:#666">← 25–35 facts per doc</span>  │
  │   conflict detection <span style="color:#666">← sources cross-checked</span> │
  └──────────────────┬──────────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────────┐
  │              structured PKB             │
  │                                         │
  │  <span style="color:#9A9A9A">· product identity</span>                      │
  │  <span style="color:#9A9A9A">· value proposition</span>                     │
  │  <span style="color:#9A9A9A">· target users + personas (max 3)</span>       │
  │  <span style="color:#9A9A9A">· competitive positioning</span>               │
  │  <span style="color:#9A9A9A">· key message pillars</span>                   │
  │  <span style="color:#9A9A9A">· gaps  →  critical / important</span>         │
  └──────────────────┬──────────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────────┐
  │           synthesizer output            │
  │                                         │
  │  <span style="color:#9A9A9A">confidence score  ·  product brief</span>      │
  │  <span style="color:#9A9A9A">health indicator  ·  suggested Qs</span>       │
  └─────────────────────────────────────────┘`
          }}
        />
      </div>

      {/* ── SECTION 7: THE BIGGER BET ── */}
      <div className="section-label">// THE BIGGER BET</div>

      <p style={{
        fontFamily: 'var(--font-lora), Lora, serif',
        fontSize: '1.75rem',
        fontStyle: 'italic',
        fontWeight: 400,
        color: '#D8D8D8',
        lineHeight: 1.4,
        marginBottom: '1.75rem',
        borderLeft: '3px solid #DE7356',
        paddingLeft: '1.5rem',
        maxWidth: '600px',
      }}>
        &ldquo;Every company building with AI will need a product intelligence layer. The differentiator
        won&apos;t be which tools you use — but how well those tools understand your business.&rdquo;
      </p>

      <p>
        Teams that build this layer early move faster, produce better output, and retain
        institutional knowledge that would otherwise walk out the door.
      </p>

      <p style={{ marginBottom: '4.5rem' }}>
        Kaizen is an early version of that layer.
      </p>

      {/* ── CLOSING CTA ── */}
      <div style={{
        borderTop: '1px solid #1e1e1e',
        paddingTop: '2.5rem',
        textAlign: 'center',
        fontFamily: 'var(--font-mono), IBM Plex Mono, monospace',
        fontSize: '0.78rem',
        color: '#555',
        lineHeight: 2.2,
      }}>
        <p style={{ margin: '0 0 0.25rem', color: '#666' }}>
          Built solo &middot; 2 months &middot; Still building
        </p>
        <p style={{ margin: '0 0 0.25rem' }}>
          If you&apos;re working on something where this matters —
          <br />
          or want to talk about the problem —
        </p>
        <p style={{ margin: 0 }}>
          <a href="mailto:devvbuilds@gmail.com" style={{ color: '#DE7356', textDecoration: 'none' }}>
            devvbuilds@gmail.com
          </a>
          {' '}&middot;{' '}
          <a
            href="https://www.linkedin.com/in/dev-saxena-650a27207/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#DE7356', textDecoration: 'none' }}
          >
            linkedin ↗
          </a>
        </p>
      </div>
    </>
  );
}
