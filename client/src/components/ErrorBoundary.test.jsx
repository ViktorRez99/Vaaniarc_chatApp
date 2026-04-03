import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

const ProblemChild = () => {
  throw new Error('Boom');
};

describe('ErrorBoundary', () => {
  it('renders the fallback UI when a child throws', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const preventUnhandledError = (event) => {
      event.preventDefault();
    };

    window.addEventListener('error', preventUnhandledError);

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/Boom/)).toBeInTheDocument();

    window.removeEventListener('error', preventUnhandledError);
    consoleErrorSpy.mockRestore();
  });
});
