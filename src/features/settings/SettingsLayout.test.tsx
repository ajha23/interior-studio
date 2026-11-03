import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsLayout } from './SettingsLayout';
import { useRoleManagementStore } from '@/state/roleManagementStore';
import { bootstrapModuleRegistry } from '@/domain/platform/authorization/bootstrap';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';

describe('SettingsLayout (FR-001)', () => {
  beforeEach(() => {
    moduleRegistry.resetForTesting();
    bootstrapModuleRegistry();
    const store = useRoleManagementStore.getState();
    store.initialize('org_test_settings', 100);
  });

  it('renders sidebar with separate Access & Security and Billing sections', () => {
    render(<SettingsLayout />);

    expect(screen.getByText('Access & Security')).toBeInTheDocument();
    expect(screen.getByText('Billing & Subscription')).toBeInTheDocument();
    expect(screen.getByTestId('nav-roles')).toBeInTheDocument();
    expect(screen.getByTestId('nav-simulator')).toBeInTheDocument();
    expect(screen.getByTestId('nav-audit')).toBeInTheDocument();
    expect(screen.getByTestId('nav-billing')).toBeInTheDocument();
  });

  it('switches between Access Simulator, Audit Log, and Billing sections', () => {
    render(<SettingsLayout />);

    // Click Simulator
    fireEvent.click(screen.getByTestId('nav-simulator'));
    expect(screen.getByTestId('access-preview-simulator')).toBeInTheDocument();

    // Click Audit Log
    fireEvent.click(screen.getByTestId('nav-audit'));
    expect(screen.getByTestId('access-audit-log')).toBeInTheDocument();

    // Click Billing
    fireEvent.click(screen.getByTestId('nav-billing'));
    expect(screen.getByText('Billing & Subscription')).toBeInTheDocument();
  });
});
