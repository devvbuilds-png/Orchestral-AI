import { useState, useRef, useEffect } from "react";
import { Send, Link2, BookOpen, Sparkles, FileUp, ExternalLink, MessageSquare, Plus, Clock, Paperclip, Bot, User, CheckCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
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
  newChatTrigger?: number;
}

const INGESTION_RE = /^\[INGESTION_COMPLETE:(\d+)\]\s*/;

function parseIngestionMarker(content: string): { isIngestion: boolean; gapsFound: number; displayContent: string } {
  const match = content.match(INGESTION_RE);
  if (!match) return { isIngestion: false, gapsFound: 0, displayContent: content };
  return { isIngestion: true, gapsFound: parseInt(match[1], 10), displayContent: content.replace(INGESTION_RE, "") };
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
  newChatTrigger,
}: Props) => {
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [mode, setMode] = useState<"learner" | "explainer">("learner");
  const [message, setMessage] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [showWelcomeCards, setShowWelcomeCards] = useState(false);
  const [cardUrlValue, setCardUrlValue] = useState("");
  // Attachment dropdown
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachUrlValue, setAttachUrlValue] = useState("");

  const { minimal } = useMinimalMode();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // Close attach dropdown when clicking outside
  useEffect(() => {
    if (!attachOpen) return;
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [attachOpen]);

  const { data: conversations = [], isFetched: convsFetched } = useQuery<Conversation[]>({
    queryKey: [`/api/products/${product.id}/conversations`],
    queryFn: async () => {
      const res = await fetch(`/api/products/${product.id}/conversations`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.conversations ?? [];
    },
  });

  // Sort conversations newest-first
  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

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

  // Sync localMessages from DB messages
  useEffect(() => {
    setLocalMessages([...convMessages]);
  }, [selectedConvId, convMessages]);

  interface SSEResult { content: string; factsExtracted: number }

  const readSSEResponse = async (convId: number, msg: string): Promise<SSEResult> => {
    const endpoint = mode === "learner"
      ? `/api/products/${product.id}/conversations/${convId}/chat`
      : `/api/products/${product.id}/conversations/${convId}/explain`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
      credentials: "include",
    });
    if (!res.ok || !res.body) return { content: "", factsExtracted: 0 };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let factsExtracted = 0;
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
          if (evt.type === "done") factsExtracted = evt.facts_extracted ?? 0;
        } catch { /* skip malformed line */ }
      }
    }
    return { content: content.trim(), factsExtracted };
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
      if (mode === "learner") {
        const result = await readSSEResponse(conv.id, "[SESSION_START]");
        if (result.content) {
          setLocalMessages([{
            id: `session_start_${conv.id}`,
            role: "assistant",
            content: result.content,
            created_at: new Date().toISOString(),
          }]);
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
      return readSSEResponse(selectedConvId, text);
    },
    onSuccess: (result) => {
      if (result.content) {
        setLocalMessages((prev) => [...prev, {
          id: String(Date.now() + 1),
          role: "assistant" as const,
          content: result.content,
          created_at: new Date().toISOString(),
        }]);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}/conversations`] });
      queryClient.invalidateQueries({
        queryKey: [`/api/products/${product.id}/conversations/${selectedConvId}/messages`],
      });
      // Refetch PKB + product list immediately if facts were extracted, then again after ~5s for synthesizer results
      if (result.factsExtracted > 0) {
        console.log("[CHAT-UI] Invalidating PKB queries, factsExtracted:", result.factsExtracted);
        queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        }, 5000);
      }
    },
  });

  // Shared upload mutation (used by welcome card + attach menu)
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/products/${product.id}/upload`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      setShowWelcomeCards(false);
      queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}`] });
      onProcess();
    },
  });

  // Shared URL fetch mutation (used by welcome card + attach menu)
  const fetchUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch(`/api/products/${product.id}/fetch-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Fetch failed");
      return res.json();
    },
    onSuccess: () => {
      setCardUrlValue("");
      setAttachUrlValue("");
      setShowWelcomeCards(false);
      queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}`] });
      onProcess();
    },
  });

  // Auto-init on mount
  useEffect(() => {
    if (!convsFetched || initializedRef.current) return;
    initializedRef.current = true;

    if (conversations.length > 0) {
      const newest = [...conversations].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )[0];
      setSelectedConvId(newest.id);
    } else {
      setShowWelcomeCards(true);
      newConvMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convsFetched, conversations.length]);

  // "New Chat" from header
  useEffect(() => {
    if (!newChatTrigger) return;
    setShowWelcomeCards(false);
    newConvMutation.mutate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newChatTrigger]);

  const sendTextMessage = (text: string) => {
    if (!selectedConvId) return;
    setShowWelcomeCards(false);
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

    if (URL_PATTERN.test(text)) {
      setMessage("");
      setShowWelcomeCards(false);
      try {
        const res = await fetch(`/api/products/${product.id}/fetch-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: text }),
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to fetch URL" }));
          const errMsg: Message = {
            id: String(Date.now()),
            role: "assistant",
            content: `I couldn't fetch that URL: ${err.error || "Unknown error"}. Please check the link and try again.`,
            created_at: new Date().toISOString(),
          };
          setLocalMessages((prev) => [...prev, errMsg]);
          return;
        }
      } catch (e) {
        const errMsg: Message = {
          id: String(Date.now()),
          role: "assistant",
          content: "I couldn't reach that URL. Please check the link and try again.",
          created_at: new Date().toISOString(),
        };
        setLocalMessages((prev) => [...prev, errMsg]);
        return;
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

  return (
    <div className="flex gap-6 flex-1 min-h-0">
      {/* Hidden file input — always mounted */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          e.target.value = "";
        }}
      />

      {/* Sidebar */}
      <div className="w-56 shrink-0 flex flex-col min-h-0">
        <button
          onClick={() => { setShowWelcomeCards(false); newConvMutation.mutate(); }}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 ring-1 ring-primary/20 px-3 py-2.5 text-sm font-bold text-primary hover:bg-primary/15 hover:ring-primary/40 transition-all group shrink-0"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/20 group-hover:bg-primary/30 transition-all">
            <Plus className="h-3.5 w-3.5" />
          </div>
          New Chat
        </button>

        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2 shrink-0">Recent</div>

        <div className="space-y-1 flex-1 overflow-y-auto">
          {sortedConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => { setSelectedConvId(conv.id); setShowWelcomeCards(false); }}
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

        <div className="mt-4 rounded-xl bg-secondary/30 ring-1 ring-border/30 p-3 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-bold text-muted-foreground">{conversations.length} conversation{conversations.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-3/5 rounded-full bg-primary/40" />
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Mode selector header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
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

        {/* Scrollable message list */}
        <div className="flex-1 overflow-y-auto pr-2 mb-3 min-h-0">
          <div className="space-y-4 pb-2">
            {localMessages.map((msg, i) => {
              const ingestion = parseIngestionMarker(msg.content);
              if (ingestion.isIngestion) {
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
                      <div className="text-sm text-foreground leading-relaxed prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown>{ingestion.displayContent}</ReactMarkdown>
                      </div>
                      {ingestion.gapsFound > 0 && (
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
                    <div className="text-sm text-foreground leading-relaxed prose prose-sm prose-invert max-w-none">
                      {msg.role === "assistant" ? (
                        <ReactMarkdown>{parsed.text}</ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-line">{parsed.text}</p>
                      )}
                    </div>
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

            {localMessages.length === 0 && !showWelcomeCards && !newConvMutation.isPending && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {selectedConvId ? "Start the conversation." : "Loading..."}
              </p>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Welcome cards — first-session only, collapse after first user message */}
        {showWelcomeCards && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 gap-3 mb-3 shrink-0"
          >
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`group relative rounded-2xl bg-secondary/40 ring-1 ring-border/50 p-5 text-center cursor-pointer transition-all duration-300 ${
                !minimal && "hover:ring-glow-purple/40 hover:bg-glow-purple/5"
              } ${uploadMutation.isPending ? "opacity-60 pointer-events-none" : ""}`}
            >
              {!minimal && <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-glow-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />}
              <div className="relative">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl mx-auto mb-2 transition-all ${
                  minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-purple/10 ring-1 ring-glow-purple/20 group-hover:ring-glow-purple/40"
                }`}>
                  <FileUp className={`h-4 w-4 ${minimal ? "text-muted-foreground" : "text-glow-purple"}`} />
                </div>
                <p className="text-sm font-bold text-foreground mb-1">
                  {uploadMutation.isPending ? "Uploading…" : (minimal ? "Upload Files" : "📄 Upload Files")}
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {["PDF", "DOCX", "TXT", "MD"].map((fmt) => (
                    <span key={fmt} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${
                      minimal ? "bg-secondary text-muted-foreground ring-border" : "bg-glow-purple/10 text-glow-purple ring-glow-purple/20"
                    }`}>{fmt}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className={`group relative rounded-2xl bg-secondary/40 ring-1 ring-border/50 p-5 transition-all duration-300 ${
              !minimal && "hover:ring-glow-pink/40 hover:bg-glow-pink/5"
            }`}>
              {!minimal && <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-glow-pink/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />}
              <div className="relative">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl mx-auto mb-2 transition-all ${
                  minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-pink/10 ring-1 ring-glow-pink/20 group-hover:ring-glow-pink/40"
                }`}>
                  <ExternalLink className={`h-4 w-4 ${minimal ? "text-muted-foreground" : "text-glow-pink"}`} />
                </div>
                <p className="text-sm font-bold text-foreground mb-2 text-center">{minimal ? "Paste URL" : "🔗 Paste URL"}</p>
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="relative">
                    <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="https://..."
                      className="pl-8 bg-card/50 border-muted rounded-lg h-8 text-xs"
                      value={cardUrlValue}
                      onChange={(e) => setCardUrlValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && cardUrlValue.trim()) fetchUrlMutation.mutate(cardUrlValue.trim());
                      }}
                    />
                  </div>
                  <Button
                    size="sm"
                    className={`w-full mt-1.5 border-0 rounded-lg h-7 text-xs font-bold ${
                      minimal ? "bg-secondary text-foreground hover:bg-secondary/80" : "bg-glow-pink/15 text-glow-pink hover:bg-glow-pink/25"
                    }`}
                    onClick={() => cardUrlValue.trim() && fetchUrlMutation.mutate(cardUrlValue.trim())}
                    disabled={fetchUrlMutation.isPending || !cardUrlValue.trim()}
                  >
                    {fetchUrlMutation.isPending ? "Fetching…" : "Fetch Content"}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Input bar */}
        <div className="flex gap-2 border-t border-border/50 pt-4 shrink-0">
          {/* Attach button with dropdown */}
          <div className="relative shrink-0" ref={attachMenuRef}>
            <button
              onClick={() => setAttachOpen(v => !v)}
              className={`flex h-12 w-12 items-center justify-center rounded-xl ring-1 transition-all ${
                attachOpen
                  ? "bg-secondary text-foreground ring-border"
                  : "bg-secondary/60 ring-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              title="Attach file or URL"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {attachOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="absolute bottom-14 left-0 w-72 rounded-xl bg-popover border border-border shadow-xl z-50 overflow-hidden"
              >
                {/* Upload option */}
                <button
                  onClick={() => { fileInputRef.current?.click(); setAttachOpen(false); }}
                  disabled={uploadMutation.isPending}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-secondary transition-colors text-left"
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-purple/10 ring-1 ring-glow-purple/20"}`}>
                    <FileUp className={`h-4 w-4 ${minimal ? "text-muted-foreground" : "text-glow-purple"}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {uploadMutation.isPending ? "Uploading…" : "Upload file"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">PDF, DOCX, TXT, MD</p>
                  </div>
                </button>

                <div className="border-t border-border/60 px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-pink/10 ring-1 ring-glow-pink/20"}`}>
                      <Link2 className={`h-4 w-4 ${minimal ? "text-muted-foreground" : "text-glow-pink"}`} />
                    </div>
                    <p className="text-sm font-semibold text-foreground">Paste URL</p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://..."
                      value={attachUrlValue}
                      onChange={e => setAttachUrlValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && attachUrlValue.trim()) {
                          fetchUrlMutation.mutate(attachUrlValue.trim());
                          setAttachOpen(false);
                        }
                      }}
                      className="h-8 text-xs flex-1"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (attachUrlValue.trim()) {
                          fetchUrlMutation.mutate(attachUrlValue.trim());
                          setAttachOpen(false);
                        }
                      }}
                      disabled={!attachUrlValue.trim() || fetchUrlMutation.isPending}
                      className="h-8 px-3 text-xs font-bold shrink-0"
                    >
                      {fetchUrlMutation.isPending ? "…" : "Fetch"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type a message or paste a URL to ingest..."
            className="flex-1 bg-card border-muted rounded-xl h-12"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            className="h-12 w-12 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatTab;
