'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsClient, type AddUnitsInput, type UnitWrite } from '@/lib/products/client';
import { detailWithUnitWrite, productsFromFlatItems, UNIT_FIELD_SET, withUnitChanges } from '@/lib/products/fromFlat';
import { wineName } from '@/lib/products/stock';
import { NetworkError } from '@/lib/network-error';
import type { Product, ProductDetailView, ProductItem, TrashedProduct } from '@/lib/products/types';
import { BULK_WINES_ERRORS, type BulkStockResult, type BulkWinesAction, type ProductDescription } from '@shared/product';
import { getAllQueuedMutations, getCachedInventory, type QueuedMutation } from '@/lib/offline/db';
import { overlayChanges, unitInStock, type UnitLike } from '@/lib/offline/optimistic';
import { notifyError, notifySuccess } from '@/lib/toast';
import { SIDEBAR_COUNTS_KEY } from '@/hooks/useSidebarCounts';

/**
 * #471 (D9): the list of wines. Under the `inventory` prefix on purpose: every
 * change to a bottle that refreshes the flat list (`['inventory']`) refreshes
 * the wines too.
 */
export const PRODUCTS_KEY = ['inventory', 'products'];
const PRODUCTS_TRUNCATED_KEY = ['inventory-meta', 'products-truncated'];

/**
 * #585: a bottle change still waiting in the offline queue stays on screen.
 * Only the bottle's own fields are overlaid; a description change shows once
 * sent. FEAT-108: a copy opened, drunk or smoked out of a group shows on its
 * own line (provisional), the group one fewer; the card lists what is in the cellar.
 */
async function overlayQueuedUnitChanges(products: Product[]): Promise<Product[]> {
  let queued: QueuedMutation[];
  try {
    queued = (await getAllQueuedMutations()).filter((m) => m.status !== 'conflict');
  } catch {
    return products;
  }
  if (queued.length === 0) return products;
  return products.map((product) => {
    const items = withQueued(product.items, queued);
    return items === product.items ? product : { ...product, items: items.filter((item) => unitInStock(item as unknown as UnitLike)) };
  });
}

/** `items` with the queued changes made on them laid over (the same array when none is). */
function withQueued(items: ProductItem[], queued: readonly QueuedMutation[]): ProductItem[] {
  const own = queued.filter((m) => items.some((item) => item.id === m.itemId));
  if (own.length === 0) return items;
  return overlayChanges(items as unknown as UnitLike[], own.map((m) => ({ ...m, patch: unitFieldsOf(m) }))) as unknown as ProductItem[];
}

/** The drawer's copies with the changes still waiting on this device. */
async function overlayQueuedOnDetail(items: ProductItem[]): Promise<ProductItem[]> {
  try {
    return withQueued(items, (await getAllQueuedMutations()).filter((m) => m.status !== 'conflict'));
  } catch {
    return items;
  }
}

/** The bottle's own fields of a queued change (a correction keeps its number and reason). */
function unitFieldsOf(m: QueuedMutation): Record<string, unknown> {
  if (m.kind === 'correct') return m.patch;
  return Object.fromEntries(Object.entries(m.patch).filter(([field]) => UNIT_FIELD_SET.has(field) || field === 'smokeOne'));
}

/** #475: true when the list only holds the 2,000 most recent wines. */
export function useProductsTruncated(): boolean {
  const { data } = useQuery<boolean>({
    queryKey: PRODUCTS_TRUNCATED_KEY,
    queryFn: () => false,
    enabled: false,
    staleTime: Infinity,
  });
  return data === true;
}

/**
 * The wines with their bottles in stock, wines without any left included
 * ("Plus en cave"). Offline, rebuilt from the flat inventory mirrored to
 * IndexedDB (FEAT-16/23), so the list can still be browsed.
 */
export function useProducts(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  return useQuery<Product[]>({
    queryKey: PRODUCTS_KEY,
    queryFn: async () => {
      try {
        const { data, truncated } = await productsClient.list();
        queryClient.setQueryData(PRODUCTS_TRUNCATED_KEY, truncated);
        return await overlayQueuedUnitChanges(data);
      } catch (error) {
        const cached = await getCachedInventory().catch(() => []);
        if (cached.length > 0) return productsFromFlatItems(cached);
        throw error;
      }
    },
    staleTime: 1000 * 30,
    enabled: options?.enabled ?? true,
    // FEAT-108: tried even offline, so the offline copy is reached (see useInventory).
    networkMode: 'always',
  });
}

