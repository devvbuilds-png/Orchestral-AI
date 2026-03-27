import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Check, XCircle, AlertTriangle, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import { apiRequest } from "@/lib/queryClient";

interface ReviewItem {
  id: string;
  type: "conflict" | "sensitive" | "stale";
  title: string;
  description: string;
  product?: string;
  field_path?: string;
}

const typeConfig = {
  conflict: { label: "Conflicts", icon: AlertTriangle, color: "text-glow-pink", bg: "bg-glow-pink/10", ring: "ring-glow-pink/20", dot: "bg-glow-pink" },
  sensitive: { label: "Sensitive Pending", icon: Shield, color: "text-glow-amber", bg: "bg-glow-amber/10", ring: "ring-glow-amber/20", dot: "bg-glow-amber" },
  stale: { label: "Stale", icon: Clock, color: "text-glow-blue", bg: "bg-glow-blue/10", ring: "ring-glow-blue/20", dot: "bg-glow-blue" },
};

interface Props {
  open: boolean;
  onClose: () => void;
  orgLevel?: boolean;
  orgId?: number | null;
  productId?: number | null;
}

function mapInboxItems(raw: any[]): ReviewItem[] {
  return raw.map((item: any) => ({
    id: item.id ?? item.item_id ?? String(Math.random()),
    type: item.type === "conflict" ? "conflict" : item.sensitive ? "sensitive" : "stale",
    title: item.title ?? item.field_path ?? "Review item",
    description: item.description ?? item.message ?? "",
    product: item.product_name ?? item.product,
    field_path: item.field_path,
  }));
}

export const ReviewQueuePanel = ({ open, onClose, orgLevel = false, orgId, productId }: Props) => {
  const { minimal } = useMinimalMode();
  const queryClient = useQueryClient();

  const endpoint = orgLevel
    ? `/api/organisations/${orgId}/inbox`
    : `/api/products/${productId}/inbox`;

  const { data: rawItems = [] } = useQuery<any[]>({
    queryKey: [endpoint],
    queryFn: async () => {
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.items ?? [];
    },
    enabled: open && !!(orgLevel ? orgId : productId),
  });

  const items = mapInboxItems(rawItems);

  const resolveMutation = useMutation({
    mutationFn: async ({ itemId, resolution }: { itemId: string; resolution: "resolved" | "dismissed" }) => {
      const base = orgLevel
        ? `/api/organisations/${orgId}/inbox/${itemId}/resolve`
        : `/api/products/${productId}/inbox/${itemId}/resolve`;
      await apiRequest("POST", base, { resolution });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [endpoint] });
    },
  });

  const approve = (id: string) => resolveMutation.mutate({ itemId: id, resolution: "resolved" });
  const dismiss = (id: string) => resolveMutation.mutate({ itemId: id, resolution: "dismissed" });

  const grouped = {
    conflict: items.filter((i) => i.type === "conflict"),
    sensitive: items.filter((i) => i.type === "sensitive"),
    stale: items.filter((i) => i.type === "stale"),
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-foreground font-heading">
                  {orgLevel ? "Org Review Queue" : "Review Queue"}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{items.length} items pending</p>
              </div>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {(["conflict", "sensitive", "stale"] as const).map((type) => {
                const group = grouped[type];
                if (group.length === 0) return null;
                const cfg = typeConfig[type];
                const Icon = cfg.icon;
                return (
                  <div key={type}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`h-2 w-2 rounded-full ${minimal ? "bg-muted-foreground" : cfg.dot}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${minimal ? "text-foreground" : cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground bg-secondary rounded-md px-2 py-0.5">{group.length}</span>
                    </div>
                    <div className="space-y-2">
                      {group.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 50 }}
                          className="rounded-xl bg-secondary/40 ring-1 ring-border/50 p-4 border-l-[3px] border-l-border"
                        >
                          <div className="flex items-start justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <Icon className={`h-3.5 w-3.5 ${minimal ? "text-muted-foreground" : cfg.color}`} />
                              <span className="text-sm font-bold text-foreground">{item.title}</span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{item.description}</p>
                          {orgLevel && item.product && (
                            <span className="text-[10px] font-bold text-muted-foreground bg-secondary rounded px-2 py-0.5 inline-block mb-2">
                              {item.product}
                            </span>
                          )}
                          <div className="flex items-center gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={() => approve(item.id)}
                              className="h-7 px-3 text-[11px] font-bold rounded-lg bg-glow-emerald/15 text-glow-emerald hover:bg-glow-emerald/25 border-0"
                            >
                              <Check className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => dismiss(item.id)}
                              className="h-7 px-3 text-[11px] font-bold rounded-lg text-muted-foreground hover:text-foreground"
                            >
                              <XCircle className="h-3 w-3 mr-1" /> Dismiss
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary mb-4">
                    <Check className="h-6 w-6 text-glow-emerald" />
                  </div>
                  <p className="text-sm font-bold text-foreground mb-1">All clear!</p>
                  <p className="text-xs text-muted-foreground">No pending review items.</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export const ReviewInbox = ReviewQueuePanel;
export default ReviewQueuePanel;
