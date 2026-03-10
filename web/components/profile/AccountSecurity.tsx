'use client';
import React, { useState } from 'react';
import {
    Box,
    Typography,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Alert,
    Paper,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { PublicUser, useUpdateEmail, useUpdatePassword } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';

export function AccountSecurity({ user }: { user: PublicUser }) {
    const { t } = useTranslation();

    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

    const [email, setEmail] = useState(user.email);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');

    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const updateEmail = useUpdateEmail();
    const updatePassword = useUpdatePassword();

    const handleOpenEmail = () => {
        setEmail(user.email);
        setErrorMsg(null);
        setSuccessMsg(null);
        setIsEmailModalOpen(true);
    };

    const handleConfirmEmail = () => {
        setErrorMsg(null);
        updateEmail.mutate({ email }, {
            onSuccess: () => {
                setIsEmailModalOpen(false);
                setSuccessMsg(t('profile.emailSuccess'));
                setTimeout(() => setSuccessMsg(null), 3000);
            },
            onError: (err: Error) => {
                if (err.message === 'EMAIL_ALREADY_TAKEN') {
                    setErrorMsg(t('auth.errors.EMAIL_ALREADY_TAKEN'));
                } else {
                    setErrorMsg(t('status.error'));
                }
            }
        });
    };

    const handleOpenPassword = () => {
        setCurrentPassword('');
        setNewPassword('');
        setErrorMsg(null);
        setSuccessMsg(null);
        setIsPasswordModalOpen(true);
    };

    const handleConfirmPassword = () => {
        setErrorMsg(null);
        updatePassword.mutate({ currentPassword, newPassword }, {
            onSuccess: () => {
                setIsPasswordModalOpen(false);
                setCurrentPassword('');
                setNewPassword('');
                setSuccessMsg(t('profile.passwordSuccess'));
                setTimeout(() => setSuccessMsg(null), 3000);
            },
            onError: (err: Error) => {
                if (err.message === 'INVALID_CREDENTIALS') {
                    setErrorMsg(t('profile.passwordError'));
                } else {
                    setErrorMsg(t('status.error'));
                }
            }
        });
    };

    return (
        <Paper sx={{ p: 3, height: '100%', borderRadius: 3, mt: 4 }}>
            <Box display="flex" alignItems="center" gap={1.5} mb={3}>
                <LockIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                    {t('profile.security')}
                </Typography>
            </Box>

            {successMsg && (
                <Alert severity="success" sx={{ mb: 3 }}>
                    {successMsg}
                </Alert>
            )}

            <Box display="flex" flexDirection="column" gap={2}>
                <Box display="flex" alignItems="center" justifyContent="space-between" p={2} bgcolor="action.hover" borderRadius={2}>
                    <Box>
                        <Typography variant="body2" color="text.secondary">Adresse Email</Typography>
                        <Typography variant="body1" fontWeight={500}>{user.email}</Typography>
                    </Box>
                    <Button variant="outlined" size="small" onClick={handleOpenEmail}>
                        Modifier
                    </Button>
                </Box>

                <Box display="flex" alignItems="center" justifyContent="space-between" p={2} bgcolor="action.hover" borderRadius={2}>
                    <Box>
                        <Typography variant="body2" color="text.secondary">Mot de passe</Typography>
                        <Typography variant="body1" fontWeight={500}>••••••••••••</Typography>
                    </Box>
                    <Button variant="outlined" size="small" onClick={handleOpenPassword}>
                        Modifier
                    </Button>
                </Box>
            </Box>

            {/* Email Modal */}
            <Dialog open={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('profile.changeEmail')}</DialogTitle>
                <DialogContent dividers>
                    {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}
                    <TextField
                        label={t('auth.email')}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        fullWidth
                        margin="normal"
                        autoComplete="off"
                        autoFocus
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsEmailModalOpen(false)} color="inherit">{t('actions.cancel')}</Button>
                    <Button
                        onClick={handleConfirmEmail}
                        variant="contained"
                        disabled={!email || email === user.email || updateEmail.isPending}
                    >
                        {updateEmail.isPending ? t('status.saving') : t('actions.confirm')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Password Modal */}
            <Dialog open={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('profile.changePassword')}</DialogTitle>
                <DialogContent dividers>
                    {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}
                    <TextField
                        label={t('profile.currentPassword')}
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        fullWidth
                        margin="normal"
                        autoComplete="current-password"
                        autoFocus
                    />
                    <TextField
                        label={t('profile.newPassword')}
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        fullWidth
                        margin="normal"
                        autoComplete="new-password"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsPasswordModalOpen(false)} color="inherit">{t('actions.cancel')}</Button>
                    <Button
                        onClick={handleConfirmPassword}
                        variant="contained"
                        disabled={!currentPassword || newPassword.length < 8 || updatePassword.isPending}
                    >
                        {updatePassword.isPending ? t('status.saving') : t('actions.confirm')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}
