import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StudioTableEditor } from './StudioTableEditor';

describe('StudioTableEditor Component (SEC-08)', () => {
  it('renders table editor dialog when open with tabs and clients', () => {
    render(<StudioTableEditor isOpen={true} onClose={vi.fn()} currentUserRole="owner" />);

    expect(screen.getByTestId('studio-table-editor-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Studio Table Editor/i)).toBeInTheDocument();
    expect(screen.getByText(/OWNER ACCESS/i)).toBeInTheDocument();
    expect(screen.getByTestId('clients-table')).toBeInTheDocument();
    expect(screen.getByText('Vikram Malhotra')).toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
  });

  it('masks client PII when current user role is viewer', () => {
    render(<StudioTableEditor isOpen={true} onClose={vi.fn()} currentUserRole="viewer" />);

    expect(screen.getByText(/VIEWER ACCESS/i)).toBeInTheDocument();
    expect(screen.getByText(/PII Masked for role 'viewer'/i)).toBeInTheDocument();
    // Mobile number should be masked (e.g. 98******10)
    expect(screen.getByText(/98\*{6}10/)).toBeInTheDocument();
    // Site address should be protected
    expect(screen.getAllByText('[Protected Site Address]').length).toBeGreaterThanOrEqual(1);
  });

  it('filters clients according to the search query', async () => {
    const user = userEvent.setup();
    render(<StudioTableEditor isOpen={true} onClose={vi.fn()} currentUserRole="owner" />);

    const searchInput = screen.getByRole('textbox', { name: /search records/i });
    await user.type(searchInput, 'Ananya');

    expect(screen.getByText('Ananya Deshmukh')).toBeInTheDocument();
    expect(screen.queryByText('Vikram Malhotra')).not.toBeInTheDocument();
  });

  it('switches between tabs: Projects, Members, and Audit Log', async () => {
    const user = userEvent.setup();
    render(<StudioTableEditor isOpen={true} onClose={vi.fn()} currentUserRole="owner" />);

    // Switch to Team Members
    await user.click(screen.getByRole('tab', { name: /team members/i }));
    expect(screen.getByTestId('members-table')).toBeInTheDocument();
    expect(screen.getByText('Mihir Sharma')).toBeInTheDocument();
    expect(screen.getByText('100/100')).toBeInTheDocument();

    // Switch to Audit Log
    await user.click(screen.getByRole('tab', { name: /audit log/i }));
    expect(screen.getByTestId('audit-table')).toBeInTheDocument();
    expect(screen.getByText('user.login')).toBeInTheDocument();

    // Switch to Projects
    await user.click(screen.getByRole('tab', { name: /projects/i }));
    expect(screen.getByTestId('projects-table')).toBeInTheDocument();

    // Switch to Billing & Plans
    await user.click(screen.getByRole('tab', { name: /billing/i }));
    expect(screen.getByTestId('billing-settings-view')).toBeInTheDocument();
  });

  it('erases client PII under DPDP Section 12 and logs an audit trail', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<StudioTableEditor isOpen={true} onClose={vi.fn()} currentUserRole="owner" />);

    const eraseButtons = screen.getAllByRole('button', { name: /erase/i });
    expect(eraseButtons.length).toBeGreaterThan(0);
    await user.click(eraseButtons[0]!);

    // Vikram Malhotra should now be anonymized
    expect(screen.getByText('Anonymized Client')).toBeInTheDocument();
    expect(screen.getByText('0000000000')).toBeInTheDocument();
    expect(screen.getByText('Redacted per DPDP Section 12')).toBeInTheDocument();

    // Switch to Audit Log tab to verify audit entry was appended
    await user.click(screen.getByRole('tab', { name: /audit log/i }));
    expect(screen.getByText('client.erased')).toBeInTheDocument();
  });
});
