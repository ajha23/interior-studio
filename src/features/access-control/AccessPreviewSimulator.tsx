import { useState, type FC } from 'react';
import { useRoleManagementStore } from '@/state/roleManagementStore';
import { SimulatorControls } from './simulator/SimulatorControls';
import { SimulatorPipelineView } from './simulator/SimulatorPipelineView';
import { SimulatorResultCard } from './simulator/SimulatorResultCard';

export const AccessPreviewSimulator: FC = () => {
  const {
    roles,
    simRoleId,
    simUserId,
    simPermissionId,
    simProjectId,
    simResult,
    setSimRoleId,
    setSimUserId,
    setSimPermissionId,
    setSimProjectId,
    runSimulation,
  } = useRoleManagementStore();

  const [selectedPlanId, setSelectedPlanId] = useState('pro');

  const handleRun = () => {
    runSimulation(selectedPlanId);
  };

  const handleReset = () => {
    setSimRoleId('designer');
    setSimUserId('');
    setSimPermissionId('designs.3d.view');
    setSimProjectId('');
    setSelectedPlanId('pro');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6" data-testid="access-preview-simulator">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Access Preview Simulator
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Simulate how the central Policy Evaluation Engine resolves permissions across tenant validity, commercial subscription plan entitlements, assigned roles, and project resource scopes.
        </p>
      </div>

      {/* Simulator Inputs */}
      <SimulatorControls
        roles={roles}
        selectedRoleId={simRoleId}
        selectedUserId={simUserId}
        selectedPermissionId={simPermissionId}
        selectedProjectId={simProjectId}
        selectedPlanId={selectedPlanId}
        onRoleChange={setSimRoleId}
        onUserChange={setSimUserId}
        onPermissionChange={setSimPermissionId}
        onProjectChange={setSimProjectId}
        onPlanChange={setSelectedPlanId}
        onRunSimulation={handleRun}
        onReset={handleReset}
      />

      {/* Results and Pipeline */}
      {simResult && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <SimulatorResultCard result={simResult} />
          <SimulatorPipelineView stages={simResult.evaluationStages} />
        </div>
      )}
    </div>
  );
};
