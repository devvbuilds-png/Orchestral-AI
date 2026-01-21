import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ModeToggle } from "./mode-toggle";
import { ConfidenceDisplay } from "./confidence-display";
import { StorytellingSummary } from "./storytelling-summary";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
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
  onModeChange: (mode: ChatMode) => void;
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
  className?: string;
}

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
  className,
}: ChatInterfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [session?.messages, streamingMessage]);

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

  return (
    <div className={cn("flex flex-col h-full", className)} data-testid="chat-interface">
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
          {session.confidence_level && (
            <ConfidenceDisplay 
              level={session.confidence_level} 
              score={session.confidence_score}
              size="sm"
            />
          )}
          <ModeToggle
            mode={session.chat_mode}
            onModeChange={onModeChange}
            explainerEnabled={explainerEnabled}
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
