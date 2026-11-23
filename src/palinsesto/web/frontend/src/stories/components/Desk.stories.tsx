import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Clock } from "../../components/Clock";
import { Cover } from "../../components/Cover";
import { LogBookView } from "../../features/book/LogBookView";
import { AlbumRecord } from "../../features/library/LibraryView";
import { Inputs, MeterBridge, ProgramLog, type Selection } from "../../features/log/LogView";
import { currentWeek } from "../../lib/desk";
import { useStore } from "../../lib/store";
import { withDesk } from "../mocks/DeskDecorator";
import { demoDesk, mockApi, withCurrentWeek, withSpotify } from "../mocks/api";

const meta = { title: "Components/Desk", decorators: [withDesk] } satisfies Meta;
export default meta;
type Story = StoryObj;

function useSelection(initial: string | null = null): Selection {
  const [sel, setSel] = useState<string | null>(initial);
  const [ghost, setGhost] = useState<string | null>(null);
  return { sel, setSel, ghost, setGhost };
}

const firstCandidate = demoDesk.candidates[0]?.album_id ?? null;

function ClockOf({ ghost }: { ghost?: boolean }) {
  const { desk } = useStore();
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div style={{ padding: 40, width: 380 }}>
      <Clock
        desk={desk}
        week={currentWeek(desk)}
        ghost={ghost && firstCandidate ? desk.albums[firstCandidate] : null}
        selected={sel}
        onSelect={setSel}
      />
    </div>
  );
}

const pane = (width: number, child: React.ReactNode) => (
  <div style={{ height: "100vh", width, display: "grid" }}>{child}</div>
);

export const ProgramClock: Story = { render: () => <ClockOf /> };
/** Hovering a candidate previews it as a dashed arc. */
export const ProgramClockWithGhost: Story = { render: () => <ClockOf ghost /> };
/** Over eight hours: the overrun shows as a red outer arc. */
export const ProgramClockOverrun: Story = {
  parameters: {
    msw: mockApi({
      desk: withCurrentWeek((w) => ({
        ...w,
        entries: [...w.entries, ...demoDesk.weeks[2].entries, ...demoDesk.weeks[3].entries],
      })),
    }),
  },
  render: () => <ClockOf />,
};

function InputsStory() {
  return pane(400, <Inputs {...useSelection(firstCandidate)} />);
}
export const InputsLanes: Story = { render: () => <InputsStory /> };
export const InputsWithoutSpotify: Story = {
  parameters: { msw: mockApi({ desk: withSpotify({ state: "not_set_up" }) }) },
  render: () => <InputsStory />,
};

function LogStory() {
  return pane(620, <ProgramLog {...useSelection()} />);
}
export const ProgramLogDraft: Story = { render: () => <LogStory /> };
export const ProgramLogEmpty: Story = {
  parameters: { msw: mockApi({ desk: withCurrentWeek((w) => ({ ...w, entries: [] })) }) },
  render: () => <LogStory />,
};

function BridgeStory() {
  return pane(380, <MeterBridge {...useSelection(firstCandidate)} />);
}
export const MeterBridgeDraft: Story = { render: () => <BridgeStory /> };

export const LogBook: Story = {
  render: () => (
    <div style={{ height: "100vh", display: "grid" }}>
      <LogBookView />
    </div>
  ),
};

function RecordStory({ title }: { title: string }) {
  const { desk } = useStore();
  const album = Object.values(desk.albums).find((a) => a.title === title);
  return album ? (
    <div style={{ height: "100vh", overflow: "auto" }}>
      <AlbumRecord album={album} />
    </div>
  ) : null;
}
/** Patched to Spotify and Bandcamp. */
export const AlbumRecordOutputs: Story = { render: () => <RecordStory title="Promises" /> };
export const AlbumRecordSpotifyOnly: Story = { render: () => <RecordStory title="Untrue" /> };

export const Covers: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 24 }}>
      {Object.values(demoDesk.albums)
        .slice(0, 12)
        .map((a) => (
          <Cover key={a.id} album={a} className="art" />
        ))}
    </div>
  ),
};
