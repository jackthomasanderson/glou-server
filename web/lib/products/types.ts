import type { Wire } from '@shared/wire';
import type { ItemView, ProductDetail, ProductList, ProductView, TrashedProductView } from '@shared/product';

// #471 (D9): the families contract as the web receives it (dates as ISO strings).
export type Product = Wire<ProductView>;
export type ProductItem = Wire<ItemView>;
export type ProductListResponse = Wire<ProductList>;
export type ProductDetailView = Wire<ProductDetail>;
export type TrashedProduct = Wire<TrashedProductView>;
