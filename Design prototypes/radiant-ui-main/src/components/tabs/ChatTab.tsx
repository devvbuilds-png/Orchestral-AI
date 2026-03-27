import { useState } from "react";
import { Send, Link2, BookOpen, Sparkles, FileUp, ExternalLink, Radar, MessageSquare, Plus, Clock, Paperclip, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";
import { useMinimalMode } from "@/contexts/MinimalModeContext";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
}

const chatHistory = [
  { id: "1", title: "Product deep-dive", time: "51m ago", icon: "🔍", hasMessages: true },
  { id: "2", title: "Feature comparison", time: "52m ago", icon: "⚡", hasMessages: false },
  { id: "3", title: "Market analysis", time: "55m ago", icon: "📊", hasMessages: false },
];

const mockMessages: Message[] = [
  { id: "m1", role: "user", content: "What are the main use cases for this product?", time: "51m ago" },
  { id: "m2", role: "assistant", content: "Based on the sources I've analyzed, there are three primary use cases:\n\n1. **Team collaboration** — Centralizing project documentation and communication\n2. **Knowledge management** — Building searchable internal wikis\n3. **Workflow automation** — Streamlining repetitive processes with templates", time: "50m ago" },
  { id: "m3", role: "user", content: "How does it compare to competitors in the knowledge management space?", time: "48m ago" },
  { id: "m4", role: "assistant", content: "The product differentiates primarily through its flexible block-based editing system and deep integration ecosystem. Compared to Confluence, it offers a more modern UX. Compared to Notion, it has stronger enterprise controls. However, I need more data on pricing and security certifications to complete the competitive analysis.", time: "47m ago" },
];

const ChatTab = () => {
  const [selectedChat, setSelectedChat] = useState("1");
  const [mode, setMode] = useState<"learner" | "explainer">("learner");
  const [message, setMessage] = useState("");
  const { minimal } = useMinimalMode();

  const currentChat = chatHistory.find((c) => c.id === selectedChat);
  const showMessages = currentChat?.hasMessages;

  return (
    <div className="flex gap-6 min-h-[calc(100vh-12rem)]">
      {/* Sidebar */}
      <div className="w-56 shrink-0 flex flex-col">
        <button className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 ring-1 ring-primary/20 px-3 py-2.5 text-sm font-bold text-primary hover:bg-primary/15 hover:ring-primary/40 transition-all group">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/20 group-hover:bg-primary/30 transition-all">
            <Plus className="h-3.5 w-3.5" />
          </div>
          New Chat
        </button>

        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2">Recent</div>

        <div className="space-y-1 flex-1">
          {chatHistory.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setSelectedChat(chat.id)}
              className={`w-full rounded-xl px-3 py-2.5 text-left transition-all duration-200 flex items-start gap-2.5 group ${
                selectedChat === chat.id
                  ? "bg-secondary ring-1 ring-border/60"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              {!minimal && <span className="text-base mt-0.5 shrink-0">{chat.icon}</span>}
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-semibold truncate ${selectedChat === chat.id ? "text-foreground" : ""}`}>
                  {chat.title}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
                  <span className="text-[10px] text-muted-foreground">{chat.time}</span>
                </div>
              </div>
              {selectedChat === chat.id && (
                <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 shrink-0" />
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-secondary/30 ring-1 ring-border/30 p-3">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-bold text-muted-foreground">3 conversations</span>
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
            {showMessages ? currentChat?.title : "New Product Analysis"}
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
            /* Message Thread */
            <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-2">
              {mockMessages.map((msg, i) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
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
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{msg.content}</p>
                    <span className="text-[10px] text-muted-foreground mt-2 block">{msg.time}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            /* Empty state ingestion cards */
            <>
              <p className="text-sm text-muted-foreground mb-6 text-center">
                The more context you provide, the better I can understand your product.
              </p>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {/* Upload Card */}
                <div className={`group relative rounded-2xl bg-secondary/40 ring-1 ring-border/50 p-6 text-center cursor-pointer transition-all duration-300 ${
                  !minimal && "hover:ring-glow-purple/40 hover:bg-glow-purple/5"
                }`}>
                  {!minimal && <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-glow-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />}
                  <div className="relative">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl mx-auto mb-3 transition-all ${
                      minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-purple/10 ring-1 ring-glow-purple/20 group-hover:ring-glow-purple/40 group-hover:shadow-lg group-hover:shadow-glow-purple/10"
                    }`}>
                      <FileUp className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-purple"}`} />
                    </div>
                    <p className="text-sm font-bold text-foreground mb-1">{minimal ? "Upload Files" : "📄 Upload Files"}</p>
                    <p className="text-xs text-muted-foreground mb-3">PDF, DOCX, TXT, MD</p>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {["PDF", "DOCX", "TXT"].map((fmt) => (
                        <span key={fmt} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${
                          minimal ? "bg-secondary text-muted-foreground ring-border" : "bg-glow-purple/10 text-glow-purple ring-glow-purple/20"
                        }`}>
                          {fmt}
                        </span>
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
                      minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-pink/10 ring-1 ring-glow-pink/20 group-hover:ring-glow-pink/40 group-hover:shadow-lg group-hover:shadow-glow-pink/10"
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

                {/* Crawl Card */}
                <div className={`group relative rounded-2xl bg-secondary/40 ring-1 ring-border/50 p-6 cursor-pointer transition-all duration-300 ${
                  !minimal && "hover:ring-glow-blue/40 hover:bg-glow-blue/5"
                }`}>
                  {!minimal && <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-glow-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />}
                  <div className="relative">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl mx-auto mb-3 transition-all ${
                      minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-blue/10 ring-1 ring-glow-blue/20 group-hover:ring-glow-blue/40 group-hover:shadow-lg group-hover:shadow-glow-blue/10"
                    }`}>
                      <Radar className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-blue"}`} />
                    </div>
                    <p className="text-sm font-bold text-foreground mb-1 text-center">{minimal ? "Crawl Site" : "🌐 Crawl Site"}</p>
                    <p className="text-xs text-muted-foreground text-center mb-3">Scan all pages automatically</p>
                    <div className="flex items-center justify-between bg-card/50 rounded-lg px-3 py-2 ring-1 ring-border/30">
                      <span className="text-xs font-semibold text-muted-foreground">Enable</span>
                      <Switch />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Input with attach icon */}
        <div className="flex gap-2 border-t border-border/50 pt-5">
          <button className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/60 ring-1 ring-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shrink-0">
            <Paperclip className="h-4 w-4" />
          </button>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-card border-muted rounded-xl h-12"
          />
          <Button size="icon" className="h-12 w-12 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatTab;
