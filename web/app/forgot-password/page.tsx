import type { Metadata } from 'next';
import { ForgotPasswordClient } from './ForgotPasswordClient';

export const metadata: Metadata = {
  title: 'Forgot password · Mot de passe oublié — Glou',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
