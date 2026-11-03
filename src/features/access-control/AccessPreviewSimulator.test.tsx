import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccessPreviewSimulator } from './AccessPreviewSimulator';
import { useRoleManagementStore } from '@/state/roleManagementStore';
import { bootstrapModuleRegistry } from '@/domain/platform/authorization/bootstrap';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';

describe('AccessPreviewSimulator (US5, FR-010)', () => {
  beforeEach(() => {
    moduleRegistry.resetForTesting();
    bootstrapModuleRegistry();
    const store = useRoleManagementStore.getState();
    store.initialize('org_test_sim_comp', 100);
  });

  it('renders simulator controls and parameters', () => {
    render(<AccessPreviewSimulator />);

    expect(screen.getByText('Access Preview Simulator')).toBeInTheDocument();
    expect(screen.getByTestId('sim-role-select')).toBeInTheDocument();
    expect(screen.getByTestId('sim-permission-select')).toBeInTheDocument();
    expect(screen.getByTestId('sim-plan-select')).toBeInTheDocument();
    expect(screen.getByTestId('sim-run-btn')).toBeInTheDocument();
  });

  it('runs simulation and renders authoritative verdict and 4 pipeline stages', () => {
    render(<AccessPreviewSimulator />);

    // Select Owner role + designs.3d.view
    const roleSelect = screen.getByTestId('sim-role-select');
    fireEvent.change(roleSelect, { target: { value: 'owner' } });

    const permSelect = screen.getByTestId('sim-permission-select');
    fireEvent.change(permSelect, { target: { value: 'designs.3d.view' } });

    // Click Run Simulation
    const runBtn = screen.getByTestId('sim-run-btn');
    fireEvent.click(runBtn);

    // Verify Result Card and 4 Stages
    expect(screen.getByTestId('simulator-result-card')).toBeInTheDocument();
    expect(screen.getByTestId('sim-verdict-badge')).toHaveTextContent('ACCESS ALLOWED');

    expect(screen.getByTestId('stage-card-tenant')).toBeInTheDocument();
    expect(screen.getByTestId('stage-card-subscription')).toBeInTheDocument();
    expect(screen.getByTestId('stage-card-role')).toBeInTheDocument();
    expect(screen.getByTestId('stage-card-scope')).toBeInTheDocument();
  });

  it('displays ACCESS DENIED and remedy when simulation fails plan entitlement check', () => {
    render(<AccessPreviewSimulator />);

    // Select designs.3d.export on Starter plan
    const permSelect = screen.getByTestId('sim-permission-select');
    fireEvent.change(permSelect, { target: { value: 'designs.3d.export' } });

    const planSelect = screen.getByTestId('sim-plan-select');
    fireEvent.change(planSelect, { target: { value: 'starter' } });

    // Click Run
    fireEvent.click(screen.getByTestId('sim-run-btn'));

    expect(screen.getByTestId('sim-verdict-badge')).toHaveTextContent('ACCESS DENIED');
    expect(screen.getByTestId('sim-final-reason')).toHaveTextContent('requires Pro Studio plan entitlement');
  });
});
