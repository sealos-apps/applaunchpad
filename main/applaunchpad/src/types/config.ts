import { z } from 'zod';

const UserDomainSchema = z.strictObject({
  name: z.string(),
  secretName: z.string()
});

const CloudSchema = z.strictObject({
  domain: z.string().describe('Main promoted domain'),
  nodePortHost: z.string().optional(),
  port: z.number().int().min(1).max(65535).describe('Port number, e.g. 443'),
  httpPort: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .describe('HTTP port number used when HTTPS is disabled'),
  disableHttps: z.boolean().default(false).describe('Whether public application URLs use HTTP'),
  userDomains: z.array(UserDomainSchema).describe('List of domains available for users'),
  desktopDomain: z.string().describe('Domain for the desktop application')
});

const InfrastructureSchema = z.strictObject({
  provider: z.string(),
  requiresIcpReg: z.boolean(),
  icpRegQueryLink: z.string(),
  domainBindingDocumentationLink: z
    .string()
    .nullable()
    .describe('Link to domain binding documentation, or null if not applicable')
});

/**
 * Script schema for <Script> component injection.
 * Supports any string attributes (src, strategy, data-*, etc.).
 */
const MetaScriptSchema = z
  .object({
    src: z.string()
  })
  .catchall(z.string());

const MetaSchema = z.strictObject({
  title: z.string(),
  description: z.string(),
  scripts: z.array(MetaScriptSchema)
});

const SliderConfigSchema = z.strictObject({
  cpu: z.array(z.number()),
  memory: z.array(z.number()),
  ephemeralStorage: z.array(z.number()).optional()
});

const EventAnalysisSchema = z.strictObject({
  enabled: z.boolean().describe('Whether the FastGPT event analysis feature is enabled'),
  url: z.string().describe('FastGPT API base URL, e.g. https://fastgpt.run/api/openapi/v1/'),
  fastGPTKey: z.string()
});

const AnalyticsSchema = z.strictObject({
  gtm: z.strictObject({
    enabled: z.boolean().describe('Whether to enable GTM analytics feature'),
    gtmId: z.string().describe('Google Tag Manager ID, e.g. GTM-XXXXXX')
  }),
  rybbit: z
    .strictObject({
      host: z
        .string()
        .describe(
          'Self-hosted Rybbit server URL, e.g. https://rybbit.example.com; empty disables tracking'
        ),
      siteId: z.string().describe('Rybbit site ID')
    })
    .optional()
});

const FeaturesSchema = z.strictObject({
  networkStorage: z.boolean().optional(),
  guide: z.boolean().describe('Whether the interactive guide feature is enabled'),
  api: z.boolean().describe('Whether the public API feature is enabled'),
  gpu: z
    .boolean()
    .describe(
      'Whether GPU resource support is enabled; overridden at runtime by GPU node detection'
    )
});

const UiSchema = z.strictObject({
  meta: MetaSchema.describe('Page meta tags and custom script injection'),
  appResourceFormSliderConfig: z
    .record(z.string(), SliderConfigSchema)
    .describe('Slider configuration per GPU type key; "default" is the base config')
});

const ComponentsSchema = z.strictObject({
  monitoring: z.strictObject({
    url: z
      .string()
      .describe('Direct Prometheus-compatible metrics base URL from the mounted ConfigMap')
  }),
  billing: z.strictObject({
    url: z.string()
  }),
  logging: z.strictObject({
    url: z.string(),
    enabled: z.boolean().describe('Whether the logging service is enabled')
  }),
  eventAnalysis: EventAnalysisSchema
});

const FileManagerSchema = z.strictObject({
  uploadLimit: z.number().describe('Upload limit in MB'),
  downloadLimit: z.number().describe('Download limit in MB')
});

const CheckIcpRegSchema = z
  .strictObject({
    enabled: z.boolean(),
    endpoint: z.string(),
    accessKeyID: z.string(),
    accessKeySecret: z.string()
  })
  .describe('ICP registration check configuration (server-side only)');

const LaunchpadSchema = z.strictObject({
  features: FeaturesSchema.describe('Feature flags and behavior switches'),
  ui: UiSchema.describe('UI and branding configuration'),
  infrastructure: InfrastructureSchema,
  domainChallengeSecret: z.string(),
  pvcStorageMax: z.number().describe('Maximum PVC storage in GB'),
  analytics: AnalyticsSchema,
  components: ComponentsSchema,
  fileManager: FileManagerSchema,
  checkIcpReg: CheckIcpRegSchema,
  imagePorts: z
    .strictObject({
      enabled: z.boolean().optional(),
      trustedRegistries: z.array(z.string()).optional()
    })
    .optional(),
  publicDomain: z
    .strictObject({
      customPrefixEnabled: z.boolean().optional(),
      reservedPrefixes: z.array(z.string()).optional()
    })
    .optional(),
  customDomain: z
    .strictObject({
      mode: z.enum(['cname', 'certificate']).optional(),
      certificate: z.strictObject({ tlsSecretName: z.string().optional() }).optional()
    })
    .optional()
});

/**
 * Complete application configuration schema.
 * Validated and loaded at startup via the instrumentation hook.
 */
export const AppConfigSchema = z.strictObject({
  cloud: CloudSchema,
  launchpad: LaunchpadSchema
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export type SliderConfig = z.infer<typeof SliderConfigSchema>;
export type FormSliderListType = Record<string, SliderConfig>;

/**
 * Client-safe application configuration schema.
 * Excludes sensitive server-side secrets (e.g. checkIcpReg credentials).
 */
export const ClientAppConfigSchema = z.strictObject({
  nodePortHost: z.string().optional(),
  networkStorageEnabled: z.boolean().optional(),
  imagePorts: LaunchpadSchema.shape.imagePorts,
  publicDomain: LaunchpadSchema.shape.publicDomain,
  customDomain: LaunchpadSchema.shape.customDomain,
  domain: z.string(),
  port: z.number(),
  httpPort: z.number().optional(),
  disableHttps: z.boolean(),
  userDomains: z.array(UserDomainSchema),
  desktopDomain: z.string(),
  guideEnabled: z.boolean(),
  apiEnabled: z.boolean(),
  gpuEnabled: z.boolean(),
  infrastructure: z.strictObject({
    provider: z.string(),
    requiresIcpReg: z.boolean(),
    icpRegQueryLink: z.string(),
    domainBindingDocumentationLink: z.string().nullable()
  }),
  pvcStorageMax: z.number(),
  analytics: z.strictObject({
    gtm: z.strictObject({
      enabled: z.boolean(),
      gtmId: z.string()
    }),
    rybbit: z
      .strictObject({
        host: z.string(),
        siteId: z.string()
      })
      .optional()
  }),
  components: z.strictObject({
    monitoring: z.strictObject({ url: z.string() }),
    billing: z.strictObject({ url: z.string() }),
    logging: z.strictObject({ url: z.string(), enabled: z.boolean() }),
    eventAnalysis: z.strictObject({
      enabled: z.boolean(),
      url: z.string()
    })
  }),
  appResourceFormSliderConfig: z.record(z.string(), SliderConfigSchema),
  fileManager: z.strictObject({
    uploadLimit: z.number(),
    downloadLimit: z.number()
  }),
  meta: z.strictObject({
    title: z.string(),
    description: z.string()
  })
});

export type ClientAppConfig = z.infer<typeof ClientAppConfigSchema>;
