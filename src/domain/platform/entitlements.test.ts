import { describe, expect, it } from 'vitest';
import { checkEntitlement, PLANS } from './entitlements';

describe('Entitlements Domain Engine (ENT-01..09)', () => {
  it('enforces trial plan boundaries', () => {
    // Trial allows 5 projects max
    expect(checkEntitlement('trial', 'projects.max_active', 4).allowed).toBe(true);
    const limitHit = checkEntitlement('trial', 'projects.max_active', 5);
    expect(limitHit.allowed).toBe(false);
    expect(limitHit.minRequiredTier).toBe('starter');

    // Trial blocks DXF and accounting export
    expect(checkEntitlement('trial', 'drawings.dxf').allowed).toBe(false);
    expect(checkEntitlement('trial', 'accounting.export').allowed).toBe(false);
  });

  it('enforces starter plan boundaries', () => {
    // Starter allows 15 projects
    expect(checkEntitlement('starter', 'projects.max_active', 10).allowed).toBe(true);
    expect(checkEntitlement('starter', 'projects.max_active', 15).allowed).toBe(false);

    // Starter allows cutlist and AI layout, but blocks DXF and accounting CSV
    expect(checkEntitlement('starter', 'cutlist.export').allowed).toBe(true);
    expect(checkEntitlement('starter', 'ai.layout').allowed).toBe(true);
    expect(checkEntitlement('starter', 'drawings.dxf').allowed).toBe(false);
    expect(checkEntitlement('starter', 'accounting.export').allowed).toBe(false);
  });

  it('enforces pro plan boundaries', () => {
    // Pro has unlimited projects
    expect(checkEntitlement('pro', 'projects.max_active', 999).allowed).toBe(true);

    // Pro unlocks DXF and accounting export
    expect(checkEntitlement('pro', 'drawings.dxf').allowed).toBe(true);
    expect(checkEntitlement('pro', 'accounting.export').allowed).toBe(true);
    expect(checkEntitlement('pro', 'cutlist.export').allowed).toBe(true);

    // Custom rulepack is enterprise only
    expect(checkEntitlement('pro', 'custom_rulepack').allowed).toBe(false);
  });

  it('inhouse and enterprise unlock all features', () => {
    expect(checkEntitlement('inhouse', 'custom_rulepack').allowed).toBe(true);
    expect(checkEntitlement('enterprise', 'custom_rulepack').allowed).toBe(true);
    expect(checkEntitlement('enterprise', 'drawings.dxf').allowed).toBe(true);
  });

  it('catalog prices are in integer paise', () => {
    expect(Number.isInteger(PLANS.starter.priceMonthlyPaise)).toBe(true);
    expect(Number.isInteger(PLANS.pro.priceMonthlyPaise)).toBe(true);
    expect(PLANS.starter.priceMonthlyPaise).toBe(499900);
    expect(PLANS.pro.priceMonthlyPaise).toBe(1299900);
  });
});

