import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { AppConfigSchema } from '@/types/config';
import { migrateAppConfig } from '@/services/backend/configMigration';

const helmAvailable = (() => {
  try {
    execFileSync('helm', ['version', '--short'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
describe.skipIf(!helmAvailable)('unified Helm configuration', () => {
  for (const flags of [
    [],
    [
      '--set',
      'applaunchpadConfig.customDomainMode=certificate',
      '--set',
      'certificateRbac.enabled=true',
      '--set',
      'applaunchpadConfig.networkStorageEnabled=true',
      '--set',
      'applaunchpadConfig.gpuEnabled=true'
    ],
    [
      '--set',
      'applaunchpadConfig.disableHttps=true',
      '--set-string',
      'applaunchpadConfig.httpPort=:8080',
      '--set',
      'applaunchpadConfig.requiresDomainReg=true'
    ]
  ]) {
    it(`validates rendered runtime YAML: ${flags.join(' ') || 'defaults'}`, () => {
      const rendered = execFileSync(
        'helm',
        [
          'template',
          'applaunchpad-frontend',
          'deploy/charts/applaunchpad-frontend',
          '-n',
          'applaunchpad-frontend',
          ...flags
        ],
        { encoding: 'utf8' }
      );
      const resources = yaml.loadAll(rendered) as any[];
      const raw = resources.find((r) => r?.kind === 'ConfigMap').data['config.yaml'];
      expect(AppConfigSchema.safeParse(migrateAppConfig(yaml.load(raw))).success).toBe(true);
      const deploy = resources.find((r) => r?.kind === 'Deployment');
      expect(deploy.spec.template.spec.containers[0].readinessProbe.httpGet.path).toBe('/healthz');
    });
  }
});
