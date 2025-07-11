import { Type, Static } from "@sinclair/typebox";

export const uploadTerrainRequestDTO = Type.Object({
  srcSRS: Type.String(),
  name: Type.String(),
  file: Type.String({ format: "binary" }),
});
export type UploadTerrainRequestDTO = Static<typeof uploadTerrainRequestDTO>;

export const upload3DTileRequestDTO = Type.Object({
  srcSRS: Type.String(),
  name: Type.String(),
  file: Type.String({ format: "binary" }),
});
export type Upload3DTileRequestDTO = Static<typeof uploadTerrainRequestDTO>;

export const uploadProjectModelRequestDTO = Type.Object({
  epsgCode: Type.String(),
  fileName: Type.String(),
  file: Type.String({ format: "binary" }),
});
export type UploadProjectModelRequestDTO = Static<
  typeof uploadProjectModelRequestDTO
>;

export const uploadProjectModelResponseDTO = Type.Object({
  blobName: Type.String(),
});
export type UploadProjectModelResponseDTO = Static<
  typeof uploadProjectModelResponseDTO
>;

export const getProjectModelStatusResponseDTO = Type.Object({
  state: Type.Union([
    Type.Literal("active"),
    Type.Literal("delayed"),
    Type.Literal("prioritized"),
    Type.Literal("waiting"),
    Type.Literal("completed"),
    Type.Literal("waiting-children"),
    Type.Literal("unknown"),
  ]),
  progress: Type.Number(),
  buffer64: Type.Optional(Type.String()),
  modelMatrix: Type.Optional(Type.Array(Type.Number())),
});

export type GetProjectModelStatusResponseDTO = Static<
  typeof getProjectModelStatusResponseDTO
>;
