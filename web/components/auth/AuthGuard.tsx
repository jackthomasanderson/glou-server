'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { useMe } from '@/hooks/useAuth';

/**
 * AuthGuard — wraps protected client pages.
 * - If user is loading: show spinner
 * - If user is null (unauthenticated): redirect to /login
 * - Otherwise: render children
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user === null) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
