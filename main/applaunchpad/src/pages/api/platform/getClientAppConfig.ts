import { Config } from '@/config';
import { jsonRes } from '@/services/backend/response';
import { ClientAppConfigSchema } from '@/types/config';
import {
  isServerMisconfiguredError,
  validateClientAppConfigOrThrow
} from '@sealos/shared/server/config';
import type { NextApiRequest, NextApiResponse } from 'next';

export function getClientAppConfigServer() {
  const fullConfig = Config();
  return validateClientAppConfigOrThrow(ClientAppConfigSchema, {
    domain: fullConfig.cloud.domain,
    nodePortHost: fullConfig.cloud.nodePortHost,
    networkStorageEnabled: fullConfig.launchpad.features.networkStorage,
    imagePorts: fullConfig.launchpad.imagePorts,
    publicDomain: fullConfig.launchpad.publicDomain,
    customDomain: fullConfig.launchpad.customDomain,
    port: fullConfig.cloud.port,
    httpPort: fullConfig.cloud.httpPort,
    disableHttps: fullConfig.cloud.disableHttps,
    userDomains: fullConfig.cloud.userDomains,
    desktopDomain: fullConfig.cloud.desktopDomain,
    guideEnabled: fullConfig.launchpad.features.guide,
    apiEnabled: fullConfig.launchpad.features.api,
    gpuEnabled: fullConfig.launchpad.features.gpu,
    infrastructure: fullConfig.launchpad.infrastructure,
    pvcStorageMax: fullConfig.launchpad.pvcStorageMax,
    analytics: fullConfig.launchpad.analytics,
    components: {
      monitoring: fullConfig.launchpad.components.monitoring,
      billing: fullConfig.launchpad.components.billing,
      logging: fullConfig.launchpad.components.logging,
      eventAnalysis: {
        enabled: fullConfig.launchpad.components.eventAnalysis.enabled,
        url: fullConfig.launchpad.components.eventAnalysis.url
      }
    },
    appResourceFormSliderConfig: fullConfig.launchpad.ui.appResourceFormSliderConfig,
    fileManager: fullConfig.launchpad.fileManager,
    meta: {
      title: fullConfig.launchpad.ui.meta.title,
      description: fullConfig.launchpad.ui.meta.description
    }
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    jsonRes(res, { code: 200, data: getClientAppConfigServer() });
  } catch (error) {
    if (isServerMisconfiguredError(error)) {
      return jsonRes(res, { code: 500, message: 'Server misconfigured' });
    }
    console.error('[Client App Config] Unexpected server error:', error);
    return jsonRes(res, { code: 500, message: 'Internal Server Error' });
  }
}
