import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ModeToggle } from "./mode-toggle";
import { ConfidenceBar } from "./confidence-bar";
import { StorytellingSummary } from "./storytelling-summary";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, RefreshCw, Info } from "lucide-react";
import type { Session, PKBChatMessage, ProductType, PrimaryMode, ChatMode } from "@shared/schema";

interface CrawlProgress {
  current: number;
  total: number;
  currentUrl: string;
}

interface ChatInterfaceProps {
  session: Session | null;
  onSendMessage: (message: string) => void;
  onProductTypeSelect: (type: ProductType, primaryMode?: PrimaryMode) => void;
  onFilesSelected: (files: File[]) => Promise<void>;
  onUrlSubmit: (url: string) => Promise<void>;
  onCrawlWebsite?: (url: string) => Promise<void>;
  onModeChange: (mode: ChatMode, override?: boolean) => void;
  onRecheckGaps?: () => void;
  isProcessing?: boolean;
  isStreaming?: boolean;
  streamingMessage?: string;
  crawlProgress?: CrawlProgress | null;
  showStorytellingSummary?: boolean;
  storytellingSummary?: {
    simple_summary?: string;
    who_its_for?: string;
    why_it_wins?: string;
    key_message_pillars?: string[];
    sample_pitch?: string;
  };
  confidenceReasons?: string[];
  confidenceImprovements?: string[];
  overrideEnabled?: boolean;
  onOverrideChange?: (enabled: boolean) => void;
  className?: string;
}

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

export function ChatInterface({
  session,
  onSendMessage,
  onProductTypeSelect,
  onFilesSelected,
  onUrlSubmit,
  onCrawlWebsite,
  onModeChange,
  onRecheckGaps,
  isProcessing = false,
  isStreaming = false,
  streamingMessage = "",
  crawlProgress,
  showStorytellingSummary = false,
  storytellingSummary,
  confidenceReasons = [],
  confidenceImprovements = [],
  overrideEnabled = false,
  onOverrideChange,
  className,
}: ChatInterfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showExplainerWelcome, setShowExplainerWelcome] = useState(false);
  const [lastMode, setLastMode] = useState<ChatMode>(session?.chat_mode || "learner");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [session?.messages, streamingMessage]);

  useEffect(() => {
    if (session?.chat_mode === "explainer" && lastMode === "learner") {
      setShowExplainerWelcome(true);
    } else if (session?.chat_mode === "learner") {
      setShowExplainerWelcome(false);
    }
    setLastMode(session?.chat_mode || "learner");
  }, [session?.chat_mode, lastMode]);

  if (!session) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center text-muted-foreground">
          <p>Select a session or create a new one to get started</p>
        </div>
      </div>
    );
  }

  const messages = session.messages || [];
  const explainerEnabled = session.confidence_level === "high";
  const isInputDisabled = isProcessing || isStreaming || 
    session.state === "product_type_selection" || 
    session.state === "document_upload";

  const getPlaceholder = () => {
    if (session.chat_mode === "explainer") {
      return "Ask me anything about the product...";
    }
    if (session.state === "gap_interview") {
      return "Answer the questions above, or type your response...";
    }
    return "Type your message...";
  };

  const handleModeChange = (mode: ChatMode) => {
    onModeChange(mode, overrideEnabled);
  };

  return (
    <div className={cn("flex flex-col h-full", className)} data-testid="chat-interface">
      {session.confidence_level && session.state !== "product_type_selection" && (
        <ConfidenceBar
          level={session.confidence_level}
          score={session.confidence_score || 0}
          reasons={confidenceReasons}
          improvements={confidenceImprovements}
        />
      )}

      <div className="flex items-center justify-between gap-4 p-4 border-b flex-wrap">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-semibold text-lg">
              {session.product_name || "New Product Analysis"}
            </h1>
            {session.product_type && (
              <p className="text-sm text-muted-foreground">
                {session.product_type.toUpperCase()}
                {session.primary_mode && ` (${session.primary_mode.toUpperCase()} primary)`}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle
            mode={session.chat_mode}
            onModeChange={handleModeChange}
            explainerEnabled={explainerEnabled}
            overrideEnabled={overrideEnabled}
            onOverrideChange={onOverrideChange}
            confidenceLevel={session.confidence_level}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-4">
          {showStorytellingSummary && storytellingSummary && session.confidence_level === "high" && (
            <StorytellingSummary
              summary={storytellingSummary}
              productName={session.product_name}
              confidenceLevel={session.confidence_level}
              className="mb-6"
            />
          )}

          {session.chat_mode === "explainer" && showExplainerWelcome && (
            <Card className="p-4 bg-primary/5 border-primary/20 mb-4" data-testid="explainer-welcome">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="prose prose-sm dark:prose-invert">
                  <div className="whitespace-pre-wrap text-sm">
                    {EXPLAINER_WELCOME}
                  </div>
                </div>
              </div>
              {overrideEnabled && !explainerEnabled && (
                <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-sm text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>
                    Note: You're using explainer mode with partial knowledge. Some questions may not have complete answers.
                  </span>
                </div>
              )}
            </Card>
          )}

          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onProductTypeSelect={onProductTypeSelect}
              onFilesSelected={onFilesSelected}
              onUrlSubmit={onUrlSubmit}
              onCrawlWebsite={onCrawlWebsite}
              isProcessing={isProcessing}
              crawlProgress={crawlProgress}
            />
          ))}

          {isStreaming && streamingMessage && (
            <ChatMessage
              message={{
                id: "streaming",
                role: "assistant",
                content: streamingMessage,
                timestamp: new Date().toISOString(),
              }}
            />
          )}

          {isProcessing && !isStreaming && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Processing...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {session.state === "gap_interview" && onRecheckGaps && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={onRecheckGaps}
                disabled={isProcessing}
                data-testid="button-recheck-gaps"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Recheck Gaps
              </Button>
            </div>
          )}
          <ChatInput
            onSend={onSendMessage}
            disabled={isInputDisabled}
            placeholder={getPlaceholder()}
          />
        </div>
      </div>
    </div>
  );
}
