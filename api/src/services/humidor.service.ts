import { prisma } from '../lib/prisma';
import { notificationService } from './notification.service';
import { RecordHumidorReadingInput } from '../schemas/humidor.schema';

// ─── Task 4: Humidor Hygrometric Monitoring ──────────────────────────────────
// Ingestion (manual today, 'sensor'-ready for a future bridge — not built
// here) + history + a simple drift check reusing the existing notification
// system exactly like FEAT-20's wishlist price-opportunity alert
// (wishlist.service.ts#recordPriceSeen / notifyOpportunity): fire-and-forget,
// a notification failure must never fail the reading write itself. Reuses
// the pre-existing `temperature` notification category ("Variations
// température/hygrométrie" in the FEAT-32 preferences UI) — it was already
// reserved for exactly this kind of alert but nothing fired it yet.
//
// Who gets notified: the user who recorded the reading (same precedent as
// wishlist's recordPriceSeen), NOT a broadcast to every instance member —
// there is no "notify all users" primitive anywhere in this codebase, and
// building one is out of scope for this pass.

export type HumidorDriftStatus = 'in_range' | 'out_of_range' | 'unconfigured';

interface DriftInputs {
  targetHumidityMin: number | null;
  targetHumidityMax: number | null;
}

function evaluateDrift(cellar: DriftInputs, humidityPercent: number): HumidorDriftStatus {
  if (cellar.targetHumidityMin == null || cellar.targetHumidityMax == null) return 'unconfigured';
  const inRange = humidityPercent >= cellar.targetHumidityMin && humidityPercent <= cellar.targetHumidityMax;
  return inRange ? 'in_range' : 'out_of_range';
}

export const humidorService = {
  async recordReading(userId: string, data: RecordHumidorReadingInput) {
    const cellar = await prisma.cellar.findFirst({ where: { id: data.cellarId } });
    if (!cellar) return null;

    const reading = await prisma.humidorReading.create({
      data: {
        cellarId: data.cellarId,
        userId,
        humidityPercent: data.humidityPercent,
        temperatureCelsius: data.temperatureCelsius ?? null,
        source: data.source ?? 'manual',
        recordedAt: data.recordedAt ?? new Date(),
      },
    });

    const drift = evaluateDrift(cellar, reading.humidityPercent);
    if (drift === 'out_of_range') {
      void notifyDrift(userId, cellar, reading).catch((err) => {
        console.error('[humidor] Failed to send drift notification:', err);
      });
    }

    return { reading, drift };
  },

  async getHistory(cellarId: string, limit = 30) {
    const cellar = await prisma.cellar.findFirst({ where: { id: cellarId } });
    if (!cellar) return null;

    const readings = await prisma.humidorReading.findMany({
      where: { cellarId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
    const latest = readings[0] ?? null;
    const drift = latest ? evaluateDrift(cellar, latest.humidityPercent) : 'unconfigured';

    return {
      cellar: {
        id: cellar.id,
        targetHumidityMin: cellar.targetHumidityMin,
        targetHumidityMax: cellar.targetHumidityMax,
      },
      readings,
      latest,
      drift,
    };
  },
};

async function notifyDrift(
  userId: string,
  cellar: { id: string; name: string; targetHumidityMin: number | null; targetHumidityMax: number | null },
  reading: { humidityPercent: number },
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true, notifLanguage: true } });
  if (!user) return;
  const isEn = (user.notifLanguage ?? user.language) === 'EN';

  const subject = isEn ? `Humidor drift: ${cellar.name}` : `Dérive détectée : ${cellar.name}`;
  const htmlBody = [
    `<p>${isEn
      ? `The latest hygrometry reading for <strong>${cellar.name}</strong> is outside your target range.`
      : `La dernière lecture d'hygrométrie de <strong>${cellar.name}</strong> est hors de votre plage cible.`}</p>`,
    '<ul>',
    `<li>${isEn ? 'Reading' : 'Lecture'}: ${reading.humidityPercent}%</li>`,
    `<li>${isEn ? 'Target range' : 'Plage cible'}: ${cellar.targetHumidityMin}% – ${cellar.targetHumidityMax}%</li>`,
    '</ul>',
  ].join('');

  await notificationService.send({ userId, category: 'temperature', subject, htmlBody });
}
