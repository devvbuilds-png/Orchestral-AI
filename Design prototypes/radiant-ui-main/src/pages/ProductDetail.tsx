import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Bell, Plus, CheckCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import ChatTab from "@/components/tabs/ChatTab";
import KnowledgeTab from "@/components/tabs/KnowledgeTab";
import ParticleBackground from "@/components/ParticleBackground";
import PersonasTab from "@/components/tabs/PersonasTab";
import DocumentsTab from "@/components/tabs/DocumentsTab";
import MinimalModeToggle from "@/components/MinimalModeToggle";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import ReviewQueuePanel from "@/components/ReviewQueuePanel";

import ProcessingOverlay from "@/components/ProcessingOverlay";

const tabs = ["Chat", "Knowledge", "Personas", "Documents"] as const;
type Tab = typeof tabs[number];

const products: Record<string, { name: string; confidence: number; currentState: string; conflicts: number }> = {
  "1": { name: "Notion", confidence: 0, currentState: "New", conflicts: 0 },
  "2": { name: "Slack", confidence: 12, currentState: "Onboarding", conflicts: 3 },
  "3": { name: "Linear", confidence: 85, currentState: "Active", conflicts: 0 },
  "4": { name: "Figma", confidence: 85, currentState: "Active", conflicts: 0 },
  "5": { name: "Vercel", confidence: 92, currentState: "Active", conflicts: 0 },
  "6": { name: "Stripe", confidence: 78, currentState: "Active", conflicts: 1 },
};

const ProductDetail = () => {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState<Tab>("Chat");
  const product = products[id || "1"] || { name: "Unknown", confidence: 0, currentState: "New", conflicts: 0 };
  const isHigh = product.confidence >= 70;
  const { minimal } = useMinimalMode();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);

  const reviewCount = product.conflicts + 2; // mock: conflicts + sensitive items

  return (
    <div className="min-h-screen outer-frame flex flex-col items-center">
      {!minimal && <ParticleBackground />}
      {/* Branding */}
      <div className="flex items-center gap-3 pt-6 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
          <Zap className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="font-heading text-lg font-bold tracking-tight text-foreground">
          Orchestral<span className="text-primary">-AI</span>
        </span>
        <MinimalModeToggle />
      </div>

      {/* Inner Panel */}
      <div className="w-full max-w-5xl px-6 pb-8 flex-1 flex flex-col">
        <div className="inner-panel rounded-2xl flex-1 flex flex-col relative">
          {/* Processing Overlay */}
          <ProcessingOverlay visible={showProcessing} onComplete={() => setShowProcessing(false)} />

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <span className="text-sm font-bold text-foreground font-display">{product.name}</span>
            </div>

            <div className="flex items-center gap-2.5">
              <div className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold ring-1 ${
                isHigh
                  ? "bg-secondary text-secondary-foreground ring-border"
                  : "bg-primary/10 text-primary ring-primary/20"
              }`}>
                <CheckCircle className="h-3.5 w-3.5" />
                <span>{isHigh ? "High" : "Low"} Confidence</span>
                <div className="h-1.5 w-16 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isHigh ? "progress-bar-neutral" : "progress-bar-fill"}`}
                    style={{ width: `${product.confidence}%` }}
                  />
                </div>
                <span className="font-bold">{product.confidence}%</span>
              </div>

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
              <Button className="gap-1.5 bg-primary hover:bg-primary/90 rounded-xl font-semibold text-xs h-8 px-3">
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

          {/* Tab content */}
          <div className="flex-1 px-6 py-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === "Chat" && <ChatTab />}
                {activeTab === "Knowledge" && <KnowledgeTab productName={product.name} confidence={product.confidence} />}
                {activeTab === "Personas" && <PersonasTab />}
                {activeTab === "Documents" && <DocumentsTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Review Queue Panel */}
      <ReviewQueuePanel open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </div>
  );
};

export default ProductDetail;
