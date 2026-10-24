type ConfigObject = Record<string, unknown>;

const isObject = (value: unknown): value is ConfigObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Normalize known legacy aliases only. Unknown fields remain for strict validation. */
export function migrateAppConfig(
  input: unknown,
  warn: (message: string) => void = () => {}
): unknown {
  if (!isObject(input)) return input;
  const config = structuredClone(input);
  if (!isObject(config.launchpad)) return config;
  const launchpad = config.launchpad;
  const legacy =
    'common' in config ||
    [
      'meta',
      'gtmId',
      'currencySymbol',
      'appResourceFormSliderConfig',
      'fileManger',
      'eventAnalyze'
    ].some((key) => key in launchpad);

  // Invalid containers are left untouched so the schema reports them, not repaired silently.
  const objectAt = (parent: ConfigObject, key: string): ConfigObject | undefined => {
    if (parent[key] === undefined) parent[key] = {};
    const value = parent[key];
    return isObject(value) ? value : undefined;
  };
  const move = (
    source: ConfigObject,
    oldKey: string,
    target: ConfigObject | undefined,
    newKey: string,
    path: string
  ) => {
    if (!(oldKey in source) || !target) return;
    if (newKey in target) {
      // Never include values: configuration can contain credentials.
      warn(`Legacy configuration field ${oldKey} ignored; ${path} takes precedence.`);
    } else {
      target[newKey] = source[oldKey];
    }
    delete source[oldKey];
  };

  if (isObject(config.common)) {
    const features = objectAt(launchpad, 'features');
    for (const [oldKey, newKey] of Object.entries({
      guideEnabled: 'guide',
      apiEnabled: 'api',
      gpuEnabled: 'gpu',
      networkStorageEnabled: 'networkStorage'
    })) {
      move(config.common, oldKey, features, newKey, `launchpad.features.${newKey}`);
    }
    if (Object.keys(config.common).length === 0) delete config.common;
  }
  if (legacy) {
    const ui = objectAt(launchpad, 'ui');
    for (const key of ['meta', 'appResourceFormSliderConfig']) {
      move(launchpad, key, ui, key, `launchpad.ui.${key}`);
    }
    delete launchpad.currencySymbol; // Currency now comes from the Desktop host.
    if (ui) delete ui.currencySymbol;
    move(launchpad, 'fileManger', launchpad, 'fileManager', 'launchpad.fileManager');
    const analytics = objectAt(launchpad, 'analytics');
    if ('gtmId' in launchpad && analytics) {
      if ('gtm' in analytics) {
        warn('Legacy configuration field gtmId ignored; launchpad.analytics.gtm takes precedence.');
      } else {
        const id = launchpad.gtmId;
        analytics.gtm = { enabled: typeof id === 'string' && id.length > 0, gtmId: id ?? '' };
      }
      delete launchpad.gtmId;
    }
    const components = objectAt(launchpad, 'components');
    const legacyEventAnalysis =
      components && !('eventAnalysis' in components) && 'eventAnalyze' in launchpad;
    move(
      launchpad,
      'eventAnalyze',
      components,
      'eventAnalysis',
      'launchpad.components.eventAnalysis'
    );
    if (legacyEventAnalysis && components && isObject(components.eventAnalysis)) {
      // release-v5.1 used this fixed endpoint in getPodEventsAnalyses.ts.
      if (components.eventAnalysis.url === undefined)
        components.eventAnalysis.url = 'https://fastgpt.run/api/openapi/v1';
      if (components.eventAnalysis.fastGPTKey === undefined)
        components.eventAnalysis.fastGPTKey = '';
    }
    // release-v5.1 does not have the main ICP query backend configuration.
    if (launchpad.checkIcpReg === undefined)
      launchpad.checkIcpReg = {
        enabled: false,
        endpoint: '',
        accessKeyID: '',
        accessKeySecret: ''
      };
    if (launchpad.domainChallengeSecret === undefined)
      launchpad.domainChallengeSecret = 'default-dev-secret-change-in-production';
  }
  if (isObject(launchpad.components)) {
    const components = launchpad.components;
    move(components, 'monitor', components, 'monitoring', 'launchpad.components.monitoring');
    const legacyLog = !('logging' in components) && 'log' in components;
    move(components, 'log', components, 'logging', 'launchpad.components.logging');
    if (legacyLog && isObject(components.logging)) {
      if (components.logging.enabled === undefined)
        components.logging.enabled = !!components.logging.url;
    }
  }
  if (isObject(launchpad.infrastructure)) {
    const infra = launchpad.infrastructure;
    move(
      infra,
      'requiresDomainReg',
      infra,
      'requiresIcpReg',
      'launchpad.infrastructure.requiresIcpReg'
    );
    move(
      infra,
      'domainRegQueryLink',
      infra,
      'icpRegQueryLink',
      'launchpad.infrastructure.icpRegQueryLink'
    );
  }
  if (isObject(launchpad.ui) && isObject(launchpad.ui.appResourceFormSliderConfig)) {
    const sliders = launchpad.ui.appResourceFormSliderConfig;
    move(
      sliders,
      'defaultGPU',
      sliders,
      'default-gpu',
      'launchpad.ui.appResourceFormSliderConfig.default-gpu'
    );
  }
  if (isObject(config.cloud)) {
    for (const [key, fallback] of [
      ['port', 443],
      ['httpPort', 80]
    ] as const) {
      const value = config.cloud[key];
      if (typeof value === 'string') {
        const trimmed = value.trim().replace(/^:/, '');
        // Leave invalid strings intact for validation; never turn them into default ports.
        config.cloud[key] =
          trimmed === '' ? fallback : /^\d+$/.test(trimmed) ? Number(trimmed) : value;
      } else if (legacy && value === undefined) {
        config.cloud[key] = fallback;
      }
    }
  }
  return config;
}

export function resolveAppConfigPath(
  development: boolean,
  exists: (path: string) => boolean
): string {
  if (!development) return '/app/data/config.yaml';
  const canonical = 'data/config.local.yaml';
  const legacy = 'data/config.yaml.local';
  return !exists(canonical) && exists(legacy) ? legacy : canonical;
}
