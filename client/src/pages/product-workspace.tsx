import { useState, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Bell, Plus, CheckCircle, LogOut, User } from "lucide-react";
import KaizenMark from "@/components/KaizenMark";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import ChatTab from "@/components/tabs/ChatTab";
import KnowledgeTab from "@/components/tabs/KnowledgeTab";
import PersonasTab from "@/components/tabs/PersonasTab";
import DocumentsTab from "@/components/tabs/DocumentsTab";
import ParticleBackground from "@/components/particle-background";
import MinimalModeToggle from "@/components/MinimalModeToggle";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import ReviewQueuePanel from "@/components/review-inbox";
import { ProcessingOverlay } from "@/components/processing-overlay";
import { GapFillDialog } from "@/components/gap-fill-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import type { Product, PKB, Gap } from "@shared/schema";

const tabs = ["Chat", "Knowledge", "Personas", "Documents"] as const;
type Tab = typeof tabs[number];

export type ProcessingState = {
  isProcessing: boolean;
  progress: number;
  statusMessage: string;
  completedAt: Date | null;
  gapsFound: number;
  error: string | null;
};

const INITIAL_PROCESSING: ProcessingState = {
  isProcessing: false,
  progress: 0,
  statusMessage: "",
  completedAt: null,
  gapsFound: 0,
  error: null,
};

