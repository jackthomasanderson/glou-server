import { InventoryCategory } from '@/lib/inventory/types';

// ─── FEAT-04: "Flux Zéro Friction" — default cellar per scanned category ─────
// Deliberately a client-only, localStorage-backed preference rather than a
// new User/SystemConfig column: it is a personal UI convenience ("bottles of
// this category I scan go to that cellar by default"), not shared-inventory
// data or account state that needs to sync across devices/members — same
// reasoning that already governs the sidebar's collapsed/expanded state
// (ux-ui.md 3.1: "L'état est persisté en localStorage").

const STORAGE_KEY = 'glou:scan:defaultCellarByCategory';

type DefaultCellarMap = Partial<Record<InventoryCategory, string>>;

function readMap(): DefaultCellarMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DefaultCellarMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: DefaultCellarMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable/full — the preference just won't persist, non-fatal.
  }
}

export function getDefaultCellarForCategory(category: InventoryCategory): string | null {
  return readMap()[category] ?? null;
}

export function setDefaultCellarForCategory(category: InventoryCategory, cellarId: string | null): void {
  const map = readMap();
  if (cellarId) {
    map[category] = cellarId;
  } else {
    delete map[category];
  }
  writeMap(map);
}
