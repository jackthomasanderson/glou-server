/** Lower case, without accents: "Cuvée" and "CUVEE" are the same word. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Shorter words ("de", "ZZ", "C5") match almost any title. */
const MIN_WORD_LENGTH = 3;

/**
 * #862: an image result is about the item when its title contains a word of
 * its name or producer — an uncommon name otherwise brought back anything.
 */
export function isAboutItem(title: string, ...texts: Array<string | undefined>): boolean {
  const titleWords = new Set(fold(title).split(/[^\p{L}\p{N}]+/u));
  return texts
    .flatMap((text) => fold(text ?? '').split(/[^\p{L}\p{N}]+/u))
    .some((word) => word.length >= MIN_WORD_LENGTH && titleWords.has(word));
}
