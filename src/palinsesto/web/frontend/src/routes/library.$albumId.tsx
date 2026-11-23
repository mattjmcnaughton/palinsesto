import { createFileRoute } from "@tanstack/react-router";

// An album's record, such as #/library/<album id>.
export const Route = createFileRoute("/library/$albumId")({});
