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
    const end = code.indexOf('<ModalContent', start.index);
    if (end === -1) throw new Error(`${file}: a <ResponsiveModal> without <ModalContent>`);
    const props = code.slice(start.index, end);
    if (props.includes(`isOpen={${isOpen}}`)) return props;
  }
  throw new Error(`${file}: no <ResponsiveModal isOpen={${isOpen}}>`);
}

describe('Form dialogs keep their fields still while you fill them (#709, ux-ui.md §4.5)', () => {
  // A centred dialog re-centres whenever its height changes, moving every
  // field. These forms grow while being filled in (sections that open,
  // choices that reveal fields, a growing textarea, a password strength
  // gauge, inline validation), so they are anchored to the top on desktop.
  // ResponsiveModal still turns them into a full-screen bottom sheet on phones.
  const forms: Array<[file: string, isOpen: string]> = [
    ['components/inventory/InventoryForm.tsx', 'open && !guard.isConfirmOpen'],
    ['components/cellars/CellarDashboard.tsx', 'openForm && !formGuard.isConfirmOpen'],
    ['components/tastings/TastingForm.tsx', 'open && !showStockDialog && !guard.isConfirmOpen'],
    ['components/wishlist/WishlistDashboard.tsx', 'formOpen && !formGuard.isConfirmOpen'],
    ['components/collections/CollectionForm.tsx', 'open && !guard.isConfirmOpen'],
    ['components/admin/MaturityReferencesSection.tsx', 'open'],
    ['components/inventory/BulkActionDialog.tsx', 'open'],
    ['components/shares/SharesDashboard.tsx', 'formOpen'],
    ['components/profile/AccountSecurity.tsx', 'isPasswordModalOpen'],
    ['components/profile/AccountSecurity.tsx', 'isPinModalOpen'],
  ];

  it.each(forms)('%s is anchored to the top', (file, isOpen) => {
    expect(dialogProps(file, isOpen)).toContain('placement="top"');
  });

  // The longer ones can outgrow the screen: they scroll inside their panel,
  // keeping their header and buttons in view (ux-ui.md §4.5).
  it.each(forms.filter(([file]) => !/CollectionForm|AccountSecurity/.test(file)))(
    '%s scrolls inside its panel',
    (file, isOpen) => {
      expect(dialogProps(file, isOpen)).toContain('scrollBehavior="inside"');
    },
  );

  it('the tasting form keeps HeroUI\'s own maximum height, which leaves room for the top margin', () => {
    expect(dialogProps('components/tastings/TastingForm.tsx', 'open && !showStockDialog && !guard.isConfirmOpen'))
      .not.toContain('classNames');
  });

  // #704: the <form> wrapping header, body and footer grew to its content, so
  // the body never scrolled and the footer was drawn below the panel (Save at
  // 1396 px in a 736 px panel, measured in Chromium). It has to be allowed to
  // shrink, like the bottle form's.
  it('the tasting form lets its body scroll instead of pushing the buttons out of the panel', () => {
    const code = readFileSync(join(root, 'components/tastings/TastingForm.tsx'), 'utf8');
    const form = code.match(/<form onSubmit=[^\n]*className="([^"]*)"/);
    expect(form?.[1].split(' ')).toEqual(expect.arrayContaining(['min-h-0', 'overflow-hidden']));
  });
});
