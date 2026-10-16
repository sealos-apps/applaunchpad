// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InsufficientQuotaDialog } from '../../../../packages/shared/src/components/shadcn/InsufficientQuotaDialog/InsufficientQuotaDialog';

const { getHostConfig } = vi.hoisted(() => ({ getHostConfig: vi.fn() }));
vi.mock('../../../../packages/shared/src/hooks/QuotaGuardProvider', () => ({
  useQuotaGuardConfig: () => ({ sealosApp: { getHostConfig } })
}));
vi.mock('../../../../packages/shared/src/store/quota', () => ({
  useQuotaStore: () => ({})
}));
vi.mock('../../../../packages/shared/src/components/shadcn/InsufficientQuotaDialog/InsufficientQuotaDialogView', () => ({
  InsufficientQuotaDialogView: ({ subscriptionEnabled }: { subscriptionEnabled: boolean }) => (
    <div data-testid="subscription">{String(subscriptionEnabled)}</div>
  )
}));

afterEach(() => {
  cleanup();
  getHostConfig.mockReset();
});

describe('shared host config in the quota dialog', () => {
  it('updates from application state without making another SDK request', () => {
    const { rerender } = render(<InsufficientQuotaDialog lang="en" subscriptionEnabled={true} />);
    expect(screen.getByTestId('subscription').textContent).toBe('true');
    rerender(<InsufficientQuotaDialog lang="en" subscriptionEnabled={false} />);
    expect(screen.getByTestId('subscription').textContent).toBe('false');
    expect(getHostConfig).not.toHaveBeenCalled();
  });

  it('preserves SDK loading for consumers without shared configuration', async () => {
    getHostConfig.mockResolvedValue({ features: { subscription: false } });
    render(<InsufficientQuotaDialog lang="en" />);
    await waitFor(() => expect(screen.getByTestId('subscription').textContent).toBe('false'));
    expect(getHostConfig).toHaveBeenCalled();
  });
});
