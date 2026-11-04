import type { ConsumptionSuggestion } from './types';

/**
 * #471 (FEAT-105 c3, ux-ui.md §10.4.2): a wine with an opened bottle (box)
 * is suggested through it — "Finir l'entamée (60 %)" — else "Consommer".
 */
export function consumeLabel(s: ConsumptionSuggestion, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (!s.isOpened) return t('consumptionPlan.suggestions.consume');
  if (s.category === 'cigar') {
    return s.cigarsLeft != null
      ? t('consumptionPlan.suggestions.finishOpenedBox', { count: s.cigarsLeft })
      : t('openedReminder.open.finish');
  }
  return s.fillLevel != null
    ? t('consumptionPlan.suggestions.finishOpened', { level: s.fillLevel })
    : t('openedReminder.open.finish');
}
