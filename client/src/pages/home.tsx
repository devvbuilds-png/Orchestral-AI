import { useState, useCallback, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SessionSidebar } from "@/components/session-sidebar";
import { ChatInterface } from "@/components/chat-interface";
import { ThemeToggle } from "@/components/theme-toggle";
import { SessionNamingDialog } from "@/components/session-naming-dialog";
import { ProcessingOverlay } from "@/components/processing-overlay";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  loadSessions,
  saveSessions,
  createNewSession,
  addMessageToSession,
  updateSessionState,
  updateSessionProductType,
  updateSessionChatMode,
  updateSessionConfidence,
  updateSessionName,
  generateMessageId,
} from "@/lib/session-store";
import type { Session, ProductType, PrimaryMode, ChatMode, PKBChatMessage } from "@shared/schema";

const INITIAL_MESSAGES: Record<string, { content: string; type: PKBChatMessage["message_type"] }> = {
  product_type_selection: {
    content: "Welcome to the Product Knowledge Builder! I'm here to help you build a comprehensive understanding of your product.\n\nLet's start by understanding what type of product you're building. This helps me ask the right questions and gather the most relevant information.",
    type: "product_type_question",
  },
  onboarding: {
    content: "Great choice! Now I'll help you gather information about your product.\n\nFor the best results, you can upload documents like:\n\n- Product documentation or specs\n- Pitch decks or presentations\n- Marketing materials\n- Website content (paste a URL)\n- Any text files describing your product\n\nThe more context you provide, the better I can understand your product!",
    type: "upload_prompt",
  },
};

interface CrawlProgress {
  current: number;
  total: number;
  currentUrl: string;
}

type ProcessingPhase = "uploading" | "fetching" | "analyzing" | "synthesizing" | "idle";

