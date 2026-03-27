import { useRef, useState } from "react";
import { FileText, Upload, Link2, Globe, Layers, ExternalLink, Radar, FileUp, Clock, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PKB } from "@shared/schema";

const colorMap = {
  purple: { bg: "bg-glow-purple/10", ring: "ring-glow-purple/20", text: "text-glow-purple" },
  blue:   { bg: "bg-glow-blue/10",   ring: "ring-glow-blue/20",   text: "text-glow-blue" },
  pink:   { bg: "bg-glow-pink/10",   ring: "ring-glow-pink/20",   text: "text-glow-pink" },
};

const minimalColorMap = {
  purple: { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground" },
  blue:   { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground" },
  pink:   { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground" },
};

type SourceColor = keyof typeof colorMap;

interface Props {
  pkb: PKB | null;
  productId: number;
  onProcess: () => void;
}

const DocumentsTab = ({ pkb, productId, onProcess }: Props) => {
  const { minimal } = useMinimalMode();
  const cMap = minimal ? minimalColorMap : colorMap;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlValue, setUrlValue] = useState("");

  const docs = pkb?.meta?.inputs?.documents ?? [];
  const urls = pkb?.meta?.inputs?.urls ?? [];

  type SourceItem = {
    id: string;
    name: string;
    url: string;
    time: string;
    type: "url" | "file";
    color: SourceColor;
  };

  const sourceColors: SourceColor[] = ["purple", "blue", "pink"];
  const ingestedSources: SourceItem[] = [
    ...docs.map((d, i) => ({
      id: `doc-${i}`,
      name: d.filename,
      url: "Uploaded file",
      time: new Date(d.uploaded_at).toLocaleString(),
      type: "file" as const,
      color: sourceColors[i % sourceColors.length],
    })),
    ...urls.map((u, i) => ({
      id: `url-${i}`,
      name: u.title ?? u.url,
      url: u.url,
      time: new Date(u.fetched_at).toLocaleString(),
      type: "url" as const,
      color: sourceColors[(docs.length + i) % sourceColors.length],
    })),
  ];

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/products/${productId}/upload`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}`] });
      onProcess();
    },
  });

  const fetchUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch(`/api/products/${productId}/fetch-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Fetch failed");
      return res.json();
    },
    onSuccess: () => {
      setUrlValue("");
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}`] });
      onProcess();
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  const handleFetchUrl = () => {
    if (urlValue.trim()) fetchUrlMutation.mutate(urlValue.trim());
  };

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
        <div
          className={`group relative rounded-2xl bg-secondary/40 ring-1 ring-border/50 p-6 text-center cursor-pointer transition-all duration-300 ${
            !minimal && "hover:ring-glow-purple/40 hover:bg-glow-purple/5"
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          {!minimal && <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-glow-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />}
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={handleFileChange} />
          <div className="relative">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl mx-auto mb-3 transition-all ${
              minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-purple/10 ring-1 ring-glow-purple/20 group-hover:ring-glow-purple/40 group-hover:shadow-lg group-hover:shadow-glow-purple/10"
            }`}>
              <FileUp className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-purple"}`} />
            </div>
            <p className="text-sm font-bold text-foreground mb-1">
              {uploadMutation.isPending ? "Uploading..." : (minimal ? "Upload Files" : "📄 Upload Files")}
            </p>
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
            <p className="text-sm font-bold text-foreground mb-1 text-center">
              {minimal ? "Paste URL" : "🔗 Paste URL"}
            </p>
            <div className="mt-3">
              <div className="relative">
                <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="https://..."
                  className="pl-8 bg-card/50 border-muted rounded-lg h-9 text-xs"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFetchUrl()}
                />
              </div>
              <Button
                size="sm"
                className={`w-full mt-2 border-0 rounded-lg h-8 text-xs font-bold ${
                  minimal ? "bg-secondary text-foreground hover:bg-secondary/80" : "bg-glow-pink/15 text-glow-pink hover:bg-glow-pink/25"
                }`}
                onClick={handleFetchUrl}
                disabled={fetchUrlMutation.isPending || !urlValue.trim()}
              >
                {fetchUrlMutation.isPending ? "Fetching..." : "Fetch Content"}
              </Button>
            </div>
          </div>
        </div>

        {/* Crawl Site — UI only, no backend */}
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
              <Switch disabled />
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

      {ingestedSources.length === 0 ? (
        <div className="rounded-2xl bg-secondary/30 ring-1 ring-border/40 p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary mx-auto mb-4">
            <Upload className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-bold text-foreground mb-1">No sources yet</p>
          <p className="text-xs text-muted-foreground">Upload a file or paste a URL above to start building your knowledge base.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ingestedSources.map((source, i) => {
            const c = cMap[source.color];
            const borderColorClass = minimal
              ? "border-l-border"
              : source.color === "purple" ? "border-l-glow-purple"
              : source.color === "blue" ? "border-l-glow-blue"
              : "border-l-glow-pink";
            return (
              <motion.div
                key={source.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`group rounded-xl bg-secondary/40 ring-1 ring-border/50 p-4 flex items-center gap-3 hover:ring-border transition-all border-l-[3px] ${borderColorClass}`}
              >
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
      )}
    </motion.div>
  );
};

export default DocumentsTab;
