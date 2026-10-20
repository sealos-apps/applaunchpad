import type {
  LaunchpadMetricType,
  LaunchpadQueryParams,
  LaunchpadQueryResult
} from '@labring/sealos-metrics-sdk';

export { monitorFetch as monitorFetchV2 } from './monitorFetch';
export type MonitorQueryType = Extract<
  LaunchpadMetricType,
  'cpu' | 'memory' | 'average_cpu' | 'average_memory' | 'storage'
>;
export type MonitorQueryParams = LaunchpadQueryParams;
export type MonitorServiceResponse = LaunchpadQueryResult;

export interface MonitorDataResult {
  name?: string;
  xData: number[];
  yData: Array<string | null>;
}
