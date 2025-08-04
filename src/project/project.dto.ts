import { Static, Type } from "@sinclair/typebox";

export type ProjectDTO = Static<typeof projectDTO>;

export const projectDTO = Type.Object({
  id: Type.String(),
  description: Type.String(),
  sasQueryParameters: Type.String(),
  img: Type.Union([Type.String(), Type.Null()]),
  title: Type.String(),
  visualAxes: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      description: Type.String(),
      startPoint: Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        z: Type.Number(),
      }),
      endPoint: Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        z: Type.Number(),
      }),
    })
  ),
  startingPoints: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      description: Type.String(),
      img: Type.String({
        description:
          "Base64 encoded data url (https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data)",
      }),
      startPoint: Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        z: Type.Number(),
      }),
      endPoint: Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        z: Type.Number(),
      }),
    })
  ),
  layers: Type.Array(
    Type.Object({
      name: Type.String(),
      id: Type.String(),
      clippingPolygons: Type.Array(
        Type.Object({
          name: Type.String(),
          id: Type.String(),
          points: Type.Array(
            Type.Object({
              x: Type.Number(),
              y: Type.Number(),
              z: Type.Number(),
            })
          ),
          affectsTerrain: Type.Boolean(),
        })
      ),
      projectModels: Type.Array(
        Type.Object({
          id: Type.String(),
          name: Type.String(),
          href: Type.String(),
          attributes: Type.Record(Type.String(), Type.String()),
          rotation: Type.Object({
            x: Type.Number(),
            y: Type.Number(),
            z: Type.Number(),
            w: Type.Number(),
          }),
          scale: Type.Object({
            x: Type.Number(),
            y: Type.Number(),
            z: Type.Number(),
          }),
          translation: Type.Object({
            x: Type.Number(),
            y: Type.Number(),
            z: Type.Number(),
          }),
        })
      ),
    })
  ),
  allAvailableBaseLayers: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      description: Type.String(),
      sizeGB: Type.Number(),
      href: Type.String(),
      type: Type.String(),
    })
  ),
  includedBaseLayers: Type.Array(Type.String()),
});
