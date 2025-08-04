import { Type, Static } from "@sinclair/typebox";

export const convertTerrainRequestDTO = Type.Object({
  srcSRS: Type.String(),
  name: Type.String(),
  blobRef: Type.String(),
});
export type ConvertTerrainRequestDTO = Static<typeof convertTerrainRequestDTO>;

export const convertTerrainResponseDTO = Type.Object({
  jobId: Type.String(),
});
export type ConvertTerrainResponseDTO = Static<typeof convertTerrainResponseDTO>;

export const convert3DTileRequestDTO = Type.Object({
  srcSRS: Type.String(),
  name: Type.String(),
  blobRef: Type.String(),
});
export type Convert3DTileRequestDTO = Static<typeof convertTerrainRequestDTO>;

export const convert3DTileResponseDTO = Type.Object({
  jobId: Type.String(),
});
export type Convert3DTileResponseDTO = Static<typeof convertTerrainRequestDTO>;

export const convertProjectModelRequestDTO = Type.Object({
  epsgCode: Type.String(),
  fileName: Type.String(),
  blobRef: Type.String(),
});
export type ConvertProjectModelRequestDTO = Static<
  typeof convertProjectModelRequestDTO
>;

export const convertProjectModelResponseDTO = Type.Object({
  jobId: Type.String(),
  secret: Type.String(),
});
export type ConvertProjectModelResponseDTO = Static<
  typeof convertProjectModelResponseDTO
>;

export const getProjectModelStatusRequestDTO = Type.Object({
  jobId: Type.String(),
  secret: Type.String(),
});
export type GetProjectModelStatusRequestDTO = Static<
  typeof getProjectModelStatusRequestDTO
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
  modelMatrix: Type.Optional(Type.Array(Type.Number())),
});
export type GetProjectModelStatusResponseDTO = Static<
  typeof getProjectModelStatusResponseDTO
>;

export const downloadProjectModelRequestDTIO = Type.Object({
  jobId: Type.String(),
  projectId: Type.String(),
  secret: Type.String(),
});
export type DownloadProjectModelRequestDTIO = Static<
  typeof downloadProjectModelRequestDTIO
>;
