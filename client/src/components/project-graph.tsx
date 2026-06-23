import { useMemo, useState } from "react";
import type { CreatorProjectConnection, Product } from "@shared/schema";

interface Props {
  projects: Product[];
  connections: CreatorProjectConnection[];
  featuredIds: Set<number>;
  orgId: number;
}

interface Node { id: number; name: string; featured: boolean; x: number; y: number; vx: number; vy: number; degree: number; }
interface Edge { from: number; to: number; relationship: string; rationale: string; }

const W = 760;
const H = 460;

/**
 * Dependency-free force-directed graph of project connections.
 * Layout is computed deterministically (no Math.random — seeded by index) so it
 * stays stable across renders. Nodes link to their public project page.
 */
const ProjectGraph = ({ projects, connections, featuredIds, orgId }: Props) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const { nodes, edges } = useMemo(() => {
    const valid = new Set(projects.map((p) => p.id));
    const edges: Edge[] = connections
      .filter((c) => valid.has(c.from_product_id) && valid.has(c.to_product_id) && c.from_product_id !== c.to_product_id)
      .map((c) => ({ from: c.from_product_id, to: c.to_product_id, relationship: c.relationship, rationale: c.rationale }));

    // Only show nodes that participate in at least one connection (keeps the
    // graph meaningful); fall back to all projects if there are no edges.
    const connected = new Set<number>();
    edges.forEach((e) => { connected.add(e.from); connected.add(e.to); });
    const shown = edges.length > 0 ? projects.filter((p) => connected.has(p.id)) : projects;

    const degree: Record<number, number> = {};
    edges.forEach((e) => { degree[e.from] = (degree[e.from] ?? 0) + 1; degree[e.to] = (degree[e.to] ?? 0) + 1; });

    const n = shown.length;
    const cx = W / 2, cy = H / 2;
    const nodes: Node[] = shown.map((p, i) => {
      const angle = (i / Math.max(1, n)) * Math.PI * 2;
      const r = Math.min(W, H) * 0.32;
      return {
        id: p.id, name: p.name, featured: featuredIds.has(p.id),
        x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r,
        vx: 0, vy: 0, degree: degree[p.id] ?? 0,
      };
    });

    if (n > 1) {
      const byId = new Map(nodes.map((nd) => [nd.id, nd]));
      const K = 0.012;            // spring stiffness
      const REPULSE = 9000;       // node repulsion
      const restLen = 150;
      for (let iter = 0; iter < 320; iter++) {
        // Repulsion (all pairs)
        for (let a = 0; a < nodes.length; a++) {
          for (let b = a + 1; b < nodes.length; b++) {
            const na = nodes[a], nb = nodes[b];
            let dx = na.x - nb.x, dy = na.y - nb.y;
            let d2 = dx * dx + dy * dy; if (d2 < 0.01) { dx = (a - b) || 1; dy = 1; d2 = 2; }
            const f = REPULSE / d2;
            const d = Math.sqrt(d2);
            const fx = (dx / d) * f, fy = (dy / d) * f;
            na.vx += fx; na.vy += fy; nb.vx -= fx; nb.vy -= fy;
          }
        }
        // Spring attraction along edges
        for (const e of edges) {
          const a = byId.get(e.from)!, b = byId.get(e.to)!;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (d - restLen) * K;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
        // Centering + integrate with damping
        for (const nd of nodes) {
          nd.vx += (cx - nd.x) * 0.008;
          nd.vy += (cy - nd.y) * 0.008;
          nd.vx *= 0.82; nd.vy *= 0.82;
          nd.x += nd.vx; nd.y += nd.vy;
          nd.x = Math.max(40, Math.min(W - 40, nd.x));
          nd.y = Math.max(30, Math.min(H - 30, nd.y));
        }
      }
    }
    return { nodes, edges };
  }, [projects, connections, featuredIds]);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isActive = (id: number) =>
    hovered === null ? true : hovered === id || edges.some((e) => (e.from === hovered && e.to === id) || (e.to === hovered && e.from === id));

  if (nodes.length === 0) {
    return <p className="text-sm text-muted-foreground">No projects to map yet.</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ minWidth: 520 }}>
        <defs>
          <marker id="pg-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="hsl(var(--primary))" opacity="0.6" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const a = byId.get(e.from)!, b = byId.get(e.to)!;
          const active = hovered === null || hovered === e.from || hovered === e.to;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          return (
            <g key={i} opacity={active ? 1 : 0.12} style={{ transition: "opacity .15s" }}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="hsl(var(--primary))" strokeWidth={active && hovered !== null ? 2 : 1.2}
                strokeOpacity={0.5} />
              {hovered !== null && (hovered === e.from || hovered === e.to) && (
                <text x={mx} y={my - 4} textAnchor="middle" fontSize="10" fill="hsl(var(--primary))" className="font-medium">
                  {e.relationship}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const active = isActive(n.id);
          const radius = 9 + Math.min(10, n.degree * 2.5) + (n.featured ? 3 : 0);
          return (
            <g key={n.id}
              opacity={active ? 1 : 0.25}
              style={{ cursor: "pointer", transition: "opacity .15s" }}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => window.open(`/portfolio/${orgId}/p/${n.id}`, "_blank", "noopener")}
            >
              <circle cx={n.x} cy={n.y} r={radius}
                fill={n.featured ? "hsl(var(--primary))" : "hsl(var(--muted))"}
                stroke="hsl(var(--primary))" strokeWidth={n.featured ? 2 : 1} strokeOpacity={n.featured ? 0.9 : 0.4} />
              <text x={n.x} y={n.y + radius + 13} textAnchor="middle" fontSize="11"
                fill="hsl(var(--foreground))" className="font-medium pointer-events-none">
                {n.name.length > 18 ? n.name.slice(0, 17) + "…" : n.name}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-muted-foreground mt-1">Hover to trace connections · click a node to open its page</p>
    </div>
  );
};

export default ProjectGraph;
