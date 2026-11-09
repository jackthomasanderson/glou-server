'use client';
import React from 'react';
import {
  Button, Chip, Input, Select, SelectItem, Skeleton,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from '@heroui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AUDIT_ACTIONS, AUDIT_STATUSES } from '@shared/audit';
import { useAdminAuditLogs, type AuditLogEntry, type AuditLogFilters } from '@/hooks/useAdmin';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useIsMobile } from '@/hooks/useIsMobile';
import { formatDateTime } from '@/lib/format';

const PAGE_SIZE = 50;

/**
 * The instance's audit log (#698): filtered by member/IP text, action types
 * and status (all with translated labels), and by day; a table on a large
 * screen, cards on a phone; the pages within reach above and below the list.
 */
export function AuditLogSection() {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();
  const isMobile = useIsMobile();

  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [filters, setFilters] = React.useState<AuditLogFilters>({});
  const { data, isLoading } = useAdminAuditLogs(page, PAGE_SIZE, filters);

  // Any filter change goes back to page 1; the text search waits for a pause in typing.
  const updateFilter = (patch: AuditLogFilters) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };
  React.useEffect(() => {
    const timer = setTimeout(() => updateFilter({ q: search.trim() }), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // An entry written by an older version may carry a code no longer listed: shown as is.
  const actionLabel = (code: string) => t(`admin.auditLog.actions.${code}`, { defaultValue: code });
  const statusLabel = (status: string) => t(`admin.auditLog.statuses.${status}`, { defaultValue: status });
  const actionOptions = React.useMemo(
    () => AUDIT_ACTIONS.map((code) => ({ code, label: actionLabel(code) })).sort((a, b) => a.label.localeCompare(b.label, i18n.language)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the labels change with the language only
    [i18n.language],
  );

  const when = (entry: AuditLogEntry) => (hasMounted ? formatDateTime(entry.createdAt, i18n.language) : '');
  const who = (entry: AuditLogEntry) => entry.user?.username || '—';
  const statusChip = (entry: AuditLogEntry) => (
    <Chip size="sm" color={entry.status === 'success' ? 'success' : 'danger'} variant="flat" radius="sm">{statusLabel(entry.status)}</Chip>
  );

  const meta = data?.meta;
  const pager = meta && meta.pages > 1 && (
    <div className="flex items-center justify-end gap-2">
      <span className="text-sm text-foreground-500">
        {t('admin.auditLog.pageInfo', { page: meta.page, pages: meta.pages, total: meta.total })}
      </span>
      <Button isIconOnly size="md" variant="light" onPress={() => setPage((p) => Math.max(1, p - 1))} isDisabled={page <= 1} aria-label={t('admin.auditLog.prevPage')}>
        <ChevronLeft size={16} />
      </Button>
      <Button isIconOnly size="md" variant="light" onPress={() => setPage((p) => p + 1)} isDisabled={page >= meta.pages} aria-label={t('admin.auditLog.nextPage')}>
        <ChevronRight size={16} />
      </Button>
    </div>
  );

  const empty = <p className="text-center py-4 text-sm text-foreground-500">{t('admin.auditLog.noLogs')}</p>;

  const cards = isLoading
    ? <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
    : !data?.items.length
    ? empty
    : (
      <ul className="flex flex-col gap-2" aria-label={t('admin.auditLog.title')}>
        {data.items.map((entry) => (
          <li key={entry.id} className="border border-divider rounded-xl p-3 flex flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium break-words">{actionLabel(entry.action)}</span>
              {statusChip(entry)}
            </div>
            <span className="text-sm">{who(entry)}</span>
            <span className="text-xs text-foreground-500">{when(entry)} · <span className="font-mono">{entry.ip}</span></span>
          </li>
        ))}
      </ul>
    );

  const table = (
    <Table isCompact shadow="none" radius="md" classNames={{ wrapper: 'border border-divider rounded-xl' }} aria-label={t('admin.auditLog.title')}>
      <TableHeader>
        <TableColumn>{t('admin.auditLog.columns.date')}</TableColumn>
        <TableColumn>{t('admin.auditLog.columns.user')}</TableColumn>
        <TableColumn>{t('admin.auditLog.columns.action')}</TableColumn>
        <TableColumn>{t('admin.auditLog.columns.status')}</TableColumn>
        <TableColumn>{t('admin.auditLog.columns.ip')}</TableColumn>
      </TableHeader>
      <TableBody>
        <>{isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 5 }).map((__, c) => (
                  <TableCell key={c}><Skeleton className="h-4 w-full rounded" /></TableCell>
                ))}
              </TableRow>
            ))
          : !data?.items.length
          ? (<TableRow><TableCell colSpan={5}>{empty}</TableCell></TableRow>)
          : data.items.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-xs">{when(entry)}</TableCell>
              <TableCell className="text-sm">{who(entry)}</TableCell>
              <TableCell><Chip size="sm" variant="bordered" radius="sm">{actionLabel(entry.action)}</Chip></TableCell>
              <TableCell>{statusChip(entry)}</TableCell>
              <TableCell className="font-mono text-xs text-foreground-500">{entry.ip}</TableCell>
            </TableRow>
          ))
        }</>
      </TableBody>
    </Table>
  );

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-4 sm:p-6">
      <h2 className="text-base font-semibold mb-1">{t('admin.auditLog.title')}</h2>
      <p className="text-sm text-foreground-500 mb-4">{t('admin.auditLog.subtitle')}</p>

      {/* #698: one column on a phone, two from `sm` — four fields never squeeze into one line. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Input
          size="sm" variant="bordered" className="sm:col-span-2"
          label={t('admin.auditLog.filters.search')}
          placeholder={t('admin.auditLog.filters.searchPlaceholder')}
          value={search}
          onValueChange={setSearch}
          isClearable
        />
        <Select
          // select-may-empty: a filter without an "all" choice: emptying it shows every action.
          size="sm" variant="bordered" selectionMode="multiple"
          label={t('admin.auditLog.filters.actions')}
          selectedKeys={new Set(filters.actions ?? [])}
          onSelectionChange={(keys) => updateFilter({ actions: keys === 'all' ? [] : Array.from(keys, String) })}
        >
          {actionOptions.map(({ code, label }) => <SelectItem key={code}>{label}</SelectItem>)}
        </Select>
        <Select
          // select-may-empty: a filter without an "all" choice: emptying it shows every status.
          size="sm" variant="bordered"
          label={t('admin.auditLog.columns.status')}
          selectedKeys={filters.status ? [filters.status] : []}
          onSelectionChange={(keys) => updateFilter({ status: String(Array.from(keys)[0] ?? '') })}
        >
          {AUDIT_STATUSES.map((s) => <SelectItem key={s}>{statusLabel(s)}</SelectItem>)}
        </Select>
        <Input
          size="sm" variant="bordered" type="date"
          label={t('admin.auditLog.filters.from')}
          value={filters.from ?? ''}
          onValueChange={(v) => updateFilter({ from: v })}
        />
        <Input
          size="sm" variant="bordered" type="date"
          label={t('admin.auditLog.filters.to')}
          value={filters.to ?? ''}
          onValueChange={(v) => updateFilter({ to: v })}
        />
      </div>

      {pager && <div className="mb-3">{pager}</div>}
      {isMobile ? cards : table}
      {pager && <div className="mt-3">{pager}</div>}
    </div>
  );
}