export default function Home() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>("idle");
  const [processingDetails, setProcessingDetails] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [showStorytellingSummary, setShowStorytellingSummary] = useState(false);
  const [storytellingSummary, setStorytellingSummary] = useState<any>(null);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const [showNamingDialog, setShowNamingDialog] = useState(false);
  const [namingMode, setNamingMode] = useState<"create" | "rename">("create");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [confidenceReasons, setConfidenceReasons] = useState<string[]>([]);
  const [confidenceImprovements, setConfidenceImprovements] = useState<string[]>([]);

  useEffect(() => {
    const stored = loadSessions();
    setSessions(stored.sessions);
    if (stored.currentSessionId && stored.sessions.find(s => s.id === stored.currentSessionId)) {
      setCurrentSessionId(stored.currentSessionId);
    }
  }, []);

  useEffect(() => {
    saveSessions({ sessions, currentSessionId });
  }, [sessions, currentSessionId]);

  const currentSession = sessions.find(s => s.id === currentSessionId) || null;

  const updateSession = useCallback((updatedSession: Session) => {
    setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
  }, []);

  const handleNewSession = useCallback(() => {
    setNamingMode("create");
    setRenamingSessionId(null);
    setShowNamingDialog(true);
  }, []);

  const handleRenameSession = useCallback((sessionId: string) => {
    setNamingMode("rename");
    setRenamingSessionId(sessionId);
    setShowNamingDialog(true);
  }, []);

  const handleSessionNameConfirmed = useCallback((productName: string) => {
    setShowNamingDialog(false);
    
    if (namingMode === "rename" && renamingSessionId) {
      setSessions(prev => prev.map(s => 
        s.id === renamingSessionId 
          ? updateSessionName(s, productName)
          : s
      ));
      setRenamingSessionId(null);
    } else {
      const newSession = createNewSession(productName);
      const sessionWithMessage = addMessageToSession(
        newSession,
        "assistant",
        INITIAL_MESSAGES.product_type_selection.content,
        INITIAL_MESSAGES.product_type_selection.type
      );
      setSessions(prev => [sessionWithMessage, ...prev]);
      setCurrentSessionId(sessionWithMessage.id);
      setShowStorytellingSummary(false);
      setStorytellingSummary(null);
      setOverrideEnabled(false);
    }
  }, [namingMode, renamingSessionId]);

  const handleNamingCancel = useCallback(() => {
    setShowNamingDialog(false);
    setRenamingSessionId(null);
  }, []);

  const handleSessionSelect = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    const session = sessions.find(s => s.id === sessionId);
    if (session?.confidence_level === "high") {
      setShowStorytellingSummary(true);
    } else {
      setShowStorytellingSummary(false);
    }
    setOverrideEnabled(false);
  }, [sessions]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
    }
  }, [currentSessionId]);

  const handleProductTypeSelect = useCallback(async (type: ProductType, primaryMode?: PrimaryMode) => {
    if (!currentSession) return;

    try {
      await apiRequest("POST", "/api/sessions/set-product-type", {
        sessionId: currentSession.id,
        productType: type,
        primaryMode,
      });
    } catch (error) {
      console.error("Failed to initialize PKB:", error);
    }

    let updated = updateSessionProductType(currentSession, type, primaryMode);
    
    const userMessage = primaryMode 
      ? `I'm building a ${type.toUpperCase()} product with ${primaryMode.toUpperCase()} as the primary focus.`
      : `I'm building a ${type.toUpperCase()} product.`;
    
    updated = addMessageToSession(updated, "user", userMessage);
    updated = updateSessionState(updated, "onboarding");
    updated = addMessageToSession(
      updated,
      "assistant",
      INITIAL_MESSAGES.onboarding.content,
      INITIAL_MESSAGES.onboarding.type
    );
    
    updateSession(updated);
  }, [currentSession, updateSession]);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (!currentSession || files.length === 0) return;

    setIsProcessing(true);
    setProcessingPhase("uploading");
    
    try {
      for (const file of files) {
        setProcessingDetails(file.name);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sessionId", currentSession.id);

        const response = await fetch("/api/sessions/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const result = await response.json();
        
        let updated = currentSession;
        updated = addMessageToSession(
          updated,
          "user",
          `Uploaded: ${file.name}`
        );
        updated = updateSessionState(updated, "processing");
        updateSession(updated);
      }

      setProcessingPhase("analyzing");
      setProcessingDetails("");
      await processDocuments(currentSession.id);
    } catch (error) {
      toast({
        title: "Upload Error",
        description: error instanceof Error ? error.message : "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProcessingPhase("idle");
      setProcessingDetails("");
    }
  }, [currentSession, updateSession, toast]);

  const handleUrlSubmit = useCallback(async (url: string) => {
    if (!currentSession) return;

    setIsProcessing(true);
    setProcessingPhase("fetching");
    setProcessingDetails(url);
    
    try {
      const response = await apiRequest("POST", "/api/sessions/fetch-url", {
        sessionId: currentSession.id,
        url,
      });

      let updated = currentSession;
      updated = addMessageToSession(updated, "user", `Added URL: ${url}`);
      updated = updateSessionState(updated, "processing");
      updateSession(updated);

      setProcessingPhase("analyzing");
      setProcessingDetails("");
      await processDocuments(currentSession.id);
    } catch (error) {
      toast({
        title: "URL Error",
        description: error instanceof Error ? error.message : "Failed to fetch URL",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProcessingPhase("idle");
      setProcessingDetails("");
    }
  }, [currentSession, updateSession, toast]);

  const handleCrawlWebsite = useCallback(async (url: string) => {
    if (!currentSession) return;

    setIsProcessing(true);
    setProcessingPhase("fetching");
    setCrawlProgress({ current: 0, total: 1, currentUrl: url });
    
    try {
      let updated = addMessageToSession(currentSession, "user", `Crawling website: ${url}`);
      updateSession(updated);

      const response = await fetch("/api/sessions/crawl-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          sessionId: currentSession.id, 
          url,
          maxPages: 30,
          maxDepth: 3
        }),
      });

      if (!response.ok) throw new Error("Crawl failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let totalPages = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === "progress") {
              setCrawlProgress({
                current: data.current,
                total: data.total,
                currentUrl: data.currentUrl,
              });
              setProcessingDetails(`Page ${data.current}/${data.total}`);
            } else if (data.type === "complete") {
              totalPages = data.totalPages;
            } else if (data.type === "done") {
              break;
            }
          } catch (e) {
            console.error("Failed to parse SSE data:", e);
          }
        }
      }

      setCrawlProgress(null);
      
      updated = addMessageToSession(
        currentSession,
        "assistant",
        `Successfully crawled ${totalPages} pages from the website. Processing the content now...`
      );
      updated = updateSessionState(updated, "processing");
      updateSession(updated);

      setProcessingPhase("analyzing");
      setProcessingDetails("");
      await processDocuments(currentSession.id);
    } catch (error) {
      setCrawlProgress(null);
      toast({
        title: "Crawl Error",
        description: error instanceof Error ? error.message : "Failed to crawl website",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProcessingPhase("idle");
      setCrawlProgress(null);
      setProcessingDetails("");
    }
  }, [currentSession, updateSession, toast]);

  const processDocuments = useCallback(async (sessionId?: string) => {
    const targetSessionId = sessionId || currentSession?.id;
    if (!targetSessionId) return;

    setIsProcessing(true);
    setProcessingPhase("synthesizing");
    setIsStreaming(true);
    setStreamingMessage("");

    try {
      const response = await fetch("/api/sessions/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: targetSessionId }),
      });

      if (!response.ok) throw new Error("Processing failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullMessage = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          
          try {
            const event = JSON.parse(line.slice(6));
            
            if (event.type === "content") {
              fullMessage += event.data;
              setStreamingMessage(fullMessage);
            } else if (event.type === "confidence") {
              setSessions(prev => prev.map(s => {
                if (s.id === targetSessionId) {
                  return {
                    ...s,
                    confidence_level: event.level,
                    confidence_score: event.score,
                  };
                }
                return s;
              }));
              if (event.reasons) {
                setConfidenceReasons(event.reasons);
              }
              if (event.improvements) {
                setConfidenceImprovements(event.improvements);
              }
            } else if (event.type === "product_name") {
              setSessions(prev => prev.map(s => {
                if (s.id === targetSessionId) {
                  return { ...s, product_name: event.name };
                }
                return s;
              }));
            } else if (event.type === "summary") {
              setStorytellingSummary(event.data);
            } else if (event.type === "done") {
              setIsStreaming(false);
              setProcessingPhase("idle");
              
              setSessions(prev => prev.map(s => {
                if (s.id === targetSessionId) {
                  let updated = addMessageToSession(
                    s,
                    "assistant",
                    fullMessage,
                    "synthesis_summary"
                  );
                  
                  if (event.has_gaps) {
                    updated = updateSessionState(updated, "gap_interview");
                  } else {
                    updated = updateSessionState(updated, "ready");
                    setShowStorytellingSummary(true);
                  }
                  
                  return updated;
                }
                return s;
              }));
            }
          } catch (e) {
          }
        }
      }
    } catch (error) {
      toast({
        title: "Processing Error",
        description: error instanceof Error ? error.message : "Failed to process documents",
        variant: "destructive",
      });
      setIsStreaming(false);
      setProcessingPhase("idle");
    } finally {
      setIsProcessing(false);
      setStreamingMessage("");
    }
  }, [currentSession, toast]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!currentSession) return;

    let updated = addMessageToSession(currentSession, "user", content);
    updateSession(updated);

    setIsStreaming(true);
    setStreamingMessage("");

    try {
      const endpoint = currentSession.chat_mode === "explainer" 
        ? "/api/sessions/explain"
        : "/api/sessions/chat";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSession.id,
          message: content,
          mode: currentSession.chat_mode,
          overrideEnabled,
        }),
      });

      if (!response.ok) throw new Error("Chat failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullMessage = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          
          try {
            const event = JSON.parse(line.slice(6));
            
            if (event.type === "content") {
              fullMessage += event.data;
              setStreamingMessage(fullMessage);
            } else if (event.type === "done") {
              setIsStreaming(false);
              const messageType = currentSession.chat_mode === "explainer" 
                ? "explainer_response" 
                : "text";
              
              setSessions(prev => prev.map(s => {
                if (s.id === currentSession.id) {
                  return addMessageToSession(s, "assistant", fullMessage, messageType);
                }
                return s;
              }));
            }
          } catch (e) {
          }
        }
      }
    } catch (error) {
      toast({
        title: "Chat Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
      setIsStreaming(false);
    } finally {
      setStreamingMessage("");
    }
  }, [currentSession, updateSession, toast, overrideEnabled]);

  const EXPLAINER_WELCOME = `Welcome to Explainer Mode! I'm ready to answer any questions about your product.

**What I can help with:**
- Explaining your product to different audiences
- Crafting elevator pitches and talking points
- Answering specific questions about features, pricing, or use cases
- Generating content based on your product knowledge

**How to use me:**
- Ask questions like "Explain our product to a first-time user"
- Request "What's our main value proposition?"
- Try "Create a 30-second pitch for investors"

Just type your question below and I'll provide detailed answers based on the knowledge I've learned about your product.`;

  const handleModeChange = useCallback((mode: ChatMode, override?: boolean) => {
    if (!currentSession) return;
    
    let updated = updateSessionChatMode(currentSession, mode);
    
    if (mode === "explainer") {
      updated = addMessageToSession(
        updated,
        "assistant",
        overrideEnabled 
          ? `**Note:** You're using Explainer mode with partial knowledge. Some answers may be incomplete or require clarification.\n\n${EXPLAINER_WELCOME}`
          : EXPLAINER_WELCOME,
        "explainer_welcome"
      );
    }
    
    updateSession(updated);
  }, [currentSession, updateSession, overrideEnabled]);

  const handleOverrideChange = useCallback((enabled: boolean) => {
    setOverrideEnabled(enabled);
  }, []);

  const handleRecheckGaps = useCallback(async () => {
    if (!currentSession) return;
    await processDocuments();
  }, [currentSession, processDocuments]);

  useEffect(() => {
    if (sessions.length === 0) {
      handleNewSession();
    }
  }, []);

  const sidebarStyle = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <SessionSidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSessionSelect={handleSessionSelect}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
        />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-hidden">
            <ChatInterface
              session={currentSession}
              onSendMessage={handleSendMessage}
              onProductTypeSelect={handleProductTypeSelect}
              onFilesSelected={handleFilesSelected}
              onUrlSubmit={handleUrlSubmit}
              onCrawlWebsite={handleCrawlWebsite}
              onModeChange={handleModeChange}
              onRecheckGaps={handleRecheckGaps}
              isProcessing={isProcessing}
              isStreaming={isStreaming}
              streamingMessage={streamingMessage}
              crawlProgress={crawlProgress}
              showStorytellingSummary={showStorytellingSummary}
              storytellingSummary={storytellingSummary}
              confidenceReasons={confidenceReasons}
              confidenceImprovements={confidenceImprovements}
              overrideEnabled={overrideEnabled}
              onOverrideChange={handleOverrideChange}
            />
          </main>
        </div>
      </div>

      <SessionNamingDialog
        open={showNamingDialog}
        onConfirm={handleSessionNameConfirmed}
        onCancel={handleNamingCancel}
        mode={namingMode}
        initialName={renamingSessionId ? sessions.find(s => s.id === renamingSessionId)?.product_name || "" : ""}
      />

      {processingPhase !== "idle" && (
        <ProcessingOverlay
          phase={processingPhase}
          details={processingDetails}
        />
      )}
    </SidebarProvider>
  );
}
