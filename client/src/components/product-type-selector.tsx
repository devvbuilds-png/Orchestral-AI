import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Building2, Users, Layers, ArrowRight } from "lucide-react";
import type { ProductType, PrimaryMode } from "@shared/schema";

interface ProductTypeSelectorProps {
  onSelect: (type: ProductType, primaryMode?: PrimaryMode) => void;
  className?: string;
}

export function ProductTypeSelector({ onSelect, className }: ProductTypeSelectorProps) {
  const [selectedType, setSelectedType] = useState<ProductType | null>(null);
  const [showPrimaryMode, setShowPrimaryMode] = useState(false);

  const productTypes = [
    {
      type: "b2b" as ProductType,
      label: "B2B",
      description: "Business-to-Business product sold to companies and organizations",
      icon: Building2,
    },
    {
      type: "b2c" as ProductType,
      label: "B2C",
      description: "Business-to-Consumer product sold directly to individual users",
      icon: Users,
    },
    {
      type: "hybrid" as ProductType,
      label: "Hybrid",
      description: "Product that serves both businesses and individual consumers",
      icon: Layers,
    },
  ];

  const handleTypeSelect = (type: ProductType) => {
    setSelectedType(type);
    if (type === "hybrid") {
      setShowPrimaryMode(true);
    } else {
      onSelect(type);
    }
  };

  const handlePrimaryModeSelect = (mode: PrimaryMode) => {
    if (selectedType === "hybrid") {
      onSelect(selectedType, mode);
    }
  };

  if (showPrimaryMode) {
    return (
      <div className={cn("flex flex-col gap-4", className)} data-testid="primary-mode-selector">
        <p className="text-sm text-muted-foreground text-center">
          Which side is primary for your hybrid product?
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Card
            className="flex-1 p-4 cursor-pointer hover-elevate active-elevate-2 transition-all border-2 border-transparent hover:border-primary/50"
            onClick={() => handlePrimaryModeSelect("b2b")}
            data-testid="card-primary-b2b"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">B2B Primary</h3>
                <p className="text-xs text-muted-foreground">Business focus first</p>
              </div>
            </div>
          </Card>
          <Card
            className="flex-1 p-4 cursor-pointer hover-elevate active-elevate-2 transition-all border-2 border-transparent hover:border-primary/50"
            onClick={() => handlePrimaryModeSelect("b2c")}
            data-testid="card-primary-b2c"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">B2C Primary</h3>
                <p className="text-xs text-muted-foreground">Consumer focus first</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)} data-testid="product-type-selector">
      <div className="grid gap-3">
        {productTypes.map(({ type, label, description, icon: Icon }) => (
          <Card
            key={type}
            className={cn(
              "p-4 cursor-pointer hover-elevate active-elevate-2 transition-all border-2",
              selectedType === type 
                ? "border-primary bg-primary/5" 
                : "border-transparent hover:border-primary/50"
            )}
            onClick={() => handleTypeSelect(type)}
            data-testid={`card-product-type-${type}`}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{label}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
