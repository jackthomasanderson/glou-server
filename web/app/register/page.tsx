import { RegisterForm } from '../../components/auth/RegisterForm';

export const metadata = {
  title: 'Register — Glou',
};

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <RegisterForm />
    </div>
  );
}
