import { describe, it, expect } from 'vitest';
import { budgetEnvelopeCreateSchema, budgetEnvelopePatchSchema } from '../../src/schemas/budget.schema';
import { recordHumidorReadingSchema } from '../../src/schemas/humidor.schema';
import { networkConfigSchema } from '../../src/schemas/network-config.schema';
import { createCellarSchema, updateCellarSchema } from '../../src/schemas/cellar.schema';

describe('budgetEnvelopeCreateSchema', () => {
  const base = { periodStart: '2026-01-01', periodEnd: '2026-02-01', amount: 200 };

  it('accepts a valid envelope', () => {
    expect(budgetEnvelopeCreateSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a negative or absurdly large amount', () => {
    expect(budgetEnvelopeCreateSchema.safeParse({ ...base, amount: -1 }).success).toBe(false);
    expect(budgetEnvelopeCreateSchema.safeParse({ ...base, amount: 10_000_001 }).success).toBe(false);
  });

  it('rejects periodEnd <= periodStart', () => {
    expect(budgetEnvelopeCreateSchema.safeParse({ ...base, periodEnd: '2026-01-01' }).success).toBe(false);
  });

  it('patch schema accepts a lone amount', () => {
    expect(budgetEnvelopePatchSchema.safeParse({ amount: 50 }).success).toBe(true);
  });
});

describe('recordHumidorReadingSchema', () => {
  it('defaults source to manual', () => {
    const res = recordHumidorReadingSchema.safeParse({ cellarId: 'c1', humidityPercent: 68 });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.source).toBe('manual');
  });

  it('bounds humidity to 0..100 and temperature to -20..60', () => {
    expect(recordHumidorReadingSchema.safeParse({ cellarId: 'c1', humidityPercent: 120 }).success).toBe(false);
    expect(
      recordHumidorReadingSchema.safeParse({ cellarId: 'c1', humidityPercent: 68, temperatureCelsius: 80 }).success,
    ).toBe(false);
  });

  it('requires a non-empty cellarId', () => {
    expect(recordHumidorReadingSchema.safeParse({ cellarId: '', humidityPercent: 68 }).success).toBe(false);
  });
});

describe('networkConfigSchema', () => {
  it('accepts direct/proxy with an optional publicUrl', () => {
    expect(networkConfigSchema.safeParse({ accessMode: 'direct' }).success).toBe(true);
    expect(networkConfigSchema.safeParse({ accessMode: 'proxy', publicUrl: null }).success).toBe(true);
    expect(networkConfigSchema.safeParse({ accessMode: 'proxy', publicUrl: 'https://glou.example.com' }).success).toBe(true);
  });

  it('rejects a bad accessMode or a malformed publicUrl', () => {
    expect(networkConfigSchema.safeParse({ accessMode: 'tunnel' }).success).toBe(false);
    expect(networkConfigSchema.safeParse({ accessMode: 'direct', publicUrl: 'glou' }).success).toBe(false);
  });
});

describe('cellar schemas', () => {
  it('createCellarSchema defaults type to VINTAGE', () => {
    const res = createCellarSchema.safeParse({ name: 'Cave' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.type).toBe('VINTAGE');
  });

  it('rejects hot+cold zone rows exceeding total rows', () => {
    const res = createCellarSchema.safeParse({ name: 'Cave', rows: 4, hotZoneRows: 3, coldZoneRows: 3 });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0].path).toEqual(['hotZoneRows']);
  });

  it('rejects targetHumidityMin > targetHumidityMax', () => {
    expect(
      createCellarSchema.safeParse({ name: 'Cave', targetHumidityMin: 80, targetHumidityMax: 60 }).success,
    ).toBe(false);
  });

  it('updateCellarSchema is partial but still enforces the zone invariant', () => {
    expect(updateCellarSchema.safeParse({}).success).toBe(true);
    expect(updateCellarSchema.safeParse({ rows: 2, hotZoneRows: 5 }).success).toBe(false);
  });
});
