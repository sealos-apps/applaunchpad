import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from 'dns';
import configHandler from '@/pages/api/platform/getClientAppConfig';
import cnameHandler from '@/pages/api/platform/authCname';

const response = () => ({ json: vi.fn() } as any);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sealox public configuration', () => {
  it.each([':443', '443', undefined])(
    'returns numeric HTTPS port from %s without credentials',
    async (port) => {
      vi.stubGlobal('AppConfig', { cloud: { domain: 'apps.test', port, secret: 'private' } });
      const res = response();
      await configHandler({} as any, res);
      expect(res.json.mock.calls[0][0]).toMatchObject({
        code: 200,
        data: { domain: 'apps.test', port: 443, httpPort: 80, disableHttps: false, userDomains: [] }
      });
      expect(res.json.mock.calls[0][0].data).not.toHaveProperty('secret');
    }
  );
  it('fails when config is missing', async () => {
    vi.stubGlobal('AppConfig', undefined);
    const res = response();
    await configHandler({} as any, res);
    expect(res.json.mock.calls[0][0].code).toBe(500);
  });
});

describe('sealox CNAME contract', () => {
  it('returns the verified normalized CNAME target', async () => {
    vi.spyOn(dns, 'resolveCname').mockImplementation(((_host: string, cb: any) =>
      cb(null, ['APP.EXAMPLE.COM.'])) as any);
    const res = response();
    await cnameHandler(
      { body: { customDomain: 'custom.example.com', publicDomain: 'app.example.com' } } as any,
      res
    );
    expect(res.json.mock.calls[0][0]).toMatchObject({
      code: 200,
      data: { type: 'CNAME', data: 'app.example.com' }
    });
  });
  it('keeps mismatches as failures', async () => {
    vi.spyOn(dns, 'resolveCname').mockImplementation(((_host: string, cb: any) =>
      cb(null, ['other.example.com'])) as any);
    const res = response();
    await cnameHandler(
      { body: { customDomain: 'custom.example.com', publicDomain: 'app.example.com' } } as any,
      res
    );
    expect(res.json.mock.calls[0][0].code).toBe(400);
  });
});
