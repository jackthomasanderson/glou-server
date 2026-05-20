'use client';
import React from 'react';
import {
    Container, Typography, Paper, Box, CircularProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Switch, Skeleton, Button, Dialog, DialogTitle, DialogContent,
    DialogContentText, DialogActions, TextField, Alert, AlertTitle,
    Stack, Chip, Tooltip, IconButton,
} from '@mui/material';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/hooks/useAuth';
import {
    useAdminUsers, useUpdateUserRole, useUpdateUserStatus,
    useAdminAuditLogs, usePurgeData,
    AdminUser, AuditLogEntry, PurgeResult,
} from '@/hooks/useAdmin';
import { useRouter } from 'next/navigation';
import { useHasMounted } from '@/hooks/useHasMounted';

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
        if (!isAuthLoading && !user?.isAdmin) {
            router.push('/');
        }
    }, [user, isAuthLoading, router]);

    const handleRoleToggle = (targetUser: AdminUser, checked: boolean) => {
        if (targetUser.id === user?.id) return;
        updateRole({ userId: targetUser.id, isAdmin: checked });
    };

    const handleStatusToggle = (targetUser: AdminUser) => {
        if (targetUser.id === user?.id) return;
        updateStatus({ userId: targetUser.id, isActive: !targetUser.isActive });
    };

    const handlePurgeClick = () => {
        setIsPurgeDialogOpen(true);
        setPurgeResult(null);
        setPurgeError(null);
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
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box display="flex" alignItems="center" mb={2}>
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => router.push('/')}
                    sx={{ mr: 2 }}
                    variant="outlined"
                >
                    {t('actions.back')}
                </Button>
                <Typography variant="h4" fontWeight="bold">
                    {t('admin.title')}
                </Typography>
            </Box>

            {/* ── User management ────────────────────────────────────────────── */}
            <Paper sx={{ p: 4, mt: 4, borderRadius: 3 }}>
                <Typography variant="h6" gutterBottom>{t('admin.users.title')}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    {t('admin.users.subtitle')}
                </Typography>

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('admin.users.columns.email')}</TableCell>
                                <TableCell>{t('admin.users.columns.username')}</TableCell>
                                <TableCell align="center">{t('admin.users.columns.role')}</TableCell>
                                <TableCell align="center">{t('admin.users.columns.status')}</TableCell>
                                <TableCell>{t('admin.users.columns.createdAt')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isUsersLoading
                                ? Array.from(new Array(3)).map((_, idx) => (
                                    <TableRow key={idx}>
                                        {Array.from(new Array(5)).map((__, c) => (
                                            <TableCell key={c}><Skeleton variant="text" /></TableCell>
                                        ))}
                                    </TableRow>
                                ))
                                : users?.map((u) => (
                                    <TableRow key={u.id} sx={{ opacity: u.isActive ? 1 : 0.5 }}>
                                        <TableCell>{u.email}</TableCell>
                                        <TableCell>
                                            {u.username}
                                            {u.id === user.id && (
                                                <Chip label={t('admin.users.me')} size="small" sx={{ ml: 1 }} />
                                            )}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title={u.id === user.id ? t('admin.users.deactivateSelf') : ''}>
                                                <span>
                                                    <Switch
                                                        checked={u.isAdmin}
                                                        onChange={(e) => handleRoleToggle(u, e.target.checked)}
                                                        disabled={u.id === user.id}
                                                        size="small"
                                                    />
                                                </span>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title={u.id === user.id
                                                ? t('admin.users.deactivateSelf')
                                                : u.isActive ? t('admin.users.deactivate') : t('admin.users.activate')
                                            }>
                                                <span>
                                                    <IconButton
                                                        size="small"
                                                        color={u.isActive ? 'success' : 'default'}
                                                        onClick={() => handleStatusToggle(u)}
                                                        disabled={u.id === user.id}
                                                    >
                                                        {u.isActive
                                                            ? <CheckCircleIcon fontSize="small" />
                                                            : <BlockIcon fontSize="small" />
                                                        }
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell>
                                            {hasMounted ? new Date(u.createdAt).toLocaleDateString() : ''}
                                        </TableCell>
                                    </TableRow>
                                ))
                            }
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* ── Audit log ──────────────────────────────────────────────────── */}
            <Paper sx={{ p: 4, mt: 4, borderRadius: 3 }}>
                <Typography variant="h6" gutterBottom>{t('admin.auditLog.title')}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    {t('admin.auditLog.subtitle')}
                </Typography>

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('admin.auditLog.columns.date')}</TableCell>
                                <TableCell>{t('admin.auditLog.columns.user')}</TableCell>
                                <TableCell>{t('admin.auditLog.columns.action')}</TableCell>
                                <TableCell>{t('admin.auditLog.columns.status')}</TableCell>
                                <TableCell>{t('admin.auditLog.columns.ip')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isAuditLoading
                                ? Array.from(new Array(5)).map((_, idx) => (
                                    <TableRow key={idx}>
                                        {Array.from(new Array(5)).map((__, c) => (
                                            <TableCell key={c}><Skeleton variant="text" /></TableCell>
                                        ))}
                                    </TableRow>
                                ))
                                : auditResponse?.items.length === 0
                                ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center">
                                            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                                {t('admin.auditLog.noLogs')}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                )
                                : auditResponse?.items.map((entry: AuditLogEntry) => (
                                    <TableRow key={entry.id}>
                                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                            {hasMounted ? new Date(entry.createdAt).toLocaleString() : ''}
                                        </TableCell>
                                        <TableCell>{entry.user?.username || '—'}</TableCell>
                                        <TableCell>
                                            <Chip label={entry.action} size="small" variant="outlined" />
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={entry.status}
                                                size="small"
                                                color={entry.status === 'success' ? 'success' : 'error'}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                            {entry.ip}
                                        </TableCell>
                                    </TableRow>
                                ))
                            }
                        </TableBody>
                    </Table>
                </TableContainer>

                {auditResponse?.meta && auditResponse.meta.pages > 1 && (
                    <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                            {t('admin.auditLog.pageInfo', {
                                page: auditResponse.meta.page,
                                pages: auditResponse.meta.pages,
                                total: auditResponse.meta.total,
                            })}
                        </Typography>
                        <IconButton
                            size="small"
                            onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                            disabled={auditPage <= 1}
                        >
                            <NavigateBeforeIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                            size="small"
                            onClick={() => setAuditPage((p) => p + 1)}
                            disabled={auditPage >= (auditResponse?.meta.pages ?? 1)}
                        >
                            <NavigateNextIcon fontSize="small" />
                        </IconButton>
                    </Box>
                )}
            </Paper>

            {/* ── Maintenance ───────────────────────────────────────────────── */}
            <Paper sx={{
                p: 4, mt: 4, borderRadius: 3,
                border: '1px solid',
                borderColor: 'error.light',
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(211,47,47,0.1)' : 'rgba(211,47,47,0.03)',
            }}>
                <Typography variant="h6" color="error.main" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DeleteForeverIcon /> {t('admin.maintenance.title')}
                </Typography>
                <Typography variant="body2" sx={{ mb: 3 }}>
                    {t('admin.maintenance.purge.description')}
                </Typography>

                {purgeResult && (
                    <Alert severity="success" sx={{ mb: 3 }}>
                        <AlertTitle>{t('admin.maintenance.purge.success')}</AlertTitle>
                        <Stack direction="row" spacing={2}>
                            <Typography variant="caption">{t('admin.maintenance.purge.counts.bottles', { count: purgeResult.counts.bottles })}</Typography>
                            <Typography variant="caption">{t('admin.maintenance.purge.counts.cellars', { count: purgeResult.counts.cellars })}</Typography>
                            <Typography variant="caption">{t('admin.maintenance.purge.counts.logs', { count: purgeResult.counts.auditLogs })}</Typography>
                        </Stack>
                    </Alert>
                )}

                {purgeError && (
                    <Alert severity="error" sx={{ mb: 3 }}>
                        {t('admin.maintenance.purge.error')} ({purgeError})
                    </Alert>
                )}

                <Button
                    variant="contained"
                    color="error"
                    startIcon={<DeleteForeverIcon />}
                    onClick={handlePurgeClick}
                    disabled={isPurging}
                >
                    {t('admin.maintenance.purge.button')}
                </Button>
            </Paper>

            {/* ── Purge dialog ──────────────────────────────────────────────── */}
            <Dialog open={isPurgeDialogOpen} onClose={() => !isPurging && setIsPurgeDialogOpen(false)}>
                <DialogTitle color="error.main">
                    {t('admin.maintenance.purge.confirmTitle')}
                </DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        {t('admin.maintenance.purge.confirmDescription')}
                    </DialogContentText>
                    <TextField
                        fullWidth
                        label={t('admin.maintenance.purge.keywordLabel')}
                        value={confirmationText}
                        onChange={(e) => setConfirmationText(e.target.value)}
                        placeholder={t('admin.maintenance.purge.keywordValue')}
                        disabled={isPurging}
                        autoFocus
                    />
                </DialogContent>
                <DialogActions sx={{ pb: 3, px: 3 }}>
                    <Button onClick={() => setIsPurgeDialogOpen(false)} disabled={isPurging}>
                        {t('actions.cancel')}
                    </Button>
                    <Button
                        onClick={handleConfirmPurge}
                        color="error"
                        variant="contained"
                        disabled={confirmationText !== t('admin.maintenance.purge.keywordValue') || isPurging}
                    >
                        {isPurging ? <CircularProgress size={24} color="inherit" /> : t('actions.confirm')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
