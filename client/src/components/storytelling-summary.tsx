import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Sparkles, 
  Target, 
  Users, 
  Trophy, 
  MessageSquare,
  CheckCircle2 
} from "lucide-react";

interface StorytellingSummaryProps {
  summary: {
    simple_summary?: string;
    who_its_for?: string;
    why_it_wins?: string;
    key_message_pillars?: string[];
    sample_pitch?: string;
  };
  productName?: string;
  confidenceLevel: "low" | "medium" | "high";
  className?: string;
}

export function StorytellingSummary({
  summary,
  productName,
  confidenceLevel,
  className,
}: StorytellingSummaryProps) {
  const sections = [
    {
      icon: Sparkles,
      title: "What It Is",
      content: summary.simple_summary,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      icon: Users,
      title: "Who It's For",
      content: summary.who_its_for,
      color: "text-glow-blue",
      bgColor: "bg-glow-blue/10",
    },
    {
      icon: Trophy,
      title: "Why It Wins",
      content: summary.why_it_wins,
      color: "text-glow-emerald",
      bgColor: "bg-glow-emerald/10",
    },
  ];

  return (
    <Card className={cn("overflow-hidden", className)} data-testid="storytelling-summary">
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{productName || "Product Summary"}</h2>
              <p className="text-sm text-muted-foreground">AI-generated product understanding</p>
            </div>
          </div>
          <Badge 
            variant="outline" 
            className={cn(
              "px-3 py-1",
              confidenceLevel === "high" && "bg-confidence-high/10 text-confidence-high border-confidence-high/20",
              confidenceLevel === "medium" && "bg-confidence-medium/10 text-confidence-medium border-confidence-medium/20",
              confidenceLevel === "low" && "bg-destructive/10 text-destructive border-destructive/20"
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            {confidenceLevel.charAt(0).toUpperCase() + confidenceLevel.slice(1)} Confidence
          </Badge>
        </div>
      </div>

      <ScrollArea className="max-h-[500px]">
        <div className="p-6 space-y-6">
          {sections.map(({ icon: Icon, title, content, color, bgColor }) => (
            content && (
              <div key={title} className="flex gap-4">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", bgColor)}>
                  <Icon className={cn("h-5 w-5", color)} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{content}</p>
                </div>
              </div>
            )
          ))}

          {summary.key_message_pillars && summary.key_message_pillars.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Key Message Pillars
                </h3>
                <div className="flex flex-wrap gap-2">
                  {summary.key_message_pillars.map((pillar, index) => (
                    <Badge key={index} variant="secondary" className="text-sm">
                      {pillar}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {summary.sample_pitch && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-2">Sample Pitch</h3>
                <Card className="p-4 bg-muted/50 border-dashed">
                  <p className="text-sm italic leading-relaxed">"{summary.sample_pitch}"</p>
                </Card>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
