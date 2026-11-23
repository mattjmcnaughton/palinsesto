import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "../../routes/__root";
import { demoDesk, mockApi, withCurrentWeek } from "../mocks/api";

// The whole app as the browser sees it: sign-in gate, then the desk.
const meta = {
  title: "Screens/Desk",
  component: App,
  args: { screen: "log" },
  decorators: [
    (Story) => (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof App>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Log: Story = {};
export const LogBook: Story = { args: { screen: "book" } };
export const Library: Story = { args: { screen: "library" } };
export const AlbumRecord: Story = {
  args: {
    screen: "library",
    albumId: Object.values(demoDesk.albums).find((a) => a.title === "Promises")?.id,
  },
};
export const Settings: Story = { args: { screen: "settings" } };
/** A new Workspace: nothing in the catalog and Dead air on the log. */
export const EmptyDesk: Story = {
  parameters: {
    msw: mockApi({
      desk: {
        ...demoDesk,
        albums: {},
        artists: {},
        candidates: [],
        weeks: [{ ...demoDesk.weeks[demoDesk.weeks.length - 1], entries: [], sent: null }],
        spotify: { state: "not_set_up" },
      },
    }),
  },
};
/** The log changed after it was sent, so Send offers to update the playlist. */
export const ChangedSinceSent: Story = {
  parameters: {
    msw: mockApi({
      desk: withCurrentWeek((w) => ({
        ...w,
        sent: {
          at: "2026-11-17T09:00:00+00:00",
          service: "spotify",
          playlist_ref: "spotify:playlist:4synthetic0000000000pl",
          album_ids: w.entries.slice(0, 3).map((e) => e.album_id),
          tracks: 30,
          left_out: 0,
        },
      })),
    }),
  },
};
export const SignedOut: Story = { parameters: { msw: mockApi({ desk: "signed_out" }) } };
export const Loading: Story = { parameters: { msw: mockApi({ desk: "loading" }) } };
export const Failed: Story = { parameters: { msw: mockApi({ desk: "failed" }) } };
