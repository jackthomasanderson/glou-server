import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = {
  title: "Login - Glou",
};

export default function LoginPage() {
  return (
    <div className="auth-shell">
      <LoginForm />
    </div>
  );
}
