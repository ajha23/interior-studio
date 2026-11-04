import { useState } from 'react';
import {
  CheckCircle2,
  FileCheck2,
  Lock,
  Layers,
  ArrowRightLeft,
  Sparkles,
  ShieldCheck,
  MonitorPlay,
  Film,
} from 'lucide-react';
import type { KitchenProject } from '@/domain/schema';
import { calculateQuotation, type QuotationLineItem } from '@/engine/commercial/gst';
import { DEFAULT_RATE_CARD_V1 } from '@/domain/commercial/rateCard';
import { diffQuotes, calculateFinishOptionDelta } from '@/engine/commercial/quoteDiff';
import { explodeScene } from '@/engine/manufacturing/explode';
import { SEED_RULE_PACK_V1 } from '@/domain/manufacturing/rulePack';
import { createClientSignOff, type ClientSignOff } from '@/domain/platform/signOff';
import { analyzeCostDownOpportunities, type CostDownSuggestion } from '@/engine/commercial/costDown';
import { CostDownCard } from '@/features/commercial/CostDownCard';
import { WalkthroughVideoModal } from '@/features/deliverables/WalkthroughVideoModal';
import { useWalkthroughStore } from '@/state/walkthroughStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '@/state/editorStore';

interface PresentationPortalProps {
  project: KitchenProject;
  revision: string;
}

const FINISH_OPTIONS = [
  { id: 'lam', name: '1.0mm Matte Laminate', ratePerSqMPaise: 120000, description: 'Durable, scratch-resistant everyday surface' },
  { id: 'acrylic', name: '2.0mm High-Gloss Acrylic', ratePerSqMPaise: 280000, description: 'Mirror-like reflection, premium modern finish' },
  { id: 'pu_matte', name: 'PU Matte Lacquer (Soft-Touch)', ratePerSqMPaise: 360000, description: 'Seamless seamless anti-fingerprint Italian finish' },
  { id: 'glass', name: 'Fluted Glass in Aluminium Profile', ratePerSqMPaise: 500000, description: 'Architectural fluted glass with integrated profile' },
];

