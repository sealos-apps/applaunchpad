/**
 * Network Monitor Service - network request count monitor
 */

import type { LaunchpadQueryResult } from '@labring/sealos-metrics-sdk';
import { monitorFetch } from './monitorFetch';

export type NetworkMonitorQueryType =
  | 'network_service_request_count'
  | 'network_service_request_percent';

export interface NetworkMonitorQueryParams {
  namespace: string;
  type: NetworkMonitorQueryType;
  service: string; // full service name, like serviceName.namespace.svc.cluster.local
  port: number; // port number
  start?: number;
  end?: number;
  step?: string;
  time?: number;
}

export interface NetworkMonitorMetric {
  response_code_class?: string; // status code class: 2xx, 3xx, 4xx, 5xx
  cluster_name?: string;
  container?: string;
  endpoint?: string;
  instance?: string;
  job?: string;
  namespace?: string;
  node?: string;
  pod?: string;
  prometheus?: string;
  __name__?: string;
  [key: string]: string | undefined;
}

export interface NetworkMonitorResultItem {
  metric: NetworkMonitorMetric;
  value?: [number, string];
  values?: [number, string][];
}

export type NetworkMonitorServiceResponse = LaunchpadQueryResult;

export interface NetworkMonitorDataResult {
  name?: string; // status code class name: 2xx, 3xx, 4xx, 5xx
  xData: number[];
  yData: Array<string | null>;
}

/**
 * build full service name
 */
export const buildFullServiceName = (serviceName: string, namespace: string): string => {
  return `${serviceName}.${namespace}.svc.cluster.local`;
};

/**
 * network monitor data query method
 */
export const networkMonitorFetch = async (
  params: NetworkMonitorQueryParams,
  kubeconfig: string
): Promise<NetworkMonitorServiceResponse> => {
  const { start, end, step, time, ...query } = params;
  return monitorFetch({ ...query, range: { start, end, step, time } }, kubeconfig);
};
