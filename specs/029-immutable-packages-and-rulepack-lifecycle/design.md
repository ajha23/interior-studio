# Design 029 — Immutable Production Packages, SHA-256 Hashing & RulePack Lifecycle Gates

## Architecture & Layers

```mermaid
flowchart TD
    subgraph Domain & Engine [Pure TS - Zero Framework/DOM]
        RP["rulePack.ts (RulePackSchema with Status Enum)"]
        PH["packageHash.ts (Canonical JSON + SHA-256 Generator)"]
        EX["explode.ts (explodeScene computes ManufacturingPackage + Hash)"]
        RD["readiness.ts (Evaluates Blocking Rules including RulePack Status)"]
    end

    subgraph State [Zustand Reactive Store]
        DS["deliverablesStore.ts (Manages active revision & readiness checks)"]
    end

    subgraph UI [React Presentation Layer]
        DV["DeliverablesView.tsx (Displays Package SHA-256 & RulePack Badge)"]
        PP["PresentationPortal.tsx (Embeds Verified Hash in Digital Sign-Off)"]
    end

    RP --> EX
    PH --> EX
    EX --> RD
    RD --> DS
    DS --> DV
    EX --> PP
```

## Data Contracts

### 1. RulePack Status & Schema (`src/domain/manufacturing/rulePack.ts`)
```ts
export type RulePackStatus =
  | 'provisional'
  | 'designer_reviewed'
  | 'factory_validated'
  | 'production_approved';

export const RulePackSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  status: z.enum([
    'provisional',
    'designer_reviewed',
    'factory_validated',
    'production_approved',
  ]).default('provisional'),
  signedOffBy: z.string().optional(),
  signedOffAtIso: z.string().optional(),
  // Joinery parameters (carcassThickness, reveals, edge-band codes...)
  ...
});
```

### 2. Canonical JSON Serialization & SHA-256 Hash (`src/engine/manufacturing/packageHash.ts`)
```ts
export function canonicalStringify(obj: unknown): string;
export async function computePackageSha256(payload: unknown): Promise<string>;
export function computePackageSha256Sync(payload: unknown): string; // Using Node crypto when available, or pure JS fallback
```

### 3. Manufacturing Package Contract (`src/engine/manufacturing/explode.ts`)
```ts
export interface ManufacturingPackage {
  packageId: string;
  projectId: string;
  schemaVersion: number;
  rulePackId: string;
  rulePackVersion: number;
  rulePackStatus: RulePackStatus;
  canonicalHash: string; // 64-char lowercase SHA-256 hex
  parts: ManufacturingPart[];
  hardware: ManufacturingHardware[];
  edgeBandSummary: EdgeBandSummaryItem[];
  summary: ManufacturingSummary;
  generatedAtIso: string;
}
```
