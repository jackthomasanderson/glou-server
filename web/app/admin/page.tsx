'use client';
import React, { useEffect } from 'react';
import { Container, Typography, Paper, Box, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
    const { t } = useTranslation();
    const { data: user, isLoading } = useMe();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !user?.isAdmin) {
            router.push('/');
        }
    }, [user, isLoading, router]);

    if (isLoading || !user?.isAdmin) {
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
                <Typography variant="h6">Admin Dashboard</Typography>
                <Typography variant="body1" sx={{ mt: 2 }}>
                    Bienvenue dans l'espace d'administration. Cet espace est réservé aux administrateurs.
                </Typography>
            </Paper>
        </Container>
    );
}
