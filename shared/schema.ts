import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export chat models for the OpenAI integration
export * from "./models/chat";

// ============================================================
// Users (kept from original template)
// ============================================================

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").unique(),       // nullable — kept for compat, not used in OAuth flow
  password: text("password"),               // nullable — not used for OAuth users
  google_id: text("google_id").unique(),    // Google OAuth sub identifier
  email: text("email"),                     // from Google profile
  display_name: text("display_name"),       // from Google profile
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============================================================
// PKB (Product Knowledge Base) TypeScript Types
// ============================================================

// Source object - tracks provenance of each fact
export const sourceSchema = z.object({
  source_type: z.enum(["doc", "url", "founder"]),
  source_ref: z.string(),
  evidence: z.string().optional(),
  captured_at: z.string(), // ISO date
});

export type Source = z.infer<typeof sourceSchema>;

// Quality tag for facts
export const qualityTagSchema = z.enum(["strong", "ok", "weak"]);
export type QualityTag = z.infer<typeof qualityTagSchema>;

// Audit trail entry for governance
export const auditTrailEntrySchema = z.object({
  timestamp: z.string(),          // ISO
  action: z.string(),             // e.g. "created", "updated", "approved", "locked"
  actor: z.string(),              // agent id or "founder"
  previous_value: z.any().optional(),
  note: z.string().optional(),
});
export type AuditTrailEntry = z.infer<typeof auditTrailEntrySchema>;

// Fact field format - value with sources
export const factFieldSchema = z.object({
  value: z.union([z.string(), z.array(z.any()), z.record(z.any())]),
  sources: z.array(sourceSchema),
  quality_tag: qualityTagSchema.optional(),
  notes: z.string().optional(),
  // V1 governance fields
  lifecycle_status: z.enum(["asserted", "evidenced", "inferred", "disputed", "stale"]).optional(),
  sensitive: z.boolean().optional(),
  approved: z.boolean().optional(),
  locked: z.boolean().optional(),
  do_not_ask: z.boolean().optional(),
  last_verified: z.string().optional(),  // ISO timestamp
  audit_trail: z.array(auditTrailEntrySchema).optional(),
});

export type FactField = z.infer<typeof factFieldSchema>;

// Use case object
export const useCaseSchema = z.object({
  name: factFieldSchema.optional(),
  for_user_type: factFieldSchema.optional(),
  problem_story: factFieldSchema.optional(),
  outcome: factFieldSchema.optional(),
});

// Feature object
export const featureSchema = z.object({
  name: factFieldSchema.optional(),
  what_it_does: factFieldSchema.optional(),
  why_it_matters: factFieldSchema.optional(),
  dependencies: factFieldSchema.optional(),
});

// Pricing tier
export const pricingTierSchema = z.object({
  name: z.string(),
  price: z.string(),
  features: z.array(z.string()).optional(),
});

// Core Facts Schema
export const coreFactsSchema = z.object({
  product_identity: z.object({
    name: factFieldSchema.optional(),
    one_liner: factFieldSchema.optional(),
    category: factFieldSchema.optional(),
    website: factFieldSchema.optional(),
  }).optional(),
  value_proposition: z.object({
    primary_problem: factFieldSchema.optional(),
    top_benefits: factFieldSchema.optional(),
    why_now: factFieldSchema.optional(),
  }).optional(),
  target_users: z.object({
    primary_users: factFieldSchema.optional(),
    secondary_users: factFieldSchema.optional(),
    not_for: factFieldSchema.optional(),
  }).optional(),
  use_cases: z.array(useCaseSchema).optional(),
  features: z.array(featureSchema).optional(),
  pricing: z.object({
    model: factFieldSchema.optional(),
    range_notes: factFieldSchema.optional(),
    currency: factFieldSchema.optional(),
    tiers: z.array(pricingTierSchema).optional(),
  }).optional(),
  differentiation: z.object({
    alternatives: factFieldSchema.optional(),
    why_we_win: factFieldSchema.optional(),
    where_we_lose: factFieldSchema.optional(),
  }).optional(),
  proof_assets: z.object({
    case_studies: factFieldSchema.optional(),
    testimonials: factFieldSchema.optional(),
    metrics: factFieldSchema.optional(),
  }).optional(),
  constraints_assumptions: z.object({
    assumptions: factFieldSchema.optional(),
    known_unknowns: factFieldSchema.optional(),
  }).optional(),
});

