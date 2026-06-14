'use client';
import React from 'react';
import {
  Button, CircularProgress, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Switch, Skeleton, Chip, Tooltip, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from '@heroui/react';
import { Trash2, ArrowLeft, Ban, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/hooks/useAuth';
import {
  useAdminUsers, useUpdateUserRole, useUpdateUserStatus,
  useAdminAuditLogs, usePurgeData,
  AdminUser, AuditLogEntry, PurgeResult,
} from '@/hooks/useAdmin';
import { useRouter } from 'next/navigation';
import { useHasMounted } from '@/hooks/useHasMounted';
import { MaturityReferencesSection } from '@/components/admin/MaturityReferencesSection';
import { SystemConfigSection } from '@/components/admin/SystemConfigSection';
import { MainLayout } from '@/components/ui/MainLayout';

export default function AdminPage() {
  const { t } = useTranslation();
  const { data: user, isLoading: isAuthLoading } = useMe();
  const router = useRouter();
  const hasMounted = useHasMounted();

  const { data: users, isLoading: isUsersLoading } = useAdminUsers();
  const { mutate: updateRole } = useUpdateUserRole();
  const { mutate: updateStatus } = useUpdateUserStatus();
  const { mutate: purgeAll, isPending: isPurging } = usePurgeData();

  const [auditPage, setAuditPage] = React.useState(1);
  const { data: auditResponse, isLoading: isAuditLoading } = useAdminAuditLogs(auditPage);

  const [isPurgeDialogOpen, setIsPurgeDialogOpen] = React.useState(false);
  const [confirmationText, setConfirmationText] = React.useState('');
  const [purgeResult, setPurgeResult] = React.useState<PurgeResult | null>(null);
  const [purgeError, setPurgeError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isAuthLoading && !user?.isAdmin) router.push('/');
  }, [user, isAuthLoading, router]);

  const handleRoleToggle = (targetUser: AdminUser, checked: boolean) => {
    if (targetUser.id === user?.id) return;
    updateRole({ userId: targetUser.id, isAdmin: checked });
  };

  const handleStatusToggle = (targetUser: AdminUser) => {
    if (targetUser.id === user?.id) return;
    updateStatus({ userId: targetUser.id, isActive: !targetUser.isActive });
  };

  const handleConfirmPurge = () => {
    if (confirmationText !== t('admin.maintenance.purge.keywordValue')) return;
    purgeAll(confirmationText, {
      onSuccess: (data: PurgeResult) => {
        setPurgeResult(data);
        setIsPurgeDialogOpen(false);
        setConfirmationText('');
      },
      onError: (err: unknown) => {
        const apiError = err as { response?: { data?: { error?: string } } };
        setPurgeError(apiError.response?.data?.error || 'PURGE_FAILED');
      },
    });
  };

  if (isAuthLoading || !user?.isAdmin) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[50vh]">
          <CircularProgress isIndeterminate color="primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Button size="sm" variant="bordered" startContent={<ArrowLeft size={14} />} onPress={() => router.push('/')}>
          {t('actions.back')}
        </Button>
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
      </div>

      {/* User management */}
      <div className="bg-content1 border border-divider rounded-2xl p-6 mt-4 overflow-hidden">
        <h2 className="text-base font-semibold mb-1">{t('admin.users.title')}</h2>
        <p className="text-sm text-foreground-500 mb-4">{t('admin.users.subtitle')}</p>

        <Table isCompact shadow="none" radius="md" classNames={{ wrapper: 'border border-divider rounded-xl' }} aria-label={t('admin.users.title')}>
          <TableHeader>
            <TableColumn>{t('admin.users.columns.email')}</TableColumn>
            <TableColumn>{t('admin.users.columns.username')}</TableColumn>
            <TableColumn className="text-center">{t('admin.users.columns.role')}</TableColumn>
            <TableColumn className="text-center">{t('admin.users.columns.status')}</TableColumn>
            <TableColumn>{t('admin.users.columns.createdAt')}</TableColumn>
          </TableHeader>
          <TableBody>
            {isUsersLoading
              ? (Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, c) => (
                      <TableCell key={c}><Skeleton className="h-4 w-full rounded" /></TableCell>
                    ))}
                  </TableRow>
                )) as unknown as React.ReactElement)
              : (users?.map((u) => (
                <TableRow key={u.id} className={u.isActive ? '' : 'opacity-50'}>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{u.username}</span>
                      {u.id === user.id && <Chip size="sm" variant="flat" radius="sm">{t('admin.users.me')}</Chip>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Tooltip content={u.id === user.id ? t('admin.users.deactivateSelf') : ''} isDisabled={u.id !== user.id}>
                      <Switch
                        isSelected={u.isAdmin}
                        onValueChange={(checked) => handleRoleToggle(u, checked)}
                        isDisabled={u.id === user.id}
                        size="sm"
                        color="primary"
                        aria-label={`${t('admin.users.columns.role')}: ${u.username}`}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-center">
                    <Tooltip content={u.id === user.id ? t('admin.users.deactivateSelf') : u.isActive ? t('admin.users.deactivate') : t('admin.users.activate')} delay={500}>
                      <Button
                        isIconOnly size="sm" variant="light"
                        color={u.isActive ? 'success' : 'default'}
                        onPress={() => handleStatusToggle(u)}
                        isDisabled={u.id === user.id}
                        aria-label={u.id === user.id ? t('admin.users.deactivateSelf') : u.isActive ? t('admin.users.deactivate') : t('admin.users.activate')}
                      >
                        {u.isActive ? <CheckCircle size={16} /> : <Ban size={16} />}
                      </Button>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-sm text-foreground-400">
                    {hasMounted ? new Date(u.createdAt).toLocaleDateString() : ''}
                  </TableCell>
                </TableRow>
              )) as unknown as React.ReactElement)
            }
          </TableBody>
        </Table>
      </div>

      <MaturityReferencesSection />

      <SystemConfigSection />

      {/* Audit log */}
      <div className="bg-content1 border border-divider rounded-2xl p-6 mt-6 overflow-hidden">
        <h2 className="text-base font-semibold mb-1">{t('admin.auditLog.title')}</h2>
        <p className="text-sm text-foreground-500 mb-4">{t('admin.auditLog.subtitle')}</p>

        <Table isCompact shadow="none" radius="md" classNames={{ wrapper: 'border border-divider rounded-xl' }} aria-label={t('admin.auditLog.title')}>
          <TableHeader>
            <TableColumn>{t('admin.auditLog.columns.date')}</TableColumn>
            <TableColumn>{t('admin.auditLog.columns.user')}</TableColumn>
            <TableColumn>{t('admin.auditLog.columns.action')}</TableColumn>
            <TableColumn>{t('admin.auditLog.columns.status')}</TableColumn>
            <TableColumn>{t('admin.auditLog.columns.ip')}</TableColumn>
          </TableHeader>
          <TableBody>
            {isAuditLoading
              ? (Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, c) => (
                      <TableCell key={c}><Skeleton className="h-4 w-full rounded" /></TableCell>
                    ))}
                  </TableRow>
                )) as unknown as React.ReactElement)
              : auditResponse?.items.length === 0
              ? (<TableRow><TableCell colSpan={5} className="text-center py-4 text-sm text-foreground-400">{t('admin.auditLog.noLogs')}</TableCell></TableRow>) as unknown as React.ReactElement
              : (auditResponse?.items.map((entry: AuditLogEntry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-xs">{hasMounted ? new Date(entry.createdAt).toLocaleString() : ''}</TableCell>
                  <TableCell className="text-sm">{entry.user?.username || '—'}</TableCell>
                  <TableCell><Chip size="sm" variant="bordered" radius="sm">{entry.action}</Chip></TableCell>
                  <TableCell>
                    <Chip size="sm" color={entry.status === 'success' ? 'success' : 'danger'} variant="flat" radius="sm">{entry.status}</Chip>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-foreground-400">{entry.ip}</TableCell>
                </TableRow>
              )) as unknown as React.ReactElement)
            }
          </TableBody>
        </Table>

        {auditResponse?.meta && auditResponse.meta.pages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2">
            <span className="text-xs text-foreground-400">
              {t('admin.auditLog.pageInfo', { page: auditResponse.meta.page, pages: auditResponse.meta.pages, total: auditResponse.meta.total })}
            </span>
            <Button isIconOnly size="sm" variant="light" onPress={() => setAuditPage(p => Math.max(1, p - 1))} isDisabled={auditPage <= 1} aria-label={t('admin.auditLog.prevPage')}>
              <ChevronLeft size={16} />
            </Button>
            <Button isIconOnly size="sm" variant="light" onPress={() => setAuditPage(p => p + 1)} isDisabled={auditPage >= (auditResponse?.meta.pages ?? 1)} aria-label={t('admin.auditLog.nextPage')}>
              <ChevronRight size={16} />
            </Button>
          </div>
        )}
      </div>

      {/* Maintenance */}
      <div className="bg-danger-50/50 border border-danger-200 rounded-2xl p-6 mt-6">
        <h2 className="text-base font-semibold text-danger mb-1 flex items-center gap-2">
          <Trash2 size={16} /> {t('admin.maintenance.title')}
        </h2>
        <p className="text-sm text-foreground-500 mb-4">{t('admin.maintenance.purge.description')}</p>

        {purgeResult && (
          <div className="bg-success-50 border border-success-200 text-success text-sm rounded-xl px-4 py-3 mb-4">
            <p className="font-semibold mb-1">{t('admin.maintenance.purge.success')}</p>
            <p className="text-xs">{t('admin.maintenance.purge.counts.bottles', { count: purgeResult.counts.bottles })} · {t('admin.maintenance.purge.counts.cellars', { count: purgeResult.counts.cellars })} · {t('admin.maintenance.purge.counts.logs', { count: purgeResult.counts.auditLogs })}</p>
          </div>
        )}

        {purgeError && (
          <div className="bg-danger-50 border border-danger-200 text-danger text-sm rounded-xl px-4 py-3 mb-4">
            {t('admin.maintenance.purge.error')} ({purgeError})
          </div>
        )}

        <Button color="danger" variant="solid" startContent={<Trash2 size={14} />} onPress={() => setIsPurgeDialogOpen(true)} isDisabled={isPurging}>
          {t('admin.maintenance.purge.button')}
        </Button>
      </div>

      {/* Purge dialog */}
      <Modal
        isOpen={isPurgeDialogOpen}
        onClose={() => !isPurging && setIsPurgeDialogOpen(false)}
        size="sm" radius="lg" backdrop="opaque" placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-danger">{t('admin.maintenance.purge.confirmTitle')}</ModalHeader>
              <ModalBody className="flex flex-col gap-3">
                <p className="text-sm text-foreground-500">{t('admin.maintenance.purge.confirmDescription')}</p>
                <Input
                  label={t('admin.maintenance.purge.keywordLabel')}
                  value={confirmationText}
                  onValueChange={setConfirmationText}
                  placeholder={t('admin.maintenance.purge.keywordValue')}
                  variant="bordered" size="md" radius="md" labelPlacement="outside"
                  isDisabled={isPurging}
                  autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose} isDisabled={isPurging}>{t('actions.cancel')}</Button>
                <Button
                  color="danger" variant="solid"
                  onPress={handleConfirmPurge}
                  isDisabled={confirmationText !== t('admin.maintenance.purge.keywordValue') || isPurging}
                  isLoading={isPurging}
                >
                  {t('actions.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
    </MainLayout>
  );
}
