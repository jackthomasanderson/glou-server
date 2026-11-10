/**
 * #759: what the page asks before it is left while it holds unsaved changes.
 * A screen with such changes registers its question (useLeaveGuard); every
 * place that leaves the page by code (`router.push` from a menu, a search
 * result, a notification, sign-out) calls {@link confirmLeave} first.
 */
const questions = new Set<string>();

/** While registered, leaving asks `question`. Returns the unregister function. */
export function registerLeaveQuestion(question: string): () => void {
  // One entry per registration, even when two screens ask the same thing.
  const entry = new String(question) as unknown as string;
  questions.add(entry);
  return () => {
    questions.delete(entry);
  };
}

/** Whether a screen holds unsaved changes. */
export function hasLeaveQuestion(): boolean {
  return questions.size > 0;
}

/** True when the page may be left: nothing pending, or the person confirmed. */
export function confirmLeave(): boolean {
  const [question] = questions;
  return question === undefined || window.confirm(String(question));
}
