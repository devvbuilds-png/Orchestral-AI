import { useState, useCallback, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SessionSidebar } from "@/components/session-sidebar";
import { ChatInterface } from "@/components/chat-interface";
import { ThemeToggle } from "@/components/theme-toggle";
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
    content: "Great choice! Now I'll help you gather information about your product.\n\nFor the best results, you can upload documents like:\n• Product documentation or specs\n• Pitch decks or presentations\n• Marketing materials\n• Website content (paste a URL)\n• Any text files describing your product\n\nThe more context you provide, the better I can understand your product!",
    type: "upload_prompt",
  },
};

interface CrawlProgress {
  current: number;
  total: number;
  currentUrl: string;
}

export default function Home() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [showStorytellingSummary, setShowStorytellingSummary] = useState(false);
  const [storytellingSummary, setStorytellingSummary] = useState<any>(null);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);

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
    const newSession = createNewSession();
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
  }, []);

  const handleSessionSelect = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    const session = sessions.find(s => s.id === sessionId);
    if (session?.confidence_level === "high") {
      setShowStorytellingSummary(true);
    } else {
      setShowStorytellingSummary(false);
    }
  }, [sessions]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
    }
  }, [currentSessionId]);

  const handleProductTypeSelect = useCallback(async (type: ProductType, primaryMode?: PrimaryMode) => {
    if (!currentSession) return;

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
    
    try {
      for (const file of files) {
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

      await processDocuments();
    } catch (error) {
      toast({
        title: "Upload Error",
        description: error instanceof Error ? error.message : "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [currentSession, updateSession, toast]);

  const handleUrlSubmit = useCallback(async (url: string) => {
    if (!currentSession) return;

    setIsProcessing(true);
    
    try {
      const response = await apiRequest("POST", "/api/sessions/fetch-url", {
        sessionId: currentSession.id,
        url,
      });

      let updated = currentSession;
      updated = addMessageToSession(updated, "user", `Added URL: ${url}`);
      updated = updateSessionState(updated, "processing");
      updateSession(updated);

      await processDocuments();
    } catch (error) {
      toast({
        title: "URL Error",
        description: error instanceof Error ? error.message : "Failed to fetch URL",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [currentSession, updateSession, toast]);

  const handleCrawlWebsite = useCallback(async (url: string) => {
    if (!currentSession) return;

    setIsProcessing(true);
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

      await processDocuments();
    } catch (error) {
      setCrawlProgress(null);
      toast({
        title: "Crawl Error",
        description: error instanceof Error ? error.message : "Failed to crawl website",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setCrawlProgress(null);
    }
  }, [currentSession, updateSession, toast]);

  const processDocuments = useCallback(async () => {
    if (!currentSession) return;

    setIsProcessing(true);
    setIsStreaming(true);
    setStreamingMessage("");

    try {
      const response = await fetch("/api/sessions/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSession.id }),
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
              let updated = updateSessionConfidence(
                currentSession,
                event.level,
                event.score
              );
              updateSession(updated);
            } else if (event.type === "product_name") {
              let updated = updateSessionName(currentSession, event.name);
              updateSession(updated);
            } else if (event.type === "summary") {
              setStorytellingSummary(event.data);
            } else if (event.type === "done") {
              setIsStreaming(false);
              let updated = addMessageToSession(
                currentSession,
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
              
              updateSession(updated);
            }
          } catch (e) {
            // Ignore JSON parse errors
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
    } finally {
      setIsProcessing(false);
      setStreamingMessage("");
    }
  }, [currentSession, updateSession, toast]);

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
              updated = addMessageToSession(updated, "assistant", fullMessage, messageType);
              updateSession(updated);
            }
          } catch (e) {
            // Ignore JSON parse errors
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
  }, [currentSession, updateSession, toast]);

  const handleModeChange = useCallback((mode: ChatMode) => {
    if (!currentSession) return;
    const updated = updateSessionChatMode(currentSession, mode);
    updateSession(updated);
  }, [currentSession, updateSession]);

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
            />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
