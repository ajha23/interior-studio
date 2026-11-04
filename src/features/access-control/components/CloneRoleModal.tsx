import { useState, type FC, type FormEvent } from 'react';
import { Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import type { CustomRole } from '@/domain/platform/authorization/types';

interface CloneRoleModalProps {
  isOpen: boolean;
  sourceRole: CustomRole | null;
  onClose: () => void;
  onClone: (newRoleName: string, newDescription?: string) => void;
}

export const CloneRoleModal: FC<CloneRoleModalProps> = ({
  isOpen,
  sourceRole,
  onClose,
  onClone,
}) => {
  const [roleName, setRoleName] = useState(() => (sourceRole ? `${sourceRole.name} (Copy)` : ''));
  const [description, setDescription] = useState(() => (sourceRole ? `Custom copy based on ${sourceRole.name}` : ''));
  const [error, setError] = useState('');

  if (!isOpen || !sourceRole) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) {
      setError('Role name is required.');
      return;
    }
    setError('');
    onClone(roleName.trim(), description.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      data-testid="clone-role-modal"
    >
      <Card className="w-full max-w-md p-6 bg-card border shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          aria-label="Close modal"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Copy className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Clone Role</h3>
            <p className="text-xs text-muted-foreground">
              Create a customizable copy of <span className="font-medium text-foreground">{sourceRole.name}</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              New Role Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={roleName}
              onChange={(e) => {
                setRoleName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Senior Lighting Designer"
              data-testid="clone-role-name-input"
              autoFocus
            />
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Explain the purpose and scope of this role..."
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="clone-role-desc-input"
            />
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p>
              The new custom role will inherit all granted capabilities from <span className="font-semibold">{sourceRole.name}</span>. You can customize them immediately after creation.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} data-testid="clone-role-cancel-btn">
              Cancel
            </Button>
            <Button type="submit" size="sm" data-testid="clone-role-submit-btn">
              Create Custom Role
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
