# Web Components — AGENTS.md

Reusable UI components for the Glou frontend. Organized by domain.

## Directory Layout

```
web/components/
├── ui/                    → Shared UI primitives, layout, navigation
│   ├── ThemeWrapper.tsx   → Theme provider (HeroUI + theme context)
│   ├── MainLayout.tsx     → App shell (sidebar + content area)
│   ├── Sidebar.tsx        → Navigation sidebar
│   ├── BottomNav.tsx      → Mobile bottom navigation
│   ├── GlobalSearch.tsx   → Navbar instant search across inventory
│   ├── NotificationBell.tsx → Alert/notification bell with badge
│   ├── ConnectivityIndicator.tsx → Online/offline status indicator
│   ├── UndoToast.tsx      → Undo toast notification for recent actions
│   └── ViewToggle.tsx     → Grid/list view toggle button
├── inventory/             → Bottle/inventory components
├── cellars/               → Cellar management components (grid, slots, map)
├── tastings/              → Tasting note components
├── auth/                  → Login, register, 2FA components
├── collections/           → Collection management components
├── admin/                 → Admin panel components (user mgmt, audit log)
├── analytics/             → Dashboard analytics components
└── profile/               → User profile, settings, preferences
```

## Component Patterns

### 'use client' Directive

All interactive components MUST start with `'use client'`:
```tsx
'use client';
import React from 'react';
```

### Props Typing

Always use explicit TypeScript interfaces for props:
```tsx
interface BottomNavProps {
  /** Current active route path */
  activeRoute: string;
  /** Callback when nav item clicked */
  onNavigate: (route: string) => void;
}

export function BottomNav({ activeRoute, onNavigate }: BottomNavProps) {
```

### HeroUI Integration

Components use HeroUI (`@heroui/react`) for:
- Forms: `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`, `Autocomplete`, `DatePicker`
- Layout: `Card`, `Modal`, `Popover`, `Tooltip`, `Divider`, `Spacer`
- Navigation: `Navbar`, `Tabs`, `Breadcrumbs`, `Pagination`
- Feedback: `Toast`, `Progress`, `Spinner`, `Skeleton`, `Badge`
- Data: `Table`, `Chip`, `Avatar`, `Image`
- Actions: `Button`, `Dropdown`, `Menu`, `Kbd`

### Tailwind + HeroUI Composition

```tsx
// Combine Tailwind utilities with HeroUI components
<Card className="p-4 border-1 border-content2 bg-content2/50 dark:border-content3 dark:bg-content3/50">
  <CardBody className="gap-4">
    <Input label="Name" variant="bordered" />
  </CardBody>
</Card>
```

### i18n in Components

```tsx
import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t } = useTranslation();
  return <Button>{t('common.save')}</Button>;
}
```

## Shared UI Components

### MainLayout.tsx
App shell that wraps all authenticated pages. Includes:
- Sidebar navigation (desktop)
- BottomNav (mobile)
- ConnectivityIndicator
- GlobalSearch in header
- NotificationBell
- Content area (`<main>`)

### ThemeWrapper.tsx
Wraps the app with HeroUI `HeroUIProvider` + dynamic theme based on user preferences. Reads user theme from `useMe()` hook.

### GlobalSearch.tsx
Instant search input in navbar. Debounced queries against `/api/search`. Shows results in dropdown popover. Handles keyboard navigation.

### Sidebar.tsx
Desktop navigation sidebar with links to:
- Bottles (inventory)
- Cellars
- Cigars
- Collections
- Tastings
- Analytics
- Admin (if admin)
- Profile

### BottomNav.tsx
Mobile bottom tab bar with same routes as sidebar.

## Feature Components

Each feature domain follows the same pattern:
```
inventory/
├── BottleCard.tsx         → Card display for bottle list/grid
├── BottleForm.tsx         → Add/edit form with contextual fields
├── BottleDetail.tsx       → Full detail view with photo, notes, traceability
├── BottleFilters.tsx      → Category, vintage, cellar filters
├── BottleGrid.tsx         → Grid view (FEAT-68 cellar map integration)
├── BottleList.tsx         → List/table view
├── BulkActionBar.tsx      → Multi-select bulk operations
└── TrashList.tsx          → Trash with restore/permanent-delete
```

## Styling Conventions

- **Tailwind-first**: Prefer Tailwind utility classes over custom CSS
- **HeroUI variants**: Use `variant="bordered"`, `variant="flat"`, etc. for consistent form styling
- **Responsive**: Use `md:`, `lg:` breakpoints for responsive layouts
- **Dark mode**: Use `dark:` prefix for dark mode overrides
- **Theme tokens**: Use HeroUI color tokens (`bg-content1`, `text-foreground`, `border-content2`) instead of hardcoded colors where possible

## Never Do (Components)

- Never use inline styles (`style={{}}`) — use Tailwind classes
- Never use `any` for props — always define interfaces
- Never forget `'use client'` on interactive components
- Never bypass HeroUI components for custom form elements — use HeroUI's form primitives
- Never hardcode French/English strings in components — use `t()` i18n function
- Never import `fs`, `path`, or other Node.js-only modules in components