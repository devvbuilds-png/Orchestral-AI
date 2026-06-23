import type { OrgPKB, CreatorProfile, PKB, Product } from "@shared/schema";

// ──────────────────────────────────────────────────────────────────────────────
// Portfolio generator — produces self-contained, shareable HTML for a vibe
// coder's portfolio and per-project landing pages. Built deterministically from
// the already-synthesized profile + product briefs (no per-render LLM cost),
// so output is consistent, fast, and on-brand (Kaizen terracotta + dark UI).
// All dynamic content is HTML-escaped to keep generated pages XSS-safe.
// ──────────────────────────────────────────────────────────────────────────────

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Only allow http(s) URLs in hrefs — blocks javascript:/data: injection. */
function safeUrl(u: unknown): string | null {
  const s = String(u ?? "").trim();
  if (!s) return null;
  try {
    const parsed = new URL(s);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return s;
  } catch { /* not absolute */ }
  return null;
}

export interface PortfolioProject {
  product: Product;
  pkb: PKB | null;
}

const ACCENT = "#DE7356";

function baseHead(title: string, description: string, ogImage?: string): string {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:type" content="website"/>
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}"/>` : ""}
<meta name="twitter:card" content="summary_large_image"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>${CSS}</style>
</head>`;
}

const CSS = `
:root{--accent:${ACCENT};--bg:#0a0a0a;--surface:#141414;--surface2:#1c1c1c;--border:#2a2a2a;--text:#f5f5f5;--muted:#a1a1a1;}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}
h1,h2,h3,.head{font-family:'Space Grotesk',sans-serif;font-weight:700;letter-spacing:-0.02em}
a{color:inherit;text-decoration:none}
.accent{color:var(--accent)}
section{padding:72px 0;border-bottom:1px solid var(--border)}
.hero{padding:120px 0 88px;position:relative;overflow:hidden}
.hero::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 50% at 50% 0%, rgba(222,115,86,0.14), transparent 70%);pointer-events:none}
.avatar{width:92px;height:92px;border-radius:24px;border:2px solid var(--accent);object-fit:cover;margin-bottom:24px}
.hero h1{font-size:clamp(2.4rem,6vw,4rem);line-height:1.05}
.headline{font-size:clamp(1.1rem,2.5vw,1.5rem);color:var(--muted);margin-top:18px;max-width:680px}
.kicker{display:inline-flex;align-items:center;gap:8px;font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.12em;color:var(--accent);background:rgba(222,115,86,.1);border:1px solid rgba(222,115,86,.25);padding:6px 14px;border-radius:999px;margin-bottom:28px}
.cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:36px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:12px;font-weight:600;font-size:.95rem;transition:.2s;border:1px solid var(--border)}
.btn-primary{background:var(--accent);color:#1a0f0b;border-color:var(--accent)}
.btn-primary:hover{filter:brightness(1.08);transform:translateY(-1px)}
.btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
.section-label{font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.14em;color:var(--accent);margin-bottom:14px}
h2{font-size:clamp(1.6rem,4vw,2.4rem);margin-bottom:8px}
.lead{color:var(--muted);max-width:760px;margin-bottom:34px}
.prose p{color:#d4d4d4;margin-bottom:16px;max-width:760px}
.grid{display:grid;gap:20px}
.grid-3{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:24px;transition:.2s;display:flex;flex-direction:column;gap:12px}
.card:hover{border-color:rgba(222,115,86,.5);transform:translateY(-3px);background:var(--surface2)}
.card h3{font-size:1.25rem}
.card .desc{color:var(--muted);font-size:.95rem;flex:1}
.badges{display:flex;gap:8px;flex-wrap:wrap}
.badge{font-size:.72rem;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--surface2);border:1px solid var(--border);color:var(--muted)}
.badge.lang{color:var(--accent);border-color:rgba(222,115,86,.3)}
.meta{display:flex;gap:16px;align-items:center;font-size:.82rem;color:var(--muted)}
.card-links{display:flex;gap:14px;font-size:.85rem;font-weight:600}
.card-links a{color:var(--accent)}
.featured{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:22px}
.feat{background:linear-gradient(160deg,var(--surface),#100d0c);border:1px solid var(--border);border-radius:22px;padding:30px;position:relative;overflow:hidden}
.feat::after{content:"";position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:radial-gradient(circle,rgba(222,115,86,.18),transparent 70%)}
.feat h3{font-size:1.5rem;margin-bottom:10px}
.skill-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
.skill-group .label{font-family:'Space Grotesk';font-weight:600;color:var(--accent);margin-bottom:12px}
.conn{display:flex;gap:14px;align-items:flex-start;padding:16px;border-left:2px solid var(--accent);background:var(--surface);border-radius:0 12px 12px 0;margin-bottom:12px}
.conn .rel{font-family:'Space Grotesk';font-weight:600;color:var(--text)}
.specialties{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}
footer{padding:48px 0;text-align:center;color:var(--muted);font-size:.85rem}
footer .built{color:var(--accent);font-weight:600}
.backlink{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:.85rem;margin-bottom:24px}
.backlink:hover{color:var(--accent)}
@media(max-width:600px){section{padding:52px 0}.hero{padding:84px 0 60px}}
`;

function projectCard(p: Product, pkb: PKB | null): string {
  const brief = pkb?.derived_insights?.product_brief?.who_its_for
    || pkb?.meta?.product_brief
    || (p as any).description
    || "A project in progress.";
  const lang = (p as any).primary_language as string | null;
  const topics = (((p as any).topics ?? []) as string[]).slice(0, 4);
  const stars = (p as any).stars ?? 0;
  // The whole card links to the project page (which carries Live/Code links) —
  // avoids nested anchors and inline onclick (XSS-safe).
  return `<a class="card" href="/portfolio/${p.org_id}/p/${p.id}">
    <div class="badges">
      ${lang ? `<span class="badge lang">${esc(lang)}</span>` : ""}
      ${topics.map((t) => `<span class="badge">${esc(t)}</span>`).join("")}
    </div>
    <h3>${esc(p.name)}</h3>
    <p class="desc">${esc(briefSnippet(brief))}</p>
    <div class="meta">${stars > 0 ? `<span>★ ${stars}</span>` : ""}${(p as any).confidence_score ? `<span>${(p as any).confidence_score}% mapped</span>` : ""}</div>
    <div class="card-links"><span>View project →</span></div>
  </a>`;
}

function briefSnippet(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 180 ? t.slice(0, 177) + "…" : t;
}

export function buildPortfolioHTML(
  org: OrgPKB,
  profile: CreatorProfile,
  projects: PortfolioProject[],
): string {
  const byId = new Map(projects.map((x) => [x.product.id, x]));
  const featured = profile.featured_product_ids.map((id) => byId.get(id)).filter(Boolean) as PortfolioProject[];
  const featuredIds = new Set(profile.featured_product_ids);
  const rest = projects.filter((x) => !featuredIds.has(x.product.id));

  const bioParas = profile.bio.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join("");

  const featuredHTML = featured.length ? `<section id="featured"><div class="wrap">
    <div class="section-label">Featured work</div>
    <h2>Things I'm proud of</h2>
    <div class="featured" style="margin-top:32px">
      ${featured.map(({ product, pkb }) => {
        const why = pkb?.derived_insights?.product_brief?.why_it_wins || pkb?.meta?.product_brief || (product as any).description || "";
        const lang = (product as any).primary_language;
        const home = safeUrl((product as any).homepage_url);
        const repo = safeUrl((product as any).repo_url);
        return `<div class="feat">
          ${lang ? `<span class="badge lang">${esc(lang)}</span>` : ""}
          <h3 style="margin-top:14px">${esc(product.name)}</h3>
          <p class="desc" style="color:var(--muted);margin:10px 0 18px">${esc(briefSnippet(why))}</p>
          <div class="card-links">
            <a href="/portfolio/${product.org_id}/p/${product.id}">Read more →</a>
            ${home ? `<a href="${esc(home)}" target="_blank" rel="noopener">Live ↗</a>` : ""}
            ${repo ? `<a href="${esc(repo)}" target="_blank" rel="noopener">Code ↗</a>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div></div></section>` : "";

  const connectionsHTML = profile.connections.length ? `<section id="connections"><div class="wrap">
    <div class="section-label">How the work connects</div>
    <h2>The through-line</h2>
    <div style="margin-top:28px">
      ${profile.connections.map((c) => {
        const a = byId.get(c.from_product_id)?.product.name ?? `#${c.from_product_id}`;
        const b = byId.get(c.to_product_id)?.product.name ?? `#${c.to_product_id}`;
        return `<div class="conn"><div><div class="rel">${esc(a)} ↔ ${esc(b)} · <span class="accent">${esc(c.relationship)}</span></div><div style="color:var(--muted);margin-top:4px">${esc(c.rationale)}</div></div></div>`;
      }).join("")}
    </div></div></section>` : "";

  const skillsHTML = profile.skill_groups.length ? `<section id="skills"><div class="wrap">
    <div class="section-label">Toolbox</div>
    <h2>What I build with</h2>
    <div class="skill-groups" style="margin-top:30px">
      ${profile.skill_groups.map((g) => `<div class="skill-group">
        <div class="label">${esc(g.label)}</div>
        <div class="badges">${g.items.map((i) => `<span class="badge">${esc(i)}</span>`).join("")}</div>
      </div>`).join("")}
    </div></div></section>` : "";

  const socials = (profile.social_links ?? []).map((l) => ({ label: l.label, url: safeUrl(l.url) })).filter((l) => l.url);
  const githubUrl = org.github_username ? `https://github.com/${encodeURIComponent(org.github_username)}` : null;

  return `${baseHead(`${profile.display_name} — ${profile.headline}`, briefSnippet(profile.bio), org.avatar_url)}
<body>
  <header class="hero"><div class="wrap">
    ${org.avatar_url ? `<img class="avatar" src="${esc(org.avatar_url)}" alt="${esc(profile.display_name)}"/>` : ""}
    <div class="kicker">● ${esc(profile.specialties[0] || "Builder")}</div>
    <h1>${esc(profile.display_name)}</h1>
    <p class="headline">${esc(profile.headline)}</p>
    <div class="cta-row">
      <a class="btn btn-primary" href="#featured">See the work</a>
      ${githubUrl ? `<a class="btn btn-ghost" href="${esc(githubUrl)}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}
      ${socials.map((l) => `<a class="btn btn-ghost" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}
    </div>
    ${profile.specialties.length ? `<div class="specialties">${profile.specialties.map((s) => `<span class="badge lang">${esc(s)}</span>`).join("")}</div>` : ""}
  </div></header>

  <section id="about"><div class="wrap">
    <div class="section-label">About</div>
    <h2>Who I am</h2>
    <div class="prose" style="margin-top:22px">${bioParas}</div>
    ${profile.how_i_build ? `<div class="prose" style="margin-top:24px"><div class="section-label" style="margin-bottom:8px">How I build</div><p>${esc(profile.how_i_build)}</p></div>` : ""}
  </div></section>

  ${featuredHTML}
  ${skillsHTML}

  <section id="projects"><div class="wrap">
    <div class="section-label">All projects</div>
    <h2>Everything I've shipped</h2>
    <div class="grid grid-3" style="margin-top:32px">
      ${(rest.length ? rest : projects).map(({ product, pkb }) => projectCard(product, pkb)).join("")}
    </div>
  </div></section>

  ${connectionsHTML}

  <footer><div class="wrap">
    <p>${esc(profile.display_name)} · portfolio auto-generated by <span class="built">Kaizen</span></p>
  </div></footer>
</body></html>`;
}

export function buildProjectHTML(org: OrgPKB, product: Product, pkb: PKB | null): string {
  const pb = pkb?.derived_insights?.product_brief;
  const brief = pkb?.meta?.product_brief || pb?.simple_summary || (product as any).description || "";
  const whoFor = pb?.who_its_for;
  const whyWins = pb?.why_it_wins;
  const pillars = pb?.key_message_pillars ?? [];
  const lang = (product as any).primary_language as string | null;
  const topics = (((product as any).topics ?? []) as string[]);
  const home = safeUrl((product as any).homepage_url);
  const repo = safeUrl((product as any).repo_url);
  const stars = (product as any).stars ?? 0;

  // Features from PKB facts
  const features: Array<{ name: string; what: string }> = [];
  const rawFeatures: any = (pkb as any)?.facts?.features;
  if (Array.isArray(rawFeatures)) {
    for (const f of rawFeatures.slice(0, 6)) {
      const name = f?.name?.value ?? f?.name;
      const what = f?.what_it_does?.value ?? f?.what_it_does ?? "";
      if (name) features.push({ name: String(name), what: String(what) });
    }
  }

  const briefParas = brief.split(/\n\n+/).map((p: string) => `<p>${esc(p)}</p>`).join("");

  return `${baseHead(`${product.name} — by ${org.name}`, briefSnippet(brief || product.name), org.avatar_url)}
<body>
  <header class="hero"><div class="wrap">
    <a class="backlink" href="/portfolio/${product.org_id}">← ${esc(org.name || "portfolio")}</a>
    <div class="kicker">● Project</div>
    <h1>${esc(product.name)}</h1>
    ${whoFor ? `<p class="headline">${esc(whoFor)}</p>` : ""}
    <div class="badges" style="margin-top:24px">
      ${lang ? `<span class="badge lang">${esc(lang)}</span>` : ""}
      ${topics.slice(0, 6).map((t) => `<span class="badge">${esc(t)}</span>`).join("")}
      ${stars > 0 ? `<span class="badge">★ ${stars}</span>` : ""}
    </div>
    <div class="cta-row">
      ${home ? `<a class="btn btn-primary" href="${esc(home)}" target="_blank" rel="noopener">Visit live ↗</a>` : ""}
      ${repo ? `<a class="btn btn-ghost" href="${esc(repo)}" target="_blank" rel="noopener">View code ↗</a>` : ""}
    </div>
  </div></header>

  ${brief ? `<section><div class="wrap"><div class="section-label">Overview</div><h2>What it is</h2><div class="prose" style="margin-top:20px">${briefParas}</div></div></section>` : ""}

  ${whyWins ? `<section><div class="wrap"><div class="section-label">Why it stands out</div><h2>The edge</h2><div class="prose" style="margin-top:18px"><p>${esc(whyWins)}</p></div>
    ${pillars.length ? `<div class="specialties">${pillars.map((p) => `<span class="badge lang">${esc(p)}</span>`).join("")}</div>` : ""}
  </div></section>` : ""}

  ${features.length ? `<section><div class="wrap"><div class="section-label">Highlights</div><h2>Key features</h2>
    <div class="grid grid-3" style="margin-top:30px">
      ${features.map((f) => `<div class="card"><h3>${esc(f.name)}</h3><p class="desc">${esc(f.what)}</p></div>`).join("")}
    </div></div></section>` : ""}

  <footer><div class="wrap"><p><a class="accent" href="/portfolio/${product.org_id}">← Back to ${esc(org.name || "portfolio")}</a> · built with <span class="built">Kaizen</span></p></div></footer>
</body></html>`;
}
