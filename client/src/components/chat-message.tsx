import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Bot, User, Sparkles, AlertCircle, Loader2 } from "lucide-react";
import type { PKBChatMessage } from "@shared/schema";
import { ProductTypeSelector } from "./product-type-selector";
import { DocumentUpload } from "./document-upload";
import type { ProductType, PrimaryMode } from "@shared/schema";

interface CrawlProgress {
  current: number;
  total: number;
  currentUrl: string;
}

interface ChatMessageProps {
  message: PKBChatMessage;
  onProductTypeSelect?: (type: ProductType, primaryMode?: PrimaryMode) => void;
  onFilesSelected?: (files: File[]) => Promise<void>;
  onUrlSubmit?: (url: string) => Promise<void>;
  onCrawlWebsite?: (url: string) => Promise<void>;
  isProcessing?: boolean;
  crawlProgress?: CrawlProgress | null;
  className?: string;
}

export function ChatMessage({
  message,
  onProductTypeSelect,
  onFilesSelected,
  onUrlSubmit,
  onCrawlWebsite,
  isProcessing,
  crawlProgress,
  className,
}: ChatMessageProps) {
  const isAssistant = message.role === "assistant" || message.role === "system";
  
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  const renderInteractiveContent = () => {
    switch (message.message_type) {
      case "product_type_question":
      case "primary_mode_question":
        return onProductTypeSelect ? (
          <div className="mt-4">
            <ProductTypeSelector onSelect={onProductTypeSelect} />
          </div>
        ) : null;

      case "upload_prompt":
        return onFilesSelected && onUrlSubmit ? (
          <div className="mt-4">
            <DocumentUpload 
              onFilesSelected={onFilesSelected}
              onUrlSubmit={onUrlSubmit}
              onCrawlWebsite={onCrawlWebsite}
              isProcessing={isProcessing}
              crawlProgress={crawlProgress}
            />
          </div>
        ) : null;

      case "processing_status":
        return (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processing documents...</span>
          </div>
        );

      case "gap_question":
        return (
          <div className="mt-3">
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500/20">
              <AlertCircle className="h-3 w-3 mr-1" />
              Gap identified
            </Badge>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        "flex gap-3 w-full",
        isAssistant ? "justify-start" : "justify-end",
        className
      )}
      data-testid={`chat-message-${message.id}`}
    >
      {isAssistant && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary">
            {message.message_type === "explainer_response" ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "flex flex-col max-w-[85%] sm:max-w-[75%]",
          !isAssistant && "items-end"
        )}
      >
        <Card
          className={cn(
            "px-4 py-3",
            isAssistant 
              ? "bg-card" 
              : "bg-primary text-primary-foreground"
          )}
        >
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="whitespace-pre-wrap m-0 text-sm leading-relaxed">
              {message.content}
            </p>
          </div>
          {renderInteractiveContent()}
        </Card>
        <span className="text-xs text-muted-foreground mt-1 px-1">
          {formatTime(message.timestamp)}
        </span>
      </div>

      {!isAssistant && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-muted">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
