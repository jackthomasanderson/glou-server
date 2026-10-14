import { prisma } from '../lib/prisma';
import { notificationService } from './notification.service';
import { RecordHumidorReadingInput } from '../schemas/humidor.schema';

// ─── Task 4: Humidor Hygrometric Monitoring ──────────────────────────────────
// Ingestion (manual today, 'sensor'-ready for a future bridge — not built
// here) + history + a drift check reusing the existing notification system
// exactly like FEAT-20's wishlist price-opportunity alert
// (wishlist.service.ts#recordPriceSeen / notifyOpportunity): fire-and-forget,
// a notification failure must never fail the reading write itself. Reuses
// the pre-existing `temperature` notification category ("Variations
// température/hygrométrie" in the FEAT-32 preferences UI).
//
// ISSUE_027: a reading only gets recorded by a human typing a value in, and
// the resulting alert used to go only to that same person — i.e. the app
// told someone a number they had just taught it, and nobody else ever heard
// about it. Two fixes, matching the audit's suggested direction:
//  1. `notifyDrift` now broadcasts to every instance member (precedent:
//     `backup.service.ts#notifyAdminsOfBackupFailure` already iterates
//     `prisma.user.findMany` + `Promise.all` to fan a single event out to
//     several accounts — this is the same pattern, just over every member
//     instead of only the admins).
//  2. `checkHumidorDrift` (new) runs daily off the existing cron
//     (`api/src/index.ts`) and catches the case nobody above covers at all:
//     no one opened the app for the whole holiday, so no reading — and
//     therefore no alert — was ever produced. It flags a monitored cellar
//     whose last reading is stale (`STALE_AFTER_DAYS`) or still out of
//     range, and broadcasts the same way.
const STALE_AFTER_DAYS = 7;

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
      void notifyDrift(cellar, reading).catch((err) => {
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

/**
 * Fans a single event out to every instance member, each in their own
 * notification-preference language — same pattern as
 * `backup.service.ts#notifyAdminsOfBackupFailure`, minus the `isAdmin`
 * filter (ISSUE_027: a humidor is shared household equipment, every member
 * who might walk down and check on it should hear about a drift).
 */
async function notifyAllMembers(
  category: 'temperature',
  subjectFor: (isEn: boolean) => string,
  htmlBodyFor: (isEn: boolean) => string,
): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true, language: true, notifLanguage: true } });
  await Promise.all(users.map((user) => {
    const isEn = (user.notifLanguage ?? user.language) === 'EN';
    return notificationService.send({
      userId: user.id,
      category,
      subject: subjectFor(isEn),
      htmlBody: htmlBodyFor(isEn),
    });
  }));
}

async function notifyDrift(
  cellar: { id: string; name: string; targetHumidityMin: number | null; targetHumidityMax: number | null },
  reading: { humidityPercent: number },
): Promise<void> {
  await notifyAllMembers(
    'temperature',
    (isEn) => (isEn ? `Humidor drift: ${cellar.name}` : `Dérive détectée : ${cellar.name}`),
    (isEn) => [
      `<p>${isEn
        ? `The latest hygrometry reading for <strong>${cellar.name}</strong> is outside the target range.`
        : `La dernière lecture d'hygrométrie de <strong>${cellar.name}</strong> est hors de la plage cible.`}</p>`,
      '<ul>',
      `<li>${isEn ? 'Reading' : 'Lecture'}: ${reading.humidityPercent}%</li>`,
      `<li>${isEn ? 'Target range' : 'Plage cible'}: ${cellar.targetHumidityMin}% – ${cellar.targetHumidityMax}%</li>`,
      '</ul>',
    ].join(''),
  );
}

export interface HumidorDriftCheckResult {
  scanned: number;
  alerted: number;
}

/**
 * Daily sweep (ISSUE_027) over every cellar with a configured target range:
 * catches the case no entry-time check can, because no entry ever happened
 * — nobody opened the app during the whole holiday, so the drift that
 * occurred along the way produced no reading and therefore no alert at all.
 * Flags a cellar whose last reading is older than `STALE_AFTER_DAYS` (no one
 * is watching it any more) or still out of range (the problem was reported
 * once but never fixed) — in both cases every member is re-notified, not
 * just whoever happened to log the last reading.
 */
export async function checkHumidorDrift(): Promise<HumidorDriftCheckResult> {
  const cellars = await prisma.cellar.findMany({
    where: { targetHumidityMin: { not: null }, targetHumidityMax: { not: null } },
  });

  let alerted = 0;
  const staleCutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  for (const cellar of cellars) {
    const latest = await prisma.humidorReading.findFirst({
      where: { cellarId: cellar.id },
      orderBy: { recordedAt: 'desc' },
    });

    if (!latest) {
      if (cellar.createdAt > staleCutoff) continue; // newly configured, not stale yet
      await notifyStale(cellar, null);
      alerted++;
      continue;
    }

    if (latest.recordedAt < staleCutoff) {
      await notifyStale(cellar, latest.recordedAt);
      alerted++;
      continue;
    }

    if (evaluateDrift(cellar, latest.humidityPercent) === 'out_of_range') {
      await notifyDrift(cellar, latest);
      alerted++;
    }
  }

  return { scanned: cellars.length, alerted };
}

async function notifyStale(
  cellar: { id: string; name: string },
  lastRecordedAt: Date | null,
): Promise<void> {
  await notifyAllMembers(
    'temperature',
    (isEn) => (isEn ? `No recent humidor reading: ${cellar.name}` : `Aucune lecture récente : ${cellar.name}`),
    (isEn) => {
      const since = lastRecordedAt
        ? (isEn
          ? `The last reading was taken on ${lastRecordedAt.toISOString().slice(0, 10)}.`
          : `La dernière lecture date du ${lastRecordedAt.toISOString().slice(0, 10)}.`)
        : (isEn ? 'No reading has ever been recorded.' : 'Aucune lecture n’a jamais été enregistrée.');
      return `<p>${isEn
        ? `<strong>${cellar.name}</strong> has a target hygrometry range configured, but nobody has recorded a reading in over ${STALE_AFTER_DAYS} days.`
        : `<strong>${cellar.name}</strong> a une plage d'hygrométrie cible configurée, mais personne n'a saisi de lecture depuis plus de ${STALE_AFTER_DAYS} jours.`} ${since}</p>`;
    },
  );
}
