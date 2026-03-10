masa/
├─ _architecture/                 # Architecture docs & decisions
│  └─ schema-v6.md

├─ app/                            # Next.js App Router
│  ├─ api/
│  │  ├─ admin/
│  │  │  └─ [id]/route.ts
│  │  ├─ manager/
│  │  │  └─ [id]/route.ts
│  │  ├─ dev/
│  │  │  └─ [id]/route.ts
│  │  ├─ dashboard/
│  │  │  └─ [id]/route.ts
│  │  └─ auth/
│  │     └─ [...nextauth]/route.ts
│  │
│  ├─ auth/
│  │  ├─ signin/
│  │  │  └─ page.tsx
│  │  └─ middleware.ts
│  │
│  ├─ dashboard/
│  │  ├─ Overview/
│  │  │  └─ page.tsx
│  │  ├─ customers/
│  │  │  └─ page.tsx
│  │  ├─ inventory/
│  │  │  └─ page.tsx
│  │  ├─ orders/
│  │  │  └─ page.tsx
│  │  ├─ sales/
│  │  │  └─ page.tsx
│  │  ├─ settings/
│  │  │  └─ page.tsx
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  │
│  ├─ hooks/
│  │  └─ hooksPlaceholder.ts
│  │
│  ├─ providers/
│  │  └─ SessionProvider.tsx
│  │
│  ├─ favicon.ico
│  ├─ layout.tsx
│  └─ page.tsx

├─ components/                     # UI & feature components
│  ├─ dashboard/
│  │  ├─ DashboardCard.tsx
│  │  ├─ CustomersTable.tsx
│  │  └─ SalesChart.tsx
│  │
│  ├─ personnel/
│  │  ├─ PersonnelCard.tsx
│  │  └─ PersonnelForm.tsx
│  │
│  ├─ customers/
│  │  ├─ CustomerCard.tsx
│  │  └─ CustomerForm.tsx
│  │
│  ├─ inventory/
│  │  ├─ ProductCard.tsx
│  │  └─ StockList.tsx
│  │
│  ├─ orders/
│  │  ├─ OrderCard.tsx
│  │  └─ OrderList.tsx
│  │
│  ├─ sales/
│  │  ├─ SaleCard.tsx
│  │  └─ SalesList.tsx
│  │
│  ├─ notifications/
│  │  ├─ NotificationItem.tsx
│  │  └─ NotificationList.tsx
│  │
│  ├─ logs/
│  │  ├─ ActivityLogItem.tsx
│  │  └─ ActivityLogList.tsx
│  │
│  ├─ settings/
│  │  ├─ PreferencesCard.tsx
│  │  └─ SettingsForm.tsx
│  │
│  ├─ feedback/
│  │  ├─ AccessDenied.tsx
│  │  ├─ Unauthorized.tsx
│  │  ├─ ToastProvider.tsx
│  │  ├─ Tooltip.tsx
│  │  └─ PersonnelFormModal.tsx
│  │
│  ├─ layout/
│  │  ├─ Sidebar.tsx
│  │  └─ TopBar.tsx
│  │
│  ├─ modal/
│  │  ├─ ConfirmModal.tsx
│  │  └─ CrudModal.tsx
│  │
│  ├─ ui/
│  │  ├─ SectionTitle.tsx
│  │  └─ StatCard.tsx
│  │
│  └─ shared/                      # Cross-feature primitives

├─ dev/
│  └─ modules/                     # Domain-driven backend logic
│     ├─ auth/
│     ├─ personnel/
│     ├─ customers/
│     ├─ inventory/
│     ├─ orders/
│     ├─ sales/
│     ├─ notifications/
│     └─ logs/

├─ hooks/                          # Global reusable hooks
│  └─ index.ts

├─ lib/
│  ├─ authOptions.ts
│  ├─ prisma.ts
│  ├─ db/
│  ├─ helpers/
│  │  └─ authHelpers.ts
│  └─ guards/
│     ├─ requireAuth.ts
│     ├─ requireAdmin.ts
│     ├─ requireDev.ts
│     └─ requireBranchRole.ts

├─ modules/                        # Shared domain services (optional)
│  ├─ personnel/
│  ├─ customers/
│  ├─ inventory/
│  └─ orders/

├─ prisma/
│  ├─ schema.prisma                # ✅ schema v6 (final)
│  └─ seed.ts

├─ providers/
│  └─ index.ts

├─ public/

├─ scripts/
│  └─ migrate.ps1

├─ styles/
│  └─ globals.css

├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/

├─ types/
│  ├─ auth.d.ts
│  ├─ personnel.d.ts
│  ├─ customer.d.ts
│  ├─ product.d.ts
│  ├─ order.d.ts
│  ├─ stock.d.ts
│  ├─ notifications.d.ts
│  ├─ enums.d.ts
│  └─ domain.d.ts

├─ .env
├─ .gitignore
├─ eslint.config.mjs
├─ next-env.d.ts
├─ next.config.ts
├─ postcss.config.mjs
├─ prisma.config.ts
├─ tsconfig.json
├─ package.json
├─ package-lock.json
└─ README.md
