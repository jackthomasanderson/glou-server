import type { Wire } from '@shared/wire';
import type { ItemView, ProductList, ProductView } from '@shared/product';

// #471 (D9): the families contract as the web receives it (dates as ISO strings).
export type Product = Wire<ProductView>;
export type ProductItem = Wire<ItemView>;
export type ProductListResponse = Wire<ProductList>;
