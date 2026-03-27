import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronUp, ChevronDown, Lightbulb, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMinimalMode } from "@/contexts/MinimalModeContext";

interface OrgSetupProps {
  onComplete: () => void;
}

const locations = ["India", "Southeast Asia", "Europe", "North America", "Latin America", "Middle East", "Africa", "Global"];
const businessModels = ["B2B", "B2C", "Both"];

const OrgSetup = ({ onComplete }: OrgSetupProps) => {
  const { minimal } = useMinimalMode();
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    localStorage.setItem("org_name", orgName.trim());
    onComplete();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-50 flex flex-col items-center outer-frame overflow-auto"
    >
      <div className="relative z-10 w-full max-w-2xl mx-auto px-6 py-16">
        {/* Progress Bar */}
        <div className="flex justify-center gap-2 mb-8">
          <div className="h-1 w-16 rounded-full bg-primary" />
          <div className="h-1 w-16 rounded-full bg-primary" />
          <div className="h-1 w-16 rounded-full bg-muted" />
        </div>

        {/* Step Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex justify-center mb-6"
        >
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Step 2 of 3 — Workspace setup
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <h1 className="font-heading text-3xl font-bold text-foreground mb-3">
            Set up your organisation
          </h1>
          <p className="font-body text-sm text-muted-foreground mb-8 leading-relaxed">
            This is the home for all your products inside Orchestral-AI. Think of it as the container — your org name, industry, and size help us tailor the experience for your team.
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

          {/* Upload card */}
          <div className="surface-card rounded-xl p-5">
            <h4 className="font-heading text-sm font-bold text-foreground mb-1">
              Or upload a company deck to auto-fill this form
            </h4>
            <p className="font-body text-xs text-muted-foreground mb-4 leading-relaxed">
              Only organisation-level fields will be extracted — everything else is ignored. Fields not found will be left blank for you to fill manually.
            </p>
            <Button type="button" variant="outline" className="rounded-xl text-xs">
              Browse file
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            You can update these details anytime from your settings.
          </p>

          <Button
            type="submit"
            disabled={!orgName.trim()}
            className="gap-2 bg-primary hover:bg-primary/90 rounded-xl font-semibold text-sm h-11 px-6"
          >
            Save Organisation
          </Button>
        </motion.form>

        {/* Branding */}
        <div className="flex items-center justify-center gap-2 mt-12 opacity-40">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="font-heading text-xs font-medium text-muted-foreground">
            Orchestral<span className="text-primary">-AI</span>
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default OrgSetup;
