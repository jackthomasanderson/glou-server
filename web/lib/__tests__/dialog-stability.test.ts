import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');

describe('Select menus open without a flash (#709)', () => {
  // framer-motion 11 removes its opening animation one frame before writing
  // the final opacity, so every HeroUI popover (Select, Dropdown, Autocomplete)
  // fell back to opacity 0 / scale 0.8 for one frame about 340 ms after
  // opening. Measured frame by frame in Chromium: 6 flashes out of 6 openings
  // on 11.18.2, none on 12.43.0. HeroUI accepts both (`>=11.5.6 || >=12`).
  it('installs framer-motion 12 or later', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'node_modules', 'framer-motion', 'package.json'), 'utf8'));
    expect(Number(pkg.version.split('.')[0])).toBeGreaterThanOrEqual(12);
  });
});

/**
 * The props written on a dialog's opening tag: everything from `<ResponsiveModal`
 * up to its `<ModalContent>`. A plain regex on `>` would stop at the first
 * arrow function (`onClose={() => …}`).
 */
function dialogProps(file: string, isOpen: string): string {
  const code = readFileSync(join(root, file), 'utf8');
  for (const start of code.matchAll(/<ResponsiveModal\b/g)) {
    const props = code.slice(start.index, code.indexOf('<ModalContent', start.index));
    if (props.includes(`isOpen={${isOpen}}`)) return props;
  }
  throw new Error(`${file}: no <ResponsiveModal isOpen={${isOpen}}>`);
}

describe('Form dialogs keep their fields still while you fill them (#709, ux-ui.md §4.5)', () => {
  // A centred dialog re-centres whenever its height changes, moving every
  // field. These forms grow while being filled in (sections that open,
  // checkboxes that reveal fields, a growing textarea, inline validation), so
  // they are anchored to the top on desktop. ResponsiveModal still turns them
  // into a full-screen bottom sheet on phones.
  const forms: Array<[file: string, isOpen: string]> = [
    ['components/inventory/InventoryForm.tsx', 'open && !guard.isConfirmOpen'],
    ['components/cellars/CellarDashboard.tsx', 'openForm && !formGuard.isConfirmOpen'],
    ['components/tastings/TastingForm.tsx', 'open && !showStockDialog && !guard.isConfirmOpen'],
    ['components/wishlist/WishlistDashboard.tsx', 'formOpen && !formGuard.isConfirmOpen'],
    ['components/collections/CollectionForm.tsx', 'open && !guard.isConfirmOpen'],
    ['components/admin/MaturityReferencesSection.tsx', 'open'],
    ['components/inventory/BulkActionDialog.tsx', 'open'],
  ];

  it.each(forms)('%s is anchored to the top', (file, isOpen) => {
    expect(dialogProps(file, isOpen)).toContain('placement="top"');
  });

  it('the cellar form scrolls inside its panel instead of growing past the screen', () => {
    expect(dialogProps('components/cellars/CellarDashboard.tsx', 'openForm && !formGuard.isConfirmOpen'))
      .toContain('scrollBehavior="inside"');
  });
});
