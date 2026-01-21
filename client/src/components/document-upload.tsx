import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Upload, 
  FileText, 
  Link as LinkIcon, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  File,
  Globe,
  Layers
} from "lucide-react";

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  status: "pending" | "uploading" | "success" | "error";
  progress?: number;
  error?: string;
}

interface CrawlProgress {
  current: number;
  total: number;
  currentUrl: string;
}

interface DocumentUploadProps {
  onFilesSelected: (files: File[]) => Promise<void>;
  onUrlSubmit: (url: string) => Promise<void>;
  onCrawlWebsite?: (url: string) => Promise<void>;
  isProcessing?: boolean;
  crawlProgress?: CrawlProgress | null;
  className?: string;
}

export function DocumentUpload({
  onFilesSelected,
  onUrlSubmit,
  onCrawlWebsite,
  isProcessing = false,
  crawlProgress,
  className,
}: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [crawlEntireSite, setCrawlEntireSite] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedTypes = ".pdf,.doc,.docx,.txt,.md";
  const acceptedTypesArray = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/markdown"];

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files).filter(file => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      return ext && ["pdf", "doc", "docx", "txt", "md"].includes(ext);
    });

    if (files.length > 0) {
      await processFiles(files);
    }
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      await processFiles(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processFiles = async (files: File[]) => {
    const newFiles: UploadedFile[] = files.map(file => ({
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      type: file.type,
      size: file.size,
      status: "pending",
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);

    for (let i = 0; i < newFiles.length; i++) {
      setUploadedFiles(prev => 
        prev.map(f => f.id === newFiles[i].id ? { ...f, status: "uploading", progress: 0 } : f)
      );

      try {
        await onFilesSelected([files[i]]);
        setUploadedFiles(prev => 
          prev.map(f => f.id === newFiles[i].id ? { ...f, status: "success", progress: 100 } : f)
        );
      } catch (error) {
        setUploadedFiles(prev => 
          prev.map(f => f.id === newFiles[i].id ? { 
            ...f, 
            status: "error", 
            error: error instanceof Error ? error.message : "Upload failed" 
          } : f)
        );
      }
    }
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) return;
    
    setUrlLoading(true);
    try {
      if (crawlEntireSite && onCrawlWebsite) {
        await onCrawlWebsite(urlInput.trim());
      } else {
        await onUrlSubmit(urlInput.trim());
      }
      setUrlInput("");
    } catch (error) {
      console.error("URL fetch error:", error);
    } finally {
      setUrlLoading(false);
    }
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    if (type.includes("pdf")) return "PDF";
    if (type.includes("word") || type.includes("document")) return "DOC";
    if (type.includes("markdown")) return "MD";
    return "TXT";
  };

  return (
    <div className={cn("flex flex-col gap-4", className)} data-testid="document-upload">
      <Card
        className={cn(
          "relative border-2 border-dashed p-8 transition-all",
          dragActive 
            ? "border-primary bg-primary/5" 
            : "border-border hover:border-primary/50",
          isProcessing && "opacity-50 pointer-events-none"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        data-testid="dropzone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes}
          multiple
          onChange={handleFileSelect}
          className="hidden"
          data-testid="input-file"
        />

        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Drop files here or click to upload</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Supports PDF, DOCX, TXT, and Markdown files
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            data-testid="button-select-files"
          >
            <FileText className="h-4 w-4 mr-2" />
            Select Files
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="url"
              placeholder="Paste a product website URL..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
              className="pl-10"
              disabled={isProcessing || urlLoading}
              data-testid="input-url"
            />
          </div>
          <Button
            onClick={handleUrlSubmit}
            disabled={!urlInput.trim() || isProcessing || urlLoading}
            data-testid="button-fetch-url"
          >
            {urlLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : crawlEntireSite ? (
              <>
                <Globe className="h-4 w-4 mr-1" />
                Crawl
              </>
            ) : (
              "Fetch"
            )}
          </Button>
        </div>

        {onCrawlWebsite && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Layers className="h-4 w-4 text-primary" />
              </div>
              <div>
                <Label htmlFor="crawl-toggle" className="text-sm font-medium cursor-pointer">
                  Crawl entire website
                </Label>
                <p className="text-xs text-muted-foreground">
                  Extract content from all pages, not just the URL you enter
                </p>
              </div>
            </div>
            <Switch
              id="crawl-toggle"
              checked={crawlEntireSite}
              onCheckedChange={setCrawlEntireSite}
              disabled={isProcessing || urlLoading}
              data-testid="switch-crawl-entire-site"
            />
          </div>
        )}

        {crawlProgress && (
          <Card className="p-3 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  Crawling website... ({crawlProgress.current}/{crawlProgress.total} pages)
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {crawlProgress.currentUrl}
                </p>
                <Progress 
                  value={(crawlProgress.current / crawlProgress.total) * 100} 
                  className="h-1 mt-2" 
                />
              </div>
            </div>
          </Card>
        )}
      </div>

      {uploadedFiles.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="uploaded-files-list">
          {uploadedFiles.map((file) => (
            <Card
              key={file.id}
              className={cn(
                "flex items-center gap-3 p-3",
                file.status === "error" && "border-destructive/50 bg-destructive/5"
              )}
              data-testid={`uploaded-file-${file.id}`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <span className="text-xs font-bold text-muted-foreground">
                  {getFileIcon(file.type)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </p>
                {file.status === "uploading" && file.progress !== undefined && (
                  <Progress value={file.progress} className="h-1 mt-1" />
                )}
              </div>
              <div className="flex items-center gap-2">
                {file.status === "success" && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Done
                  </Badge>
                )}
                {file.status === "error" && (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Error
                  </Badge>
                )}
                {file.status === "uploading" && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => removeFile(file.id)}
                  data-testid={`button-remove-file-${file.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
