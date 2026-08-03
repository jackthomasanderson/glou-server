'use client';
import React, { useEffect, useState } from 'react';
import {
  Card, CardHeader, CardBody, Button, Chip, Avatar, Skeleton, Progress, Input, Select, SelectItem,
} from '@heroui/react';
import { Wine, Clock, RotateCcw, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useConsumptionSuggestions, usePostponeSuggestion, useGoalProgress, useSetGoal,
} from '@/hooks/useConsumptionPlan';
import { ConsumptionSuggestion, GoalTargetType, SuggestionReason } from '@/lib/consumption-plan/types';
import { TastingForm } from '@/components/tastings/TastingForm';

const SUGGESTIONS_LIMIT = 7;

const REASON_ICON: Record<SuggestionReason, React.ReactNode> = {
  peak_window: <Clock size={14} />,
  opened: <Wine size={14} />,
  rotation: <RotateCcw size={14} />,
};

const REASON_COLOR: Record<SuggestionReason, 'warning' | 'secondary' | 'default'> = {
  peak_window: 'warning',
  opened: 'secondary',
  rotation: 'default',
};

// v1 simplification: the goal period is always fixed to the current
// calendar month ("vider X bouteilles ce mois", per feature.md's own
// wording) — only the target type/value are user-editable. A custom period
// picker is left for a future iteration if the need arises.
function startOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function endOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
}

