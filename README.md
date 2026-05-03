# NitiYantra — Governance Intelligence Platform

> **Hackathon Project · Hack2Skills PS2**  
> An AI-powered election & policy intelligence superplatform built for India.

---

## ✨ Features

| Module | Description |
|---|---|
| **AI Assistant** | Multi-provider chat with Groq · Gemini · Cerebras · NIM and automatic fallback |
| **Policy Simulator** | 4 AI agents (Professor, Activist, Journalist, Citizen) debate any topic in parallel |
| **Civic Planner** | Election Q&A powered by 4 personas with Indian voter context |
| **Intelligence Feed** | 5-step news pipeline: Summarise → Classify → Score → Scheme Extract → Tag Regions |
| **Voice Commands** | Browser Speech API + Groq Whisper STT with Edge TTS voice output |
| **Dashboard** | Real-time provider health, latency charts, circuit-breaker status |
| **Admin** | Full model analytics, A/B test controls, provider performance heatmaps |

---

## 🤖 AI Providers (all free tier)

| Provider | Key Env Var | Used For |
|---|---|---|
| **Groq** | `GROQ_API_KEY` | Professor agent, Citizen agent, Relevance scoring, Chat |
| **Google Gemini** | `GOOGLE_AI_KEY` | Activist agent, Summarisation, Regional tagging |
| **Cerebras** | `CEREBRAS_API_KEY` | Journalist agent, fast inference |
| **NVIDIA NIM** | `NIM_API_KEY` | Scheme extraction, Citizen fallback |
| **Firebase Admin** | `FIREBASE_*` | Firestore analytics, circuit-breaker state |

> Together AI has been **removed** — all agents now run on free-tier providers.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Setup

```bash
git clone https://github.com/j25aiml192-hash/h2sps2.git
cd h2sps2
npm install
```

Copy the environment template and fill in your keys:

```bash
cp .env.example .env.local
```

Required variables:

```env
GROQ_API_KEY=gsk_...
GOOGLE_AI_KEY=AIzaSy...
CEREBRAS_API_KEY=csk_...
NIM_API_KEY=nvapi-...
FIREBASE_PROJECT_ID=your-project
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
NEWS_API_KEY=optional
```

### Run Locally

```bash
npm run dev
# Open http://localhost:3000
```

---

## 🏗 Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # AI Assistant (home)
│   ├── debate/page.tsx     # Policy Simulator
│   ├── election/page.tsx   # Civic Planner
│   ├── news/page.tsx       # Intelligence Feed
│   ├── voice/page.tsx      # Voice Commands
│   ├── dashboard/page.tsx  # Dashboard
│   └── admin/page.tsx      # Admin analytics
├── components/
│   └── AppShell.tsx        # Shared header + nav (single source of truth)
└── lib/
    ├── ai-providers.ts     # Groq · Gemini · Cerebras · NIM provider classes
    ├── agent-configs.ts    # 4 debate agent personas + routing config
    ├── agent-router.ts     # Parallel agent orchestration with timeouts
    ├── news-pipeline.ts    # 5-step news processing pipeline
    └── firebase-admin.ts   # Firebase Admin SDK singleton
```

### Agent Routing

| Agent | Primary | Fallback | Persona |
|---|---|---|---|
| Professor | Groq `llama-3.1-70b-versatile` | NIM `llama-3.1-70b-instruct` | Academic researcher |
| Activist | Gemini `gemini-2.0-flash-exp` | Groq `mixtral-8x7b` | Grassroots organiser |
| Journalist | Cerebras `llama3.1-70b` | Groq `llama-3.1-70b` | Investigative reporter |
| **Citizen** | **Groq `llama-3.1-8b-instant`** | **NIM `llama-3.1-8b-instruct`** | **Amit Patil — first-time voter** |

### News Pipeline

```
Raw Article
  │
  ├─[Wave A parallel]─────────────────────────────────────┐
  │  Step 1: Summarise        (Gemini 1.5 Flash)          │
  │  Step 4: Scheme Extract   (NIM Llama 70B)             │
  │  Step 5: Regional Tag     (Gemini 1.5 Flash)          │
  └────────────────────────────────────────────────────────┤
                                                           │
  ├─[Wave B parallel, on summary]──────────────────────────┤
  │  Step 2: Classify         (Groq Llama 3.1 8B)         │
  │  Step 3: Relevance Score  (Groq Llama 3.1 8B)         │
  └────────────────────────────────────────────────────────┘
         ↓
  ProcessedArticle (scored, categorised, scheme-extracted)
         ↓
  Score ≥ 0.8 → Auto-trigger 4-agent debate
```

---

## 🎨 Design System

- **Font**: Plus Jakarta Sans (Golden Ratio type scale)
- **Theme**: High-contrast light — `#09090b` ink on `#ffffff` canvas
- **Spacing**: Golden Ratio tokens (`sm:16px`, `md:26px`, `lg:42px`, `xl:68px`)
- **Icons**: Lucide React (zero emoji in production UI)
- **Colors**: Pastel-tinted agent cards (Blue / Red / Amber / Green)

---

## 🔐 Security Notes

- `.env.local` is in `.gitignore` — API keys are never committed
- Firebase Private Key stored as env var (not a file)
- Circuit-breaker automatically disables a failing provider for 5 minutes
- All API routes are server-side only (Next.js App Router)

---

## 📦 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 3 + Vanilla CSS
- **AI SDKs**: `groq-sdk`, `@google/generative-ai`
- **Database**: Firebase Firestore (Admin SDK)
- **Charts**: Recharts
- **Icons**: Lucide React
- **Tests**: Vitest + Playwright

---

## 🧪 Tests

```bash
npm run test          # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)
npm run type-check    # TypeScript check
npm run lint          # ESLint
```

---

## 🚢 Deployment

Optimised for **Vercel**:

```bash
npx vercel --prod
```

Set all env vars in the Vercel dashboard under **Settings → Environment Variables**.

---

## 👥 Team

Built for **Hack2Skills PS2** hackathon — NitiYantra team.