/** Cache key of a wine's detail; under `inventory`, so a bottle change refreshes it too. */
export const productDetailKey = (id: string | null) => ['inventory', 'product', id];

/** A wine's detail: its drawer, and the tastings the trash confirmation warns about. */
export function useProductDetail(id: string | null) {
  const queryClient = useQueryClient();
  return useQuery<ProductDetailView>({
    queryKey: productDetailKey(id),
    queryFn: async () => {
      try {
        const detail = await productsClient.get(id as string);
        // FEAT-108: the changes still waiting show in the drawer too.
        return { ...detail, items: await overlayQueuedOnDetail(detail.items) };
      } catch (error) {
        // FEAT-108: without network, the drawer opens on what the device
        // knows of the wine (its card, the offline copy) — enough to open,
        // drink or correct a line; tastings and history come with the network.
        const known = error instanceof NetworkError ? await knownWine(queryClient, id as string) : undefined;
        if (known) return known;
        throw error;
      }
    },
    enabled: !!id,
    // FEAT-108: tried even offline, so the drawer opens on what the device knows.
    networkMode: 'always',
  });
}

/**
 * The drawer as last shown (already with the changes waiting), else the wine
 * as its card shows it, else rebuilt from the offline copy.
 */
async function knownWine(queryClient: ReturnType<typeof useQueryClient>, id: string): Promise<ProductDetailView | undefined> {
  const shown = queryClient.getQueryData<ProductDetailView>(productDetailKey(id));
  if (shown) return shown;
  const product = queryClient.getQueryData<Product[]>(PRODUCTS_KEY)?.find((p) => p.id === id)
    ?? productsFromFlatItems(await getCachedInventory().catch(() => [])).find((p) => p.id === id);
  return product ? ({ ...product, tastings: [], history: [] } as unknown as ProductDetailView) : undefined;
}

/**
 * FEAT-112: a wine's messages name what it is (« ce vin », « ce spiritueux »,
 * « ce cigare »), read from the cached list; the wine wording by default.
 */
function productCtx(queryClient: ReturnType<typeof useQueryClient>, id: string, known?: string): { context: string } | undefined {
  // A wine in the trash has left the list: its category is read from the trash too.
  const category = known
    ?? queryClient.getQueryData<Product[]>(PRODUCTS_KEY)?.find((product) => product.id === id)?.category
    ?? queryClient.getQueryData<TrashedProduct[]>(['inventory', 'products-trash'])?.find((product) => product.id === id)?.category;
  return category === 'cigar' || category === 'spirit' ? { context: category } : undefined;
}

/** Wines in the trash (D10), refreshed with every bottle change (`inventory` prefix). */
export function useProductsTrash() {
  return useQuery<TrashedProduct[]>({
    queryKey: ['inventory', 'products-trash'],
    queryFn: productsClient.listTrash,
    staleTime: 1000 * 60,
  });
}

/** "Mettre ce vin à la corbeille": the wine and all its bottles (D10), undone by {@link useRestoreProduct}. */
export function useTrashProduct() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    meta: { handlesError: true },
    mutationFn: productsClient.trash,
    onSuccess: (_result, id) => {
      queryClient.setQueryData<Product[]>(PRODUCTS_KEY, (old) => old?.filter((product) => product.id !== id));
    },
    onError: (_error, id) => notifyError('toast.product.deleteError', productCtx(queryClient, id)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
    },
  });
}

export function useRestoreProduct() {
  const queryClient = useQueryClient();
  return useMutation<Product, Error, string>({
    meta: { handlesError: true },
    mutationFn: productsClient.restore,
    onSuccess: (product) => notifySuccess('toast.product.restoreSuccess', productCtx(queryClient, product.id, product.category)),
    onError: (_error, id) => notifyError('toast.product.restoreError', productCtx(queryClient, id)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
    },
  });
}

/**
 * #471 (FEAT-111): "Déplacer", "Mettre à la corbeille" or "Marquer comme bus"
 * on the wines selected — all of it or nothing (D18). Every list, drawer,
 * cellar and counter that shows those bottles is read again afterwards.
 */
