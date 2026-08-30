/**
 * Best-effort HTML → plain text, for generating the `text/plain` alternative
 * of an outgoing notification (email body, Gotify webhook message).
 *
 * Not a sanitiser for rendered output — the result is only ever put in a
 * plain-text context — but it is written to fully strip markup rather than
 * leave a dangling `<script`/`<img ...` fragment behind: the single-pass
 * `replace(/<[^>]+>/g, '')` it replaces could do exactly that on input like
 * `<<b>script>` (CodeQL js/incomplete-multi-character-sanitization).
 */
export function htmlToPlainText(html: string): string {
  // 1. Remove <script>/<style> elements including their text content.
  let out = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  // 2. Strip remaining tags, repeating to a fixed point so nested-looking
  //    sequences can't reconstitute a tag after one pass.
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== prev);

  // 3. Drop any leftover unclosed tag-like tail (`... <script` with no `>`).
  out = out.replace(/<[a-z!/][^<>]*$/i, '');

  // 4. Decode the handful of entities that actually show up in our templates.
  out = out
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'");

  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
