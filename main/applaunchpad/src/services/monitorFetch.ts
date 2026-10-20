import { MetricsClient } from '@labring/sealos-metrics-sdk';
import type { LaunchpadQueryParams } from '@labring/sealos-metrics-sdk';
import { Config } from '@/config';

export const monitorFetch = async (params: LaunchpadQueryParams, kubeconfig: string) => {
  // A client is bound to this request's credentials; never share it across users.
  const client = new MetricsClient({
    kubeconfig,
    metricsURL: process.env.METRICS_URL || Config().launchpad.components.monitoring.url
  });
  return client.launchpad.query(params);
};
