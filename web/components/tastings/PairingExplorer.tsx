'use client';
import React, { useMemo, useState } from 'react';
import { Avatar, Button, Card, CardBody, Chip, Input, Skeleton } from '@heroui/react';
import { Search, Utensils, Wine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { InventoryItem } from '@/lib/inventory/types';
import { matchDishToPairings, pickBestPairingLabel } from '@/lib/tastings/pairingEngine';
import { getRecommendations } from '@/lib/tastings/recommendations';
import { TastingForm } from './TastingForm';

// Quick-pick chips: derived from the vocabulary already present in the
// RECOS food pairing catalog (recommendations.ts). The catalog itself is
// French-only business data (same convention as ServiceRecommendations.tsx,
// which never runs pairing labels through i18n), but the search *query* the
// chip types into the box is picked per active locale (fr/en) so it reads
// naturally either way — both resolve to the same French keywords via the
// bilingual synonym dictionary in pairingEngine.ts.
const QUICK_CHIPS: { i18nKey: string; fr: string; en: string }[] = [
  { i18nKey: 'tastings.pairing.quickChips.meat', fr: 'viande', en: 'meat' },
  { i18nKey: 'tastings.pairing.quickChips.fish', fr: 'poisson', en: 'fish' },
  { i18nKey: 'tastings.pairing.quickChips.cheese', fr: 'fromage', en: 'cheese' },
  { i18nKey: 'tastings.pairing.quickChips.chocolate', fr: 'chocolat', en: 'chocolate' },
];

/** The subtype field an inventory item actually carries, per category. */
function getItemSubtype(item: InventoryItem): string | null {
  switch (item.category) {
    case 'wine':
      return item.color ?? null;
    case 'sparkling':
      return item.sparklingType ?? null;
    case 'spirit':
      return item.spiritType ?? null;
    case 'cigar':
      return null;
    default:
      return null;
  }
}

/**
 * Consumption-rotation priority (FEAT-08/FEAT-06 spirit): among bottles that
 * pair equally well with the dish, surface the ones that most need drinking
 * first — past their peak, at their peak, approaching it, then already
 * opened bottles (finish what's started) before anything else.
 */
function urgencyRank(item: InventoryItem): number {
  switch (item.alertStatus) {
    case 'past':
      return 0;
    case 'peak':
      return 1;
    case 'approaching':
      return 2;
    default:
      return 3;
  }
}

interface PairingSuggestion {
  item: InventoryItem;
  score: number;
  reasonLabel: string | null;
}

export function PairingExplorer() {
  const { t, i18n } = useTranslation();
  const { data: inventory, isLoading, isError } = useInventory();
  const [query, setQuery] = useState('');
  const [consumeTarget, setConsumeTarget] = useState<{ itemId: string; foodPairing: string } | null>(null);
  const chipLocale: 'fr' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'fr';

  const suggestions = useMemo<PairingSuggestion[]>(() => {
    const trimmed = query.trim();
    if (!trimmed || !inventory) return [];

    const dishMatches = matchDishToPairings(trimmed);
    if (dishMatches.length === 0) return [];

    // A bottle can, in theory, satisfy more than one matching combo (e.g. a
    // spirit item with no dedicated recommendation matches both its
    // category's specific combo and the "default" fallback) — keep the
    // highest-scoring match per bottle.
    const byItemId = new Map<string, PairingSuggestion>();
    for (const combo of dishMatches) {
      const reco = getRecommendations(combo.category, combo.subtype);
      const reasonLabel = reco ? pickBestPairingLabel(trimmed, reco.foodPairings) : null;

      for (const item of inventory) {
        if (item.deletedAt) continue;
        if (item.category !== combo.category) continue;
        // A null combo subtype means the match came from the category's
        // "default" catalog entry — it applies regardless of the bottle's
        // own subtype (documented in pairingEngine.ts).
        if (combo.subtype !== null && getItemSubtype(item) !== combo.subtype) continue;

        const existing = byItemId.get(item.id);
        if (!existing || combo.score > existing.score) {
          byItemId.set(item.id, { item, score: combo.score, reasonLabel });
        }
      }
    }

    return Array.from(byItemId.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const urgencyDiff = urgencyRank(a.item) - urgencyRank(b.item);
      if (urgencyDiff !== 0) return urgencyDiff;
      if (a.item.isOpened !== b.item.isOpened) return a.item.isOpened ? -1 : 1;
      return a.item.name.localeCompare(b.item.name);
    });
  }, [query, inventory]);

  const hasSearched = query.trim().length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Utensils size={22} className="text-primary" />
        <h1 className="text-xl font-bold">{t('tastings.pairing.title')}</h1>
      </div>

      {/* Search */}
      <Input
        value={query}
        onValueChange={setQuery}
        label={t('tastings.pairing.searchLabel')}
        placeholder={t('tastings.pairing.searchPlaceholder')}
        startContent={<Search size={16} className="text-default-400" />}
        variant="bordered"
        size="md"
        isClearable
        onClear={() => setQuery('')}
        className="max-w-lg"
      />

      {/* Quick chips */}
      <div className="flex flex-wrap gap-2 mt-3 mb-6">
        {QUICK_CHIPS.map((chip) => {
          const chipQuery = chip[chipLocale];
          return (
            <Button
              key={chipQuery}
              variant={query.trim().toLowerCase() === chipQuery ? 'solid' : 'flat'}
              color="primary"
              size="sm"
              radius="full"
              onPress={() => setQuery(chipQuery)}
            >
              {t(chip.i18nKey)}
            </Button>
          );
        })}
      </div>

      {/* Error banner */}
      {isError && (
        <div className="mb-4 rounded-lg bg-danger-50 border border-danger-200 text-danger px-4 py-3 text-sm">
          {t('tastings.pairing.inventoryLoadError')}
        </div>
      )}

      {/* Loading */}
      {isLoading && hasSearched ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} radius="lg" shadow="sm">
              <CardBody className="gap-2">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 w-3/4 rounded-lg" />
                <Skeleton className="h-3 w-1/2 rounded-lg" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : !hasSearched ? (
        /* Prompt state */
        <div className="flex flex-col items-center py-16 text-center">
          <Utensils size={64} className="text-default-300 mb-4" />
          <p className="text-lg font-semibold text-default-500">{t('tastings.pairing.promptTitle')}</p>
          <p className="text-sm text-default-400">{t('tastings.pairing.promptHint')}</p>
        </div>
      ) : suggestions.length === 0 ? (
        /* No matching bottle */
        <div className="flex flex-col items-center py-16 text-center">
          <Wine size={64} className="text-default-300 mb-4" />
          <p className="text-lg font-semibold text-default-500">
            {t('tastings.pairing.noResults', { query: query.trim() })}
          </p>
          <p className="text-sm text-default-400">{t('tastings.pairing.noResultsHint')}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-default-400 mb-3">
            {t('tastings.pairing.resultsCount', { count: suggestions.length })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestions.map(({ item, reasonLabel }) => (
              <Card key={item.id} radius="lg" shadow="sm">
                <CardBody className="gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar
                      src={item.photoUrl ?? undefined}
                      fallback={<Wine size={16} />}
                      className="w-10 h-10 shrink-0 bg-primary-100 text-primary"
                      showFallback
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">
                        {item.name} — {item.producer}
                      </p>
                      {item.vintage && (
                        <p className="text-xs text-default-400">{item.vintage}</p>
                      )}
                    </div>
                  </div>

                  {reasonLabel && (
                    <Chip size="sm" variant="bordered" className="self-start">
                      {t('tastings.pairing.reason', { pairing: reasonLabel })}
                    </Chip>
                  )}

                  <Button
                    color="primary"
                    variant="bordered"
                    size="sm"
                    className="mt-1"
                    onPress={() => setConsumeTarget({ itemId: item.id, foodPairing: query.trim() })}
                  >
                    {t('tastings.pairing.consumeNow')}
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Consume now — reuses the existing tasting log flow (FEAT-77 stock
          update dialog included) rather than inventing a new consumption
          mechanism. */}
      <TastingForm
        open={!!consumeTarget}
        onClose={() => setConsumeTarget(null)}
        initialItemId={consumeTarget?.itemId}
        initialFoodPairing={consumeTarget?.foodPairing}
      />
    </div>
  );
}
