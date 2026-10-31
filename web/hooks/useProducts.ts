'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsClient } from '@/lib/products/client';
import { productsFromFlatItems } from '@/lib/products/fromFlat';
import type { Product, ProductDetailView, TrashedProduct } from '@/lib/products/types';
import type { ProductDescription } from '@shared/product';
import { getAllQueuedMutations, getCachedInventory } from '@/lib/offline/db';
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
 * Only the bottle's own fields are overlaid; a description change shows once sent.
 */
async function overlayQueuedUnitChanges(products: Product[]): Promise<Product[]> {
  let queued;
  try {
    queued = (await getAllQueuedMutations()).filter((m) => m.status !== 'conflict');
  } catch {
    return products;
  }
  if (queued.length === 0) return products;
  return products.map((product) => {
    if (!product.items.some((item) => queued.some((m) => m.itemId === item.id))) return product;
    const items = product.items.map((item) =>
      queued.reduce((shown, m) => {
        if (m.itemId !== item.id) return shown;
        const own = Object.fromEntries(Object.entries(m.patch).filter(([field]) => field in shown));
        return { ...shown, ...own };
      }, item),
    );
    return { ...product, items };
  });
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
  });
}

/** Cache key of a wine's detail; under `inventory`, so a bottle change refreshes it too. */
export const productDetailKey = (id: string | null) => ['inventory', 'product', id];

/** A wine's detail: its drawer, and the tastings the trash confirmation warns about. */
export function useProductDetail(id: string | null) {
  return useQuery<ProductDetailView>({
    queryKey: productDetailKey(id),
    queryFn: () => productsClient.get(id as string),
    enabled: !!id,
  });
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
    mutationFn: productsClient.trash,
    onSuccess: (_result, id) => {
      queryClient.setQueryData<Product[]>(PRODUCTS_KEY, (old) => old?.filter((product) => product.id !== id));
    },
    onError: () => notifyError('toast.deleteError'),
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
    mutationFn: productsClient.restore,
    onSuccess: () => notifySuccess('toast.restoreSuccess'),
    onError: () => notifyError('toast.restoreError'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
    },
  });
}

export interface UpdateProductVariables {
  id: string;
  patch: Partial<ProductDescription>;
  /** The wine's version the form started from (#572). */
  expectedUpdatedAt?: string;
}

/**
 * FEAT-92 c4: "Modifier" on a wine writes its description once, for every
 * bottle. A change made meanwhile by someone else is refused (409) and
 * reported; the form stays open with what was typed.
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation<Product, Error, UpdateProductVariables>({
    mutationFn: ({ id, patch, expectedUpdatedAt }) => productsClient.update(id, patch, expectedUpdatedAt),
    onSuccess: (saved) => {
      queryClient.setQueryData<Product[]>(PRODUCTS_KEY, (old) =>
        old?.map((product) => (product.id === saved.id ? saved : product)));
    },
    onError: (error) => {
      if (error.message === 'CONFLICT') {
        notifyError('familyDrawer.form.conflict');
        return;
      }
      notifyError(error.message === 'VALIDATION_ERROR' ? 'familyDrawer.form.rejected' : 'familyDrawer.form.error');
    },
    onSettled: (_saved, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: productDetailKey(id) });
      // The flat bottles carry the description too (transitional copy).
      void queryClient.invalidateQueries({ queryKey: ['inventory'], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
