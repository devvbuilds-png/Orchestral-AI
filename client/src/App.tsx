import { useEffect, useState, Component, ReactNode } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MinimalModeProvider } from "@/contexts/MinimalModeContext";
import { AnimatePresence } from "framer-motion";
import Welcome from "@/pages/Welcome";
import OrgSetup from "@/pages/OrgSetup";
import Dashboard from "@/pages/dashboard";
import ProductWorkspace from "@/pages/product-workspace";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";
import type { Organisation } from "@shared/schema";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", fontFamily: "monospace", background: "#0a0a0a", color: "#f00", minHeight: "100vh" }}>
          <h2>Runtime Error</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem", color: "#aaa" }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

type OnboardingStep = "welcome" | "setup";

interface AuthUser {
  id: string;
  email: string | null;
  display_name: string | null;
}

function AppContent() {
  const [step, setStep] = useState<OnboardingStep | null>(null);

  // Auth check — runs before anything else
  const { data: authData, isLoading: authLoading } = useQuery<{ user: AuthUser } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Auth check failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  });

  const { data, isLoading: orgLoading } = useQuery<{ organisation: Organisation | null }>({
    queryKey: ["/api/organisations"],
    queryFn: async () => {
      const res = await fetch("/api/organisations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load org");
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!authData?.user,  // only fetch once authenticated
  });

  // Once we know there's no org, start the welcome flow
  useEffect(() => {
    if (!orgLoading && data?.organisation === null && step === null) {
      setStep("welcome");
    }
  }, [orgLoading, data, step]);

  if (authLoading) {
    return (
      <div className="fixed inset-0 outer-frame flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Not authenticated — show login page
  if (!authData?.user) {
    return <Login />;
  }

  if (orgLoading) {
    return (
      <div className="fixed inset-0 outer-frame flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const hasOrg = !!data?.organisation;

  // Onboarding flow — only shown when no org exists
  if (!hasOrg && step !== null) {
    return (
      <>
        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <Welcome key="welcome" onGetStarted={() => setStep("setup")} />
          )}
          {step === "setup" && (
            <OrgSetup key="setup" onComplete={() => setStep(null)} />
          )}
        </AnimatePresence>
      </>
    );
  }

  // Main app router
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/products/:productId" component={ProductWorkspace} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MinimalModeProvider>
          <TooltipProvider>
            <Toaster />
            <AppContent />
          </TooltipProvider>
        </MinimalModeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
