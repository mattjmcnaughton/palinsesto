import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpotifySetup } from "../../features/settings/SpotifySetup";
import { withDesk } from "../mocks/DeskDecorator";
import { failure, mockApi, setup, spotifyError, withSpotify } from "../mocks/api";

// The setup guide in Settings, in each state it can be in.
const meta = {
  title: "Screens/Spotify setup",
  component: SpotifySetup,
  decorators: [
    withDesk,
    (Story) => (
      <div className="settings" style={{ height: "100vh", overflow: "auto" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpotifySetup>;
export default meta;
type Story = StoryObj<typeof meta>;

const CLIENT_ID = "0123456789abcdef0123456789abcdef";

export const NotSetUp: Story = {
  parameters: { msw: mockApi({ desk: withSpotify({ state: "not_set_up" }) }) },
};
/** Credentials checked with Spotify and saved; Connect is the last step. */
export const CredentialsEntered: Story = {
  parameters: {
    msw: mockApi({
      desk: withSpotify({ state: "credentials", client_id: CLIENT_ID, error: null }),
    }),
  },
};
export const Connected: Story = {};
/** Saving a wrong client ID or secret: Spotify answers invalid_client. */
export const InvalidClient: Story = {
  parameters: { msw: mockApi({ desk: spotifyError("invalid_client") }) },
};
/** Opened at localhost, which Spotify refuses as a redirect URI. */
export const LocalhostRedirect: Story = {
  parameters: {
    msw: mockApi({
      desk: withSpotify({ state: "not_set_up" }),
      setup: {
        redirect_uri: "http://localhost:8000/api/spotify/callback",
        redirect_problem: "localhost",
      },
    }),
  },
};
/** Spotify's own page when the redirect URI is not registered. Shown in the guide's list. */
export const RedirectMismatch: Story = {
  parameters: {
    msw: mockApi({
      desk: withSpotify({ state: "credentials", client_id: CLIENT_ID, error: null }),
      setup,
    }),
  },
  render: () => (
    <>
      <div className="alert" role="alert">
        <h4>Spotify showed: INVALID_CLIENT: Invalid redirect URI</h4>
        <p>
          Spotify stops on its own page and never sends you back, so Palinsesto stays at this step.
          The guide's troubleshooting list below explains the fix.
        </p>
      </div>
      <SpotifySetup />
    </>
  ),
};
export const CancelledConsent: Story = {
  parameters: { msw: mockApi({ desk: spotifyError("access_denied") }) },
};
export const NotAllowlisted: Story = {
  parameters: { msw: mockApi({ desk: spotifyError("not_allowlisted") }) },
};
export const PremiumLapsed: Story = {
  parameters: { msw: mockApi({ desk: spotifyError("premium_required") }) },
};
export const TokenRevoked: Story = {
  parameters: { msw: mockApi({ desk: spotifyError("token_revoked") }) },
};
/** Saving credentials Spotify rejects shows the invalid_client fix inline. */
export const SaveRejected: Story = {
  parameters: {
    msw: mockApi({
      desk: withSpotify({ state: "not_set_up" }),
      writes: {
        "/spotify/credentials": failure(
          409,
          "spotify_invalid_client",
          "Spotify rejected the client ID or secret.",
        ),
      },
    }),
  },
};
