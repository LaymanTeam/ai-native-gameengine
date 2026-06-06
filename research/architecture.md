# Engine Architecture — Module Interaction Map

> How every module in this repo wires together to produce a game under `generations/<game>/`
> (layout per `generations/info.md`). Agents are LangChain v1 `createAgent` instances; the
> director composes the rest as tools/subagents. Each chat turn advances one pipeline phase
> (Vercel 300s limit), resumable via LangGraph checkpointer.

```mermaid
flowchart TB
    %% ============ SURFACE ============
    subgraph SURFACE["Surface (Vercel)"
        ]
        USER([User])
        VOICE["tools/voice/voice.ts<br/>speech-to-text layer"]
        CHAT["frontend/components/Chat.tsx<br/>Mantine chat UI"]
        ROUTE["app/api/chat/route.ts<br/>Node runtime, streaming"]
        CLERK["auth/clerk.ts + proxy.ts<br/>login / user mgmt"]
        SENDBLUE["auth/sendblue.ts<br/>multiplayer + login msgs"]
    end

    USER -->|speaks| VOICE --> CHAT
    USER -->|types| CHAT
    CLERK -.gates.-> CHAT
    CHAT -->|POST messages| ROUTE

    %% ============ AI CORE ============
    subgraph AICORE["AI core (engine/ai)"]
        PROV["providers.ts<br/>Gemini factories: conversation /<br/>coder / lite / image / search-grounded"]
        TOOLDEFS["tool-definitions.ts<br/>Zod-schemaed tool() wrappers"]
        DIRECTOR["agents/director.ts<br/>conductor — phase-aware, resumable,<br/>human gates at visualizers"]
        DESIGNER["agents/designer.ts<br/>prompt → bounded GDD,<br/>user-confirmed"]
        CODER["agents/coder.ts<br/>systems/ + ui/ code<br/>(GDD + manifest + research injected)"]
        IMGREV["agents/image-reviewer.ts<br/>rubric vs style bible,<br/>3 retries → human"]
        SAG["agents/search-and-get.ts<br/>OpenGameArt / Kenney trawl<br/>+ license provenance"]
        LOGIC["agents/logic-evaluator.ts<br/>truth-table rule verification"]
        PLAY["agents/playtester.ts<br/>headless input-driven invariants"]
        TESTER["agents/tester.ts<br/>authors + runs tests.ts"]
        DEBUG["agents/debugger.ts<br/>minimal-diff repair"]
    end

    ROUTE --> DIRECTOR
    PROV --> DIRECTOR & DESIGNER & CODER & IMGREV & SAG & LOGIC & TESTER & DEBUG
    TOOLDEFS --> DIRECTOR
    DIRECTOR -->|phase 0| DESIGNER
    DIRECTOR -->|phase 1 assets| IMGREV & SAG
    DIRECTOR -->|phase 2 code| CODER
    DIRECTOR -->|phase 3 verify| LOGIC & TESTER & PLAY
    LOGIC -->|spec gap| DESIGNER
    LOGIC -->|impl gap| DEBUG
    TESTER -->|failures| DEBUG
    PLAY -->|violations| DEBUG
    DEBUG -->|minimal diffs| GAME

    %% ============ TOOLS ============
    subgraph TOOLS["Tools (engine/tools) — the agents' hands"]
        VISDIR["visualizers/visual-direction.ts<br/>web search → references/ +<br/>STYLE BIBLE (reports/style.md, config/style.json)"]
        PROTO["visualizers/prototype-still.ts<br/>headless composed-scene screenshot"]
        ASSREV["visualizers/asset-review.ts<br/>human review surface"]
        PIXEL["generators/pixel-art.ts<br/>procedural sprites (node-canvas)"]
        TEXTT["generators/text-trees.ts<br/>JSONIC dialogue trees"]
        FSFX["fetchers/sfx.ts"]
        FMUS["fetchers/music.ts"]
        FFONT["fetchers/fonts.ts<br/>Google Fonts CDN"]
        TRUN["testing/test-runner.ts<br/>tsx child process"]
    end

    DESIGNER --> VISDIR
    VISDIR -->|style bible prepended to EVERY image prompt| IMGREV
    IMGREV -->|gen| PIXEL
    IMGREV -->|escalate| ASSREV --> USER
    SAG --> FSFX & FMUS & FFONT
    CODER --> TEXTT
    TESTER --> TRUN
    PLAY --> PROTO
    PROTO -->|screenshot| IMGREV

    %% ============ GENERATION PLUMBING ============
    subgraph COMPILER["Generation plumbing (engine/compiler)"]
        SCAFF["game-scaffold.ts<br/>writes info.md tree + main.ts"]
        MANIF["asset-manifest.ts<br/>config/ asset↔variable JSON<br/>+ bidirectional validation pass"]
        VITE["vite-creator.ts<br/>Vite 8 project wrap"]
        DEPLOY["vercel-deploy.ts<br/>REST API deploy"]
    end

    DIRECTOR -->|scaffold first| SCAFF
    SCAFF --> GAME
    PIXEL & FSFX & FMUS & FFONT & TEXTT -->|assets land| GAME
    MANIF -->|manifest BEFORE coder runs| CODER
    GAME --> MANIF
    CODER -->|systems/ ui/ saves/| GAME
    DIRECTOR -->|phase 4 ship| VITE --> DEPLOY
    DEPLOY -->|live URL| USER

    %% ============ RUNTIME LAYERS ============
    subgraph RUNTIME["Runtime layers (imported BY every generated game)"]
        ECS["ecs/bitecs.ts<br/>bitECS 0.4 helpers"]
        PIXI["renderer/pixi-js.ts<br/>PixiJS v8"]
        RXDB["storage/rx-db.ts<br/>Zod-schemaed saves"]
        AUDIO["audio/playback.ts"]
        INPUT["input/controller.ts<br/>typed action set"]
    end

    subgraph GAME["generations/&lt;game&gt;/ (per info.md)"]
        GTREE["research/ reports/ assets/ systems/<br/>ui/ saves/ config/ render/ tests/ main.ts"]
    end

    GAME -->|imports| ECS & PIXI & RXDB & AUDIO & INPUT
    PLAY -->|drives actions via| INPUT
    SENDBLUE -.multiplayer/login msgs.-> GAME
```

## Reading the loops

1. **Asset quality loop:** image-gen/pixel-art → image-reviewer (rubric vs style bible) → ≤3 retries → asset-review.ts human gate.
2. **Logic loop:** GDD → logic-evaluator (truth tables) → spec gaps back to designer *before* coding; impl gaps to debugger *after*.
3. **Code quality loop:** coder → tester (tests.ts via test-runner) + playtester (controller-driven invariants + prototype-still vision check) → debugger (minimal diffs) → re-verify.
4. **Human gates:** GDD confirmation (designer), asset escalation (asset-review), deploy approval (director) — all surfaced in the chat.

## Invariants this wiring depends on

- Style bible exists before any image generation (visual-direction is phase 0/1 output).
- `config/` manifest exists before coder runs; validation pass is plain code, not an agent.
- Every fetched asset has `LICENSE.json` provenance (GPL-3.0 compatibility).
- Each chat turn = one director phase; state resumes from checkpointer + the game folder itself.
