masa/
│
├─ _architecture/                        # Architecture docs
│  └─ schema-v6.md
│
├─ app/                                  # Next.js App Router
│
│  ├─ (auth)/                            # Auth route group
│  │  └─ signin/
│  │     └─ page.tsx
│  │
│  ├─ (dashboard)/                       # Protected app
│  │
│  │  ├─ dashboard/
│  │  │  ├─ overview/
│  │  │  │  └─ page.tsx
│  │  │  │
│  │  │  ├─ customers/
│  │  │  │  └─ page.tsx
│  │  │  │
│  │  │  ├─ inventory/
│  │  │  │  └─ page.tsx
│  │  │  │
│  │  │  ├─ orders/
│  │  │  │  └─ page.tsx
│  │  │  │
│  │  │  ├─ sales/
│  │  │  │  └─ page.tsx
│  │  │  │
│  │  │  ├─ personnel/
│  │  │  │  └─ page.tsx
│  │  │  │
│  │  │  ├─ notifications/
│  │  │  │  └─ page.tsx
│  │  │  │
│  │  │  ├─ logs/
│  │  │  │  └─ page.tsx
│  │  │  │
│  │  │  ├─ settings/
│  │  │  │  └─ page.tsx
│  │  │  │
│  │  │  ├─ layout.tsx
│  │  │  └─ page.tsx
│  │
│  ├─ api/                               # API Routes
│  │
│  │  ├─ auth/
│  │  │  └─ [...nextauth]/
│  │  │     └─ route.ts
│  │  │
│  │  ├─ admin/
│  │  │  └─ [id]/
│  │  │     └─ route.ts
│  │  │
│  │  ├─ manager/
│  │  │  └─ [id]/
│  │  │     └─ route.ts
│  │  │
│  │  ├─ dev/
│  │  │  └─ [id]/
│  │  │     └─ route.ts
│  │  │
│  │  ├─ dashboard/
│  │  │  └─ route.ts
│  │  │
│  │  ├─ customers/
│  │  │  └─ route.ts
│  │  │
│  │  ├─ inventory/
│  │  │  └─ route.ts
│  │  │
│  │  ├─ orders/
│  │  │  └─ route.ts
│  │  │
│  │  ├─ sales/
│  │  │  └─ route.ts
│  │  │
│  │  ├─ personnel/
│  │  │  └─ route.ts
│  │  │
│  │  ├─ notifications/
│  │  │  └─ route.ts
│  │  │
│  │  └─ logs/
│  │     └─ route.ts
│
│  ├─ layout.tsx
│  ├─ page.tsx
│  └─ favicon.ico
│
├─ middleware.ts                         # Auth protection
│
├─ components/                           # UI + Feature Components
│
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
│  │  ├─ StatCard.tsx
│  │  ├─ Button.tsx
│  │  ├─ Input.tsx
│  │  └─ Table.tsx
│  │
│  └─ shared/                            # Cross-feature primitives
│
├─ server/                               # Backend service layer
│
│  ├─ services/
│  │  ├─ auth.service.ts
│  │  ├─ customers.service.ts
│  │  ├─ inventory.service.ts
│  │  ├─ orders.service.ts
│  │  ├─ sales.service.ts
│  │  └─ personnel.service.ts
│  │
│  ├─ repositories/
│  │  ├─ customers.repo.ts
│  │  ├─ inventory.repo.ts
│  │  ├─ orders.repo.ts
│  │  ├─ sales.repo.ts
│  │  └─ personnel.repo.ts
│  │
│  └─ actions/
│     ├─ createSale.ts
│     ├─ createOrder.ts
│     └─ updateStock.ts
│
├─ dev/                                  # Internal dev modules
│  └─ modules/
│     ├─ auth/
│     ├─ personnel/
│     ├─ customers/
│     ├─ inventory/
│     ├─ orders/
│     ├─ sales/
│     ├─ notifications/
│     └─ logs/
│
├─ hooks/                                # Global reusable hooks
│  ├─ index.ts
│  ├─ useDebounce.ts
│  └─ usePagination.ts
│
├─ providers/                            # Global providers
│  ├─ SessionProvider.tsx
│  ├─ QueryProvider.tsx
│  └─ index.ts
│
├─ lib/
│
│  ├─ authOptions.ts
│  ├─ prisma.ts
│  │
│  ├─ db/
│  │  └─ migrations/
│  │
│  ├─ helpers/
│  │  ├─ authHelpers.ts
│  │  ├─ formatCurrency.ts
│  │  └─ getInitials.ts
│  │
│  ├─ guards/
│  │  ├─ requireAuth.ts
│  │  ├─ requireAdmin.ts
│  │  ├─ requireDev.ts
│  │  └─ requireBranchRole.ts
│  │
│  ├─ validators/
│  │  ├─ customer.schema.ts
│  │  ├─ product.schema.ts
│  │  ├─ order.schema.ts
│  │  └─ sale.schema.ts
│  │
│  └─ rbac/
│     └─ permissions.ts
│
├─ modules/                              # Optional shared domain modules
│
│  ├─ personnel/
│  ├─ customers/
│  ├─ inventory/
│  └─ orders/
│
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts
│
├─ public/
│
├─ scripts/
│  ├─ migrate.ps1
│  └─ seed.ts
│
├─ styles/
│  └─ globals.css
│
├─ tests/
│
│  ├─ unit/
│  │  └─ services.test.ts
│  │
│  ├─ integration/
│  │  └─ api.test.ts
│  │
│  └─ e2e/
│     └─ login.test.ts
│
├─ types/
│
│  ├─ auth.d.ts
│  ├─ personnel.d.ts
│  ├─ customer.d.ts
│  ├─ product.d.ts
│  ├─ order.d.ts
│  ├─ stock.d.ts
│  ├─ notifications.d.ts
│  ├─ enums.d.ts
│  └─ domain.d.ts
│
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