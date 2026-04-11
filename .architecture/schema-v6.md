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





      <section className="px-6 pt-6 pb-2">
        <div className="flex items-center gap-2 mb-4 px-2">
          <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Operations Hub</h2>
          <div className="h-px bg-slate-200 flex-1"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {authorizedModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <a 
                key={mod.id} 
                href={mod.href}
                className="group flex flex-col items-start p-3 bg-white rounded-xl border border-slate-200/60 hover:border-blue-200 hover:shadow-md transition-all cursor-pointer"
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${mod.color} text-white flex items-center justify-center mb-2 shadow-sm group-hover:scale-105 transition-transform`}>
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-[12px] font-bold text-slate-900 leading-tight">{mod.title}</h3>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{mod.descriptionSm}</p>
              </a>
            );
          })}
        </div>
      </section>