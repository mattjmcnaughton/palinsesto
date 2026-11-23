import type { StorybookConfig } from "@storybook/react-vite";

// Storybook builds with the app's own vite.config.ts.
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["msw-storybook-addon"],
  // Serves MSW's mockServiceWorker.js, which mocks every /api request in the browser.
  staticDirs: ["./public"],
  core: { disableTelemetry: true },
};
export default config;
