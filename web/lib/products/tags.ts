/**
 * A wine's tags as typed in its form, comma-separated (#708): trimmed, empty
 * parts dropped, doubles dropped whatever their case (the first spelling is
 * kept). A tag of `known` holding a comma (set in bulk) stays whole while its
 * text is left as is; edited, it is split like anything typed.
 */
export function parseTags(text: string, known: readonly string[] = []): string[] {
  const withComma = known.filter((tag) => tag.includes(','));
  const parts = text.split(',');
  const tags: string[] = [];
  for (let i = 0; i < parts.length;) {
    const whole = withComma.find((tag) => {
      const n = tag.split(',').length;
      return parts.slice(i, i + n).join(',').trim() === tag.trim();
    });
    if (whole) {
      tags.push(whole);
      i += whole.split(',').length;
    } else {
      tags.push(parts[i].trim());
      i += 1;
    }
  }
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
