import { LoginForm } from '@/components/auth/LoginForm';

export const metadata = {
  title: 'Login — Glou',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <LoginForm />
    </div>
  );
}
