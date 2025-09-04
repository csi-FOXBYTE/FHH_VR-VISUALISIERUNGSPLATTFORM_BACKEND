import { Type, Static } from "@sinclair/typebox";

export const eventsResponseDTO = Type.Array(
  Type.Object({
    name: Type.String(),
    state: Type.String(),
    joinCode: Type.Optional(Type.String()),
    id: Type.String(),
  })
);

export const eventsHostRequestDTO = Type.Object({
  joinCode: Type.String(),
});
export type EventsHostRequestDTO = Static<typeof eventsHostRequestDTO>;

export const eventsStatusResponseDTO = Type.Object({
  state: Type.String(),
  joinCode: Type.Optional(Type.String()),
});

export const eventsCreateRequestDTO = Type.Object({
  endTime: Type.String(),
  startTime: Type.String(),
  title: Type.String(),
  attendees: Type.Array(Type.String()),
  moderators: Type.Array(Type.String()),
  project: Type.Optional(Type.String()),
});
export type EventsCreateRequestDTO = Static<typeof eventsCreateRequestDTO>;

export const eventsUpdateRequestDTO = Type.Object({
  id: Type.String(),
  endTime: Type.Optional(Type.String()),
  startTime: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  attendees: Type.Optional(Type.Array(Type.String())),
  moderators: Type.Array(Type.String()),
  project: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type EventsUpdateRequestDTO = Static<typeof eventsUpdateRequestDTO>;
