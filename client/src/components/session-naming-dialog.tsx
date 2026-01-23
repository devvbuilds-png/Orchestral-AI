import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SessionNamingDialogProps {
  open: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  mode?: "create" | "rename";
  initialName?: string;
}

export function SessionNamingDialog({ 
  open, 
  onConfirm, 
  onCancel,
  mode = "create",
  initialName = "",
}: SessionNamingDialogProps) {
  const [productName, setProductName] = useState(initialName);

  useEffect(() => {
    if (open) {
      setProductName(initialName);
    }
  }, [open, initialName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (productName.trim()) {
      onConfirm(productName.trim());
      setProductName("");
    }
  };

  const isRename = mode === "rename";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-session-naming">
        <DialogHeader>
          <DialogTitle>{isRename ? "Rename Product" : "Name Your Product"}</DialogTitle>
          <DialogDescription>
            {isRename 
              ? "Enter a new name for this product session."
              : "What product are you building knowledge for? This helps keep your sessions organized."
            }
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="productName">Product Name</Label>
              <Input
                id="productName"
                placeholder="e.g., Spotify, Slack, Notion..."
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                autoFocus
                data-testid="input-product-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-naming">
              Cancel
            </Button>
            <Button type="submit" disabled={!productName.trim()} data-testid="button-confirm-naming">
              {isRename ? "Save" : "Start Session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
