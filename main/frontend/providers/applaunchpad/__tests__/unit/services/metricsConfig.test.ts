import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { AppConfigSchema } from '@/types/config';
import { getClientAppConfigServer } from '@/pages/api/platform/getClientAppConfig';

const config = vi.hoisted(() => ({ value: undefined as any }));
vi.mock('@/config', () => ({ Config: () => config.value }));

it('keeps metrics server settings out of the strict client configuration', () => {
  config.value = AppConfigSchema.parse(yaml.load(readFileSync('data/config.example.yaml', 'utf8')));
  const client = getClientAppConfigServer();
  expect(client.components).not.toHaveProperty('metrics');
  expect(client.components.monitoring).toEqual(config.value.launchpad.components.monitoring);
});
