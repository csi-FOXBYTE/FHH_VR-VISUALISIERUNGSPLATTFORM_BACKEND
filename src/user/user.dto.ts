import { Static, Type } from "@sinclair/typebox";

export const ownershipEntityTypeDTO = Type.Union([
  Type.Literal("PROJECT"),
  Type.Literal("BASE_LAYER"),
  Type.Literal("VISUAL_AXIS"),
  Type.Literal("EVENT"),
]);

export const ownershipSuccessorsDTO = Type.Object(
  {
    PROJECT: Type.Optional(Type.String()),
    BASE_LAYER: Type.Optional(Type.String()),
    VISUAL_AXIS: Type.Optional(Type.String()),
    EVENT: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type OwnershipSuccessorsDTO = Static<typeof ownershipSuccessorsDTO>;

export const ownershipImpactDTO = Type.Object({
  projects: Type.Integer({ minimum: 0 }),
  baseLayers: Type.Integer({ minimum: 0 }),
  visualAxes: Type.Integer({ minimum: 0 }),
  events: Type.Integer({ minimum: 0 }),
  total: Type.Integer({ minimum: 0 }),
  canDelete: Type.Boolean(),
});

export const ownershipPreflightDTO = Type.Object({
  projects: Type.Integer({ minimum: 0 }),
  baseLayers: Type.Integer({ minimum: 0 }),
  visualAxes: Type.Integer({ minimum: 0 }),
  events: Type.Integer({ minimum: 0 }),
  total: Type.Integer({ minimum: 0 }),
  invalidReferences: Type.Integer({ minimum: 0 }),
  readyForReleaseB: Type.Boolean(),
});
