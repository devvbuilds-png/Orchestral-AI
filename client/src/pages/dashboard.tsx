import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Zap, ArrowRight, ChevronDown, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import ProductCard from "@/components/ProductCard";
import ParticleBackground from "@/components/particle-background";
import MinimalModeToggle from "@/components/MinimalModeToggle";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import ReviewQueuePanel from "@/components/review-inbox";
import AddProductModal from "@/components/AddProductModal";
import { apiRequest } from "@/lib/queryClient";
import type { Product, Organisation } from "@shared/schema";


function scrollToProducts() {
  document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth" });
}

const Dashboard = () => {
  const { minimal } = useMinimalMode();
  const queryClient = useQueryClient();
  const [chatQuery, setChatQuery] = useState("");
  const [chatResponse, setChatResponse] = useState("");
  const [ciMode, setCiMode] = useState<"guide" | "knowledge">("guide");
  const [orgReviewOpen, setOrgReviewOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);

  const { data: orgData } = useQuery<{ organisation: Organisation | null }>({
    queryKey: ["/api/organisations"],
    queryFn: async () => {
      const res = await fetch("/api/organisations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load org");
      return res.json();
    },
    staleTime: 30_000,
  });

  const org = orgData?.organisation ?? null;
  const orgName = org?.name ?? "Your Organisation";
  const orgId = org?.id ?? null;

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", orgId],
    queryFn: async () => {
      const url = orgId ? `/api/products?orgId=${orgId}` : `/api/products`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      return Array.isArray(data) ? data : data.products ?? [];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const { data: inboxData } = useQuery<{ conflicts: any[] }>({
    queryKey: ["/api/organisations", orgId, "inbox"],
    queryFn: async () => {
      const res = await fetch(`/api/organisations/${orgId}/inbox`, { credentials: "include" });
      if (!res.ok) return { conflicts: [] };
      return res.json();
    },
    enabled: !!orgId,
    refetchInterval: 60_000,
  });

  const pendingConflicts = inboxData?.conflicts ?? [];

  const chatMutation = useMutation({
    mutationFn: async (query: string) => {
      const surface = ciMode === "guide" ? "app_guide" : "dashboard_chat";
      const res = await apiRequest("POST", `/api/organisations/${orgId}/chat`, { message: query, surface });
      return res.json() as Promise<{ response: string }>;
    },
    onSuccess: (data) => {
      setChatResponse(data.response ?? "");
    },
  });

  const handleChatSubmit = () => {
    if (!chatQuery.trim() || !orgId || chatMutation.isPending) return;
    chatMutation.mutate(chatQuery.trim());
    setChatQuery("");
  };

  // Stats
  const highCount = products.filter(p => (p.confidence_score ?? 0) >= 70).length;
  const needReview = products.filter(p => p.state === "founder_review").length;
  const lowCount = products.filter(p => (p.confidence_score ?? 0) < 40).length;
  const totalConflicts = pendingConflicts.length;

  return (
    <div className="min-h-[200vh] outer-frame relative">
      {!minimal && <ParticleBackground />}

      {/* Top bar — floating */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 pointer-events-none">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
            <Zap className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-heading text-base font-bold tracking-tight text-foreground">
            Orchestral<span className="text-primary">-AI</span>
          </span>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <MinimalModeToggle />
        </div>
      </div>

      {/* ─── Hero Section ─── */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
        <motion.span
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-xs font-bold uppercase tracking-[0.25em] text-primary mb-6"
        >
          Central Intelligence
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="font-heading text-5xl md:text-7xl font-bold tracking-tight text-foreground text-center"
        >
          {orgName}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="font-body text-sm md:text-base text-muted-foreground mt-4 text-center"
        >
          Your organisation's knowledge, unified.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="mt-10 w-full max-w-xl"
        >
          {/* CI mode toggle */}
          <div className="flex justify-center mb-3">
            <TooltipProvider delayDuration={300}>
              <div className="flex rounded-full ring-1 ring-border/50 bg-secondary/60 p-0.5 gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setCiMode("guide"); setChatResponse(""); setChatQuery(""); }}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        ciMode === "guide"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Guide
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Ask how to use Orchestral-AI — navigation, features, getting started</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setCiMode("knowledge"); setChatResponse(""); setChatQuery(""); }}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        ciMode === "knowledge"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Knowledge
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Ask questions about your products using your captured knowledge base</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>

          <div className="relative flex items-center rounded-full border border-border bg-secondary/60 backdrop-blur-sm ring-1 ring-border/30">
            <Input
              value={chatQuery}
              onChange={e => setChatQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleChatSubmit()}
              placeholder={ciMode === "guide" ? "Ask me how to use Orchestral-AI..." : "Ask anything across your products..."}
              className="border-0 bg-transparent rounded-full h-12 pl-5 pr-14 text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <button
              onClick={handleChatSubmit}
              disabled={!chatQuery.trim() || chatMutation.isPending}
              className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          {chatResponse && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl bg-secondary/60 ring-1 ring-border/50 px-5 py-4 text-sm text-foreground leading-relaxed"
            >
              {chatResponse}
            </motion.div>
          )}
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          onClick={scrollToProducts}
          className="absolute bottom-10 flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <span className="text-[10px] font-medium uppercase tracking-[0.2em]">Scroll</span>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </motion.button>
      </section>

      {/* ─── Products Section ─── */}
      <section id="products-section" className="relative z-10 w-full px-6 pb-16">
        {/* Sticky sub-header */}
        <div className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border">
          <div className="max-w-6xl mx-auto flex items-center justify-between py-4 px-2">
            <span className="font-heading text-base font-bold text-foreground tracking-tight">{orgName}</span>
            <div className="flex items-center gap-3">
              {/* Org-level bell icon */}
              <button
                onClick={() => setOrgReviewOpen(true)}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/60 ring-1 ring-border/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Bell className="h-4 w-4" />
                {totalConflicts > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                    {totalConflicts > 9 ? "9+" : totalConflicts}
                  </span>
                )}
              </button>
              <Button
                onClick={() => setAddProductOpen(true)}
                className="gap-1.5 bg-primary hover:bg-primary/90 rounded-xl font-semibold text-sm h-9 px-4"
              >
                <Plus className="h-3.5 w-3.5" />
                Add product
              </Button>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        </div>

        {/* Content area */}
        <div className="max-w-6xl mx-auto pt-8 px-2">
          {/* Stats row */}
          {products.length > 0 && (
            <div className="flex items-center gap-2 mb-6 text-xs font-body">
              <span className="text-sm font-body text-muted-foreground">
                {products.length} product{products.length !== 1 ? "s" : ""}
              </span>
              <span className="text-border mx-1">·</span>
              {highCount > 0 && (
                <span className="flex items-center gap-1.5 bg-glow-emerald/10 ring-1 ring-glow-emerald/20 rounded-full px-3 py-1.5 font-bold text-glow-emerald">
                  <span className="h-1.5 w-1.5 rounded-full bg-glow-emerald" /> {highCount} <span className="font-medium opacity-80">high</span>
                </span>
              )}
              {needReview > 0 && (
                <span className="flex items-center gap-1.5 bg-primary/10 ring-1 ring-primary/20 rounded-full px-3 py-1.5 font-bold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {needReview} <span className="font-medium opacity-80">review</span>
                </span>
              )}
              {lowCount > 0 && (
                <span className="flex items-center gap-1.5 bg-secondary/60 ring-1 ring-border/50 rounded-full px-3 py-1.5 font-bold text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> {lowCount} <span className="font-medium opacity-80">low</span>
                </span>
              )}
            </div>
          )}

          {/* Product grid */}
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary mb-4">
                <Zap className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-heading text-base font-semibold text-foreground mb-2">No products yet</p>
              <p className="text-muted-foreground text-sm mb-8">Add your first product to get started.</p>
              <Button onClick={() => setAddProductOpen(true)} className="gap-2 bg-primary hover:bg-primary/90 rounded-xl">
                <Plus className="h-4 w-4" />
                Add your first product
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {products.map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Org-level Review Queue */}
      <ReviewQueuePanel
        open={orgReviewOpen}
        onClose={() => setOrgReviewOpen(false)}
        orgLevel
        orgId={orgId}
      />
      <AddProductModal
        open={addProductOpen}
        onClose={() => setAddProductOpen(false)}
        orgId={orgId}
      />
    </div>
  );
};

export default Dashboard;
