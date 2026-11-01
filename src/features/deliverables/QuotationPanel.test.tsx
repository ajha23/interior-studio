import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { QuotationPanel } from './QuotationPanel';

describe('QuotationPanel Component', () => {
  const project = createProject({ name: 'Test Kitchen', room: DEFAULT_ROOM, layout: 'straight' });

  it('renders the quotation panel with statutory HSN and SAC line items', () => {
    render(<QuotationPanel project={project} revision="REV001" />);

    expect(screen.getByTestId('quotation-panel')).toBeInTheDocument();
    expect(screen.getByText(/Commercial Quotation & GST Breakdown/i)).toBeInTheDocument();
    expect(screen.getAllByText(/9403.40.00/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/9954.79/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Grand Total \(incl\. GST\)/i)).toBeInTheDocument();
  });

  it('switches tax mode between Intra-State and Inter-State', async () => {
    const user = userEvent.setup();
    render(<QuotationPanel project={project} revision="REV001" />);

    // Initially Intra-State: should show CGST and SGST
    expect(screen.getByText(/Central GST \(CGST 9%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/State GST \(SGST 9%\)/i)).toBeInTheDocument();

    // Select Inter-State (IGST)
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'INTER_STATE');

    expect(screen.getByText(/Integrated GST \(IGST 18%\)/i)).toBeInTheDocument();
  });
});
