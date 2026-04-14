export default function WhyPage() {
  return (
    <>
      <div className="section-label">// 02 — WHY</div>
      <h1 className="display-heading">The Problem Worth Solving</h1>
      <p className="page-subtitle">
        On onboarding tax, context rot, and why your AI outputs are generic
      </p>

      <p>
        When a new hire joins a product team, someone senior disappears for two or three days. Not
        because onboarding is poorly designed — but because the knowledge that matters most was
        never written down. It lives in a Slack thread from eight months ago, in the deck that was
        &ldquo;good enough at the time,&rdquo; in the judgment calls that shaped the product roadmap but never
        made it into a doc. The transfer happens, but it&apos;s lossy. Every time.
      </p>

      <p>
        Now the same thing is happening with AI tools. Every time you use one, you paste in context
        — what your product is, who it&apos;s for, how it compares. The model gives you a generic answer
        because it doesn&apos;t know your specific context. You get something useful but not quite right.
        So you add more context. Manually. Every time. And none of it is saved.
      </p>

      <p>
        The companies that win with AI won&apos;t necessarily have the best models. They&apos;ll have the best
        context. Structured, maintained, reusable product knowledge that any agent — or any new hire
        — can pull from on day one.
      </p>

      <p>
        Kaizen (改善) is a Japanese concept meaning continuous improvement. The name reflects the
        actual bet: product knowledge isn&apos;t something you capture once and forget. It decays, it
        conflicts with itself, it gaps over time as the product evolves. The right model isn&apos;t a
        one-time import — it&apos;s a living layer that improves every time you interact with it.
      </p>

      <p>
        This problem became real through two experiences: working on internal employee onboarding
        flows at a startup, and getting close to HyperVerge — a company that solves the{' '}
        <em>external</em> version of this problem (customer identity onboarding via AI). Both
        experiences pointed at the same gap: onboarding friction, whether for a customer or a new
        hire, is fundamentally a knowledge transfer problem. The tools to solve it properly
        didn&apos;t exist. So this is an attempt at one.
      </p>
    </>
  );
}
