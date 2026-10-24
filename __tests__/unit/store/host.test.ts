import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getHostConfig } = vi.hoisted(() => ({ getHostConfig: vi.fn() }));
vi.mock('@labring/sealos-desktop-sdk/app', () => ({ sealosApp: { getHostConfig } }));

describe('Desktop currency state', () => {
  beforeEach(() => {
    vi.resetModules();
    getHostConfig.mockReset();
  });

  it.each(['shellCoin', 'cny', 'usd'] as const)('uses the host %s symbol', async (currencySymbol) => {
    getHostConfig.mockResolvedValue({ currencySymbol });
    const { loadHostConfig, useHostStore } = await import('@/store/host');
    expect(useHostStore.getState().currencySymbol).toBe('shellCoin');
    const subscriber = vi.fn();
    const unsubscribe = useHostStore.subscribe(subscriber);
    await loadHostConfig();
    expect(useHostStore.getState().currencySymbol).toBe(currencySymbol);
    expect(subscriber).toHaveBeenCalled();
    unsubscribe();
  });

  it('falls back for an older Desktop without the field', async () => {
    getHostConfig.mockResolvedValue({ cloud: {}, features: {} });
    const { loadHostConfig, useHostStore } = await import('@/store/host');
    await loadHostConfig();
    expect(useHostStore.getState().currencySymbol).toBe('shellCoin');
  });

  it('falls back when standalone or a host request fails', async () => {
    getHostConfig.mockRejectedValue(new Error('timeout'));
    const { loadHostConfig, useHostStore } = await import('@/store/host');
    await expect(loadHostConfig()).resolves.toBeUndefined();
    expect(useHostStore.getState().currencySymbol).toBe('shellCoin');
    await loadHostConfig();
    expect(getHostConfig).toHaveBeenCalledTimes(1);
  });

  it('shares one pending request and keeps the result across remounts', async () => {
    let resolve!: (value: { currencySymbol: 'usd' }) => void;
    getHostConfig.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { loadHostConfig, useHostStore } = await import('@/store/host');
    const first = loadHostConfig();
    expect(loadHostConfig()).toBe(first);
    expect(useHostStore.getState().currencySymbol).toBe('shellCoin');
    resolve({ currencySymbol: 'usd' });
    await first;
    await loadHostConfig();
    expect(useHostStore.getState().currencySymbol).toBe('usd');
    expect(getHostConfig).toHaveBeenCalledTimes(1);
  });
});
