import type { Preview } from "@storybook/react-vite";
import { mswLoader } from "msw-storybook-addon/csf3";
import "../src/index.css";
import { mockApi } from "../src/stories/mocks/api";

const preview: Preview = {
  loaders: [mswLoader()],
  parameters: {
    // Every story reads the demo desk unless it sets its own `msw` handlers.
    msw: mockApi(),
    layout: "fullscreen",
  },
};
export default preview;
