import { FileText, Upload, Link2, Globe, Layers, ExternalLink, Radar, FileUp, Clock, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { useMinimalMode } from "@/contexts/MinimalModeContext";

const ingestedSources = [
  { id: 1, name: "Documentation", url: "https://www.notion.com/help/guides/category/documentation", time: "57m ago", type: "url", emoji: "📄", color: "purple" as const },
  { id: 2, name: "API Reference", url: "https://developers.notion.com/reference", time: "1h ago", type: "url", emoji: "⚙️", color: "blue" as const },
  { id: 3, name: "product-overview.pdf", url: "Uploaded file", time: "2h ago", type: "file", emoji: "📎", color: "pink" as const },
];

const colorMap = {
  purple: { bg: "bg-glow-purple/10", ring: "ring-glow-purple/20", text: "text-glow-purple" },
  blue: { bg: "bg-glow-blue/10", ring: "ring-glow-blue/20", text: "text-glow-blue" },
  pink: { bg: "bg-glow-pink/10", ring: "ring-glow-pink/20", text: "text-glow-pink" },
};

const minimalColorMap = {
  purple: { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground" },
  blue: { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground" },
  pink: { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground" },
};

const DocumentsTab = () => {
  const { minimal } = useMinimalMode();
  const cMap = minimal ? minimalColorMap : colorMap;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-purple/10 ring-1 ring-glow-purple/20"}`}>
            <FileText className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-purple"}`} />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-foreground">Documents & Sources</h2>
            <p className="text-xs text-muted-foreground">Upload files, paste URLs, or crawl websites to build your knowledge base</p>
          </div>
        </div>
        <span className="text-xs font-bold text-muted-foreground bg-secondary/60 px-3 py-1.5 rounded-full ring-1 ring-border/50">
          {ingestedSources.length} sources
        </span>
      </div>

      {/* 3-column input cards */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {/* Upload */}
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
            <p className="text-xs text-muted-foreground mb-3">Drag & drop or browse</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {["PDF", "DOCX", "TXT", "MD"].map((fmt) => (
                <span key={fmt} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${
                  minimal ? "bg-secondary text-muted-foreground ring-border" : "bg-glow-purple/10 text-glow-purple ring-glow-purple/20"
                }`}>
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* URL */}
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

        {/* Crawl */}
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
            <p className="text-xs text-muted-foreground text-center mb-3">Scan all pages</p>
            <div className="flex items-center justify-between bg-card/50 rounded-lg px-3 py-2 ring-1 ring-border/30">
              <span className="text-xs font-semibold text-muted-foreground">Enable</span>
              <Switch />
            </div>
          </div>
        </div>
      </div>

      <Separator className="mb-6 bg-border/50" />

      {/* Ingested Sources */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className={`h-4 w-4 ${minimal ? "text-muted-foreground" : "text-glow-emerald"}`} />
          <h3 className="text-base font-extrabold text-foreground">Ingested Sources</h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${
            minimal ? "bg-secondary text-foreground ring-border" : "bg-glow-emerald/10 text-glow-emerald ring-glow-emerald/20"
          }`}>
            {ingestedSources.length} active
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {ingestedSources.map((source, i) => {
          const c = cMap[source.color];
          return (
            <motion.div
              key={source.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`group rounded-xl bg-secondary/40 ring-1 ring-border/50 p-4 flex items-center gap-3 hover:ring-border transition-all border-l-[3px] ${
                minimal ? "border-l-border" : (source.color === "purple" ? "border-l-glow-purple" : source.color === "blue" ? "border-l-glow-blue" : "border-l-glow-pink")
              }`}
            >
              {!minimal && <span className="text-xl shrink-0">{source.emoji}</span>}
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.bg} ring-1 ${c.ring} shrink-0`}>
                {source.type === "url" ? <Globe className={`h-4 w-4 ${c.text}`} /> : <FileText className={`h-4 w-4 ${c.text}`} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">{source.name}</p>
                <p className="text-xs text-muted-foreground truncate">{source.url}</p>
              </div>
              <div className={`flex items-center gap-1.5 text-[10px] font-bold shrink-0 ${minimal ? "text-foreground" : "text-glow-emerald"}`}>
                <CheckCircle2 className="h-3 w-3" />
                Ingested
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                <Clock className="h-3 w-3" />
                {source.time}
              </div>
              <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default DocumentsTab;
