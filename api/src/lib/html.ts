/**
 * Best-effort HTML → plain text, for generating the `text/plain` alternative
 * of an outgoing notification (email body, Gotify webhook message).
 *
 * Not a sanitiser for rendered output — the result is only ever put in a
 * plain-text context — but written to fully strip markup rather than leave a
 * dangling `<script`/`<img ...` fragment behind the way the single-pass
 * `replace(/<[^>]+>/g, '')` it replaces could, on input like `<<b>script>`.
 * Every removal below loops to a fixed point for that reason.
 */
export function htmlToPlainText(html: string): string {
  let out = html;
  let prev: string;

  // 1. Remove <script>/<style> elements including their text content.
  do {
    prev = out;
    out = out.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  } while (out !== prev);

  // 2. Strip all remaining tags, then drop any residual `<` so a broken
  //    fragment like `foo <script bar` (no closing `>`) can't survive. Real
  //    `&lt;` content is restored in step 3, after this.
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== prev);
  out = out.replace(/</g, '');

  // 3. Decode the handful of entities that show up in our templates. `&amp;`
  //    is done last so a decoded entity can't be re-interpreted as another
  //    (no `&amp;lt;` -> `&lt;` -> `<` double-unescape).
  out = out
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&');

  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
