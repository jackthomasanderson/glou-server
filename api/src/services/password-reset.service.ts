import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { emailService } from './email.service';

const TOKEN_TTL_MINUTES = 15;

export const passwordResetService = {
  async requestReset(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    // Always resolve without error to prevent user enumeration
    if (!user || !user.isActive) return;

    // Invalidate any existing tokens for this user
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const resetUrl = `${appUrl}/reset-password/${rawToken}`;

    const lang = user.language ?? 'FR';
    const subject = lang === 'EN' ? 'Glou — Reset your password' : 'Glou — Réinitialisation de mot de passe';
    const html = lang === 'EN'
      ? `<p>Hello ${user.username},</p><p>Click the link below to reset your password. This link expires in ${TOKEN_TTL_MINUTES} minutes and can only be used once.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`
      : `<p>Bonjour ${user.username},</p><p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe. Ce lien expire dans ${TOKEN_TTL_MINUTES} minutes et ne peut être utilisé qu'une seule fois.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`;

    await emailService.send({ to: user.email, subject, html });
  },

  async validateToken(rawToken: string): Promise<{ valid: boolean; userId?: string }> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record) return { valid: false };
    if (record.usedAt) return { valid: false };
    if (record.expiresAt < new Date()) return { valid: false };

    return { valid: true, userId: record.userId };
  },

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new Error('INVALID_OR_EXPIRED_TOKEN');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { tokenHash }, data: { usedAt: new Date() } }),
    ]);
  },
};