export type CoreFacts = z.infer<typeof coreFactsSchema>;

// B2B Extensions
export const b2bExtensionsSchema = z.object({
  buyer_vs_user: z.object({
    buyers: factFieldSchema.optional(),
    end_users: factFieldSchema.optional(),
  }).optional(),
  org_fit: z.object({
    industries: factFieldSchema.optional(),
    company_size: factFieldSchema.optional(),
    regions: factFieldSchema.optional(),
    tech_stack_fit: factFieldSchema.optional(),
  }).optional(),
  procurement: z.object({
    sales_cycle: factFieldSchema.optional(),
    security_compliance: factFieldSchema.optional(),
    roi_driver: factFieldSchema.optional(),
  }).optional(),
  implementation: z.object({
    integrations: factFieldSchema.optional(),
    onboarding_time: factFieldSchema.optional(),
    support_model: factFieldSchema.optional(),
  }).optional(),
});

export type B2BExtensions = z.infer<typeof b2bExtensionsSchema>;

// B2C Extensions
export const b2cExtensionsSchema = z.object({
  user_segments: z.array(z.object({
    segment_name: factFieldSchema.optional(),
    who: factFieldSchema.optional(),
    why_they_care: factFieldSchema.optional(),
  })).optional(),
  monetization: z.object({
    model: factFieldSchema.optional(),
    range_notes: factFieldSchema.optional(),
    optional_tiers: z.array(pricingTierSchema).optional(),
  }).optional(),
  retention_habits: z.object({
    triggers: factFieldSchema.optional(),
    loops: factFieldSchema.optional(),
  }).optional(),
  trust_safety: z.object({
    risks: factFieldSchema.optional(),
    mitigations: factFieldSchema.optional(),
  }).optional(),
});

export type B2CExtensions = z.infer<typeof b2cExtensionsSchema>;

// Derived Insights Schema
export const derivedInsightsSchema = z.object({
  product_brief: z.object({
    simple_summary: z.string().optional(),
    who_its_for: z.string().optional(),
    why_it_wins: z.string().optional(),
    key_message_pillars: z.array(z.string()).optional(),
    sample_pitch: z.string().optional(),
  }).optional(),
  confidence: z.object({
    level: z.enum(["low", "medium", "high"]),
    score: z.number().min(0).max(100).optional(),
    reasons: z.array(z.string()).optional(),
  }).optional(),
  icp_hypothesis: z.object({
    b2b_icp_hypothesis: z.string().optional(),
    b2c_segment_hypothesis: z.string().optional(),
  }).optional(),
  storytelling_summary: z.string().optional(),
});

export type DerivedInsights = z.infer<typeof derivedInsightsSchema>;

// Gap Schema
export const gapSchema = z.object({
  gap_id: z.string(),
  field_path: z.string(),
  severity: z.enum(["critical", "important", "nice_to_have"]),
  question: z.string(),
  why_needed: z.string(),
  do_not_ask: z.boolean().optional(),
});

export type Gap = z.infer<typeof gapSchema>;

export const gapsSchema = z.object({
  current: z.array(gapSchema).optional(),
  history: z.array(z.object({
    timestamp: z.string(),
    gaps: z.array(gapSchema),
  })).optional(),
});

export type Gaps = z.infer<typeof gapsSchema>;

// Review Inbox Item Schema (V1 Phase 3)
export const inboxItemSchema = z.object({
  item_id: z.string(),
  type: z.enum(["sensitive_field", "conflict", "persona_confirmation", "icp_confirmation", "low_confidence", "informational"]),
  priority: z.enum(["critical", "persona_icp", "low_confidence", "informational"]),
  title: z.string(),
  description: z.string(),
  field_path: z.string().optional(),
  current_value: z.any().optional(),
  proposed_value: z.any().optional(),
  conflict_id: z.string().optional(),
  persona_id: z.string().optional(),
  icp_id: z.string().optional(),
  status: z.enum(["unresolved", "approved", "rejected", "locked", "do_not_ask", "resolved"]),
  created_at: z.string(),
  resolved_at: z.string().optional(),
  resolved_by: z.string().optional(),
});

export type InboxItem = z.infer<typeof inboxItemSchema>;

