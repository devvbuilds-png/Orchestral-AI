import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Zap, ArrowRight, ChevronDown, Bell, LogOut, User } from "lucide-react";
import KaizenMark from "@/components/KaizenMark";
import ReactMarkdown from "react-markdown";
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
import DashboardTutorial, { type DashboardTutorialStep } from "@/components/dashboard-tutorial";
import OrgSetup from "@/pages/OrgSetup";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import type { Product, Organisation } from "@shared/schema";


function scrollToProducts() {
  document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth" });
}

function animateWindowScroll(targetY: number, durationMs: number) {
  const startY = window.scrollY;
  const delta = targetY - startY;

  if (Math.abs(delta) < 4) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const startTime = window.performance.now();

    const tick = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      window.scrollTo({ top: startY + delta * eased, behavior: "auto" });

      if (progress < 1) {
        window.requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };

    window.requestAnimationFrame(tick);
  });
}

function resetDashboardScrollToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

const Dashboard = () => {
  const { minimal } = useMinimalMode();
  const [chatQuery, setChatQuery] = useState("");
  const [chatResponse, setChatResponse] = useState("");
  const [ciMode, setCiMode] = useState<"guide" | "knowledge">("guide");
  const [orgReviewOpen, setOrgReviewOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [editOrgOpen, setEditOrgOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialReady, setTutorialReady] = useState(false);
  const autoScrollPlayedRef = useRef(false);
  const ciModuleRef = useRef<HTMLDivElement | null>(null);
  const ciToggleRef = useRef<HTMLDivElement | null>(null);
  const chatBarRef = useRef<HTMLDivElement | null>(null);
  const productsSectionRef = useRef<HTMLElement | null>(null);
  const addProductButtonRef = useRef<HTMLButtonElement | null>(null);
  const themeToggleRef = useRef<HTMLDivElement | null>(null);

  const { data: authData } = useQuery<{ user: { id: string; email: string | null; display_name: string | null } } | null>({
    queryKey: ["/api/auth/me"],
    staleTime: 5 * 60 * 1000,
  });
  const currentUserId = authData?.user?.id;
  const currentUserName = authData?.user?.display_name;
  const currentUserEmail = authData?.user?.email;

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

  const tutorialStorageKey = orgId ? `kaizen.dashboardTutorialSeen.org_${orgId}` : null;
  const isTutorialSeen = tutorialStorageKey
    ? typeof window !== "undefined" && window.localStorage.getItem(tutorialStorageKey) === "true"
    : false;

  useEffect(() => {
    setTutorialReady(!!isTutorialSeen);
    setTutorialOpen(false);
  }, [orgId, isTutorialSeen]);

  useEffect(() => {
    if (!orgId || typeof window === "undefined") return;
    if (isTutorialSeen) return;

    const timeoutId = window.setTimeout(() => {
      resetDashboardScrollToTop();
      setTutorialReady(true);
      setTutorialOpen(true);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [orgId, isTutorialSeen]);

  const markTutorialSeen = () => {
    if (typeof window === "undefined" || !tutorialStorageKey) return;
    window.localStorage.setItem(tutorialStorageKey, "true");
    setTutorialReady(true);
  };

  const handleCloseTutorial = () => {
    markTutorialSeen();
    setTutorialOpen(false);
  };

  const handleCompleteTutorial = () => {
    markTutorialSeen();
    setTutorialOpen(false);
  };

  const tutorialSteps: DashboardTutorialStep[] = [
    {
      id: "central-intelligence",
      title: "This is your organisation home",
      body: "Central Intelligence is the dashboard-level surface for understanding how Kaizen works and for asking questions across your organisation.",
      target: ciModuleRef.current,
      highlightMode: "viewport",
      scrollAlign: "start",
    },
    {
      id: "guide-vs-knowledge",
      title: "Guide and Knowledge do different jobs",
      body: "Use Guide to learn how to navigate and use the app. Use Knowledge when you want answers about your organisation or products.",
      target: ciToggleRef.current,
    },
    {
      id: "chat-bar",
      title: "Ask from here",
      body: "This chat bar is the fastest way to get oriented. In Guide mode it teaches the app. In Knowledge mode it answers from your captured knowledge base.",
      target: chatBarRef.current,
    },
    {
      id: "products-below",
      title: "The dashboard continues below the hero",
      body: "Your products live below this top section. Scroll down to manage the portfolio and move into individual product workspaces.",
      target: productsSectionRef.current,
      scrollAlign: "start",
    },
    {
      id: "add-product",
      title: "Add products here",
      body: "Use Add product to create a workspace for a product. Each product gets its own chat, knowledge, personas, and documents area.",
      target: addProductButtonRef.current,
    },
    {
      id: "theme-toggle",
      title: "Switch themes",
      body: "Cycle between Dark, Light, and Minimal modes. Minimal strips away decorative elements for a clean, content-focused view.",
      target: themeToggleRef.current,
      scrollAlign: "start",
    },
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (minimal) return;
    if (!tutorialReady) return;
    if (tutorialOpen) return;
    if (!isTutorialSeen) return;
    if (autoScrollPlayedRef.current) return;
    if (window.scrollY > 24) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const hasPlayedInSession = window.sessionStorage.getItem("dashboard-scroll-hint-played");
    if (hasPlayedInSession) return;

    autoScrollPlayedRef.current = true;
    let cancelled = false;

    const cancelAnimation = () => {
      cancelled = true;
    };

    const timeoutId = window.setTimeout(async () => {
      if (cancelled) return;

      const productsSection = document.getElementById("products-section");
      if (!productsSection) return;

      const sectionTop = productsSection.getBoundingClientRect().top + window.scrollY;
      const peekTarget = Math.max(0, sectionTop - Math.max(window.innerHeight * 0.32, 220));

      if (peekTarget <= 32) return;

      try {
        await animateWindowScroll(peekTarget, 1100);
        if (cancelled) return;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 450));
        if (cancelled) return;
        await animateWindowScroll(0, 1200);
        if (!cancelled) {
          window.sessionStorage.setItem("dashboard-scroll-hint-played", "true");
        }
      } catch {
        // Ignore interrupted hint animation.
      }
    }, 1300);

    window.addEventListener("wheel", cancelAnimation, { passive: true });
    window.addEventListener("touchstart", cancelAnimation, { passive: true });
    window.addEventListener("keydown", cancelAnimation);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("wheel", cancelAnimation);
      window.removeEventListener("touchstart", cancelAnimation);
      window.removeEventListener("keydown", cancelAnimation);
    };
  }, [minimal, tutorialOpen, isTutorialSeen]);

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
            <KaizenMark className="h-4 w-4" />
          </div>
          <span className="font-heading text-base font-bold tracking-tight text-foreground">
            Kaizen
          </span>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              resetDashboardScrollToTop();
              setTutorialOpen(true);
            }}
            className="flex h-9 items-center rounded-xl bg-secondary/80 ring-1 ring-border/60 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-primary transition-all hover:ring-border hover:bg-secondary"
          >
            Tutorial
          </button>
          <div ref={themeToggleRef}>
            <MinimalModeToggle />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/80 ring-1 ring-border/60 text-muted-foreground transition-all hover:ring-border hover:bg-secondary hover:text-foreground"
              >
                <User className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  {currentUserName && <p className="text-sm font-medium">{currentUserName}</p>}
                  {currentUserEmail && <p className="text-xs text-muted-foreground">{currentUserEmail}</p>}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  window.location.href = "/auth/logout";
                }}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          ref={ciModuleRef}
        >
          {/* CI mode toggle */}
          <div className="flex justify-center mb-3" ref={ciToggleRef}>
            <TooltipProvider delayDuration={300} skipDelayDuration={0}>
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
                  <TooltipContent>Ask how to use Kaizen — navigation, features, getting started</TooltipContent>
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

          <div
            className="relative flex items-center rounded-full border border-border bg-secondary/60 backdrop-blur-sm ring-1 ring-border/30"
            ref={chatBarRef}
          >
            <Input
              value={chatQuery}
              onChange={e => setChatQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleChatSubmit()}
              placeholder={ciMode === "guide" ? "Ask me how to use Kaizen..." : "Ask anything across your products..."}
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
          {chatMutation.isPending && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl bg-secondary/60 ring-1 ring-border/50 px-5 py-4 flex items-center gap-3"
            >
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-muted-foreground">Thinking…</span>
            </motion.div>
          )}
          {chatResponse && !chatMutation.isPending && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl bg-secondary/60 ring-1 ring-border/50 px-5 py-4 text-sm text-foreground leading-relaxed prose prose-sm prose-invert max-w-none"
            >
              <ReactMarkdown>{chatResponse}</ReactMarkdown>
            </motion.div>
          )}
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          onClick={scrollToProducts}
          className="absolute bottom-8 flex flex-col items-center gap-2 cursor-pointer transition-transform hover:-translate-y-0.5"
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
            Scroll
          </span>
          <ChevronDown className="h-5 w-5 animate-bounce text-primary" />
        </motion.button>
      </section>

      {/* ─── Products Section ─── */}
      <section id="products-section" ref={productsSectionRef} className="relative z-10 w-full px-6 pb-16">
        {/* Sticky sub-header */}
        <div className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border">
          <div className="max-w-6xl mx-auto flex items-center justify-between py-4 px-2">
            <span className="font-heading text-base font-bold text-foreground tracking-tight">{orgName}</span>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setEditOrgOpen(true)}
                className="rounded-xl font-semibold text-sm h-9 px-4 border-border bg-secondary/60 hover:bg-secondary"
              >
                Edit organisation
              </Button>
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
                ref={addProductButtonRef}
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
                <ProductCard key={product.id} product={product} index={i} currentUserId={currentUserId} />
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
      {editOrgOpen && org && (
        <OrgSetup
          mode="edit"
          initialOrganisation={org}
          onCancel={() => setEditOrgOpen(false)}
          onComplete={() => setEditOrgOpen(false)}
        />
      )}
      <DashboardTutorial
        open={tutorialOpen}
        steps={tutorialSteps}
        onClose={handleCloseTutorial}
        onComplete={handleCompleteTutorial}
      />
    </div>
  );
};

export default Dashboard;
