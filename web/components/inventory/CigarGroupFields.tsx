'use client';
import React from 'react';
import { Radio, RadioGroup } from '@heroui/react';
import { MAX_COPIES } from '@shared/product';
import { ParsedNumberInput } from '@/components/ui/ParsedInput';
import { cigarGroupErrors, cigarsInDraft, type CigarGroupDraft, type CigarStorage } from '@/lib/products/cigarGroup';

type Translate = (key: string, options?: Record<string, unknown>) => string;

interface CigarGroupFieldsProps {
  draft: CigarGroupDraft;
  onChange: (draft: CigarGroupDraft) => void;
  /** Errors show once the form was submitted. */
  submitted: boolean;
  t: Translate;
  autoFocus?: boolean;
}

/**
 * #471 (FEAT-95, ux-ui.md §10.4.1): what a group of cigars is — "Boîtes
 * fermées" (number of boxes and cigars per box) or "À l'unité" (number of
 * cigars). Used by the add form and by "Ajouter des cigares" on a known one.
 * Renders grid cells: the caller lays them out.
 */
export function CigarGroupFields({ draft, onChange, submitted, t, autoFocus }: CigarGroupFieldsProps) {
  const errors = cigarGroupErrors(draft);
  const boxes = draft.storage === 'boxes';
  const cigars = cigarsInDraft(draft);

  return (
    <>
      <RadioGroup
        data-testid="cigar-storage"
        className="col-span-full"
        label={t('cigarGroup.storage')}
        orientation="horizontal"
        size="sm"
        value={draft.storage}
        onValueChange={(value) => onChange({ ...draft, storage: value as CigarStorage })}
      >
        <Radio value="boxes">{t('cigarGroup.boxes')}</Radio>
        <Radio value="singles">{t('cigarGroup.singles')}</Radio>
      </RadioGroup>
      <ParsedNumberInput
        data-testid="cigar-quantity-input"
        label={t(boxes ? 'cigarGroup.boxCount' : 'cigarGroup.cigarCount')}
        variant="bordered"
        size="sm"
        isRequired
        autoFocus={autoFocus}
        isInvalid={submitted && errors.quantity}
        errorMessage={t(boxes ? 'cigarGroup.invalidBoxCount' : 'cigarGroup.invalidCigarCount', { max: MAX_COPIES })}
        // The total in cigars, what the counters show (FEAT-95: 3 boxes of 25 = 75).
        description={boxes && cigars != null ? t('cigarGroup.total', { count: cigars }) : undefined}
        value={draft.quantity ?? undefined}
        onValueChange={(quantity) => onChange({ ...draft, quantity })}
        min={1} max={MAX_COPIES}
      />
      {boxes && (
        <ParsedNumberInput
          data-testid="cigars-per-box-input"
          label={t('cigarGroup.cigarsPerBox')}
          variant="bordered"
          size="sm"
          isRequired
          isInvalid={submitted && errors.cigarsPerBox}
          errorMessage={t('cigarGroup.invalidBoxSize', { max: MAX_COPIES })}
          value={draft.cigarsPerBox ?? undefined}
          onValueChange={(cigarsPerBox) => onChange({ ...draft, cigarsPerBox })}
          min={1} max={MAX_COPIES}
        />
      )}
    </>
  );
}