// Conflict Schema
export const conflictSchema = z.object({
  conflict_id: z.string(),
  field_path: z.string(),
  value_a: z.any(),
  source_a: sourceSchema,
  value_b: z.any(),
  source_b: sourceSchema,
  detected_at: z.string(),
  resolution_status: z.enum(["unresolved", "resolved"]),
  resolved_at: z.string().optional(),
  resolution: z.string().optional(),
});

export type Conflict = z.infer<typeof conflictSchema>;

// Product Type
export const productTypeSchema = z.enum(["b2b", "b2c", "hybrid"]);
export type ProductType = z.infer<typeof productTypeSchema>;

export const primaryModeSchema = z.enum(["b2b", "b2c"]);
export type PrimaryMode = z.infer<typeof primaryModeSchema>;

// Input metadata
export const inputDocumentSchema = z.object({
  filename: z.string(),
  type: z.string(),
  uploaded_at: z.string(),
  size_bytes: z.number().optional(),
});

export const inputUrlSchema = z.object({
  url: z.string(),
  fetched_at: z.string(),
  title: z.string().optional(),
});

export const founderSessionSchema = z.object({
  session_id: z.string(),
  started_at: z.string(),
  ended_at: z.string().optional(),
  questions_answered: z.number().optional(),
});

// PKB Meta Schema
export const pkbMetaSchema = z.object({
  product_id: z.string(),
  product_name: z.string().optional(),
  product_type: productTypeSchema,
  primary_mode: primaryModeSchema.optional(),
  version: z.string().default("0.1"),
  created_at: z.string(),
  last_updated: z.string(),
  inputs: z.object({
    documents: z.array(inputDocumentSchema).optional(),
    urls: z.array(inputUrlSchema).optional(),
    founder_sessions: z.array(founderSessionSchema).optional(),
  }).optional(),
  product_brief: z.string().optional(),
  kb_health_narrative: z.string().optional(),
  kb_stage: z.enum(["empty", "building", "established"]).optional(),
  suggested_questions: z.array(z.string()).optional(),
  confidence_score: z.number().optional(),
});

export type PKBMeta = z.infer<typeof pkbMetaSchema>;

// ============================================================
// Persona & ICP Schemas (V1 Phase 2)
// ============================================================

const personaEvidenceSchema = z.object({
  source_id: z.string(),
  quote: z.string(),
  field_ref: z.string(),
});

