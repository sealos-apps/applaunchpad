import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LaunchpadService } from '../src/services/launchpad';
import { DatabaseService } from '../src/services/database';

function fixture(Service: typeof LaunchpadService | typeof DatabaseService, denied = false) {
  const events: string[] = [];
  const requests: { path: string; body: URLSearchParams }[] = [];
  const auth = {
    resolveNamespace: (namespace?: string) => namespace || 'ns-demo',
    authenticate: async (namespace: string) => {
      events.push(`auth:${namespace}`);
      if (denied) throw new Error('forbidden');
    }
  };
  const service = new Service('http://unused.invalid', auth as any);
  (service as any).client = {
    post: async (path: string, body: string) => {
      events.push('query');
      requests.push({ path, body: new URLSearchParams(body) });
      return { data: { status: 'success', data: { result: [] } } };
    }
  };
  return { service, events, requests };
}

test('launchpad authenticates the namespace before querying a range', async () => {
  const { service, events, requests } = fixture(LaunchpadService);
  await (service as LaunchpadService).query({
    type: 'cpu',
    podName: 'demo-abc-xyz',
    range: { start: 0, end: 60, step: '1m' }
  });
  assert.deepEqual(events, ['auth:ns-demo', 'query']);
  assert.equal(requests[0].path, '/api/v1/query_range');
  assert.equal(requests[0].body.get('start'), '0');
  assert.match(requests[0].body.get('query')!, /namespace=~"ns-demo"/);
  assert.match(requests[0].body.get('query')!, /sum_irate/);
});

test('launchpad denial prevents metrics transport', async () => {
  const { service, requests } = fixture(LaunchpadService, true);
  await assert.rejects(
    (service as LaunchpadService).query({ type: 'memory', podName: 'demo-abc-xyz' }),
    /forbidden/
  );
  assert.equal(requests.length, 0);
});

test('database query resolves the application and namespace before transport', async () => {
  const { service, requests } = fixture(DatabaseService);
  await (service as DatabaseService).query({ type: 'postgresql', app: 'demo', query: 'cpu' });
  assert.equal(requests[0].path, '/api/v1/query');
  assert.match(requests[0].body.get('query')!, /demo-postgresql/);
  assert.match(requests[0].body.get('query')!, /ns-demo/);
});

test('database denial also blocks raw queries', async () => {
  const { service, requests } = fixture(DatabaseService, true);
  await assert.rejects((service as DatabaseService).rawQuery({ query: 'up{}' }), /forbidden/);
  assert.equal(requests.length, 0);
});
