import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart } from './BarChart';

describe('BarChart', () => {
  it('renders an SVG with a bar and labels for each datum', () => {
    const { container } = render(
      <BarChart
        data={[
          { label: 'soccer', value: 12 },
          { label: 'tennis', value: 5 },
        ]}
      />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // Two value rects (the filled bars) plus two track rects = 4 rects.
    expect(container.querySelectorAll('rect').length).toBe(4);

    // Both labels and both values render as text nodes.
    expect(screen.getByText('soccer')).toBeInTheDocument();
    expect(screen.getByText('tennis')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders an empty state when given no data', () => {
    render(<BarChart data={[]} />);
    expect(screen.getByText('no data')).toBeInTheDocument();
  });
});