export const personaSchema = z.object({
  persona_id: z.string(),
  name: z.string(),
  type: z.enum(["buyer_persona", "user_persona", "influencer", "economic_buyer", "gatekeeper"]),
  status: z.enum(["active", "inactive", "candidate"]),
  context: z.object({
    company_stage: z.array(z.string()),
    company_size: z.array(z.string()),
    region: z.array(z.string()),
  }).optional(),
  goals: z.array(z.object({
    text: z.string(),
    priority: z.enum(["high", "medium", "low"]),
  })).optional(),
  pains: z.array(z.object({
    text: z.string(),
    severity: z.enum(["high", "medium", "low"]),
  })).optional(),
  objections: z.array(z.object({
    text: z.string(),
    frequency: z.enum(["common", "occasional"]),
  })).optional(),
  buying_triggers: z.array(z.string()).optional(),
  success_metrics: z.array(z.string()).optional(),
  evidence: z.array(personaEvidenceSchema).optional(),
  lifecycle_status: z.enum(["asserted", "evidenced", "inferred"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type Persona = z.infer<typeof personaSchema>;

export const icpSchema = z.object({
  icp_id: z.string(),
  segment_type: z.enum(["b2b", "b2c", "hybrid"]),
  firmographics: z.object({
    company_size: z.array(z.string()),
    industries: z.array(z.string()),
    geography: z.array(z.string()),
  }).optional(),
  technographics: z.object({
    must_have_integrations: z.array(z.string()),
    deployment_preferences: z.array(z.string()),
    security_requirements: z.array(z.string()),
  }).optional(),
  buying_context: z.object({
    buyer_roles: z.array(z.string()),
    budget_owner: z.array(z.string()),
    sales_motion: z.array(z.string()),
  }).optional(),
  not_for: z.array(z.string()).optional(),
  disqualifiers: z.array(z.string()).optional(),
  lifecycle_status: z.enum(["asserted", "evidenced", "inferred"]).optional(),
  confidence: z.number().optional(),
  evidence: z.array(personaEvidenceSchema).optional(),
});

export type ICP = z.infer<typeof icpSchema>;

// Complete PKB Schema
export const pkbSchema = z.object({
  meta: pkbMetaSchema,
  facts: coreFactsSchema.optional(),
  extensions: z.object({
    b2b: b2bExtensionsSchema.optional(),
    b2c: b2cExtensionsSchema.optional(),
  }).optional(),
  derived_insights: derivedInsightsSchema.optional(),
  gaps: gapsSchema.optional(),
  conflicts: z.array(conflictSchema).optional(),
  personas: z.array(personaSchema).optional(),
  icps: z.array(icpSchema).optional(),
  review_inbox: z.array(inboxItemSchema).optional(),
});

export type PKB = z.infer<typeof pkbSchema>;

// ============================================================
// PKC (Product Knowledge Core) Types
// ============================================================

// Proposed Update - what agents send to PKC
export const proposedUpdateSchema = z.object({
  target_section: z.enum(["facts", "extensions.b2b", "extensions.b2c", "derived_insights", "gaps"]),
  field_path: z.string(),
  value: z.any(),
  sources: z.array(sourceSchema).optional(),
  metadata: z.object({
    proposed_by: z.enum(["extractor", "interviewer", "synthesizer"]),
    timestamp: z.string(),
    session_id: z.string(),
  }),
});

export type ProposedUpdate = z.infer<typeof proposedUpdateSchema>;

// PKC Decision Result
export const pkcDecisionSchema = z.object({
  accepted: z.boolean(),
  reason: z.string().optional(),
  conflict_created: z.boolean().optional(),
  conflict_id: z.string().optional(),
});

export type PKCDecision = z.infer<typeof pkcDecisionSchema>;

// ============================================================
// Product & Conversation Types
// ============================================================

export const sessionStateSchema = z.enum([
  "product_type_selection",
  "onboarding",
  "document_upload",
  "processing",
  "gap_interview",
  "synthesizing",
  "ready",
  "explainer_mode"
]);

export type SessionState = z.infer<typeof sessionStateSchema>;

export const chatModeSchema = z.enum(["learner", "explainer"]);
export type ChatMode = z.infer<typeof chatModeSchema>;

// Chat Message for our custom chat (not the OpenAI integration)
export const pkbChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string(),
  message_type: z.enum([
    "text",
    "product_type_question",
    "primary_mode_question",
    "upload_prompt",
    "processing_status",
    "synthesis_summary",
    "gap_question",
    "gap_answers",
    "gap_prompt",
    "storytelling_summary",
    "explainer_response",
    "explainer_welcome"
  ]).optional(),
  metadata: z.record(z.any()).optional(),
});

export type PKBChatMessage = z.infer<typeof pkbChatMessageSchema>;

// Session Schema (for frontend state)
export const sessionSchema = z.object({
  id: z.string(),
  product_name: z.string().optional(),
  product_type: productTypeSchema.optional(),
  primary_mode: primaryModeSchema.optional(),
  state: sessionStateSchema,
  chat_mode: chatModeSchema,
  confidence_level: z.enum(["low", "medium", "high"]).optional(),
  confidence_score: z.number().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  messages: z.array(pkbChatMessageSchema).optional(),
});

export type Session = z.infer<typeof sessionSchema>;

// API Request/Response Types
export const createSessionRequestSchema = z.object({
  product_name: z.string().optional(),
});

export const setProductTypeRequestSchema = z.object({
  product_type: productTypeSchema,
  primary_mode: primaryModeSchema.optional(),
});

export const sendMessageRequestSchema = z.object({
  content: z.string(),
  message_type: z.string().optional(),
});

export const uploadDocumentResponseSchema = z.object({
  success: z.boolean(),
  filename: z.string(),
  extracted_text_length: z.number().optional(),
  message: z.string().optional(),
});

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;
export type SetProductTypeRequest = z.infer<typeof setProductTypeRequestSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
export type UploadDocumentResponse = z.infer<typeof uploadDocumentResponseSchema>;

// ============================================================
// Organisations (V3)
// ============================================================

export const organisations = pgTable("organisations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  owner_id: varchar("owner_id").references(() => users.id),
  description: text("description"),
  industry: text("industry"),
  founded_year: integer("founded_year"),
  num_products: integer("num_products"),
  locations: text("locations").array(),
  competitors: text("competitors").array(),
  business_model: text("business_model"),      // 'b2b' | 'b2c' | 'both'
  website_url: text("website_url"),
  created_at: timestamp("created_at").default(sql`now()`),
  updated_at: timestamp("updated_at").default(sql`now()`),
});

export const insertOrganisationSchema = createInsertSchema(organisations).pick({
  name: true,
  owner_id: true,
  description: true,
  industry: true,
  founded_year: true,
  num_products: true,
  locations: true,
  competitors: true,
  business_model: true,
  website_url: true,
});

export type InsertOrganisation = z.infer<typeof insertOrganisationSchema>;
export type Organisation = typeof organisations.$inferSelect;

// ============================================================
// Organisation Members (V3)
// ============================================================

export const organisationMembers = pgTable("organisation_members", {
  id: serial("id").primaryKey(),
  org_id: integer("org_id").references(() => organisations.id),
  user_id: varchar("user_id").references(() => users.id),
  org_role: text("org_role").default("admin"),  // 'admin' | 'member' | 'global_member'
  joined_at: timestamp("joined_at").default(sql`now()`),
});

export const insertOrganisationMemberSchema = createInsertSchema(organisationMembers).pick({
  org_id: true,
  user_id: true,
  org_role: true,
});

export type InsertOrganisationMember = z.infer<typeof insertOrganisationMemberSchema>;
export type OrganisationMember = typeof organisationMembers.$inferSelect;

// Org-level conflict — surfaces when a product fact contradicts an org PKB field
export interface OrgConflict {
  id: string;                  // uuid
  product_id: number;
  product_name: string;
  field: string;               // which org PKB field is in conflict
  org_value: string;           // current org PKB value
  product_value: string;       // the conflicting product fact value
  suggestion: string;          // human-readable suggested update to org PKB
  detected_at: string;         // ISO timestamp
  status: "pending" | "resolved" | "dismissed";
  resolved_at?: string;
}

// Flat file-based JSON for org-level facts — mirrors organisations table fields
export interface OrgPKB {
  org_id: number;
  name: string;
  description: string;
  industry: string;
  founded_year: number | null;
  num_products: number | null;
  locations: string[];
  competitors: string[];
  business_model: string;
  website_url: string;
  created_at: string;
  updated_at: string;
  conflicts: OrgConflict[];
}

// ============================================================
// Products (V2 + V3: org_id added)
// ============================================================

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  owner_id: varchar("owner_id").references(() => users.id),
  org_id: integer("org_id").references(() => organisations.id).notNull(),
  product_type: text("product_type"),          // 'b2b' | 'b2c' | 'hybrid'
  state: text("state").default("product_type_selection"),
  confidence_score: integer("confidence_score").default(0),
  created_at: timestamp("created_at").default(sql`now()`),
  updated_at: timestamp("updated_at").default(sql`now()`),
});

