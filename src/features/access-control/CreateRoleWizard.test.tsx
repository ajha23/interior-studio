import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreateRoleWizard } from './CreateRoleWizard';
import { useRoleManagementStore } from '@/state/roleManagementStore';
import { bootstrapModuleRegistry } from '@/domain/platform/authorization/bootstrap';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';

describe('CreateRoleWizard (US4, FR-004)', () => {
  beforeEach(() => {
    moduleRegistry.resetForTesting();
    bootstrapModuleRegistry();
    const store = useRoleManagementStore.getState();
    store.initialize('org_test_wizard', 100);
    store.startCreateRole();
  });

  it('renders Step 1 with template cards and inputs', () => {
    render(<CreateRoleWizard onCancel={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText('Step 1: Basic Information & Templates')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-role-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('template-card-tpl-senior-designer')).toBeInTheDocument();
  });

  it('populates fields when selecting a template card', () => {
    render(<CreateRoleWizard onCancel={vi.fn()} onSuccess={vi.fn()} />);

    const templateCard = screen.getByTestId('template-card-tpl-senior-designer');
    fireEvent.click(templateCard);

    const nameInput = screen.getByTestId('wizard-role-name-input') as HTMLInputElement;
    expect(nameInput.value).toContain('Senior Designer');
  });

  it('validates role name before continuing to Step 2', () => {
    render(<CreateRoleWizard onCancel={vi.fn()} onSuccess={vi.fn()} />);

    // Clear name and click continue
    const nameInput = screen.getByTestId('wizard-role-name-input');
    fireEvent.change(nameInput, { target: { value: '' } });

    const continueBtn = screen.getByTestId('wizard-next-btn');
    fireEvent.click(continueBtn);

    expect(screen.getByText('Please enter a role name before proceeding.')).toBeInTheDocument();
    expect(screen.queryByText('Step 2: Permissions & Resource Access')).not.toBeInTheDocument();
  });

  it('advances through all 3 steps and creates custom role', () => {
    const onSuccess = vi.fn();
    render(<CreateRoleWizard onCancel={vi.fn()} onSuccess={onSuccess} />);

    // 1. Select template
    const templateCard = screen.getByTestId('template-card-tpl-designer');
    fireEvent.click(templateCard);

    // 2. Next to Step 2
    fireEvent.click(screen.getByTestId('wizard-next-btn'));
    expect(screen.getByText('Step 2: Permissions & Resource Access')).toBeInTheDocument();

    // 3. Next to Step 3
    fireEvent.click(screen.getByTestId('wizard-next-btn'));
    expect(screen.getByText('Step 3: Review & Summary')).toBeInTheDocument();
    expect(screen.getByTestId('review-role-name')).toBeInTheDocument();

    // 4. Click Create
    const createBtn = screen.getByTestId('wizard-create-btn');
    fireEvent.click(createBtn);

    expect(onSuccess).toHaveBeenCalled();
  });
});
