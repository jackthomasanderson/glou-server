import type { PostProcessorModule } from 'i18next';

/**
 * French puts a space before ? ! : ; % and inside « » (recette #471, lot RD
 * point 3): « ? » alone at the start of a line, « (50 ⏎ %) ». A
 * non-breaking space keeps the sign with its word. Applied to every French
 * text the app shows, its interpolated values included, so the translation
 * files stay plain to edit.
 */
export function frenchSpaces(text: string): string {
  return text.replace(/ (?=[?!:;%»])/g, ' ').replace(/« /g, '« ');
}

export const frenchTypography: PostProcessorModule = {
  type: 'postProcessor',
  name: 'frenchTypography',
  process(value, _key, _options, translator) {
    return translator.language === 'fr' && typeof value === 'string' ? frenchSpaces(value) : value;
  },
};
