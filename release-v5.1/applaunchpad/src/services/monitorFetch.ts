import { MetricsClient } from '@labring/sealos-metrics-sdk';
import type { LaunchpadQueryParams } from '@labring/sealos-metrics-sdk';

export const monitorFetch = async (params: LaunchpadQueryParams, kubeconfig: string) => {
  // A client is bound to this request's credentials; never share it across users.
  const client = new MetricsClient({
    kubeconfig,
    metricsURL: global.AppConfig?.launchpad?.components?.monitor?.url
  });
  return client.launchpad.query(params);
};
