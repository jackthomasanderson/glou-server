'use client';
import React, { useEffect, useState } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Card, CardHeader, CardBody, Progress, Spinner,
} from '@heroui/react';
import { Plus, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useBudgetEnvelopes, useCreateBudgetEnvelope, useDeleteBudgetEnvelope, useBudgetProgress,
} from '@/hooks/useBudget';
import { BudgetEnvelope } from '@/lib/budget/types';

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

const EMPTY_FORM = { periodStart: '', periodEnd: '', amount: '' };

function EnvelopeCard({ envelope, onDelete }: { envelope: BudgetEnvelope; onDelete: (e: BudgetEnvelope) => void }) {
  const { t } = useTranslation();
  const { data: progress, isLoading } = useBudgetProgress(envelope.id);

  return (
    <Card radius="lg" shadow="sm">
      <CardHeader className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          {new Date(envelope.periodStart).toLocaleDateString()} — {new Date(envelope.periodEnd).toLocaleDateString()}
        </span>
        <Button size="sm" variant="light" color="danger" onPress={() => onDelete(envelope)}>
          {t('actions.delete')}
        </Button>
      </CardHeader>
      <CardBody className="gap-2">
        {isLoading || !progress ? (
          <Progress isIndeterminate size="sm" color="primary" aria-label={t('budget.title')} />
        ) : (
          <>
            <p className="text-sm text-default-500">
              {t('budget.progress.label', {
                spent: `${progress.spent} €`,
                amount: `${envelope.amount} €`,
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
              {t('budget.progress.remaining')}: {progress.remaining} €
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function BudgetPanel() {
  const { t } = useTranslation();
  const { data: envelopes, isLoading, isError } = useBudgetEnvelopes();
  const createMutation = useCreateBudgetEnvelope();
  const deleteMutation = useDeleteBudgetEnvelope();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleting, setDeleting] = useState<BudgetEnvelope | null>(null);

  useEffect(() => {
    if (formOpen) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setForm({ periodStart: toDateInputValue(start.toISOString()), periodEnd: toDateInputValue(end.toISOString()), amount: '' });
    }
  }, [formOpen]);

  const handleSubmit = async () => {
    const amount = Number(form.amount);
    if (!form.periodStart || !form.periodEnd || !Number.isFinite(amount) || amount < 0) return;
    await createMutation.mutateAsync({
      periodStart: new Date(form.periodStart).toISOString(),
      periodEnd: new Date(form.periodEnd).toISOString(),
      amount,
    });
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
        <Button className="ml-auto" color="primary" variant="solid" startContent={<Plus size={16} />} onPress={() => setFormOpen(true)}>
          {t('budget.create')}
        </Button>
      </div>

      {isError && (
        <div className="mb-4 rounded-lg bg-danger-50 border border-danger-200 text-danger px-4 py-3 text-sm">
          {t('budget.errors.load')}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : !envelopes?.length ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Wallet size={64} className="text-default-300 mb-4" />
          <p className="text-lg font-semibold text-default-500">{t('budget.empty')}</p>
          <p className="text-sm text-default-400 mb-6">{t('budget.emptyHint')}</p>
          <Button color="primary" variant="solid" startContent={<Plus size={16} />} onPress={() => setFormOpen(true)}>
            {t('budget.create')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {envelopes.map((e) => <EnvelopeCard key={e.id} envelope={e} onDelete={setDeleting} />)}
        </div>
      )}

      {/* Create form */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} size="md" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('budget.create')}</ModalHeader>
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
                  isLoading={createMutation.isPending}
                  isDisabled={!form.periodStart || !form.periodEnd || !form.amount}
                  onPress={handleSubmit}
                >
                  {t('actions.save')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} size="sm" radius="lg" backdrop="opaque" placement="center">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('budget.deleteTitle')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">{t('budget.deleteConfirm')}</p>
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
      </Modal>
    </div>
  );
}