const ProductWorkspace = () => {
  const { productId } = useParams<{ productId: string }>();
  const { minimal } = useMinimalMode();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("Chat");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [newChatTrigger, setNewChatTrigger] = useState(0);

  // Processing pipeline state
  const [processingState, setProcessingState] = useState<ProcessingState>(INITIAL_PROCESSING);

  // Lifted gap dialog state (was in KnowledgeTab)
  const [gapDialogOpen, setGapDialogOpen] = useState(false);
  const [selectedGap, setSelectedGap] = useState<{
    key: string; q: string; why: string; severity: string;
  } | null>(null);

  const productIdNum = productId ? parseInt(productId) : null;

  const { data: authData } = useQuery<{ user: { id: string; email: string | null; display_name: string | null } } | null>({
    queryKey: ["/api/auth/me"],
    staleTime: 5 * 60 * 1000,
  });
  const currentUserName = authData?.user?.display_name;
  const currentUserEmail = authData?.user?.email;

  const { data: productsData } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await fetch("/api/products", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      return Array.isArray(data) ? data : data.products ?? [];
    },
    staleTime: 30_000,
  });

  const product = productsData?.find(p => p.id === productIdNum) ?? null;

  const { data: pkbData } = useQuery<{ pkb: PKB }>({
    queryKey: [`/api/products/${productId}`],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load PKB");
      return res.json();
    },
    enabled: !!productId,
    staleTime: 30_000,
  });

  const pkb = pkbData?.pkb ?? null;

  const { data: inboxData } = useQuery<any[]>({
    queryKey: [`/api/products/${productId}/inbox`],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/inbox`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.items ?? [];
    },
    enabled: !!productId,
    refetchInterval: 60_000,
  });

  const reviewCount = inboxData?.length ?? 0;
  const confidence = product?.confidence_score ?? 0;
  const confidenceTier = confidence >= 70 ? "high" as const : confidence >= 40 ? "medium" as const : "low" as const;
  const productName = product?.name ?? "Product";
  const kbHealthNarrative: string = pkb?.meta.kb_health_narrative ?? "";


  // Run the /process SSE pipeline
  const runProcess = useCallback(async () => {
    if (!productId) return;

    setProcessingState({
      isProcessing: true,
      progress: 5,
      statusMessage: "Starting pipeline...",
      completedAt: null,
      gapsFound: 0,
      error: null,
    });

    try {
      const res = await fetch(`/api/products/${productId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!res.ok || !res.body) throw new Error("Processing request failed");

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
            const event = JSON.parse(line.slice(6));

            if (event.type === "status") {
              const msg: string = event.data ?? "";
              const progress =
                msg.includes("Extracting information") ? 20
                : msg.includes("Synthesizing") ? 50
                : msg.includes("Identifying") ? 70
                : msg.includes("personas") ? 85
                : 30;
              setProcessingState(s => ({ ...s, statusMessage: msg, progress }));
            } else if (event.type === "confidence") {
              setProcessingState(s => ({ ...s, progress: 90 }));
            } else if (event.type === "done") {
              setProcessingState(s => ({
                ...s,
                isProcessing: false,
                progress: 100,
                completedAt: new Date(),
              }));
              // Refetch PKB, product list, conversations, and messages so the
              // server-created ingestion_complete message appears in chat
              queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}`] });
              queryClient.invalidateQueries({ queryKey: ["/api/products"] });
              // Invalidate all conversation and message queries for this product
              queryClient.invalidateQueries({
                predicate: (query) => {
                  const key = query.queryKey[0];
                  return typeof key === "string" && key.startsWith(`/api/products/${productId}/conversations`);
                },
              });
            } else if (event.type === "error") {
              setProcessingState(s => ({
                ...s,
                isProcessing: false,
                error: event.error ?? "Processing failed",
              }));
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }
    } catch (err) {
      setProcessingState(s => ({
        ...s,
        isProcessing: false,
        error: err instanceof Error ? err.message : "Processing failed",
      }));
    }
  }, [productId, queryClient]);

  // Gap dialog handlers (lifted from KnowledgeTab)
  const openGapFill = useCallback((gap?: Gap) => {
    if (gap) {
      setSelectedGap({
        key: gap.field_path,
        q: gap.question ?? gap.field_path,
        why: gap.why_needed ?? "",
        severity: gap.severity === "critical" ? "Critical" : "Important",
      });
    } else {
      // No specific gap — open to first critical, then first available
      const gaps = pkb?.gaps?.current ?? [];
      const first = gaps.find(g => g.severity === "critical") ?? gaps[0] ?? null;
      setSelectedGap(first ? {
        key: first.field_path,
        q: first.question ?? first.field_path,
        why: first.why_needed ?? "",
        severity: first.severity === "critical" ? "Critical" : "Important",
      } : null);
    }
    setGapDialogOpen(true);
  }, [pkb]);

  const closeGapFill = useCallback(() => {
    setGapDialogOpen(false);
    setSelectedGap(null);
  }, []);

  const handleNewChat = () => {
    setActiveTab("Chat");
    setNewChatTrigger(t => t + 1);
  };

  return (
    <div className="h-screen outer-frame flex flex-col items-center overflow-hidden">
      {!minimal && <ParticleBackground />}

      {/* Branding */}
      <div className="flex items-center gap-3 pt-6 pb-4 w-full max-w-5xl px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
          <KaizenMark className="h-4 w-4" />
        </div>
        <span className="font-heading text-lg font-bold tracking-tight text-foreground">
          Kaizen
        </span>
        <MinimalModeToggle />
        <div className="ml-auto">
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

      {/* Inner Panel */}
      <div className="w-full max-w-5xl px-6 pb-8 flex-1 flex flex-col min-h-0">
        <div className="inner-panel rounded-2xl flex-1 flex flex-col relative min-h-0">
          {/* Processing Overlay — controlled by SSE state */}
          <ProcessingOverlay visible={processingState.isProcessing} />

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <span className="text-sm font-bold text-foreground font-heading">{productName}</span>
            </div>

            <div className="flex items-center gap-2.5">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold ring-1 ${
                      confidenceTier === "high"
                        ? "bg-glow-emerald/10 text-glow-emerald ring-glow-emerald/20"
                        : confidenceTier === "medium"
                          ? "bg-glow-amber/10 text-glow-amber ring-glow-amber/20"
                          : "bg-destructive/10 text-destructive ring-destructive/20"
                    }`}>
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>{confidenceTier === "high" ? "High" : confidenceTier === "medium" ? "Medium" : "Low"} Confidence</span>
                      <div className="h-1.5 w-16 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            confidenceTier === "high" ? "bg-glow-emerald"
                            : confidenceTier === "medium" ? "bg-glow-amber"
                            : "bg-destructive"
                          }`}
                          style={{ width: `${confidence}%` }}
                        />
                      </div>
                      <span className="font-bold">{confidence}%</span>
                    </div>
                  </TooltipTrigger>
                  {kbHealthNarrative && (
                    <TooltipContent className="max-w-xs text-xs">{kbHealthNarrative}</TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>

              <button
                onClick={() => setReviewOpen(true)}
                className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              >
                <Bell className="h-4 w-4" />
                {reviewCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                    {reviewCount}
                  </span>
                )}
              </button>
              <Button
                onClick={handleNewChat}
                className="gap-1.5 bg-primary hover:bg-primary/90 rounded-xl font-semibold text-xs h-8 px-3"
              >
                <Plus className="h-3.5 w-3.5" />
                New Chat
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-border">
            <div className="px-6">
              <nav className="flex gap-0.5">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`relative px-4 py-3 text-xs font-semibold transition-colors font-body ${
                      activeTab === tab
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab}
                    {activeTab === tab && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-primary"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Tab content — Chat uses overflow-hidden so its message list scrolls internally;
               other tabs use overflow-y-auto so their long content scrolls as a page. */}
          <div className={`flex-1 min-h-0 flex flex-col px-6 py-6 ${activeTab === "Chat" ? "overflow-hidden" : "overflow-y-auto"}`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className={activeTab === "Chat" ? "flex-1 flex flex-col min-h-0" : undefined}
              >
                {activeTab === "Chat" && product && (
                  <ChatTab
                    product={product}
                    pkb={pkb}
                    processingState={processingState}
                    openGapFill={openGapFill}
                    onProcess={runProcess}
                    newChatTrigger={newChatTrigger}
                  />
                )}
                {activeTab === "Knowledge" && product && (
                  <KnowledgeTab
                    product={product}
                    pkb={pkb}
                    gapDialogOpen={gapDialogOpen}
                    selectedGap={selectedGap}
                    openGapFill={openGapFill}
                    closeGapFill={closeGapFill}
                  />
                )}
                {activeTab === "Personas" && (
                  <PersonasTab pkb={pkb} />
                )}
                {activeTab === "Documents" && productIdNum !== null && (
                  <DocumentsTab
                    pkb={pkb}
                    productId={productIdNum}
                    onProcess={runProcess}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Gap Fill Dialog — lifted from KnowledgeTab, shared by all tabs */}
      <GapFillDialog
        open={gapDialogOpen}
        onClose={closeGapFill}
        productId={productIdNum}
        gap={selectedGap}
        pkb={pkb}
      />

      {/* Review Queue Panel */}
      <ReviewQueuePanel
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        productId={productIdNum}
      />
    </div>
  );
};

export default ProductWorkspace;
