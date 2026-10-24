import type { NextApiRequest, NextApiResponse } from 'next';
import { getClientAppConfigServer } from './getClientAppConfig';
import { jsonRes } from '@/services/backend/response';

/** Compatibility response for Desktop integrations using the release configuration endpoint. */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const c = getClientAppConfigServer();
  return jsonRes(res, {
    data: {
      SEALOS_DOMAIN: c.domain,
      NODE_PORT_HOST: c.nodePortHost || '',
      DOMAIN_PORT: String(c.port),
      HTTP_PORT: String(c.httpPort || 80),
      DISABLE_HTTPS: c.disableHttps,
      SEALOS_USER_DOMAINS: c.userDomains,
      DESKTOP_DOMAIN: c.desktopDomain,
      INFRASTRUCTURE_PROVIDER: c.infrastructure.provider,
      REQUIRES_DOMAIN_REG: c.infrastructure.requiresIcpReg,
      DOMAIN_REG_QUERY_LINK: c.infrastructure.icpRegQueryLink,
      DOMAIN_BINDING_DOCUMENTATION_LINK: c.infrastructure.domainBindingDocumentationLink,
      SHOW_EVENT_ANALYZE: c.components.eventAnalysis.enabled,
      FORM_SLIDER_LIST_CONFIG: c.appResourceFormSliderConfig,
      guideEnabled: c.guideEnabled,
      fileMangerConfig: c.fileManager,
      PVC_STORAGE_MAX: c.pvcStorageMax,
      GPU_ENABLED: c.gpuEnabled,
      LOG_ENABLED: c.components.logging.enabled,
      NETWORK_STORAGE_ENABLED: !!c.networkStorageEnabled,
      IMAGE_PORTS_ENABLED: !!c.imagePorts?.enabled,
      CUSTOM_PUBLIC_DOMAIN_PREFIX_ENABLED: !!c.publicDomain?.customPrefixEnabled,
      PUBLIC_DOMAIN_RESERVED_PREFIXES: c.publicDomain?.reservedPrefixes || [],
      CUSTOM_DOMAIN_MODE: c.customDomain?.mode || 'cname',
      CUSTOM_DOMAIN_CERTIFICATE_SECRET_NAME:
        c.customDomain?.certificate?.tlsSecretName || 'wildcard-cert'
    }
  });
}
