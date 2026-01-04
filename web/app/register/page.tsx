import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata = {
  title: "Register - Glou",
};

export default function RegisterPage() {
  return (
    <div className="auth-shell">
      <RegisterForm />
    </div>
  );
}