export function useBulkWines() {
  const queryClient = useQueryClient();
  return useMutation<BulkStockResult, Error, BulkWinesAction>({
    meta: { handlesError: true },
    mutationFn: productsClient.bulk,
    // A refusal the dialog can name (a wine with fewer bottles left, a line
    // over the maximum, a cellar deleted meanwhile); any other one is generic.
    onError: (error) => notifyError((BULK_WINES_ERRORS as readonly string[]).includes(error.message)
      ? `bulkWines.errors.${error.message}` : 'bulkWines.error'),
    onSettled: () => {
      // The wines, their drawers, the flat list and the trash all live under `inventory`.
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['budget'] });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export interface UpdateProductVariables {
  id: string;
  patch: Partial<ProductDescription>;
  /** The wine's version the form started from (#572). */
  expectedUpdatedAt?: string;
  /** Its category, for the words of a refusal (« ce cigare »); else read from the cached list. */
  category?: string;
}

/**
 * FEAT-92 c4: "Modifier" on a wine writes its description once, for every
 * bottle. A change made meanwhile by someone else is refused (409) and
 * reported; the form stays open with what was typed.
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation<Product, Error, UpdateProductVariables>({
    meta: { handlesError: true },
    mutationFn: ({ id, patch, expectedUpdatedAt }) => productsClient.update(id, patch, expectedUpdatedAt),
    onSuccess: (saved) => {
      queryClient.setQueryData<Product[]>(PRODUCTS_KEY, (old) =>
        old?.map((product) => (product.id === saved.id ? saved : product)));
    },
    onError: (error, { id, category }) => {
      const context = productCtx(queryClient, id, category);
      if (error.message === 'CONFLICT') {
        notifyError('familyDrawer.form.conflict', context);
        return;
      }
      notifyError(error.message === 'VALIDATION_ERROR' ? 'familyDrawer.form.rejected' : 'familyDrawer.form.error', context);
    },
    onSettled: (_saved, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: productDetailKey(id) });
      // The flat bottles carry the description too (transitional copy).
      void queryClient.invalidateQueries({ queryKey: ['inventory'], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export interface AddUnitsVariables {
  /** The wine the bottles are added to (its name goes into the message; cigars are counted in cigars). */
  product: Pick<Product, 'id' | 'name' | 'vintage'> & Partial<Pick<Product, 'category'>>;
  input: AddUnitsInput;
}

const ADD_UNITS_REFUSALS: Record<string, string> = {
  PRODUCT_IN_TRASH: 'addUnits.errors.inTrash',
  PRODUCT_NOT_FOUND: 'addUnits.errors.inTrash',
  QUANTITY_TOO_LARGE: 'addUnits.errors.tooMany',
  CELLAR_NOT_FOUND: 'addUnits.errors.rejected',
  VALIDATION_ERROR: 'addUnits.errors.rejected',
};

/**
 * #471 (FEAT-92 c2, FEAT-101 c3, ux-ui.md §10.4.1): "Ajouter des bouteilles"
 * to a wine, one known without bottle included. The answer (D8) goes into
 * the list and the open drawer at once: the line completed (×6 → ×8) or
 * created. Online only (decision point 47).
 */
export function useAddUnits() {
  const queryClient = useQueryClient();
  return useMutation<UnitWrite, Error, AddUnitsVariables>({
    meta: { handlesError: true },
    mutationFn: ({ product, input }) => productsClient.addUnits(product.id, input),
    onSuccess: (write, { product, input }) => {
      const written = [write.data, ...write.changed];
      queryClient.setQueryData<Product[]>(PRODUCTS_KEY, (old) => withUnitChanges(old, written, write.removedIds));
      queryClient.setQueryData<ProductDetailView>(productDetailKey(product.id), (old) =>
        detailWithUnitWrite(old, null, written, write.removedIds));
      // FEAT-95: cigars are counted in cigars, 3 boxes of 25 being 75.
      if (product.category === 'cigar') {
        const cigars = input.quantity * (input.cigarsPerBox ?? 1);
        notifySuccess('addUnits.successCigar', { count: cigars, name: wineName(product) });
        return;
      }
      notifySuccess('addUnits.success', { count: input.quantity, name: wineName(product) });
    },
    onError: (error, { product }) => {
      const of = product.category === 'cigar' ? 'Cigar' : '';
      if (error instanceof NetworkError) {
        notifyError(`addUnits.errors.offline${of}`);
        return;
      }
      notifyError(`${ADD_UNITS_REFUSALS[error.message] ?? 'addUnits.errors.failed'}${of}`);
    },
    onSettled: (_write, _error, { product }) => {
      // The drawer's history, the flat bottles, the cellars and the menu counts.
      void queryClient.invalidateQueries({ queryKey: productDetailKey(product.id) });
      void queryClient.invalidateQueries({ queryKey: ['inventory'], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
    },
  });
}
