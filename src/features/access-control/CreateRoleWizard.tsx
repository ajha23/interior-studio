import { useState, type FC } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { WizardStepBasicInfo } from './wizard/WizardStepBasicInfo';
import { WizardStepPermissions } from './wizard/WizardStepPermissions';
import { WizardStepReview } from './wizard/WizardStepReview';
import { useRoleManagementStore } from '@/state/roleManagementStore';
import { getRoleTemplateById } from '@/domain/platform/authorization/roleTemplates';

interface CreateRoleWizardProps {
  onCancel: () => void;
  onSuccess: (roleId: string) => void;
}

export const CreateRoleWizard: FC<CreateRoleWizardProps> = ({
  onCancel,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [nameError, setNameError] = useState('');

  const {
    draftRole,
    updateDraftName,
    updateDraftDescription,
    updateDraftScope,
    toggleDraftPermission,
    setDraftModulePermissions,
    commitSaveDraft,
    discardDraft,
  } = useRoleManagementStore();

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = getRoleTemplateById(templateId);
    if (template) {
      updateDraftName(`${template.name} (Custom)`);
      updateDraftDescription(template.description);
      updateDraftScope(template.recommendedScope, []);
      setNameError('');

      // Replace permissions with template grants
      for (const p of template.grantedPermissionIds) {
        if (!draftRole?.permissions.has(p)) {
          toggleDraftPermission(p);
        }
      }
    }
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!draftRole?.name.trim()) {
        setNameError('Please enter a role name before proceeding.');
        return;
      }
      setNameError('');
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    if (currentStep === 2) setCurrentStep(1);
    if (currentStep === 3) setCurrentStep(2);
  };

  const handleCreate = () => {
    try {
      const created = commitSaveDraft();
      onSuccess(created.id);
    } catch (err: unknown) {
      setNameError((err as Error).message);
      setCurrentStep(1);
    }
  };

  const handleCancel = () => {
    discardDraft();
    onCancel();
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6" data-testid="create-role-wizard">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Create Custom Role</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure tailored access rights and project boundaries for your team.
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          data-testid="wizard-cancel-btn"
        >
          <X className="size-4" />
          <span>Exit Wizard</span>
        </Button>
      </div>

      {/* 3-Step Progress Header */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { step: 1, title: '1. Basic Information' },
          { step: 2, title: '2. Permissions & Scopes' },
          { step: 3, title: '3. Review & Create' },
        ].map((item) => {
          const isActive = currentStep === item.step;
          const isPassed = currentStep > item.step;

          return (
            <div
              key={item.step}
              className={`p-3 rounded-lg border text-center transition-all ${
                isActive
                  ? 'border-primary bg-primary/5 text-primary font-semibold shadow-xs'
                  : isPassed
                  ? 'border-border bg-card text-foreground font-medium'
                  : 'border-border/60 text-muted-foreground opacity-60'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 text-xs">
                {isPassed && <Check className="size-3.5 text-primary" />}
                <span>{item.title}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Step Content */}
      <Card className="p-6 bg-card border shadow-xs min-h-[420px]">
        {currentStep === 1 && (
          <WizardStepBasicInfo
            name={draftRole?.name || ''}
            description={draftRole?.description || ''}
            selectedTemplateId={selectedTemplateId}
            onNameChange={updateDraftName}
            onDescriptionChange={updateDraftDescription}
            onSelectTemplate={handleSelectTemplate}
            error={nameError}
          />
        )}

        {currentStep === 2 && draftRole && (
          <WizardStepPermissions
            grantedPermissions={draftRole.permissions}
            scopeType={draftRole.scopeType}
            specificProjectIds={draftRole.specificProjectIds}
            onTogglePermission={toggleDraftPermission}
            onSetModulePermissions={setDraftModulePermissions}
            onScopeChange={updateDraftScope}
          />
        )}

        {currentStep === 3 && draftRole && (
          <WizardStepReview
            name={draftRole.name}
            description={draftRole.description}
            rank={draftRole.rank}
            scopeType={draftRole.scopeType}
            specificProjectIds={draftRole.specificProjectIds}
            grantedPermissions={draftRole.permissions}
          />
        )}
      </Card>

      {/* Footer Navigation Buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1}
          className="gap-1.5 text-xs"
          data-testid="wizard-back-btn"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back</span>
        </Button>

        {currentStep < 3 ? (
          <Button
            onClick={handleNext}
            className="gap-1.5 text-xs"
            data-testid="wizard-next-btn"
          >
            <span>Continue</span>
            <ArrowRight className="size-3.5" />
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            className="gap-1.5 text-xs"
            data-testid="wizard-create-btn"
          >
            <Check className="size-3.5" />
            <span>Create Custom Role</span>
          </Button>
        )}
      </div>
    </div>
  );
};
