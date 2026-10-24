import { create } from 'zustand';
import { sealosApp } from '@labring/sealos-desktop-sdk/app';
import type { HostConfig } from '@labring/sealos-desktop-sdk';

type CurrencySymbol = NonNullable<HostConfig['currencySymbol']>;

// Host settings live only in memory; never persist them across Desktop sessions.
export const useHostStore = create<{ currencySymbol: CurrencySymbol; hostConfig?: HostConfig }>(() => ({
  currencySymbol: 'shellCoin'
}));

let hostConfigRequest: Promise<void> | undefined;

// Call after createSealosApp(). Deduplicate concurrent calls and React remounts.
export function loadHostConfig(): Promise<void> {
  return (hostConfigRequest ??= (async () => {
    try {
      const config = await sealosApp.getHostConfig();
      useHostStore.setState({ hostConfig: config, currencySymbol: config.currencySymbol ?? 'shellCoin' });
    } catch {
      // Older hosts and standalone mode may reject (including the SDK timeout).
      useHostStore.setState({ currencySymbol: 'shellCoin' });
    }
  })());
}
