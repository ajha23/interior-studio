import { useState, type FC } from 'react';
import { UserPlus, UserMinus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { UserRoleAssignment, CustomRole } from '@/domain/platform/authorization/types';

interface RoleMembersTabProps {
  role: CustomRole;
  members: UserRoleAssignment[];
  onAssignMember: (userId: string, userName?: string) => void;
  onUnassignMember: (userId: string) => void;
  disabled?: boolean;
}

export const RoleMembersTab: FC<RoleMembersTabProps> = ({
  role,
  members,
  onAssignMember,
  onUnassignMember,
  disabled = false,
}) => {
  const [newUserId, setNewUserId] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId.trim()) {
      setErrorMessage('User ID or email is required.');
      return;
    }
    setErrorMessage('');
    onAssignMember(newUserId.trim(), newUserName.trim() || newUserId.trim());
    setNewUserId('');
    setNewUserName('');
  };

  const handleUnassign = (userId: string) => {
    try {
      setErrorMessage('');
      onUnassignMember(userId);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  };

  return (
    <div className="space-y-6" data-testid="role-members-tab">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Assigned Members</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Users who currently hold the <span className="font-semibold text-foreground">{role.name}</span> role. Permissions combine additively if a user holds multiple roles.
          </p>
        </div>

        <Badge variant="outline" className="text-xs">
          {members.length} {members.length === 1 ? 'Member' : 'Members'}
        </Badge>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2" data-testid="members-error-banner">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Assign User Form */}
      {!disabled && (
        <form onSubmit={handleAssign} className="p-4 rounded-lg border bg-muted/20 space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="size-4 text-primary" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Assign New Member
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                User ID / Identifier <span className="text-destructive">*</span>
              </label>
              <Input
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="e.g. user_vikram_designer"
                className="h-8 text-xs"
                data-testid="assign-user-id-input"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Display Name (Optional)
              </label>
              <Input
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="e.g. Vikram Burman"
                className="h-8 text-xs"
                data-testid="assign-user-name-input"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" size="xs" className="gap-1.5" data-testid="assign-member-submit-btn">
              <UserPlus className="size-3.5" />
              <span>Assign to Role</span>
            </Button>
          </div>
        </form>
      )}

      {/* Member List Table */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 border-b uppercase text-muted-foreground">
            <tr>
              <th className="py-2.5 px-3">Member</th>
              <th className="py-2.5 px-3">Assigned By</th>
              <th className="py-2.5 px-3">Assigned Date</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y text-foreground">
            {members.map((member) => (
              <tr key={member.id} className="hover:bg-muted/20 transition-colors" data-testid={`member-row-${member.userId}`}>
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-foreground">
                    {member.userName || member.userId}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{member.userId}</div>
                </td>
                <td className="py-2.5 px-3 text-muted-foreground">{member.assignedBy}</td>
                <td className="py-2.5 px-3 text-muted-foreground">
                  {new Date(member.assignedAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td className="py-2.5 px-3 text-right">
                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleUnassign(member.userId)}
                      className="text-destructive hover:bg-destructive/10 gap-1 text-[11px]"
                      data-testid={`unassign-btn-${member.userId}`}
                    >
                      <UserMinus className="size-3" />
                      <span>Unassign</span>
                    </Button>
                  )}
                </td>
              </tr>
            ))}

            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted-foreground">
                  No members are currently assigned to this role.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
