import type { Metadata } from 'next';
import { ResetPasswordClient } from './ResetPasswordClient';

export const metadata: Metadata = {
  title: 'Reset password · Réinitialisation du mot de passe — Glou',
};

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
