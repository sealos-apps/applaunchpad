const path = require("path");
module.exports = {
  i18n: { defaultLocale: "zh", locales: ["en", "zh"], localeDetection: false },
  localePath: path.resolve(
    __dirname,
    "../../applaunchpad/public/locales"
  ),
};
