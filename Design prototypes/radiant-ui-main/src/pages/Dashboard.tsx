import { useState, useEffect } from "react";
import { Plus, Zap, ArrowRight, ChevronDown, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import ProductCard from "@/components/ProductCard";
import ParticleBackground from "@/components/ParticleBackground";
import MinimalModeToggle from "@/components/MinimalModeToggle";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import ReviewQueuePanel from "@/components/ReviewQueuePanel";
import AddProductModal from "@/components/AddProductModal";

const products = [
  { id: "1", name: "Notion", segment: "B2B", category: "SaaS", confidence: 0, facts: 0, currentState: "New", lastActive: "6h ago", conflicts: 0 },
  { id: "2", name: "Slack", segment: "B2B", category: "SaaS", confidence: 12, facts: 5, currentState: "Onboarding", lastActive: "2h ago", conflicts: 3 },
  { id: "3", name: "Linear", segment: "B2B", category: "SaaS", confidence: 85, facts: 47, currentState: "Active", lastActive: "1h ago", conflicts: 0 },
  { id: "4", name: "Figma", segment: "B2B", category: "SaaS", confidence: 85, facts: 44, currentState: "Active", lastActive: "58m ago", conflicts: 0 },
  { id: "5", name: "Vercel", segment: "B2B", category: "SaaS", confidence: 92, facts: 61, currentState: "Active", lastActive: "26m ago", conflicts: 0 },
  { id: "6", name: "Stripe", segment: "B2B", category: "Fintech", confidence: 78, facts: 38, currentState: "Active", lastActive: "17m ago", conflicts: 1 },
];

const highCount = products.filter(p => p.confidence >= 70).length;
const lowCount = products.filter(p => p.confidence < 70).length;
const needReview = products.filter(p => p.conflicts > 0).length;
const totalConflicts = products.reduce((s, p) => s + p.conflicts, 0);

const Dashboard = () => {
  const { minimal } = useMinimalMode();
  const [orgName, setOrgName] = useState("Your Organisation");
  const [chatQuery, setChatQuery] = useState("");
  const [orgReviewOpen, setOrgReviewOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);

  const handleResetOnboarding = () => {
    localStorage.removeItem("onboarding_complete");
    localStorage.removeItem("org_name");
    window.location.reload();
  };

  useEffect(() => {
    const stored = localStorage.getItem("org_name");
    if (stored) setOrgName(stored);
  }, []);

  const scrollToProducts = () => {
    document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-[200vh] outer-frame relative">
      {!minimal && <ParticleBackground />}

      {/* Top bar — floating */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
            <Zap className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-heading text-base font-bold tracking-tight text-foreground">
            Orchestral<span className="text-primary">-AI</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleResetOnboarding} className="text-xs text-muted-foreground hover:text-foreground underline">Reset Onboarding</button>
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
          <div className="relative flex items-center rounded-full border border-border bg-secondary/60 backdrop-blur-sm ring-1 ring-border/30">
            <Input
              value={chatQuery}
              onChange={e => setChatQuery(e.target.value)}
              placeholder={`Ask anything about ${orgName}...`}
              className="border-0 bg-transparent rounded-full h-12 pl-5 pr-14 text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <button className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
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
                    {totalConflicts}
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
          <div className="flex items-center gap-2 mb-6 text-xs font-body">
            <span className="text-sm font-body text-muted-foreground">
              {products.length} product{products.length !== 1 ? "s" : ""}
            </span>
            <span className="text-border mx-1">·</span>
            <span className="flex items-center gap-1.5 bg-glow-emerald/10 ring-1 ring-glow-emerald/20 rounded-full px-3 py-1.5 font-bold text-glow-emerald">
              <span className="h-1.5 w-1.5 rounded-full bg-glow-emerald" /> {highCount} <span className="font-medium opacity-80">high</span>
            </span>
            <span className="flex items-center gap-1.5 bg-primary/10 ring-1 ring-primary/20 rounded-full px-3 py-1.5 font-bold text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {needReview} <span className="font-medium opacity-80">review</span>
            </span>
            <span className="flex items-center gap-1.5 bg-secondary/60 ring-1 ring-border/50 rounded-full px-3 py-1.5 font-bold text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> {lowCount} <span className="font-medium opacity-80">low</span>
            </span>
          </div>

          {/* Product grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {products.map((product, i) => (
              <ProductCard key={product.id} {...product} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Org-level Review Queue */}
      <ReviewQueuePanel open={orgReviewOpen} onClose={() => setOrgReviewOpen(false)} orgLevel />
      <AddProductModal open={addProductOpen} onClose={() => setAddProductOpen(false)} />
    </div>
  );
};

export default Dashboard;
