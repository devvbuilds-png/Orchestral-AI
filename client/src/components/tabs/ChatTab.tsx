import { useState, useRef, useEffect } from "react";
import { Send, Link2, BookOpen, Sparkles, FileUp, ExternalLink, MessageSquare, Plus, Clock, Paperclip, Bot, User, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Product, PKB, Gap } from "@shared/schema";
import type { ProcessingState } from "@/pages/product-workspace";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "ingestion_complete";
  gapsFound?: number;
  created_at?: string;
}

interface Conversation {
  id: number;
  title: string | null;
  mode: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  product: Product;
  pkb: PKB | null;
  processingState: ProcessingState;
  openGapFill: (gap?: Gap) => void;
  onProcess: () => void;
  pendingIngestionMessage: { gapsFound: number; id: string } | null;
  onIngestionMessageShown: () => void;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

function parseSuggestedQuestions(content: string): { text: string; questions: string[] } {
  const match = content.match(/<suggested_questions>([\s\S]*?)<\/suggested_questions>/);
  if (!match) return { text: content, questions: [] };
  const text = content.replace(/<suggested_questions>[\s\S]*?<\/suggested_questions>/, "").trim();
  const questions = match[1].split("\n").map((q: string) => q.trim()).filter(Boolean);
  return { text, questions };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const ChatTab = ({
  product,
  pkb,
  processingState,
  openGapFill,
  onProcess,
  pendingIngestionMessage,
  onIngestionMessageShown,
}: Props) => {
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [mode, setMode] = useState<"learner" | "explainer">("learner");
  const [message, setMessage] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const { minimal } = useMinimalMode();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: [`/api/products/${product.id}/conversations`],
    queryFn: async () => {
      const res = await fetch(`/api/products/${product.id}/conversations`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.conversations ?? [];
    },
  });

  const { data: convMessages = [] } = useQuery<Message[]>({
    queryKey: [`/api/products/${product.id}/conversations/${selectedConvId}/messages`],
    queryFn: async () => {
      const res = await fetch(`/api/products/${product.id}/conversations/${selectedConvId}/messages`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.messages ?? [];
    },
    enabled: !!selectedConvId,
  });

  useEffect(() => {
    if (selectedConvId && convMessages.length > 0) {
      setLocalMessages(convMessages);
    }
  }, [selectedConvId, convMessages]);

  // Inject ingestion_complete message when processing finishes and a conversation is active
  useEffect(() => {
    if (!pendingIngestionMessage || !selectedConvId) return;
    const { gapsFound, id } = pendingIngestionMessage;

    const msg: Message = {
      id: `ingestion_${id}`,
      role: "assistant",
      type: "ingestion_complete",
      gapsFound,
      content: gapsFound > 0
        ? `I've processed your content and captured what I could find — check the Knowledge tab to see it. I identified ${gapsFound} gaps that would improve answer quality.`
        : "I've processed your content — the knowledge base is looking good. Check the Knowledge tab to see what was captured.",
      created_at: new Date().toISOString(),
    };

    setLocalMessages(prev => [...prev, msg]);
    onIngestionMessageShown();
  }, [pendingIngestionMessage, selectedConvId]);

  // Read an SSE stream from the chat endpoint and return the assembled text response.
  const readSSEResponse = async (convId: number, message: string): Promise<string> => {
    const endpoint = mode === "learner"
      ? `/api/products/${product.id}/conversations/${convId}/chat`
      : `/api/products/${product.id}/conversations/${convId}/explain`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      credentials: "include",
    });
    if (!res.ok || !res.body) return "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "content") content += evt.data ?? "";
        } catch { /* skip malformed line */ }
      }
    }
    return content.trim();
  };

  const newConvMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/products/${product.id}/conversations`, { mode });
      const data = await res.json() as { conversation: Conversation };
      return data.conversation;
    },
    onSuccess: async (conv) => {
      queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}/conversations`] });
      setSelectedConvId(conv.id);
      setLocalMessages([]);
      // Trigger opening greeting for Learner mode
      if (mode === "learner") {
        const content = await readSSEResponse(conv.id, "[SESSION_START]");
        if (content) {
          setLocalMessages([{
            id: `session_start_${conv.id}`,
            role: "assistant",
            content,
            created_at: new Date().toISOString(),
          }]);
          // Greeting is now in DB — prime the messages cache so reopening this conv loads it
          queryClient.invalidateQueries({
            queryKey: [`/api/products/${product.id}/conversations/${conv.id}/messages`],
          });
        }
      }
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!selectedConvId) throw new Error("No conversation");
      // Use SSE reader — same as newConvMutation — to correctly capture streaming reply
      return readSSEResponse(selectedConvId, text);
    },
    onSuccess: (content) => {
      if (content) {
        setLocalMessages((prev) => [...prev, {
          id: String(Date.now() + 1),
          role: "assistant" as const,
          content,
          created_at: new Date().toISOString(),
        }]);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}/conversations`] });
      // Sync DB messages — server has already saved both turns before sending 'done'
      queryClient.invalidateQueries({
        queryKey: [`/api/products/${product.id}/conversations/${selectedConvId}/messages`],
      });
    },
  });

  const sendTextMessage = (text: string) => {
    if (!selectedConvId) return;
    const userMsg: Message = {
      id: String(Date.now()),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    sendMutation.mutate(text);
  };

  const handleSend = async () => {
    const text = message.trim();
    if (!text) return;

    // URL detected — ingest it instead of sending to LLM
    if (URL_PATTERN.test(text)) {
      setMessage("");
      try {
        await fetch(`/api/products/${product.id}/fetch-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: text }),
          credentials: "include",
        });
      } catch (e) {
        console.error("URL fetch failed:", e);
      }
      onProcess();
      return;
    }

    if (!selectedConvId) return;
    setMessage("");
    sendTextMessage(text);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const currentConv = conversations.find((c) => c.id === selectedConvId);
  const showMessages = selectedConvId && localMessages.length > 0;

  return (
    <div className="flex gap-6 min-h-[calc(100vh-12rem)]">
      {/* Sidebar */}
      <div className="w-56 shrink-0 flex flex-col">
        <button
          onClick={() => newConvMutation.mutate()}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 ring-1 ring-primary/20 px-3 py-2.5 text-sm font-bold text-primary hover:bg-primary/15 hover:ring-primary/40 transition-all group"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/20 group-hover:bg-primary/30 transition-all">
            <Plus className="h-3.5 w-3.5" />
          </div>
          New Chat
        </button>

        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2">Recent</div>

        <div className="space-y-1 flex-1">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConvId(conv.id)}
              className={`w-full rounded-xl px-3 py-2.5 text-left transition-all duration-200 flex items-start gap-2.5 group ${
                selectedConvId === conv.id
                  ? "bg-secondary ring-1 ring-border/60"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-semibold truncate ${selectedConvId === conv.id ? "text-foreground" : ""}`}>
                  {conv.title ?? "New chat"}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
                  <span className="text-[10px] text-muted-foreground">{timeAgo(conv.updated_at)}</span>
                </div>
              </div>
              {selectedConvId === conv.id && (
                <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-secondary/30 ring-1 ring-border/30 p-3">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-bold text-muted-foreground">{conversations.length} conversation{conversations.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-3/5 rounded-full bg-primary/40" />
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-extrabold text-foreground">
            {currentConv?.title ?? (selectedConvId ? "Chat" : "New Product Analysis")}
          </h2>

          {!minimal && (
            <div className="flex items-center gap-0.5 rounded-xl bg-secondary/60 p-0.5 ring-1 ring-border/50">
              <button
                onClick={() => setMode("learner")}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-300 ${
                  mode === "learner"
                    ? "bg-glow-cyan/15 text-glow-cyan ring-1 ring-glow-cyan/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <BookOpen className="h-3 w-3" />
                Learner
                {mode === "learner" && <span className="flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-glow-cyan opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-glow-cyan" /></span>}
              </button>
              <button
                onClick={() => setMode("explainer")}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-300 ${
                  mode === "explainer"
                    ? "bg-glow-amber/15 text-glow-amber ring-1 ring-glow-amber/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                Explainer
                {mode === "explainer" && <span className="flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-glow-amber opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-glow-amber" /></span>}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col justify-end">
          {showMessages ? (
            <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-2">
              {localMessages.map((msg, i) => {
                // Special render for ingestion_complete system messages
                if (msg.type === "ingestion_complete") {
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="flex gap-3"
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-xl shrink-0 ${
                        minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-emerald/10 ring-1 ring-glow-emerald/20"
                      }`}>
                        <CheckCircle className={`h-3.5 w-3.5 ${minimal ? "text-muted-foreground" : "text-glow-emerald"}`} />
                      </div>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                        minimal ? "bg-secondary/60 ring-1 ring-border/50" : "bg-glow-emerald/5 ring-1 ring-glow-emerald/20"
                      }`}>
                        <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
                        {(msg.gapsFound ?? 0) > 0 && (
                          <button
                            onClick={() => openGapFill()}
                            className={`mt-3 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                              minimal
                                ? "bg-secondary text-foreground hover:bg-secondary/80 ring-1 ring-border"
                                : "bg-primary text-primary-foreground hover:bg-primary/90"
                            }`}
                          >
                            Fill gaps →
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                }

                // Normal message render
                const parsed = msg.role === "assistant"
                  ? parseSuggestedQuestions(msg.content)
                  : { text: msg.content, questions: [] };
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.3) }}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl shrink-0 ${
                      msg.role === "user"
                        ? "bg-primary/15 ring-1 ring-primary/30"
                        : minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-purple/10 ring-1 ring-glow-purple/20"
                    }`}>
                      {msg.role === "user" ? (
                        <User className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Bot className={`h-3.5 w-3.5 ${minimal ? "text-muted-foreground" : "text-glow-purple"}`} />
                      )}
                    </div>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-primary/10 ring-1 ring-primary/20"
                        : "bg-secondary/60 ring-1 ring-border/50"
                    }`}>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{parsed.text}</p>
                      {parsed.questions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {parsed.questions.map((q, qi) => (
                            <button
                              key={qi}
                              onClick={() => sendTextMessage(q)}
                              className="surface-card rounded-full px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-secondary/80 transition-colors"
                              title={q.length > 60 ? q : undefined}
                            >
                              {q.length > 60 ? q.slice(0, 57) + "…" : q}
                            </button>
                          ))}
                        </div>
                      )}
                      {msg.created_at && (
                        <span className="text-[10px] text-muted-foreground mt-2 block">{timeAgo(msg.created_at)}</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
              {sendMutation.isPending && (
                <div className="flex gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl shrink-0 ${minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-purple/10 ring-1 ring-glow-purple/20"}`}>
                    <Bot className={`h-3.5 w-3.5 ${minimal ? "text-muted-foreground" : "text-glow-purple"}`} />
                  </div>
                  <div className="rounded-2xl px-4 py-3 bg-secondary/60 ring-1 ring-border/50">
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-6 text-center">
                {selectedConvId ? "Start the conversation." : "The more context you provide, the better I can understand your product."}
              </p>

              {!selectedConvId && (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {/* Upload Card */}
                  <div className={`group relative rounded-2xl bg-secondary/40 ring-1 ring-border/50 p-6 text-center cursor-pointer transition-all duration-300 ${
                    !minimal && "hover:ring-glow-purple/40 hover:bg-glow-purple/5"
                  }`}>
                    {!minimal && <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-glow-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />}
                    <div className="relative">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl mx-auto mb-3 transition-all ${
                        minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-purple/10 ring-1 ring-glow-purple/20 group-hover:ring-glow-purple/40"
                      }`}>
                        <FileUp className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-purple"}`} />
                      </div>
                      <p className="text-sm font-bold text-foreground mb-1">{minimal ? "Upload Files" : "📄 Upload Files"}</p>
                      <p className="text-xs text-muted-foreground mb-3">PDF, DOCX, TXT, MD</p>
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {["PDF", "DOCX", "TXT"].map((fmt) => (
                          <span key={fmt} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${
                            minimal ? "bg-secondary text-muted-foreground ring-border" : "bg-glow-purple/10 text-glow-purple ring-glow-purple/20"
                          }`}>{fmt}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* URL Card */}
                  <div className={`group relative rounded-2xl bg-secondary/40 ring-1 ring-border/50 p-6 cursor-pointer transition-all duration-300 ${
                    !minimal && "hover:ring-glow-pink/40 hover:bg-glow-pink/5"
                  }`}>
                    {!minimal && <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-glow-pink/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />}
                    <div className="relative">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl mx-auto mb-3 transition-all ${
                        minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-pink/10 ring-1 ring-glow-pink/20 group-hover:ring-glow-pink/40"
                      }`}>
                        <ExternalLink className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-pink"}`} />
                      </div>
                      <p className="text-sm font-bold text-foreground mb-1 text-center">{minimal ? "Paste URL" : "🔗 Paste URL"}</p>
                      <div className="mt-3">
                        <div className="relative">
                          <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input placeholder="https://..." className="pl-8 bg-card/50 border-muted rounded-lg h-9 text-xs" />
                        </div>
                        <Button size="sm" className={`w-full mt-2 border-0 rounded-lg h-8 text-xs font-bold ${
                          minimal ? "bg-secondary text-foreground hover:bg-secondary/80" : "bg-glow-pink/15 text-glow-pink hover:bg-glow-pink/25"
                        }`}>
                          Fetch Content
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-border/50 pt-5">
          <button className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/60 ring-1 ring-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shrink-0">
            <Paperclip className="h-4 w-4" />
          </button>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={selectedConvId ? "Type a message or paste a URL to ingest..." : "Start a new chat first..."}
            className="flex-1 bg-card border-muted rounded-xl h-12"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            className="h-12 w-12 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatTab;
