import { Box } from '@mui/material';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata = {
  title: 'Login — Glou',
};

export default function LoginPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <LoginForm />
    </Box>
  );
}
