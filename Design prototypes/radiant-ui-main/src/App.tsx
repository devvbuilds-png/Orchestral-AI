import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MinimalModeProvider } from "@/contexts/MinimalModeContext";
import { AnimatePresence } from "framer-motion";
import Welcome from "./pages/Welcome";
import OrgSetup from "./pages/OrgSetup";
import Dashboard from "./pages/Dashboard";
import ProductDetail from "./pages/ProductDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

type OnboardingStep = "welcome" | "org" | "dashboard";

const AppContent = () => {
  const [step, setStep] = useState<OnboardingStep>(() => {
    const completed = localStorage.getItem("onboarding_complete");
    return completed ? "dashboard" : "welcome";
  });

  const handleGetStarted = () => setStep("org");
  const handleOrgComplete = () => {
    localStorage.setItem("onboarding_complete", "true");
    setStep("dashboard");
  };

  return (
    <>
      <Toaster />
      <Sonner />
      <AnimatePresence mode="wait">
        {step === "welcome" && (
          <Welcome key="welcome" onGetStarted={handleGetStarted} />
        )}
        {step === "org" && (
          <OrgSetup key="org" onComplete={handleOrgComplete} />
        )}
      </AnimatePresence>
      {step === "dashboard" && (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      )}
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <MinimalModeProvider>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </MinimalModeProvider>
  </QueryClientProvider>
);

export default App;
