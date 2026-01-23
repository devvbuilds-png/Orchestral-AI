# PKB System - Product Knowledge Builder

## Overview

This is an AI-powered Product Knowledge Builder (PKB) system that helps users understand and document their products through intelligent conversation and document analysis. The system uses a multi-agent architecture where specialized AI agents extract, synthesize, and validate product knowledge from various sources including documents, URLs, and founder interviews.

The core concept is the Product Knowledge Core (PKC) - a governed memory system that acts as the single authority layer for product understanding. It maintains a structured Product Knowledge Base (PKB) that stores verified facts, derived insights, and identifies knowledge gaps.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state, localStorage for session persistence
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme configuration supporting light/dark modes
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful endpoints under `/api/*` prefix
- **Build**: esbuild for server bundling, Vite for client

### Multi-Agent System
The system employs specialized AI agents that work together:

1. **Information Extractor** (`server/agents/information-extractor.ts`): Extracts structured facts from documents and URLs
2. **Product Synthesizer** (`server/agents/product-synthesizer.ts`): Generates derived insights and product briefs from extracted facts
3. **Gap Identifier** (`server/agents/gap-identifier.ts`): Identifies missing information and prioritizes what to ask next
4. **Product Interviewer** (`server/agents/product-interviewer.ts`): Conducts conversational interviews with founders to fill gaps
5. **Product Explainer** (`server/agents/product-explainer.ts`): Answers questions about the product based on stored knowledge

### PKC (Product Knowledge Core) Components
- **PKB Storage** (`server/services/pkb-storage.ts`): File-based JSON storage with atomic writes and snapshot versioning
- **PKC Curator** (`server/services/pkc-curator.ts`): Validates and applies updates to the PKB with conflict detection
- **Ingestion Service** (`server/services/ingestion-service.ts`): Processes uploaded files (PDF, DOCX, TXT) and fetches URL content

### Data Flow
1. User uploads documents or provides URLs
2. Ingestion service extracts and chunks text
3. Information Extractor agent identifies facts
4. PKC Curator validates and stores facts in PKB
5. Product Synthesizer generates insights
6. Gap Identifier finds missing information
7. Product Interviewer fills gaps through conversation

### Session Management
- Sessions are stored client-side in localStorage
- Each session has its own PKB stored server-side in `pkb_store/{sessionId}/`
- Sessions track state progression: product_type_selection → onboarding → learning → ready
- Two chat modes: "learner" (building knowledge) and "explainer" (answering questions)

## External Dependencies

### AI/LLM Integration
- **OpenAI API**: Primary LLM provider via Replit AI Integrations
- **Environment Variables**: 
  - `AI_INTEGRATIONS_OPENAI_API_KEY`: API key for OpenAI
  - `AI_INTEGRATIONS_OPENAI_BASE_URL`: Custom base URL for Replit's AI proxy
- **Model**: gpt-4o (configured in `server/agents/base-agent.ts`)

### Key Features
- **Session Naming**: Users must name their product before starting a session (`session-naming-dialog.tsx`)
- **Session Rename**: Editable from three-dots menu on each session in sidebar
- **Processing Overlay**: Shows during uploads, URL fetches, and analysis with explanatory text - remains visible until AI responds (`processing-overlay.tsx`)
- **Confidence Bar**: Colored bar at top of chat showing knowledge confidence, hover-expandable (`confidence-bar.tsx`)
- **User Refusal Handling**: Tracks declined fields, excludes from future gap questions
- **Explainer Override**: Switch to use explainer mode before high confidence with warning (`mode-toggle.tsx`)
- **Explainer Welcome**: Fresh welcome message added to chat when entering explainer mode, with partial knowledge warning if override enabled
- **Initial Summary**: AI reviews and summarizes learned information before asking questions

### Database
- **PostgreSQL**: Database via Drizzle ORM (connection via `DATABASE_URL`)
- **Schema Location**: `shared/schema.ts`
- **Migrations**: `./migrations/` directory managed by drizzle-kit
- **Tables**: users, conversations, messages

### File Processing
- **multer**: File upload handling (50MB limit)
- **pdf-parse**: PDF text extraction
- **cheerio**: HTML parsing for URL content extraction
- **axios**: HTTP client for fetching URLs

### Session Storage
- **connect-pg-simple**: PostgreSQL session store for Express
- **memorystore**: In-memory session store fallback

### Audio Integration (Replit Integrations)
Located in `server/replit_integrations/audio/`:
- Speech-to-text and text-to-speech capabilities
- WebM to WAV conversion via ffmpeg
- AudioWorklet for streaming playback

### Image Generation (Replit Integrations)
Located in `server/replit_integrations/image/`:
- Image generation via gpt-image-1 model

### Batch Processing (Replit Integrations)
Located in `server/replit_integrations/batch/`:
- Rate-limited concurrent API calls with automatic retries