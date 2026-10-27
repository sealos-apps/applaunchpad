const path = require("path");
const { i18n } = require("./next-i18next.config");
module.exports = {
  i18n,
  transpilePackages: ["@sealos/driver", "@sealos/ui"],
  experimental: { externalDir: true },
  webpack(config, { isServer, webpack }) {
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: ["@svgr/webpack"],
    });
    // Reuse the real release-v5.1 Form while substituting only the prototype network section.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^\.\/NetworkSection$/,
        (resource) => {
          if (resource.context.endsWith("/pages/app/edit/components")) {
            resource.request = path.resolve(
              __dirname,
              "components/NetworkSection.tsx"
            );
          }
        }
      )
    );
    if (!isServer)
      config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
};
