/**
 * The assistant's credits line (spec 045, User Story 3): "Alpha Studio · 480 credits", or why AI is
 * not available (viewer, no studio, no credits). Display only; the server decides.
 */
import { AI_UNAVAILABLE, aiUnavailableReason } from './aiAccess';
import { usePayingStudio } from './payingStudio';

export function AiCreditsBar() {
  const payer = usePayingStudio();
  const reason = aiUnavailableReason(payer);
  return (
    <div className="flex flex-col gap-1 border-b px-3 py-1.5 text-[11px]">
      {payer && payer.role !== 'viewer' && (
        <span data-testid="ai-credits" className="truncate text-muted-foreground">
          {payer.name} · {payer.balance === null ? '…' : payer.balance} {payer.balance === 1 ? 'credit' : 'credits'}
        </span>
      )}
      {reason && (
        <p role="status" className="text-muted-foreground" data-testid="ai-unavailable">
          {AI_UNAVAILABLE[reason]}
        </p>
      )}
    </div>
  );
}
