import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronUp, ChevronDown } from "lucide-react";
import KaizenMark from "@/components/KaizenMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Organisation } from "@shared/schema";

interface OrgSetupProps {
  onComplete: () => void;
  mode?: "create" | "edit";
  initialOrganisation?: Organisation | null;
  onCancel?: () => void;
}

const locations = ["India", "Southeast Asia", "Europe", "North America", "Latin America", "Middle East", "Africa", "Global"];
const businessModels = ["B2B", "B2C", "Both"];

const OrgSetup = ({
  onComplete,
  mode = "create",
  initialOrganisation = null,
  onCancel,
}: OrgSetupProps) => {
  const { minimal } = useMinimalMode();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditMode = mode === "edit";

  const [orgName, setOrgName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [founded, setFounded] = useState("");
  const [numProducts, setNumProducts] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [competitorInput, setCompetitorInput] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    if (!initialOrganisation) return;

    setOrgName(initialOrganisation.name ?? "");
    setDescription(initialOrganisation.description ?? "");
    setIndustry(initialOrganisation.industry ?? "");
    setFounded(initialOrganisation.founded_year ? String(initialOrganisation.founded_year) : "");
    setNumProducts(initialOrganisation.num_products ? String(initialOrganisation.num_products) : "");
    setSelectedLocations(initialOrganisation.locations ?? []);
    setCompetitors(initialOrganisation.competitors ?? []);
    setBusinessModel(initialOrganisation.business_model ? initialOrganisation.business_model.toUpperCase() : "");
    setWebsiteUrl(initialOrganisation.website_url ?? "");
  }, [initialOrganisation]);

  const toggleLocation = (loc: string) => {
    setSelectedLocations(prev =>
      prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]
    );
  };

  const addCompetitor = () => {
    const trimmed = competitorInput.trim();
    if (trimmed && !competitors.includes(trimmed)) {
      setCompetitors(prev => [...prev, trimmed]);
      setCompetitorInput("");
    }
  };

  const saveOrgMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: orgName.trim(),
        description: description.trim() || undefined,
        industry: industry.trim() || undefined,
        founded_year: founded ? parseInt(founded) : undefined,
        num_products: numProducts ? parseInt(numProducts) : undefined,
        locations: selectedLocations.length > 0 ? selectedLocations : undefined,
        competitors: competitors.length > 0 ? competitors : undefined,
        business_model: businessModel ? businessModel.toLowerCase() : undefined,
        website_url: websiteUrl.trim() || undefined,
      };

      if (isEditMode && initialOrganisation?.id) {
        return apiRequest("PATCH", `/api/organisations/${initialOrganisation.id}`, payload);
      }

      return apiRequest("POST", "/api/organisations", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organisations"] });
      onComplete();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    saveOrgMutation.mutate();
  };

  const uploadExtractMutation = useMutation({
    mutationFn: async (file: File) => {
      // We need an orgId — but org doesn't exist yet. Extract after creation.
      // For now, just store the file and do the extraction after org creation.
      // This is a UI affordance; we skip extraction pre-creation.
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-50 flex flex-col items-center outer-frame overflow-auto"
    >
      <div className="relative z-10 w-full max-w-2xl mx-auto px-6 py-16">
        {!isEditMode && (
          <div className="flex justify-center gap-2 mb-8">
            <div className="h-1 w-16 rounded-full bg-primary" />
            <div className="h-1 w-16 rounded-full bg-primary" />
            <div className="h-1 w-16 rounded-full bg-muted" />
          </div>
        )}

        {/* Step Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex justify-center mb-6"
        >
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            {isEditMode ? "Organisation settings" : "Step 2 of 3 — Workspace setup"}
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <h1 className="font-heading text-3xl font-bold text-foreground mb-3">
            {isEditMode ? "Edit organisation details" : "Set up your organisation"}
          </h1>
          <p className="font-body text-sm text-muted-foreground mb-8 leading-relaxed">
            {isEditMode
              ? "Update the core organisation details that shape your dashboard and company-level knowledge context."
              : "This is the home for all your products inside Kaizen. Think of it as the container — your org name, industry, and size help us tailor the experience for your team."}
          </p>
        </motion.div>

        {/* Why accordion */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="surface-card rounded-xl mb-8 overflow-hidden"
        >
          <button
            onClick={() => setWhyOpen(!whyOpen)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              {!minimal && "💡 "}Why are we asking this?
            </span>
            {whyOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {whyOpen && (
            <div className="px-5 pb-4 text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
              Your organisation is the top-level workspace. Every product, knowledge base, and team member will live inside it. You only set this up once.
            </div>
          )}
        </motion.div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Upload card */}
          <div className="surface-card rounded-xl p-5">
            <h4 className="font-heading text-sm font-bold text-foreground mb-1">
              Upload a company deck to auto-fill this form
            </h4>
            <p className="font-body text-xs text-muted-foreground mb-4 leading-relaxed">
              Only organisation-level fields will be extracted — everything else is ignored. Fields not found will be left blank for you to fill manually.
            </p>
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={() => {}} />
            <Button type="button" variant="outline" className="rounded-xl text-xs" onClick={() => fileInputRef.current?.click()}>
              Browse file
            </Button>
          </div>

          {/* Org Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Organisation name <span className="text-primary">*</span>
            </label>
            <Input
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="bg-secondary/50 border-border"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              One-line description
            </label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. The operating system for modern sales teams"
              className="bg-secondary/50 border-border"
            />
          </div>

          {/* Industry + Founded */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Industry / sector
              </label>
              <Input
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                placeholder="e.g. SaaS, Fintech"
                className="bg-secondary/50 border-border"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Founded year
              </label>
              <Input
                value={founded}
                onChange={e => setFounded(e.target.value)}
                placeholder="e.g. 2019"
                className="bg-secondary/50 border-border"
              />
            </div>
          </div>

          {/* Number of products */}
          <div className="w-1/2">
            <label className="block text-sm font-medium text-foreground mb-2">
              Number of products
            </label>
            <Input
              value={numProducts}
              onChange={e => setNumProducts(e.target.value)}
              placeholder="e.g. 3"
              className="bg-secondary/50 border-border"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Location of operation
            </label>
            <div className="flex flex-wrap gap-2">
              {locations.map(loc => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => toggleLocation(loc)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium border transition-colors ${
                    selectedLocations.includes(loc)
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-secondary/40 text-muted-foreground hover:border-muted-foreground/50"
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>

          {/* Competitors */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Company-wide competitors
            </label>
            <div className="flex gap-2">
              <Input
                value={competitorInput}
                onChange={e => setCompetitorInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCompetitor())}
                placeholder="Type a competitor and press Enter"
                className="bg-secondary/50 border-border flex-1"
              />
              <Button type="button" variant="outline" onClick={addCompetitor} className="rounded-xl">
                Add
              </Button>
            </div>
            {competitors.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {competitors.map(c => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-foreground"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => setCompetitors(prev => prev.filter(x => x !== c))}
                      className="text-muted-foreground hover:text-foreground ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Business model */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Business model
            </label>
            <div className="grid grid-cols-3 gap-3">
              {businessModels.map(model => (
                <button
                  key={model}
                  type="button"
                  onClick={() => setBusinessModel(model)}
                  className={`rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                    businessModel === model
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-secondary/40 text-muted-foreground hover:border-muted-foreground/50"
                  }`}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>

          {/* Website URL */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Website URL
            </label>
            <Input
              value={websiteUrl}
              onChange={e => setWebsiteUrl(e.target.value)}
              placeholder="https://acme.com"
              className="bg-secondary/50 border-border"
            />
          </div>

          {saveOrgMutation.isError && (
            <p className="text-xs text-destructive">
              {isEditMode ? "Failed to update organisation. Please try again." : "Failed to create organisation. Please try again."}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            You can update these details anytime from your settings.
          </p>

          <div className="flex items-center gap-3">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl font-semibold text-sm h-11 px-6">
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={!orgName.trim() || saveOrgMutation.isPending}
              className="gap-2 bg-primary hover:bg-primary/90 rounded-xl font-semibold text-sm h-11 px-6"
            >
              {saveOrgMutation.isPending
                ? isEditMode ? "Saving..." : "Creating..."
                : isEditMode ? "Save changes" : "Save Organisation"}
            </Button>
          </div>
        </motion.form>

        {/* Branding */}
        <div className="flex items-center justify-center gap-2 mt-12 opacity-40">
          <KaizenMark className="h-4 w-4" />
          <span className="font-heading text-xs font-medium text-muted-foreground">
            Kaizen
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default OrgSetup;
