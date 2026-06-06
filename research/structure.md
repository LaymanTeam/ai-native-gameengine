game-gen/                      # the pipeline is the product
├── package.json
├── tsconfig.json
├── src/
│   ├── schema/                # ← declarative core: what content IS
│   │   ├── entity.ts          #   base record + stable-ID helpers
│   │   ├── components/        #   each component as a Zod schema = model's vocabulary
│   │   │   ├── position.ts
│   │   │   ├── npc.ts
│   │   │   └── index.ts
│   │   ├── content.ts         #   top-level artifacts: level, quest, world
│   │   └── index.ts           #   single source of truth; exported for any consumer
│   ├── generation/            # ← prompt → structured output → validate/repair
│   │   ├── client.ts          #   LLMClient interface (provider-agnostic seam)
│   │   ├── providers/         #   anthropic.ts, vertex.ts — swappable adapters
│   │   ├── generate.ts        #   constrained generation against a schema
│   │   ├── repair.ts          #   feed Zod errors back, bounded retry
│   │   └── prompts/           #   templates as data, versioned
│   ├── store/                 # ← append-log content store (event-sourced)
│   │   ├── store.ts           #   ContentStore interface
│   │   ├── events.ts          #   created / edited / regenerated + provenance
│   │   └── adapters/
│   │       ├── file-log.ts    #   default: append-only JSONL, zero infra to run
│   │       └── postgres.ts    #   drop-in for your Supabase/pgmq stack
│   ├── eval/                  # ← what makes it a product, not a script
│   │   ├── scorer.ts          #   Scorer interface: artifact → score
│   │   ├── scorers/           #   schema-validity, diversity, dedup, llm-as-judge
│   │   └── report.ts          #   aggregate + regression across runs
│   ├── runtime/               # ← OPTIONAL, deferred. only if a game loop exists
│   │   └── load.ts            #   records → Miniplex objects (not bitECS)
│   └── cli/                   # ← the interface (no UI): generate | validate | eval | inspect
│       ├── index.ts
│       └── commands/
└── content/                   # generated artifacts land here (file-log adapter)