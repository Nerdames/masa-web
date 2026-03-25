masa/
├── .architecture/             # RFCs, ADRs, and Schema v6 docs
├── prisma/                    # Database Configuration
│   ├── schema.prisma          # ✅ Schema v6 (Final)
│   └── seed.ts                # NGN-specific seed data (Currencies, Roles)
├── public/                    # Minimal static assets (SVG only)
├── src/                       # All source code moved here for a clean root
│   ├── app/                   # NEXT.JS APP ROUTER (Role-Isolation Layer)
│   │   ├── (auth)/            # Auth Group
│   │   │   ├── sign-in/
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/       # MANAGEMENT INTERFACES (Sidebar Layout)
│   │   │   ├── admin/         # Org/Branch management
│   │   │   ├── inventory/     # Stock/Products
│   │   │   ├── sales/         # Analytics/Reports
│   │   │   ├── audit/         # Read-only ledger views
│   │   │   └── layout.tsx     # The "Dashboard" Layout (Sidebar + TopBar)
│   │   ├── (pos)/             # TASK-ORIENTED WORKSPACE (No Sidebar)
│   │   │   ├── checkout/
│   │   │   └── layout.tsx     # Full-screen "Operational" Layout
│   │   ├── api/               # Essential Webhooks/Third-party integrations
│   │   └── layout.tsx         # Root Layout (Providers, Toast, Fonts)
│   │
│   ├── modules/               # DOMAIN LAYER (The Engine)
│   │   ├── sales/             # Each module is self-contained:
│   │   │   ├── actions.ts     # Server Actions (Mutations)
│   │   │   ├── components/    # Domain-specific UI (SaleCard, etc.)
│   │   │   ├── services/      # Business Logic & Math (Tax/NGN calcs)
│   │   │   ├── repository.ts  # Prisma database queries
│   │   │   ├── schema.ts      # Zod validation schemas
│   │   │   └── types.ts       # Domain-specific TypeScript interfaces
│   │   ├── inventory/         # [Same internal structure]
│   │   ├── accounting/        # [Same internal structure]
│   │   ├── personnel/         # [Same internal structure]
│   │   └── audit/             # Logic for immutable ActivityLogs
│   │
│   ├── core/                  # INFRASTRUCTURE LAYER (Shared Primitives)
│   │   ├── components/        # UI primitives (DataTables, Inputs, Buttons)
        ├── events/
│   │   ├── lib/               # Singleton instances (Prisma, AuthOptions)
│   │   ├── guards/            # RBAC utilities (checkPermission, requireRole)
│   │   ├── hooks/             # Utility hooks (useDebounce, useMediaQuery)
│   │   ├── utils/             # Formatters (NGN Currency, Date formatting)
│   │   └── providers/         # Global Contexts (Auth, Theme)
│   │
│   └── types/                 # Global/Shared Types (next-auth.d.ts, etc.)
├── tests/                     # Unit, Integration, and Playwright E2E
├── .env                       # Environment Secrets
├── next.config.ts             # Performance tweaks (Asset prefixes, etc.)
└── package.json