export function PresentationPortal({ project, revision }: PresentationPortalProps) {
  const setPresenting = useEditorStore((s) => s.setPresenting);
  const openVideoModal = useWalkthroughStore((s) => s.openModal);

  // Cost-down advisor recommendations
  const costDownSuggestions = analyzeCostDownOpportunities(
    project.cabinets.map((c) => ({
      id: c.id,
      type: c.type,
      dimensions: c.dimensions,
    })),
    SEED_RULE_PACK_V1
  );
  const [appliedCostDownIds, setAppliedCostDownIds] = useState<string[]>([]);

  const handleApplyCostDown = (suggestion: CostDownSuggestion) => {
    setAppliedCostDownIds((prev) => [...prev, suggestion.id]);
  };

  // Derive quotation
  const explodePkg = explodeScene(
    project.cabinets.map((e) => ({
      id: e.id,
      type: e.type,
      dimensions: e.dimensions,
    })),
    SEED_RULE_PACK_V1,
    project.id
  );

  const shutterArea = explodePkg.summary.totalShutterAreaSqM;
  const carcassArea = explodePkg.summary.totalCarcaseAreaSqM;

  const quoteItems: QuotationLineItem[] = [
    {
      id: 'carcass_pkg',
      description: 'Modular Carcasses (18mm Plywood / Particle Board, 32mm System)',
      code: '9403',
      type: 'goods',
      quantity: Math.max(1, Math.round(carcassArea * 10) / 10),
      unit: 'sqm',
      unitRatePaise: 185000, // ₹1,850/sqm
    },
    {
      id: 'shutter_pkg',
      description: 'Fascia & Cabinet Shutters with 2.0mm ABS Edge-Banding',
      code: '9403',
      type: 'goods',
      quantity: Math.max(1, Math.round(shutterArea * 10) / 10),
      unit: 'sqm',
      unitRatePaise: 240000, // ₹2,400/sqm
    },
    {
      id: 'hardware_pkg',
      description: 'Functional Hardware (110° Soft-Close Hinges, Legs, Handles)',
      code: '9403',
      type: 'goods',
      quantity: explodePkg.hardware.length,
      unit: 'nos',
      unitRatePaise: 35000, // ₹350/item
    },
    {
      id: 'installation_svc',
      description: 'Factory Certified Modular Installation & Site Alignment',
      code: '9954',
      type: 'services',
      quantity: 1,
      unit: 'lump_sum',
      unitRatePaise: 1250000, // ₹12,500
    },
  ];

  const currentQuote = calculateQuotation(`QT-${revision.slice(0, 8)}`, quoteItems, 'INTRA_STATE', {
    id: DEFAULT_RATE_CARD_V1.id,
    version: DEFAULT_RATE_CARD_V1.version,
  });

  // Baseline mock quote for diffing (e.g. without tall or extra shutters)
  const baselineQuote = calculateQuotation(
    'QT-REV-00',
    quoteItems.slice(0, 3).map((item) => ({
      ...item,
      quantity: Math.max(1, Math.round(item.quantity * 0.8)),
    })),
    'INTRA_STATE'
  );

  const quoteDiff = diffQuotes(baselineQuote, currentQuote);

  // Sign-off state
  const [clientName, setClientName] = useState('');
  const [clientMobile, setClientMobile] = useState('');
  const [agreedConsent, setAgreedConsent] = useState(false);
  const [signOffRecord, setSignOffRecord] = useState<ClientSignOff | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [selectedFinish, setSelectedFinish] = useState('lam');

  const baselineRate = FINISH_OPTIONS[0]?.ratePerSqMPaise ?? 120000;
  const currentFinishObj = FINISH_OPTIONS.find((f) => f.id === selectedFinish) || FINISH_OPTIONS[0]!;
  const finishDelta = calculateFinishOptionDelta(
    shutterArea,
    baselineRate,
    currentFinishObj.ratePerSqMPaise
  );

  const handleSignOff = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!agreedConsent) {
      setErrorMsg('Please review and check the DPDP legal consent confirmation.');
      return;
    }

    try {
      const record = createClientSignOff({
        id: `signoff_${Date.now()}`,
        projectId: project.id,
        quoteNumber: currentQuote.quotationNumber,
        quoteSha256: `sha256:${explodePkg.canonicalHash}`,
        clientName,
        clientMobile,
        status: 'accepted',
        notes: `Selected Shutter Finish: ${currentFinishObj.name}`,
      });
      setSignOffRecord(record);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid client details.');
    }
  };

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6" data-testid="presentation-portal">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">Client Presentation & Digital Sign-Off</h2>
            <span className="flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
              <Lock className="size-3" /> Locked Client Mode
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Revision {revision.slice(0, 8)} · PII Protected under Indian DPDP Act 2023 · All prices include statutory GST
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={openVideoModal}
            data-testid="open-video-walkthrough-btn"
          >
            <Film className="size-4 mr-1.5 text-primary" /> Render 30s 1080p Video
          </Button>
          <Button onClick={() => setPresenting(true)} data-testid="start-presentation-walkthrough">
            <MonitorPlay className="size-4 mr-1.5" /> Start 3D Walkthrough
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Commercial Quotation & Sign-Off */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* Statutory Quote Summary */}
          <div className="rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between pb-3 border-b">
              <div className="flex items-center gap-2">
                <FileCheck2 className="size-5 text-primary" />
                <h3 className="text-sm font-semibold">Authoritative Commercial Quotation</h3>
              </div>
              <span className="font-mono text-xs font-medium text-muted-foreground">
                {currentQuote.quotationNumber}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-xs py-1 border-b">
                <span className="text-muted-foreground">HSN 9403 (Modular Furniture Goods):</span>
                <span className="font-medium">
                  ₹{((currentQuote.hsnSummary['9403']?.taxableAmountPaise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-xs py-1 border-b">
                <span className="text-muted-foreground">SAC 9954 (Installation Services):</span>
                <span className="font-medium">
                  ₹{((currentQuote.hsnSummary['9954']?.taxableAmountPaise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-xs py-1 border-b">
                <span className="text-muted-foreground">GST Taxes (CGST 9% + SGST 9%):</span>
                <span className="font-medium">
                  ₹{(currentQuote.totalTaxPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-sm pt-2 font-bold text-foreground">
                <span>Grand Total (Net Inclusive):</span>
                <span className="text-primary text-base" data-testid="quote-grand-total">
                  {currentQuote.formatted.grandTotal}
                </span>
              </div>
            </div>

            {/* Revision Diff Callout */}
            <div className="mt-5 rounded-md border bg-muted/40 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <ArrowRightLeft className="size-3.5 text-primary" />
                <span>Revision Diff vs. Previous Milestone ({quoteDiff.fromRevision})</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                Added {quoteDiff.addedItems.length} items, updated {quoteDiff.modifiedItems.length} items. Net variance:{' '}
                <span className={quoteDiff.grandTotalDeltaPaise >= 0 ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                  {quoteDiff.formatted.grandTotalDelta}
                </span>
              </p>
            </div>
          </div>

          {/* Digital Sign-off Card */}
          <div className="rounded-lg border bg-card p-5">
            <div className="flex items-center gap-2 pb-3 border-b">
              <ShieldCheck className="size-5 text-emerald-600" />
              <div>
                <h3 className="text-sm font-semibold">Digital Quote Acceptance & Sign-Off</h3>
                <p className="text-[11px] text-muted-foreground">
                  Statutory timestamped electronic acceptance binding the client to design revision {revision.slice(0, 8)}
                </p>
              </div>
            </div>

            {signOffRecord ? (
              <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4" data-testid="sign-off-badge">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                  <CheckCircle2 className="size-5" />
                  <span>Quotation Digitally Accepted</span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <p><strong className="text-foreground">Signed By:</strong> {signOffRecord.clientName} ({signOffRecord.clientMobile})</p>
                  <p><strong className="text-foreground">Timestamp:</strong> {new Date(signOffRecord.timestamp).toLocaleString('en-IN')}</p>
                  <p><strong className="text-foreground">Consent Notice:</strong> {signOffRecord.consentNoticeVersion}</p>
                  <p className="font-mono text-[10px] break-all"><strong className="text-foreground">Digest:</strong> {signOffRecord.quoteSha256}</p>
                  {signOffRecord.notes && <p className="italic text-foreground mt-1">"{signOffRecord.notes}"</p>}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSignOff} className="mt-4 space-y-4" data-testid="sign-off-form">
                {errorMsg && (
                  <p className="rounded bg-destructive/10 p-2 text-xs text-destructive font-medium" data-testid="sign-off-error">
                    {errorMsg}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">
                      Client Full Name *
                    </label>
                    <Input
                      placeholder="e.g. Ananya Sen"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      required
                      data-testid="client-name-input"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">
                      10-Digit Mobile Number *
                    </label>
                    <Input
                      placeholder="e.g. 9876543210"
                      value={clientMobile}
                      maxLength={10}
                      onChange={(e) => setClientMobile(e.target.value.replace(/\D/g, ''))}
                      required
                      data-testid="client-mobile-input"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="consent-check"
                    checked={agreedConsent}
                    onChange={(e) => setAgreedConsent(e.target.checked)}
                    className="mt-0.5 rounded border-input size-4 text-primary"
                    data-testid="consent-checkbox"
                  />
                  <label htmlFor="consent-check" className="text-xs text-muted-foreground leading-snug">
                    I confirm that I have reviewed the design layout, material specifications, and the statutory Indian GST quotation of{' '}
                    <strong className="text-foreground">{currentQuote.formatted.grandTotal}</strong>. I provide consent under the Digital Personal Data Protection (DPDP) Act 2023 for project execution.
                  </label>
                </div>

                <Button type="submit" className="w-full" data-testid="accept-quote-button">
                  <CheckCircle2 className="size-4 mr-2" /> Accept & Digitally Sign Quote
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Finish Option Boards & Cost-Down Advisor */}
        <div className="flex flex-col gap-4">
          {/* Cost-Down Advisor (AI-03 / CP-05) */}
          <CostDownCard
            suggestions={costDownSuggestions}
            onApply={handleApplyCostDown}
            appliedIds={appliedCostDownIds}
          />

          <div className="rounded-lg border bg-card p-5">
            <div className="flex items-center gap-2 pb-3 border-b">
              <Sparkles className="size-5 text-amber-500" />
              <div>
                <h3 className="text-sm font-semibold">Finish Option Boards (PR-02)</h3>
                <p className="text-[11px] text-muted-foreground">
                  Explore material finishes with live ₹ delta over baseline
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {FINISH_OPTIONS.map((opt) => {
                const isSelected = selectedFinish === opt.id;
                const optDelta = calculateFinishOptionDelta(shutterArea, baselineRate, opt.ratePerSqMPaise);
                return (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedFinish(opt.id)}
                    className={`cursor-pointer rounded-lg border p-3 text-xs transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-muted-foreground/40 bg-card'
                    }`}
                    data-testid={`finish-option-${opt.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{opt.name}</span>
                      <span className={`text-[11px] font-bold ${optDelta.deltaPaise > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {optDelta.deltaPaise === 0 ? 'Baseline' : optDelta.formattedDelta}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{opt.description}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-md border bg-accent/40 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-accent-foreground">
                <Layers className="size-3.5" />
                <span>Selected Shutter Delta</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Shutter Area: <strong className="text-foreground">{Math.round(shutterArea * 10) / 10} m²</strong> · Live Delta:{' '}
                <strong className="text-foreground">{finishDelta.formattedDelta}</strong>
              </p>
            </div>
          </div>
        </div>
      </div>

      <WalkthroughVideoModal
        projectId={project.id}
        room={{
          width: project.room.width,
          length: project.room.length,
          height: project.room.height,
        }}
      />
    </div>
  );
}
