import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { monitorFetch } from '@/services/monitorFetch';

vi.mock('@/config', () => ({
  Config: () => ({ launchpad: { components: { monitoring: { url: '' } } } })
}));

let server: Server;
let baseURL: string;
let allowed = true;
let backendError = false;
const metricsRequests: URL[] = [];
const reviews: any[] = [];
const kubeconfig = () =>
  JSON.stringify({
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [{ name: 'fixture', cluster: { server: baseURL } }],
    users: [{ name: 'fixture', user: { token: 'fictional-test-token' } }],
    contexts: [
      { name: 'fixture', context: { cluster: 'fixture', user: 'fixture', namespace: 'fixture-ns' } }
    ],
    'current-context': 'fixture'
  });

beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (req.url === '/readyz') {
      res.end('ok');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.includes('selfsubjectaccessreviews')) {
      let body = '';
      for await (const part of req) body += part;
      reviews.push(JSON.parse(body));
      res.end(
        JSON.stringify({
          apiVersion: 'authorization.k8s.io/v1',
          kind: 'SelfSubjectAccessReview',
          status: { allowed }
        })
      );
      return;
    }
    let body = '';
    for await (const part of req) body += part;
    const metricsURL = new URL(req.url!, baseURL);
    metricsURL.search = new URLSearchParams(body).toString();
    metricsRequests.push(metricsURL);
    res.end(
      JSON.stringify(
        backendError
          ? { status: 'error', error: 'fixture query failure' }
          : {
              status: 'success',
              data: {
                resultType: 'matrix',
                result: [{ metric: { pod: 'demo-hash-0' }, values: [[0, '42.5']] }]
              }
            }
      )
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  vi.stubEnv('METRICS_URL', `${baseURL}/select/0/prometheus`);
  vi.stubEnv('WHITELIST_KUBERNETES_HOSTS', baseURL);
});
beforeEach(() => {
  allowed = true;
  backendError = false;
  metricsRequests.length = 0;
  reviews.length = 0;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

describe('published SDK 0.2.0 with local Kubernetes and metrics fixtures', () => {
  it.each(['cpu', 'memory', 'average_cpu', 'average_memory', 'gpu', 'gpu_memory'] as const)(
    'queries scoped %s metrics with client-node 0.18 and preserves seconds/units',
    async (type) => {
      const result = await monitorFetch(
        {
          type,
          podName: 'demo-hash-0',
          namespace: 'fixture-ns',
          range: { start: 0, end: 60, step: '30s' }
        },
        kubeconfig()
      );
      expect(result.data.result[0].values).toEqual([[0, '42.5']]);
      expect(reviews[0].spec.resourceAttributes).toMatchObject({
        namespace: 'fixture-ns',
        verb: 'get',
        resource: 'pods'
      });
      expect(metricsRequests[0].pathname).toBe('/select/0/prometheus/api/v1/query_range');
      expect(Object.fromEntries(metricsRequests[0].searchParams)).toMatchObject({
        start: '0',
        end: '60',
        step: '30s'
      });
      expect(metricsRequests[0].searchParams.get('query')).toContain('fixture-ns');
      expect(metricsRequests[0].searchParams.get('query')).toContain('demo-hash.*');
    }
  );
  it.each(['storage', 'disk'] as const)(
    'queries %s by PVC without requiring a Pod',
    async (type) => {
      await monitorFetch({ type, namespace: 'fixture-ns', pvcName: 'data-demo-0' }, kubeconfig());
      expect(metricsRequests[0].pathname).toBe('/select/0/prometheus/api/v1/query');
      expect(metricsRequests[0].searchParams.get('query')).toContain(
        'persistentvolumeclaim=~"data-demo-0"'
      );
    }
  );
  it.each(['network_service_request_count', 'network_service_request_percent'] as const)(
    'queries %s for the namespaced Service',
    async (type) => {
      await monitorFetch(
        { type, namespace: 'fixture-ns', service: 'web', port: 8080 },
        kubeconfig()
      );
      expect(metricsRequests[0].searchParams.get('query')).toContain(
        'outbound|8080||web.fixture-ns.svc.cluster.local'
      );
    }
  );
  it('does not query metrics when namespace permission is denied', async () => {
    allowed = false;
    await expect(
      monitorFetch({ type: 'cpu', podName: 'demo-hash-0', namespace: 'fixture-ns' }, kubeconfig())
    ).rejects.toThrow('No permission');
    expect(metricsRequests).toHaveLength(0);
  });
  it('rejects Prometheus errors even when HTTP status is 200', async () => {
    backendError = true;
    await expect(
      monitorFetch({ type: 'cpu', podName: 'demo-hash-0', namespace: 'fixture-ns' }, kubeconfig())
    ).rejects.toThrow();
  });
});
