export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { readFileSync, existsSync } = await import('fs');
    const { load } = await import('js-yaml');
    const { migrateAppConfig, resolveAppConfigPath } = await import(
      './services/backend/configMigration'
    );
    const { readConfig, mountToGlobalThis, prettyPrintErrors } = await import(
      '@sealos/shared/server/config'
    );
    const { AppConfigSchema } = await import('./types/config');

    const configPath = resolveAppConfigPath(process.env.NODE_ENV === 'development', existsSync);

    try {
      const configText = readFileSync(configPath, 'utf-8');
      const result = await readConfig(configText, AppConfigSchema as any, (text) =>
        migrateAppConfig(load(text), (message) => console.warn(`[App Config] ${message}`))
      );

      if (result.error) {
        console.error('[Instrumentation Hook] Configuration validation failed:');
        console.error(prettyPrintErrors(result.error.details));
        process.exit(1);
      }

      mountToGlobalThis('__APP_CONFIG__', result.data);
      const { setPublicDomainReservedPrefixes } = await import('./utils/public-domain');
      setPublicDomainReservedPrefixes(
        globalThis.__APP_CONFIG__?.launchpad.publicDomain?.reservedPrefixes
      );
      console.log('[Instrumentation Hook] Configuration loaded.');

      // GPU node detection
      try {
        const { getGpuNode } = await import('./services/backend/gpu');
        const gpuNodes = await getGpuNode();
        console.log(gpuNodes, 'gpuNodes');
      } catch (gpuErr) {
        console.warn('[Instrumentation Hook] GPU node detection failed (non-fatal):', gpuErr);
      }
    } catch (err) {
      // nosemgrep: unsafe-formatstring
      console.error(`[Instrumentation Hook] Failed to load config file from ${configPath}:`, err);
      process.exit(1);
    }
  }
}
