'use client';
import React, { useState } from 'react';
import {
  ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Card, CardHeader, CardBody, Progress, Skeleton, Spinner,
} from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Plus, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useBudgetEnvelopes, useCreateBudgetEnvelope, useUpdateBudgetEnvelope, useDeleteBudgetEnvelope, useBudgetProgress,
} from '@/hooks/useBudget';
import { BudgetEnvelope } from '@/lib/budget/types';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatCurrency, formatDate, todayLocalIso } from '@/lib/format';

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

const EMPTY_FORM = { periodStart: '', periodEnd: '', amount: '' };

function EnvelopeCard({ envelope, onEdit, onDelete }: {
  envelope: BudgetEnvelope;
  onEdit: (e: BudgetEnvelope) => void;
  onDelete: (e: BudgetEnvelope) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: progress, isLoading } = useBudgetProgress(envelope.id);

  return (
    <Card radius="lg" shadow="sm">
      <CardHeader className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          {formatDate(envelope.periodStart, i18n.language)} — {formatDate(envelope.periodEnd, i18n.language)}
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="light" color="primary" onPress={() => onEdit(envelope)}>
            {t('actions.edit')}
          </Button>
          <Button size="sm" variant="light" color="danger" onPress={() => onDelete(envelope)}>
            {t('actions.delete')}
          </Button>
        </div>
      </CardHeader>
      <CardBody className="gap-2">
        {isLoading || !progress ? (
          <Skeleton className="h-3 w-full rounded-full" />
        ) : (
          <>
            <p className="text-sm text-foreground-500">
              {t('budget.progress.label', {
                spent: formatCurrency(progress.spent, i18n.language),
                amount: formatCurrency(envelope.amount, i18n.language),
                percent: progress.percent,
              })}
            </p>
            <Progress
              value={progress.percent}
              color={progress.percent >= 100 ? 'warning' : 'primary'}
              size="sm"
              radius="full"
              aria-label={t('budget.title')}
            />
            <p className="text-xs text-foreground-400">
              {t('budget.progress.remaining')}: {formatCurrency(progress.remaining, i18n.language)}
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function BudgetPanel() {
  const { t } = useTranslation();
  const { data: envelopes, isLoading, isError, refetch, isRefetching } = useBudgetEnvelopes();
  const createMutation = useCreateBudgetEnvelope();
  const updateMutation = useUpdateBudgetEnvelope();
  const deleteMutation = useDeleteBudgetEnvelope();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  // #469: an envelope can be corrected in place (the API route and hook
  // already existed, but no button reached them).
  const [editing, setEditing] = useState<BudgetEnvelope | null>(null);
  const [deleting, setDeleting] = useState<BudgetEnvelope | null>(null);

  const openCreate = () => {
    // This month, in local time (toISOString would give the UTC date, a day
    // early east of Greenwich — same bug as #482).
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setEditing(null);
    setForm({ periodStart: todayLocalIso(start), periodEnd: todayLocalIso(end), amount: '' });
    setFormOpen(true);
  };

  const openEdit = (envelope: BudgetEnvelope) => {
    setEditing(envelope);
    setForm({
      periodStart: toDateInputValue(envelope.periodStart),
      periodEnd: toDateInputValue(envelope.periodEnd),
      amount: String(envelope.amount),
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    const amount = Number(form.amount);
    if (!form.periodStart || !form.periodEnd || !Number.isFinite(amount) || amount < 0) return;
    const data = {
      periodStart: new Date(form.periodStart).toISOString(),
      periodEnd: new Date(form.periodEnd).toISOString(),
      amount,
    };
    if (editing) await updateMutation.mutateAsync({ id: editing.id, data });
    else await createMutation.mutateAsync(data);
    setFormOpen(false);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await deleteMutation.mutateAsync(deleting.id);
    setDeleting(null);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-6">
        <Wallet size={22} className="text-primary" />
        <h1 className="text-xl font-bold">{t('budget.title')}</h1>
        <Button className="ml-auto" color="primary" variant="solid" startContent={<Plus size={16} />} onPress={openCreate}>
          {t('budget.create')}
        </Button>
      </div>

      {isError && (
        <ErrorState
          className="mb-4"
          message={t('budget.errors.load')}
          onRetry={() => { void refetch(); }}
          isRetrying={isRefetching}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-16" role="status" aria-live="polite"><Spinner size="lg" aria-label={t('status.loading')} /></div>
      ) : !envelopes?.length ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Wallet size={64} className="text-foreground-400 mb-4" />
          <p className="text-lg font-semibold text-foreground-500">{t('budget.empty')}</p>
          <p className="text-sm text-foreground-500 mb-6">{t('budget.emptyHint')}</p>
          <Button color="primary" variant="solid" startContent={<Plus size={16} />} onPress={openCreate}>
            {t('budget.create')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {envelopes.map((e) => <EnvelopeCard key={e.id} envelope={e} onEdit={openEdit} onDelete={setDeleting} />)}
        </div>
      )}

      {/* Create form */}
      <ResponsiveModal isOpen={formOpen} onClose={() => setFormOpen(false)} size="md" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{editing ? t('budget.edit') : t('budget.create')}</ModalHeader>
              <ModalBody className="gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="date"
                    label={t('budget.form.periodStart')}
                    value={form.periodStart}
                    onValueChange={(v) => setForm((f) => ({ ...f, periodStart: v }))}
                    variant="bordered" size="md" radius="md" labelPlacement="outside" isRequired
                  />
                  <Input
                    type="date"
                    label={t('budget.form.periodEnd')}
                    value={form.periodEnd}
                    onValueChange={(v) => setForm((f) => ({ ...f, periodEnd: v }))}
                    variant="bordered" size="md" radius="md" labelPlacement="outside" isRequired
                  />
                </div>
                <Input
                  type="number"
                  min={0}
                  label={t('budget.form.amount')}
                  value={form.amount}
                  onValueChange={(v) => setForm((f) => ({ ...f, amount: v }))}
                  variant="bordered" size="md" radius="md" labelPlacement="outside" isRequired
                />
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={() => setFormOpen(false)}>{t('actions.cancel')}</Button>
                <Button
                  color="primary" variant="solid"
                  isLoading={createMutation.isPending || updateMutation.isPending}
                  isDisabled={!form.periodStart || !form.periodEnd || !form.amount}
                  onPress={handleSubmit}
                >
                  {t('actions.save')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>

      {/* Delete confirm */}
      <ResponsiveModal isOpen={!!deleting} onClose={() => setDeleting(null)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('budget.deleteTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-foreground-600">{t('budget.deleteConfirm')}</p>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={() => setDeleting(null)}>{t('actions.cancel')}</Button>
                <Button color="danger" variant="solid" isLoading={deleteMutation.isPending} onPress={handleDelete}>
                  {t('actions.delete')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>
    </div>
  );
}
