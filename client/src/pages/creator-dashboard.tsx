import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Github, ExternalLink, RefreshCw, Sparkles, Star, ArrowUpRight, Layers,
  LogOut, Loader2, Network, Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import KaizenMark from "@/components/KaizenMark";
import ParticleBackground from "@/components/particle-background";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import type { CreatorProfile, Organisation, Product } from "@shared/schema";

interface ProfileResponse {
  profile: CreatorProfile | null;
  projects: Product[];
  github_username: string | null;
  avatar_url: string | null;
}

const CreatorDashboard = () => {
  const { minimal } = useMinimalMode();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [ghInput, setGhInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [synthing, setSynthing] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  const { data: orgData } = useQuery<{ organisation: Organisation | null }>({
    queryKey: ["/api/organisations"],
    queryFn: async () => {
      const res = await fetch("/api/organisations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
  const orgId = orgData?.organisation?.id;

  const { data, isLoading } = useQuery<ProfileResponse>({
    queryKey: [`/api/organisations/${orgId}/profile`],
    queryFn: async () => {
      const res = await fetch(`/api/organisations/${orgId}/profile`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    enabled: !!orgId,
  });

  const profile = data?.profile ?? null;
  const projects = data?.projects ?? [];
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const featuredIds = new Set(profile?.featured_product_ids ?? []);
  const featured = (profile?.featured_product_ids ?? []).map((id) => projectById.get(id)).filter(Boolean) as Product[];
  const rest = projects.filter((p) => !featuredIds.has(p.id));

  const refreshProfile = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/organisations/${orgId}/profile`] });
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
  };

  const runImport = async () => {
    if (!orgId) return;
    const username = (ghInput || data?.github_username || "").trim();
    if (!username) { setImportMsg("Enter a GitHub username first."); return; }
    setImporting(true);
    setImportProgress(null);
    setImportMsg("Connecting to GitHub…");
    try {
      const res = await fetch(`/api/organisations/${orgId}/github/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, token: tokenInput.trim() || undefined }),
        credentials: "include",
      });
      if (!res.ok || !res.body) { setImportMsg("Import failed to start."); setImporting(false); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "status") setImportMsg(evt.message);
            if (evt.type === "progress") { setImportProgress({ current: evt.current, total: evt.total }); setImportMsg(`Importing ${evt.repo}…`); }
            if (evt.type === "done") setImportMsg(`Imported ${evt.imported} projects.`);
          } catch { /* skip */ }
        }
      }
      refreshProfile();
      setShowConnect(false);
    } catch {
      setImportMsg("Import failed.");
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const regenerate = async () => {
    if (!orgId) return;
    setSynthing(true);
    try {
      await fetch(`/api/organisations/${orgId}/synthesize-profile`, { method: "POST", credentials: "include" });
      refreshProfile();
    } finally {
      setSynthing(false);
    }
  };

  if (isLoading || !orgId) {
    return (
      <div className="fixed inset-0 outer-frame flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen outer-frame relative">
      {!minimal && <ParticleBackground />}
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <KaizenMark className="h-5 w-5" />
            <span className="font-heading font-bold text-foreground">Kaizen</span>
            <span className="text-xs font-medium text-primary bg-primary/10 ring-1 ring-primary/25 rounded-full px-2 py-0.5 ml-1">Vibe Coder</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/auth/logout" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" /> Logout
            </a>
          </div>
        </div>

        {/* Profile header */}
        <div className="surface-card rounded-2xl p-7 mb-6">
          <div className="flex items-start gap-5 flex-wrap">
            {data?.avatar_url ? (
              <img src={data.avatar_url} alt="" className="h-20 w-20 rounded-2xl ring-2 ring-primary/40 object-cover" />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
                <Code2 className="h-8 w-8 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-heading text-2xl font-bold text-foreground">{profile?.display_name || orgData?.organisation?.name}</h1>
              {profile?.headline && <p className="text-muted-foreground mt-1">{profile.headline}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {(profile?.specialties ?? []).map((s) => (
                  <span key={s} className="text-[11px] font-medium text-primary bg-primary/10 ring-1 ring-primary/25 rounded-full px-2.5 py-1">{s}</span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {profile && (
                <a href={`/portfolio/${orgId}`} target="_blank" rel="noopener noreferrer">
                  <Button className="gap-2 bg-primary hover:bg-primary/90 rounded-xl w-full"><ExternalLink className="h-4 w-4" /> View portfolio</Button>
                </a>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowConnect((v) => !v)} className="gap-2 rounded-xl flex-1"><Github className="h-4 w-4" /> Import</Button>
                {projects.length > 0 && (
                  <Button variant="outline" onClick={regenerate} disabled={synthing} className="gap-2 rounded-xl">
                    {synthing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* GitHub connect panel */}
          {(showConnect || projects.length === 0) && (
            <div className="mt-6 border-t border-border/60 pt-5">
              <div className="flex items-center gap-2 mb-3">
                <Github className="h-4 w-4 text-foreground" />
                <span className="font-semibold text-sm">Connect GitHub</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Input value={ghInput} onChange={(e) => setGhInput(e.target.value)} placeholder={data?.github_username || "github username"} className="h-10 rounded-xl flex-1 min-w-[160px]" disabled={importing} />
                <Input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="token (optional, higher rate limit)" type="password" className="h-10 rounded-xl flex-1 min-w-[160px]" disabled={importing} />
                <Button onClick={runImport} disabled={importing} className="gap-2 bg-primary hover:bg-primary/90 rounded-xl">
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />} Import repos
                </Button>
              </div>
              {importMsg && (
                <div className="mt-3 text-sm text-muted-foreground flex items-center gap-2">
                  {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {importMsg}
                  {importProgress && <span className="text-xs">({importProgress.current}/{importProgress.total})</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Empty state */}
        {projects.length === 0 && !importing && (
          <div className="surface-card rounded-2xl p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30 mx-auto mb-4">
              <Github className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-heading text-lg font-bold text-foreground">Bring your work in</h3>
            <p className="text-muted-foreground text-sm mt-2 max-w-md mx-auto">
              Connect your GitHub above and Kaizen will read your repos, understand what you build, and
              generate a portfolio with a landing page for every project.
            </p>
          </div>
        )}

        {/* Bio */}
        {profile?.bio && (
          <div className="surface-card rounded-2xl p-7 mb-6">
            <div className="text-xs font-bold uppercase tracking-wider text-primary mb-3">About</div>
            <div className="prose prose-sm prose-invert max-w-none text-foreground/90 whitespace-pre-line leading-relaxed">{profile.bio}</div>
            {profile.how_i_build && (
              <div className="mt-5 pt-5 border-t border-border/60">
                <div className="text-xs font-bold uppercase tracking-wider text-primary mb-2">How I build</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{profile.how_i_build}</p>
              </div>
            )}
          </div>
        )}

        {/* Skills */}
        {profile && profile.skill_groups.length > 0 && (
          <div className="surface-card rounded-2xl p-7 mb-6">
            <div className="text-xs font-bold uppercase tracking-wider text-primary mb-4">Toolbox</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {profile.skill_groups.map((g) => (
                <div key={g.label}>
                  <div className="font-heading font-semibold text-sm text-foreground mb-2">{g.label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((i) => (
                      <span key={i} className="text-[11px] font-medium text-muted-foreground bg-secondary/60 ring-1 ring-border/50 rounded-full px-2 py-0.5">{i}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Featured */}
        {featured.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-lg font-bold text-foreground">Featured projects</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {featured.map((p) => <ProjectCard key={p.id} p={p} orgId={orgId} featured />)}
            </div>
          </div>
        )}

        {/* All projects */}
        {rest.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-heading text-lg font-bold text-foreground">{featured.length > 0 ? "More projects" : "Projects"}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rest.map((p) => <ProjectCard key={p.id} p={p} orgId={orgId} />)}
            </div>
          </div>
        )}

        {/* Connections */}
        {profile && profile.connections.length > 0 && (
          <div className="surface-card rounded-2xl p-7 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Network className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-lg font-bold text-foreground">How the work connects</h2>
            </div>
            <div className="space-y-3">
              {profile.connections.map((c, i) => {
                const a = projectById.get(c.from_product_id)?.name ?? `#${c.from_product_id}`;
                const b = projectById.get(c.to_product_id)?.name ?? `#${c.to_product_id}`;
                return (
                  <div key={i} className="border-l-2 border-primary pl-4 py-1">
                    <div className="text-sm font-semibold text-foreground">{a} <span className="text-primary">↔</span> {b} <span className="text-primary text-xs">· {c.relationship}</span></div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.rationale}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function ProjectCard({ p, orgId, featured }: { p: Product; orgId: number; featured?: boolean }) {
  const lang = (p as any).primary_language as string | null;
  const stars = (p as any).stars ?? 0;
  const topics = (((p as any).topics ?? []) as string[]).slice(0, 3);
  const home = (p as any).homepage_url as string | null;
  const repo = (p as any).repo_url as string | null;
  return (
    <div className={`surface-card rounded-2xl p-5 flex flex-col gap-3 ${featured ? "ring-1 ring-primary/20" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-heading font-bold text-foreground">{p.name}</h3>
        {stars > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Star className="h-3 w-3" />{stars}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {lang && <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">{lang}</span>}
        {topics.map((t) => <span key={t} className="text-[10px] font-medium text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5">{t}</span>)}
      </div>
      <div className="flex items-center gap-3 text-xs font-semibold mt-auto pt-2">
        <Link href={`/products/${p.id}`} className="text-foreground hover:text-primary">Manage →</Link>
        <a href={`/portfolio/${orgId}/p/${p.id}`} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1">Page <ExternalLink className="h-3 w-3" /></a>
        {home && <a href={home} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">Live ↗</a>}
        {repo && <a href={repo} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">Code ↗</a>}
      </div>
    </div>
  );
}

export default CreatorDashboard;
