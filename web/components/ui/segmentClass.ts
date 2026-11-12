// Selected option of a segmented control (view, page size, mode switches).
// Colour alone must not carry the state (WCAG 1.4.1): the selected option is
// also bold and underlined. The transparent border on the others keeps the
// height from jumping when the selection moves.
export function segmentClass(selected: boolean, extra = ''): string {
  return `border-b-2 ${selected ? 'border-primary font-semibold' : 'border-transparent'}${extra ? ` ${extra}` : ''}`;
}
