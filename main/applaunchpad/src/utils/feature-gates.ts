function getAppConfig(config?: unknown) {
  return (config || globalThis.__APP_CONFIG__) as any;
}

export function isCustomPublicDomainPrefixEnabled(config?: unknown) {
  return !!getAppConfig(config)?.launchpad?.publicDomain?.customPrefixEnabled;
}

export function isImagePortsEnabled(config?: unknown) {
  return !!getAppConfig(config)?.launchpad?.imagePorts?.enabled;
}

export function isNodePortAccessEnabled(config?: unknown) {
  return !!getAppConfig(config)?.cloud?.nodePortHost?.trim();
}
