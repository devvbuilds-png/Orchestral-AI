import type { Session, PKBChatMessage, SessionState, ChatMode, ProductType, PrimaryMode } from "@shared/schema";

export interface SessionStore {
  sessions: Session[];
  currentSessionId: string | null;
}

const STORAGE_KEY = "pkb-sessions";

export function loadSessions(): SessionStore {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load sessions:", e);
  }
  return { sessions: [], currentSessionId: null };
}

export function saveSessions(store: SessionStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error("Failed to save sessions:", e);
  }
}

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createNewSession(): Session {
  const now = new Date().toISOString();
  return {
    id: generateSessionId(),
    state: "product_type_selection",
    chat_mode: "learner",
    created_at: now,
    updated_at: now,
    messages: [],
  };
}

export function addMessageToSession(
  session: Session,
  role: "user" | "assistant" | "system",
  content: string,
  messageType?: PKBChatMessage["message_type"],
  metadata?: Record<string, any>
): Session {
  const message: PKBChatMessage = {
    id: generateMessageId(),
    role,
    content,
    timestamp: new Date().toISOString(),
    message_type: messageType,
    metadata,
  };

  return {
    ...session,
    updated_at: new Date().toISOString(),
    messages: [...(session.messages || []), message],
  };
}

export function updateSessionState(session: Session, state: SessionState): Session {
  return {
    ...session,
    state,
    updated_at: new Date().toISOString(),
  };
}

export function updateSessionProductType(
  session: Session, 
  productType: ProductType, 
  primaryMode?: PrimaryMode
): Session {
  return {
    ...session,
    product_type: productType,
    primary_mode: primaryMode,
    updated_at: new Date().toISOString(),
  };
}

export function updateSessionChatMode(session: Session, chatMode: ChatMode): Session {
  return {
    ...session,
    chat_mode: chatMode,
    updated_at: new Date().toISOString(),
  };
}

export function updateSessionConfidence(
  session: Session,
  level: "low" | "medium" | "high",
  score?: number
): Session {
  return {
    ...session,
    confidence_level: level,
    confidence_score: score,
    updated_at: new Date().toISOString(),
  };
}

export function updateSessionName(session: Session, name: string): Session {
  return {
    ...session,
    product_name: name,
    updated_at: new Date().toISOString(),
  };
}
