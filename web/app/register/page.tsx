import { Box } from '@mui/material';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata = {
  title: 'Register — Glou',
};

export default function RegisterPage() {
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
      <RegisterForm />
    </Box>
  );
}
