import type { FC } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PREDEFINED_ROLE_TEMPLATES } from '@/domain/platform/authorization/roleTemplates';

interface WizardStepBasicInfoProps {
  name: string;
  description: string;
  selectedTemplateId: string | null;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onSelectTemplate: (templateId: string) => void;
  error?: string;
}

export const WizardStepBasicInfo: FC<WizardStepBasicInfoProps> = ({
  name,
  description,
  selectedTemplateId,
  onNameChange,
  onDescriptionChange,
  onSelectTemplate,
  error,
}) => {
  return (
    <div className="space-y-6" data-testid="wizard-step-basic-info">
      <div>
        <h3 className="text-base font-semibold text-foreground">Step 1: Basic Information & Templates</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Provide a descriptive name for your custom role or bootstrap with an industry-tested baseline template.
        </p>
      </div>

      {/* Starter Templates */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Recommended Role Templates
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PREDEFINED_ROLE_TEMPLATES.map((tpl) => {
            const isSelected = selectedTemplateId === tpl.id;
            return (
              <Card
                key={tpl.id}
                onClick={() => onSelectTemplate(tpl.id)}
                className={`p-3.5 cursor-pointer transition-all border-2 text-left relative ${
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-xs'
                    : 'border-border hover:border-muted-foreground/30 hover:bg-muted/10'
                }`}
                data-testid={`template-card-${tpl.id}`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Check className="size-3" />
                  </div>
                )}
                <div className="pr-6">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{tpl.name}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {tpl.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {tpl.description}
                  </p>
                  <p className="text-[11px] text-primary/80 font-medium mt-2">
                    {tpl.grantedPermissionIds.length} capabilities pre-configured
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Form Fields */}
      <div className="space-y-4 pt-2 border-t">
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Role Name <span className="text-destructive">*</span>
          </label>
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Senior Kitchen Specialist"
            className="h-9 text-sm max-w-md"
            data-testid="wizard-role-name-input"
          />
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Description (Optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={3}
            placeholder="Describe the duties, responsibilities, and access expectations for this role..."
            className="w-full max-w-xl rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="wizard-role-desc-input"
          />
        </div>
      </div>
    </div>
  );
};
