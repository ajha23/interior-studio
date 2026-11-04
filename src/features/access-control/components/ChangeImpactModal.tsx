import type { FC } from 'react';
import { AlertTriangle, Users, PlusCircle, MinusCircle, Layers, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ChangeImpactAnalysis } from '@/domain/platform/authorization/types';

interface ChangeImpactModalProps {
  isOpen: boolean;
  impact: ChangeImpactAnalysis | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const ChangeImpactModal: FC<ChangeImpactModalProps> = ({
  isOpen,
  impact,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !impact) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      data-testid="change-impact-modal"
    >
      <Card className="w-full max-w-lg p-6 bg-card border shadow-2xl relative animate-in fade-in zoom-in-95 duration-150 space-y-4">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          aria-label="Close dialog"
        >
          <X className="size-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Review Role Changes</h3>
            <p className="text-xs text-muted-foreground">
              Verify the impact of your changes before applying them to active members.
            </p>
          </div>
        </div>

        {/* Affected Users Callout */}
        <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-xs text-amber-800">
          <Users className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              {impact.affectedUserCount} organization {impact.affectedUserCount === 1 ? 'member' : 'members'} will be immediately affected.
            </p>
            {impact.affectedUserNames.length > 0 && (
              <p className="text-[11px] text-amber-800/80 mt-1 line-clamp-2">
                Members: {impact.affectedUserNames.join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* Scope Change */}
        {impact.isScopeChanged && (
          <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Layers className="size-3.5 text-primary" />
              <span>Resource Scope Update</span>
            </div>
            <p className="text-muted-foreground text-[11px]">
              Scope will change from <span className="font-medium text-foreground">{impact.previousScope}</span> to{' '}
              <span className="font-medium text-foreground">{impact.newScope}</span>.
            </p>
          </div>
        )}

        {/* Added Permissions */}
        {impact.addedPermissions.length > 0 && (
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-600">
              <PlusCircle className="size-3.5" />
              <span>Permissions Added ({impact.addedPermissions.length})</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {impact.addedPermissions.map((p) => (
                <Badge key={p.id} className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[11px]">
                  + {p.title}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Removed Permissions */}
        {impact.removedPermissions.length > 0 && (
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-destructive">
              <MinusCircle className="size-3.5" />
              <span>Permissions Revoked ({impact.removedPermissions.length})</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {impact.removedPermissions.map((p) => (
                <Badge key={p.id} variant="destructive" className="text-[11px]">
                  - {p.title}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* High Risk Flags */}
        {impact.highRiskPermissionsAdded.length > 0 && (
          <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-1">
            <p className="font-semibold">High-Risk Permissions Warning</p>
            <p className="text-[11px] leading-relaxed">
              You are granting high-privilege capabilities: {impact.highRiskPermissionsAdded.join(', ')}.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button variant="outline" size="sm" onClick={onClose} data-testid="impact-cancel-btn">
            Cancel & Keep Editing
          </Button>
          <Button size="sm" onClick={onConfirm} data-testid="impact-confirm-btn">
            Confirm & Apply Changes
          </Button>
        </div>
      </Card>
    </div>
  );
};
