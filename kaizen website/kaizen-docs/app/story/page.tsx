export default function StoryPage() {
  return (
    <>
      {/* Decorative pixel accent — subtle header line */}
      <div style={{ marginBottom: '2rem' }}>
        <svg width="40%" height="4" aria-hidden="true">
          {Array.from({ length: 20 }).map((_, i) => (
            <rect key={i} x={i * 5} y={0} width={4} height={4} fill="#E8A0B0" opacity={0.4} />
          ))}
        </svg>
      </div>

      <div className="section-label">// 04 — STORY</div>
      <h1 className="display-heading">How It Started</h1>
      <p className="page-subtitle">
        From onboarding flows to a knowledge layer — a 2-month build log
      </p>

      <div className="story-section">
        <div className="story-section-title">The First Thread</div>
        <p>
          It started at Betterplace, a startup working on workforce management. The work was in
          onboarding flows — specifically, the experience of getting a new employee up to speed on
          how the product actually worked. What became clear quickly: the bottleneck wasn&apos;t
          process. It was knowledge. The information that someone needed to truly understand the
          product wasn&apos;t in any single place. It was distributed across the people who&apos;d built it.
        </p>
      </div>

      <div className="story-section">
        <div className="story-section-title">The HyperVerge Signal</div>
        <p>
          Around the same time, I got close to joining HyperVerge — a company that solves the
          external version of this problem. They use AI to make customer KYC onboarding
          frictionless. Getting deep into how they thought about it reinforced the same pattern
          from a different angle: onboarding friction, in almost any context, is a knowledge
          transfer problem. The moment that knowledge is structured and accessible, the friction
          drops.
        </p>
      </div>

      <div className="story-section">
        <div className="story-section-title">The First Idea Was Wrong</div>
        <p>
          The original product was called Orchestral AI. The idea: an agent orchestration layer
          for sales workflows. Agents coordinating across tasks, handing off context between each
          other. The &ldquo;Orchestral&rdquo; metaphor made sense — multiple agents playing in sync.
        </p>
        <p>
          Building it revealed the real problem. The agents kept producing poor output — not
          because the orchestration logic was broken, but because they didn&apos;t have good context to
          work from. Product knowledge was missing, scattered, or wrong. The orchestration was
          fine. The intelligence was thin.
        </p>
      </div>

      <div className="story-section">
        <div className="story-section-title">The Flip</div>
        <p>
          Once that was clear, the product reoriented completely. The question stopped being
          &ldquo;how do we orchestrate agents better?&rdquo; and became &ldquo;what is the knowledge layer that
          agents need to work from?&rdquo; That question led to a structured product knowledge base —
          not a wiki, not a document store, but something that extracts, validates, maintains, and
          makes product knowledge queryable.
        </p>
        <p>
          The name changed to Kaizen. 改善. Continuous improvement. Because the bet is that
          product knowledge isn&apos;t a one-time capture — it&apos;s something that should improve every
          time you interact with it.
        </p>
      </div>

      <div className="story-section">
        <div className="story-section-title">How It Was Built</div>
        <p>
          The entire system was built solo over 2 months. Claude Code wrote the implementation
          files. Every architectural decision, every agent design, every prompt, every product
          call was made by the builder. That division matters: AI as execution layer, human as the
          thinking layer. That&apos;s the pattern Kaizen itself is built around — and the pattern used
          to build it.
        </p>
      </div>

      <div className="story-closing">
        &ldquo;The product is still being built. This page will be out of date soon. That&apos;s the
        point.&rdquo;
      </div>
    </>
  );
}
