/**
 * The one fill-level scale (#708): the add form's chips, the bulk edit's and
 * the shortcuts beside the drawer's slider. Before, the form offered five
 * levels and the drawer three, under different words.
 */
export const FILL_LEVELS = [
  { value: 100, key: 'inventory.fillLevels.full' },
  { value: 75, key: 'inventory.fillLevels.threeQuarters' },
  { value: 50, key: 'inventory.fillLevels.half' },
  { value: 25, key: 'inventory.fillLevels.quarter' },
  { value: 0, key: 'inventory.fillLevels.empty' },
] as const;
