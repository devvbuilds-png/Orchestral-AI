import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Trash2, MoreHorizontal, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Session } from "@shared/schema";

interface SessionSidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string) => void;
}

export function SessionSidebar({
  sessions,
  currentSessionId,
  onSessionSelect,
  onNewSession,
  onDeleteSession,
  onRenameSession,
}: SessionSidebarProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const getConfidenceBadge = (level?: "low" | "medium" | "high") => {
    if (!level) return null;
    
    const config = {
      low: { label: "Low", className: "bg-destructive/10 text-destructive border-destructive/20" },
      medium: { label: "Med", className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500/20" },
      high: { label: "High", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20" },
    };

    const { label, className } = config[level];
    return (
      <Badge variant="outline" className={cn("text-xs px-1.5 py-0", className)}>
        {label}
      </Badge>
    );
  };

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  return (
    <Sidebar data-testid="session-sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Package className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">PKB System</h2>
              <p className="text-xs text-muted-foreground">Product Knowledge</p>
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between px-2 mb-2">
            <SidebarGroupLabel className="mb-0">Sessions</SidebarGroupLabel>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onNewSession}
              data-testid="button-new-session"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <SidebarGroupContent>
            <ScrollArea className="h-[calc(100vh-200px)]">
              <SidebarMenu>
                {sortedSessions.length === 0 ? (
                  <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                    <p>No sessions yet</p>
                    <p className="text-xs mt-1">Create a new session to get started</p>
                  </div>
                ) : (
                  sortedSessions.map((session) => (
                    <SidebarMenuItem key={session.id} className="group">
                      <div className="flex items-center w-full">
                        <SidebarMenuButton
                          isActive={session.id === currentSessionId}
                          onClick={() => onSessionSelect(session.id)}
                          className="flex-1 min-w-0"
                          data-testid={`session-item-${session.id}`}
                        >
                          <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                            <span className="truncate font-medium text-sm">
                              {session.product_name || "Untitled Product"}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {formatDate(session.updated_at)}
                              </span>
                              {getConfidenceBadge(session.confidence_level)}
                            </div>
                          </div>
                        </SidebarMenuButton>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`button-session-menu-${session.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onRenameSession(session.id);
                              }}
                              data-testid={`button-rename-session-${session.id}`}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession(session.id);
                              }}
                              data-testid={`button-delete-session-${session.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="px-3 py-2">
          <p className="text-xs text-muted-foreground text-center">
            V0 - Product Research
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
