/** Lower case, without accents: "Cuvée" and "CUVEE" are the same word. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Shorter words ("de", "ZZ", "C5") match almost any title. */
const MIN_WORD_LENGTH = 3;

/** Words found in the titles of countless unrelated wines or cigars. */
const GENERIC_WORDS = new Set(['domaine', 'chateau', 'cuvee', 'petit', 'grand', 'vin', 'wine', 'cigar', 'cigare']);

const significantWords = (text: string | undefined) =>
  fold(text ?? '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= MIN_WORD_LENGTH && !GENERIC_WORDS.has(word));

/**
 * #862, #1049: an image result is about the item when its title names the
 * item: every significant word of the name, and a word of the producer. One
 * shared word is not enough ("Dom" alone brought back a Dom Pérignon photo for
 * a wine called "ZV Test"). With no significant word in the name, the whole
 * producer must be there.
 */
export function isAboutItem(title: string, name: string | undefined, producer: string | undefined): boolean {
  const titleWords = new Set(fold(title).split(/[^\p{L}\p{N}]+/u));
  const nameWords = significantWords(name);
  const producerWords = significantWords(producer);
  if (nameWords.length === 0 && producerWords.length === 0) return false;
  if (!nameWords.every((word) => titleWords.has(word))) return false;
  if (producerWords.length === 0) return true;
  return nameWords.length > 0
    ? producerWords.some((word) => titleWords.has(word))
    : producerWords.every((word) => titleWords.has(word));
}
