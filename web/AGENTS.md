# Web — AGENTS.md

Next.js 16 + TypeScript frontend for Glou. Port 3000.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 18, HeroUI (`@heroui/react`), Tailwind CSS
- **State**: TanStack React Query v5
- **Forms**: react-hook-form + @hookform/resolvers (Zod)
- **i18n**: i18next + react-i18next (FR default, EN supported)
- **Auth**: JWT via HttpOnly cookie (auto-sent with `credentials: 'include'`)
- **Icons**: lucide-react
- **Maps**: react-leaflet (cellar location)
- **Drag & Drop**: @dnd-kit (cellar grid map)
- **Charts**: (via analytics components)

## Directory Layout

```
web/
├── app/                    → Next.js App Router pages & layouts
│   ├── layout.tsx          → Root layout (html, body, fonts)
│   ├── page.tsx            → Landing page
│   ├── providers.tsx       → Client providers (QueryClient, I18n, Theme)
│   ├── I18nProvider.tsx    → i18next initialization
│   ├── globals.css         → Tailwind directives + global styles
│   ├── login/              → Login page
│   ├── register/           → Registration page
│   ├── bottles/            → Inventory views (list, detail, add, edit)
│   ├── cellars/            → Cellar management (list, detail, grid map)
│   ├── cigars/             → Cigar-specific views
│   ├── collections/        → Collection management
│   ├── tastings/           → Tasting notes
│   ├── profile/            → User profile, preferences, 2FA, account deletion
│   ├── admin/              → Admin panel (user management, audit log)
│   └── analytics/          → Dashboard analytics
├── components/             → Reusable components (see web/components/AGENTS.md)
├── hooks/                  → TanStack React Query hooks (one file per domain)
│   ├── useAuth.ts          → Auth (login, register, logout, 2FA, preferences, profile)
│   ├── useInventory.ts     → Bottle CRUD, trash, search
│   ├── useCellars.ts       → Cellar CRUD, slot management
│   ├── useCollections.ts   → Collection CRUD
│   ├── useTastings.ts      → Tasting notes CRUD
│   ├── useAlerts.ts        → Peak maturity alerts
│   ├── useAnalytics.ts     → Dashboard analytics
│   ├── useBulkPresets.ts   → Bulk action presets
│   ├── useAdmin.ts         → Admin functions
│   ├── useConnectivity.ts  → Internet connectivity detection
│   ├── useConnectivityWarning.ts → Offline warning banner
│   ├── useHasMounted.ts    → SSR hydration helper
│   └── useViewMode.ts      → Grid/list view toggle
├── lib/                    → API client, theme, i18n config
│   ├── api.ts              → HTTP client (get/post/patch/delete with credentials)
│   ├── theme.ts            → Theme utility functions
│   ├── i18n.ts             → i18next configuration
│   └── */                  → Domain-specific libs (alerts, cellars, inventory, ...)
├── types/                  → TypeScript type declarations
├── public/                 → Static assets
├── tailwind.config.ts      → Tailwind + HeroUI theme configuration
├── tsconfig.json           → strict: true, paths: { "@/*": ["./*"] }
└── vitest.config.ts
```

## React Query Pattern

Every domain has a corresponding hook file in `web/hooks/`. Hooks use TanStack React Query v5:

```typescript
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Query keys are arrays: [domain, ...params]
const INVENTORY_KEY = ['inventory'];

export function useInventory() {
  return useQuery({
    queryKey: INVENTORY_KEY,
    queryFn: () => apiFetch<InventoryItem[]>('/api/inventory'),
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InventoryInput) => apiFetch<InventoryItem>('/api/inventory', {
      method: 'POST', body: JSON.stringify(data)
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVENTORY_KEY }),
  });
}
```

## API Client

`web/lib/api.ts` provides a typed HTTP client:

```typescript
import { client } from '@/lib/api';

// Returns { data: T }
const { data } = await client.get<T>('/inventory');
const { data } = await client.post<T>('/inventory', body);
const { data } = await client.patch<T>('/inventory/123', body);
const { data } = await client.delete<T>('/inventory/123');
```

All requests include `credentials: 'include'` for HttpOnly cookie auth.

## Auth Hooks

Auth hooks (`useAuth.ts`) use React Query directly with `staleTime: Infinity` and `retry: false` for the session query. The `ME_KEY` query key is `['auth', 'me']`. Invalidated on login/logout/register/profile updates.

## i18n

- Default language: French (FR)
- Supported: FR, EN
- Translations loaded via `i18next-fs-backend` (server) and `i18next-http-backend` (browser)
- Use `useTranslation()` hook from `react-i18next`

## Theme / HeroUI

- HeroUI (`@heroui/react`) with custom Tailwind theme
- Dark mode: `class` strategy (toggle class on `<html>`)
- Accent colors: user-configurable via profile preferences
- Theme provided by `web/components/ui/ThemeWrapper.tsx`

## 'use client' Boundaries

- All components using hooks (React Query, useState, useEffect, etc.) MUST have `'use client'` directive
- App Router layout files and pages that are server components do NOT use the directive
- Server components pass data as props to client components

## Styling

- Tailwind CSS utility classes
- HeroUI component library for form inputs, modals, tables, navigation
- Custom components in `web/components/` with Tailwind + HeroUI composition
- Inter font (variable weight) configured in root layout

## Never Do (Web)

- Never suppress TypeScript errors (`as any`, `@ts-ignore`, `@ts-expect-error`)
- Never use `any` in component props or hooks — use proper interfaces
- Never pass secrets to client components
- Never use `localStorage` for sensitive data (use HttpOnly cookies)
- Never mix French and English in code — code is English
- Never import server-only modules in client components