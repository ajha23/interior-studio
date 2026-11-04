import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { TileSchedulePanel } from './TileSchedulePanel';

describe('TileSchedulePanel Component', () => {
  const project = createProject({
    name: 'Tile Test Kitchen',
    room: DEFAULT_ROOM,
    layout: 'straight',
  });

  it('renders tile metrics and breakdown table', () => {
    render(<TileSchedulePanel project={project} revision="REV_TILE_01" />);

    expect(screen.getByTestId('tile-schedule-panel')).toBeInTheDocument();
    expect(screen.getByText(/Net Backsplash Area/i)).toBeInTheDocument();
    expect(screen.getByTestId('tile-count')).toBeInTheDocument();
    expect(screen.getByTestId('tile-boxes')).toBeInTheDocument();
    expect(screen.getByText(/Wall-by-Wall Dado Schedule/i)).toBeInTheDocument();
    expect(screen.getByText(/IS 15477/i)).toBeInTheDocument();
  });
});

