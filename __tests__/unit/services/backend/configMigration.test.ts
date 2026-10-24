import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';
import { readConfig } from '@labring/sealos-shared-sdk/server/config';
import { AppConfigSchema } from '@/types/config';
import { migrateAppConfig, resolveAppConfigPath } from '@/services/backend/configMigration';
import { getClientAppConfigServer } from '@/pages/api/platform/getClientAppConfig';

const mainText = readFileSync(resolve(process.cwd(), 'data/config.example.yaml'), 'utf8');
const releaseText = readFileSync(
  resolve(process.cwd(), '__tests__/fixtures/legacy-config.fixture.yaml'),
  'utf8'
);
const legacy = () => load(releaseText) as any;
const current = () => load(mainText) as any;
const parse = (input: unknown) => AppConfigSchema.parse(migrateAppConfig(input));

describe('configuration migration', () => {
  it('loads the actual main and release examples through the startup reader', async () => {
    for (const text of [mainText, releaseText]) {
      const result = await readConfig(text, AppConfigSchema as any, (text) =>
        migrateAppConfig(load(text))
      );
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    }
  });

  it('preserves the main configuration and does not mutate either input', () => {
    const input = current();
    expect(parse(input)).toEqual(AppConfigSchema.parse(input));
    for (const config of [input, legacy()]) {
      const before = structuredClone(config);
      migrateAppConfig(config);
      expect(config).toEqual(before);
    }
  });

  it('maps release fields and retains its optional capabilities', () => {
    const input = legacy();
    input.common.networkStorageEnabled = true;
    input.launchpad.imagePorts.enabled = true;
    input.launchpad.customDomain.mode = 'certificate';
    input.launchpad.gtmId = 'GTM-TEST';
    input.launchpad.eventAnalyze = { enabled: true, fastGPTKey: 'server-only-test-key' };
    const result = parse(input);
    expect(result.cloud).toMatchObject({ port: 443, httpPort: 80, nodePortHost: '' });
    expect(result.launchpad.features.networkStorage).toBe(true);
    expect(result.launchpad.imagePorts?.enabled).toBe(true);
    expect(result.launchpad.customDomain?.mode).toBe('certificate');
    expect(result.launchpad.ui).not.toHaveProperty('currencySymbol');
    expect(result.launchpad.ui.appResourceFormSliderConfig.default.ephemeralStorage).toEqual([
      10, 20, 30, 40, 50
    ]);
    expect(result.launchpad.fileManager).toEqual({ uploadLimit: 50, downloadLimit: 100 });
    expect(result.launchpad.analytics.gtm).toEqual({ enabled: true, gtmId: 'GTM-TEST' });
    expect(result.launchpad.components.eventAnalysis).toEqual({
      enabled: true,
      url: 'https://fastgpt.run/api/openapi/v1',
      fastGPTKey: 'server-only-test-key'
    });
    expect(result.launchpad.components.logging.enabled).toBe(true);
    expect(result.launchpad.infrastructure.requiresIcpReg).toBe(true);
    expect(result.launchpad.checkIcpReg.enabled).toBe(false);
    expect(parse(result)).toEqual(result);
  });

  it('prefers explicit canonical values, including false, and warns without exposing values', () => {
    const input = legacy();
    const canonical = current();
    input.launchpad.features = { guide: false, api: false, gpu: false, networkStorage: false };
    input.common.networkStorageEnabled = true;
    input.launchpad.components.eventAnalysis = canonical.launchpad.components.eventAnalysis;
    input.launchpad.eventAnalyze.fastGPTKey = 'must-not-appear';
    input.launchpad.ui = { ...canonical.launchpad.ui, currencySymbol: 'usd' };
    input.launchpad.components.logging = { enabled: false, url: 'http://canonical' };
    const warn = vi.fn();
    const result = AppConfigSchema.parse(migrateAppConfig(input, warn));
    expect(result.launchpad.features.networkStorage).toBe(false);
    expect(result.launchpad.ui).not.toHaveProperty('currencySymbol');
    expect(result.launchpad.components.logging.enabled).toBe(false);
    expect(result.launchpad.components.eventAnalysis.fastGPTKey).toBe('');
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('must-not-appear');
  });

  it('normalizes legacy GPU slider aliases and custom ports', () => {
    const input = legacy();
    input.launchpad.appResourceFormSliderConfig.defaultGPU =
      input.launchpad.appResourceFormSliderConfig['default-gpu'];
    delete input.launchpad.appResourceFormSliderConfig['default-gpu'];
    input.cloud.port = ':8443';
    input.cloud.httpPort = ' 8080 ';
    input.cloud.disableHttps = true;
    const result = parse(input);
    expect(result.cloud).toMatchObject({ port: 8443, httpPort: 8080, disableHttps: true });
    expect(result.launchpad.ui.appResourceFormSliderConfig['default-gpu']).toBeDefined();
    expect(result.launchpad.ui.appResourceFormSliderConfig.defaultGPU).toBeUndefined();
  });

  it.each(['invalid', '-1', '65536', 0, 65536, 1.5])('rejects invalid ports: %s', (port) => {
    const input = legacy();
    input.cloud.port = port;
    expect(() => parse(input)).toThrow();
  });

  it('retains unknown fields and invalid containers for strict validation', () => {
    for (const mutate of [
      (c: any) => {
        c.common.apiEnabld = true;
      },
      (c: any) => {
        c.launchpad.fileManger.unknown = true;
      },
      (c: any) => {
        c.launchpad.features = false;
      },
      (c: any) => {
        c.launchpad.ui = null;
      },
      (c: any) => {
        c.launchpad.checkIcpReg = null;
      },
      (c: any) => {
        c.launchpad.components.eventAnalysis = { enabled: false };
      }
    ]) {
      const input = legacy();
      mutate(input);
      expect(() => parse(input)).toThrow();
    }
    const input = current();
    delete input.launchpad.components;
    expect(() => parse(input)).toThrow();
  });

  it('keeps server credentials out of client configuration', () => {
    const input = legacy();
    input.launchpad.eventAnalyze.fastGPTKey = 'server-only-test-key';
    const original = globalThis.__APP_CONFIG__;
    try {
      globalThis.__APP_CONFIG__ = parse(input);
      const client = getClientAppConfigServer();
      expect(client.components.eventAnalysis).toEqual({
        enabled: false,
        url: 'https://fastgpt.run/api/openapi/v1'
      });
      expect(JSON.stringify(client)).not.toContain('server-only-test-key');
      expect(client).not.toHaveProperty('checkIcpReg');
      expect(client).not.toHaveProperty('domainChallengeSecret');
    } finally {
      globalThis.__APP_CONFIG__ = original;
    }
  });
});

describe('configuration file selection', () => {
  it('uses the canonical development file when both exist', () => {
    expect(resolveAppConfigPath(true, () => true)).toBe('data/config.local.yaml');
  });
  it('falls back to the release development file only when the canonical file is absent', () => {
    expect(resolveAppConfigPath(true, (path) => path === 'data/config.yaml.local')).toBe(
      'data/config.yaml.local'
    );
    expect(resolveAppConfigPath(true, () => false)).toBe('data/config.local.yaml');
  });
  it('always uses the mounted production file', () => {
    const exists = vi.fn();
    expect(resolveAppConfigPath(false, exists)).toBe('/app/data/config.yaml');
    expect(exists).not.toHaveBeenCalled();
  });
});