export function ConsumptionPlanWidget() {
  const { t } = useTranslation();
  const { data: suggestions, isLoading, isError } = useConsumptionSuggestions(SUGGESTIONS_LIMIT);
  const postpone = usePostponeSuggestion(SUGGESTIONS_LIMIT);
  const { data: progress, isLoading: goalLoading } = useGoalProgress();
  const setGoal = useSetGoal();

  const [consumeTarget, setConsumeTarget] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [targetType, setTargetType] = useState<GoalTargetType>('count');
  const [targetValue, setTargetValue] = useState('12');

  useEffect(() => {
    if (editingGoal && progress?.goal) {
      setTargetType(progress.goal.targetType);
      setTargetValue(String(progress.goal.targetValue));
    }
  }, [editingGoal, progress?.goal]);

  const handleSaveGoal = async () => {
    const value = Number(targetValue);
    if (!Number.isFinite(value) || value <= 0) return;
    try {
      await setGoal.mutateAsync({
        periodStart: startOfMonthISO(),
        periodEnd: endOfMonthISO(),
        targetType,
        targetValue: Math.round(value),
      });
      setEditingGoal(false);
    } catch {
      // error surfaced via setGoal.isError below
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Goal section */}
      <Card radius="lg" shadow="sm">
        <CardHeader className="flex items-center gap-2">
          <Target size={18} className="text-primary" />
          <span className="text-sm font-semibold">{t('consumptionPlan.goal.title')}</span>
        </CardHeader>
        <CardBody className="gap-3">
          {goalLoading ? (
            <Skeleton className="h-10 w-full rounded-lg" />
          ) : editingGoal ? (
            <div className="flex flex-col gap-3 max-w-sm">
              <Select
                label={t('consumptionPlan.goal.targetType')}
                selectedKeys={[targetType]}
                onSelectionChange={(keys) => setTargetType((Array.from(keys)[0] as GoalTargetType) ?? 'count')}
                variant="bordered"
                labelPlacement="outside"
              >
                <SelectItem key="count">{t('consumptionPlan.goal.targetTypeCount')}</SelectItem>
                <SelectItem key="volume">{t('consumptionPlan.goal.targetTypeVolume')}</SelectItem>
              </Select>
              <Input
                type="number"
                min={1}
                label={t('consumptionPlan.goal.targetValue')}
                value={targetValue}
                onValueChange={setTargetValue}
                variant="bordered"
                labelPlacement="outside"
              />
              {setGoal.isError && (
                <p className="text-xs text-danger">{t('consumptionPlan.goal.saveError')}</p>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="light"
                  color="danger"
                  size="sm"
                  onPress={() => setEditingGoal(false)}
                  isDisabled={setGoal.isPending}
                >
                  {t('actions.cancel')}
                </Button>
                <Button
                  color="primary"
                  variant="solid"
                  size="sm"
                  onPress={handleSaveGoal}
                  isLoading={setGoal.isPending}
                >
                  {t('actions.save')}
                </Button>
              </div>
            </div>
          ) : progress?.goal ? (
            <div className="flex flex-col gap-2 max-w-sm">
              <p className="text-sm text-default-500">
                {t('consumptionPlan.goal.progressLabel', {
                  count: progress.consumedCount,
                  target: progress.goal.targetValue,
                })}
              </p>
              <Progress
                value={progress.percent}
                color="primary"
                size="sm"
                radius="full"
                aria-label={t('consumptionPlan.goal.title')}
              />
              <Button
                variant="light"
                color="primary"
                size="sm"
                className="self-start"
                onPress={() => setEditingGoal(true)}
              >
                {t('consumptionPlan.goal.edit')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-default-400">{t('consumptionPlan.goal.empty')}</p>
              <Button color="primary" variant="bordered" size="sm" onPress={() => setEditingGoal(true)}>
                {t('consumptionPlan.goal.define')}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Suggestions list */}
      <div>
        <h2 className="text-sm font-semibold mb-3">{t('consumptionPlan.suggestions.title')}</h2>

        {isError && (
          <div className="mb-4 rounded-lg bg-danger-50 border border-danger-200 text-danger px-4 py-3 text-sm">
            {t('consumptionPlan.suggestions.loadError')}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} radius="lg" shadow="sm">
                <CardBody className="gap-2">
                  <Skeleton className="h-4 w-1/2 rounded-lg" />
                  <Skeleton className="h-3 w-1/3 rounded-lg" />
                </CardBody>
              </Card>
            ))}
          </div>
        ) : !suggestions || suggestions.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Wine size={48} className="text-default-300 mb-3" />
            <p className="text-sm font-semibold text-default-500">{t('consumptionPlan.suggestions.empty')}</p>
            <p className="text-xs text-default-400">{t('consumptionPlan.suggestions.emptyHint')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {suggestions.map((s: ConsumptionSuggestion) => (
              <Card key={s.id} radius="lg" shadow="sm">
                <CardBody className="flex-row items-center gap-3">
                  <Avatar
                    src={s.photoUrl ?? undefined}
                    fallback={<Wine size={16} />}
                    showFallback
                    className="w-10 h-10 shrink-0 bg-primary-100 text-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      {s.name} — {s.producer}
                      {s.vintage ? ` (${s.vintage})` : ''}
                    </p>
                    <Chip
                      size="sm"
                      variant="flat"
                      color={REASON_COLOR[s.reason]}
                      startContent={REASON_ICON[s.reason]}
                      className="mt-1"
                    >
                      {t(`consumptionPlan.reasons.${s.reason}`)}
                    </Chip>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button color="primary" variant="solid" size="sm" onPress={() => setConsumeTarget(s.id)}>
                      {t('consumptionPlan.suggestions.consume')}
                    </Button>
                    <Button
                      variant="light"
                      color="default"
                      size="sm"
                      onPress={() => postpone.mutate(s.id)}
                      isDisabled={postpone.isPending}
                    >
                      {t('consumptionPlan.suggestions.postpone')}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Consume now — reuses the existing tasting log flow (FEAT-77 stock
          update dialog included) rather than inventing a new consumption
          mechanism, same pattern as PairingExplorer's "Consommer maintenant". */}
      <TastingForm
        open={!!consumeTarget}
        onClose={() => setConsumeTarget(null)}
        initialItemId={consumeTarget ?? undefined}
      />
    </div>
  );
}
