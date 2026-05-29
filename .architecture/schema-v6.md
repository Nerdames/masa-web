C:\Users\chibu\Projects\Next\masa\
├── .architecture/
│   └── schema-v6.md
├── prisma/
│   └── schema.prisma
├── public/
├── src/
│   ├── app/                                  # Presentation, Layout Routing & Security Entrypoints Only
│   │   ├── (auth)/                           # Public Authentication App Group
│   │   │   ├── error/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   ├── reset-password/
│   │   │   │   └── page.tsx
│   │   │   ├── signin/
│   │   │   │   └── page.tsx
│   │   │   ├── support/
│   │   │   │   └── page.tsx
│   │   │   └── welcome/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/                      # Authenticated Internal Management App Shell
│   │   │   ├── admin/
│   │   │   │   └── page.tsx
│   │   │   ├── audit/
│   │   │   │   └── page.tsx
│   │   │   ├── feedback/                     # Relocated: Flattened into dashboard layout context
│   │   │   │   └── page.tsx
│   │   │   ├── notifications/                # Relocated: Flattened into dashboard layout context
│   │   │   │   └── page.tsx
│   │   │   ├── settings/                     # Relocated: Consolidated nested configurations
│   │   │   │   ├── notifications/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── preferences/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── profile/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── (terminal)/                       # Ultra-lightweight Isolated Point-of-Sale Shell
│   │   │   ├── inventory/
│   │   │   │   └── page.tsx
│   │   │   ├── pos/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── api/                              # Stateless HTTP Transport Controllers
│   │   │   ├── approvals/ route.ts
│   │   │   ├── audit/ route.ts
│   │   │   ├── auth/ route.ts
│   │   │   ├── branches/ route.ts
│   │   │   ├── calendar/ route.ts
│   │   │   ├── categories/ route.ts
│   │   │   ├── customers/ route.ts
│   │   │   ├── inventory/ route.ts
│   │   │   ├── invoices/ route.ts
│   │   │   ├── logs/ route.ts
│   │   │   ├── myorg/ route.ts
│   │   │   ├── notifications/ route.ts
│   │   │   ├── orders/ route.ts
│   │   │   ├── organizations/
│   │   │   │   └── route.ts
│   │   │   ├── overview/ route.ts
│   │   │   ├── payments/ route.ts
│   │   │   ├── personnels/ route.ts
│   │   │   ├── preferences/ route.ts
│   │   │   ├── products/ route.ts
│   │   │   ├── profile/ route.ts
│   │   │   ├── refunds/ route.ts
│   │   │   ├── register/
│   │   │   │   └── route.ts
│   │   │   ├── sales/ route.ts
│   │   │   ├── stats/ route.ts
│   │   │   ├── support/ route.ts
│   │   │   ├── transfers/ route.ts
│   │   │   ├── uoms/ route.ts
│   │   │   └── vendors/ route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── infrastructure/                       # External Stateful Gateway Allocations (Pure I/O Client Init)
│   │   ├── auth/
│   │   ├── cache/
│   │   ├── prisma/
│   │   │   └── client.ts                     # Migrated out of src/core/lib/prisma.ts
│   │   ├── pusher/
│   │   │   └── client.ts                     # Migrated out of src/core/lib/pusher.ts
│   │   ├── redis/
│   │   │   └── client.ts                     # Migrated out of src/core/lib/redis.ts
│   │   └── queue/
│   │
│   ├── modules/                              # Self-Contained Business Domain Modules (Portable & Isolated)
│   │   ├── auth/
│   │   │   ├── components/                   # AccessDenied, EmailChangeModal, PasswordChangeModal
│   │   │   └── index.ts
│   │   ├── audit/
│   │   ├── branches/
│   │   ├── feedback/                         # Extracted domain boundaries
│   │   ├── inventory/
│   │   ├── myorg/
│   │   ├── notifications/                    # Components, Hooks (usePusherNotifications), Services
│   │   ├── personnel/
│   │   │   ├── components/                   # PersonnelDetailsPanel, PersonnelRow, PropertyRow, etc.
│   │   │   ├── server/
│   │   │   │   ├── personnel.service.ts
│   │   │   │   └── personnel.repository.ts
│   │   │   ├── types/
│   │   │   ├── utils/
│   │   │   └── index.ts                      # Strict Domain Entrypoint Module Contract
│   │   ├── sales/
│   │   └── settings/
│   │
│   ├── server/                               # Pure, Isolated Server Runtime Engines
│   │   ├── events/                           # Central Application Event Aggregation Core
│   │   │   ├── bus.ts
│   │   │   ├── handlers.ts
│   │   │   ├── register.ts
│   │   │   └── types.ts
│   │   ├── permissions/                      # Mandatory Access Control Engine
│   │   │   ├── cache.ts                      # Migrated out of src/core/lib/permissionCache.ts
│   │   │   └── enforcer.ts                   # Migrated out of src/core/lib/permission.ts
│   │   ├── security/                         # Inflexible Structural Route Guarding
│   │   │   └── guards.ts                     # Migrated out of src/core/lib/actions.ts
│   │   ├── repositories/
│   │   └── services/
│   │
│   ├── shared/                               # Global Shared Domain-Agnostic Utilities & Primitives
│   │   ├── components/
│   │   │   ├── calendar/                     # MasaCalendar.tsx
│   │   │   ├── layout/                       # AdminOverview, Sidebar, TopBar, SidePanelContext
│   │   │   └── modals/                       # ConfirmModal, ResetModal, SummarySettingsModal, ExportModal
│   │   ├── hooks/                            # useDebounce.ts, useDataTablePreference.ts
│   │   ├── types/                            # Global System Types & API Response Definitions
│   │   ├── ui/                               # Atomic primitives (Buttons, Inputs, Tooltips)
│   │   └── utils/                            # Pure function tool belts
│   │
│   ├── middleware.ts                         # Edge Network Request Router Matrix
│   └── proxy.ts
├── env
├── eslint.config.mjs
├── next.config.ts
├── package.json
└── tsconfig.json