export const insertProductSchema = createInsertSchema(products).pick({
  name: true,
  owner_id: true,
  org_id: true,
  product_type: true,
  state: true,
  confidence_score: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// ============================================================
// Product Members (V2)
// ============================================================

export const productMembers = pgTable("product_members", {
  id: serial("id").primaryKey(),
  product_id: integer("product_id").references(() => products.id),
  user_id: varchar("user_id").references(() => users.id),
  role: text("role").default("member"),        // 'owner' | 'member'
  joined_at: timestamp("joined_at").default(sql`now()`),
});

export const insertProductMemberSchema = createInsertSchema(productMembers).pick({
  product_id: true,
  user_id: true,
  role: true,
});

export type InsertProductMember = z.infer<typeof insertProductMemberSchema>;
export type ProductMember = typeof productMembers.$inferSelect;

// ============================================================
// Conversations (V2)
// ============================================================

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  product_id: integer("product_id").references(() => products.id),
  user_id: varchar("user_id").references(() => users.id),
  title: text("title"),
  mode: text("mode").default("learner"),
  created_at: timestamp("created_at").default(sql`now()`),
  updated_at: timestamp("updated_at").default(sql`now()`),
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  product_id: true,
  user_id: true,
  title: true,
  mode: true,
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// ============================================================
// Messages (Phase 2 — persistent chat history)
// ============================================================

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversation_id: integer("conversation_id").references(() => conversations.id).notNull(),
  role: text("role").notNull(),    // 'user' | 'assistant'
  content: text("content").notNull(),
  created_at: timestamp("created_at").default(sql`now()`),
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversation_id: true,
  role: true,
  content: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
