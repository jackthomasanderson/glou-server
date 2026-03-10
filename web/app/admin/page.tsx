'use client';
import React, { useEffect } from 'react';
import {
    Container, Typography, Paper, Box, CircularProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Switch, Skeleton,
    Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, TextField,
    Alert, AlertTitle, Stack
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/hooks/useAuth';
import { useAdminUsers, useUpdateUserRole, AdminUser, usePurgeData, PurgeResult } from '@/hooks/useAdmin';
import { useRouter } from 'next/navigation';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

export default function AdminPage() {
    const { t } = useTranslation();
    const { data: user, isLoading: isAuthLoading } = useMe();
    const router = useRouter();

    const { data: users, isLoading: isUsersLoading } = useAdminUsers();
    const { mutate: updateRole } = useUpdateUserRole();
    const { mutate: purgeAll, isPending: isPurging } = usePurgeData();

    const [isPurgeDialogOpen, setIsPurgeDialogOpen] = React.useState(false);
    const [confirmationText, setConfirmationText] = React.useState('');
    const [purgeResult, setPurgeResult] = React.useState<PurgeResult | null>(null);
    const [purgeError, setPurgeError] = React.useState<string | null>(null);

    useEffect(() => {
        if (!isAuthLoading && !user?.isAdmin) {
            router.push('/');
        }
    }, [user, isAuthLoading, router]);

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
            }
        });
    };

    const handleRoleToggle = (targetUser: AdminUser, checked: boolean) => {
        if (targetUser.id === user?.id) return; // double safe guard
        updateRole({ userId: targetUser.id, isAdmin: checked }, {
            onError: (err) => {
                console.error("Erreur lors de la modification du rôle :", err);
            }
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
                    {t('common.back', 'Retour')}
                </Button>
                <Typography variant="h4" fontWeight="bold">
                    {t('nav.admin', 'Administration')}
                </Typography>
            </Box>

            <Paper sx={{ p: 4, mt: 4, borderRadius: 3 }}>
                <Typography variant="h6" gutterBottom>Gestion des Utilisateurs</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Gérez ici les rôles des utilisateurs de toute la plateforme.
                </Typography>

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Email</TableCell>
                                <TableCell>Nom d&apos;utilisateur</TableCell>
                                <TableCell align="center">Rôle Admin</TableCell>
                                <TableCell>Date de création</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isUsersLoading ? (
                                Array.from(new Array(3)).map((_, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell><Skeleton variant="text" /></TableCell>
                                        <TableCell><Skeleton variant="text" /></TableCell>
                                        <TableCell><Skeleton variant="text" /></TableCell>
                                        <TableCell><Skeleton variant="text" /></TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                users?.map((u) => (
                                    <TableRow key={u.id}>
                                        <TableCell>{u.email}</TableCell>
                                        <TableCell>{u.username}</TableCell>
                                        <TableCell align="center">
                                            <Switch
                                                checked={u.isAdmin}
                                                onChange={(e) => handleRoleToggle(u, e.target.checked)}
                                                disabled={u.id === user.id} // User cannot demote themselves
                                            />
                                        </TableCell>
                                        <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* Maintenance Section */}
            <Paper sx={{ p: 4, mt: 4, borderRadius: 3, border: '1px solid', borderColor: 'error.light', bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.1)' : 'rgba(211, 47, 47, 0.03)' }}>
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

            {/* Purge Confirmation Dialog */}
            <Dialog
                open={isPurgeDialogOpen}
                onClose={() => !isPurging && setIsPurgeDialogOpen(false)}
            >
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
                        {isPurging ? <CircularProgress size={24} color="inherit" /> : t('actions.delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
