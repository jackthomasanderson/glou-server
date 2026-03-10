'use client';
import React, { useEffect } from 'react';
import {
    Container, Typography, Paper, Box, CircularProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Switch, Skeleton
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/hooks/useAuth';
import { useAdminUsers, useUpdateUserRole, AdminUser } from '@/hooks/useAdmin';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
    const { t } = useTranslation();
    const { data: user, isLoading: isAuthLoading } = useMe();
    const router = useRouter();

    const { data: users, isLoading: isUsersLoading } = useAdminUsers();
    const { mutate: updateRole } = useUpdateUserRole();

    useEffect(() => {
        if (!isAuthLoading && !user?.isAdmin) {
            router.push('/');
        }
    }, [user, isAuthLoading, router]);

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
            <Typography variant="h4" gutterBottom fontWeight="bold">
                {t('nav.admin', 'Administration')}
            </Typography>

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
        </Container>
    );
}
