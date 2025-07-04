import { Type, Static } from "@sinclair/typebox";

export const uploadProjectObjectRequestDTO = Type.Object({
  file: Type.Any(),
  epsgCode: Type.String(),
  fileName: Type.String(),
});
export type UploadProjectObjectRequestDTO = Static<
  typeof uploadProjectObjectRequestDTO
>;

export const uploadProjectObjectResponseDTO = Type.Object({
  blobName: Type.String(),
});
export type UploadProjectObjectResponseDTO = Static<
  typeof uploadProjectObjectResponseDTO
>;
