import { Static, Type } from "@sinclair/typebox";

export type ProjectDTO = Static<typeof projectDTO>;

export const projectDTO = Type.Object({
  id: Type.String(),
  description: Type.String(),
  sasQueryParameters: Type.String(),
  img: Type.Union([Type.String(), Type.Null()]),
  title: Type.String(),
  isReadOnly: Type.Boolean(),
  camera: Type.Union([Type.String(), Type.Null()]),
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
      uiStartPoint: Type.Object({
        x: Type.String(),
        y: Type.String(),
        z: Type.String(),
      }),
      uiStartPointEpsg: Type.String(),
      endPoint: Type.Object({
        x: Type.Number({}),
        y: Type.Number(),
        z: Type.Number(),
      }),
      uiEndPoint: Type.Object({
        x: Type.String(),
        y: Type.String(),
        z: Type.String(),
      }),
      uiEndPointEpsg: Type.String(),
    })
  ),
  layers: Type.Array(
    Type.Object({
      name: Type.String(),
      id: Type.String(),
      includedBaseLayers: Type.Array(Type.String()),
      includedExtensionLayers: Type.Array(Type.String()),
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
          uiRotation: Type.Object({
            x: Type.String(),
            y: Type.String(),
            z: Type.String(),
          }),
          scale: Type.Object({
            x: Type.Number(),
            y: Type.Number(),
            z: Type.Number(),
          }),
          uiScale: Type.Object({
            x: Type.String(),
            y: Type.String(),
            z: Type.String(),
          }),
          translation: Type.Object({
            x: Type.Number(),
            y: Type.Number(),
            z: Type.Number(),
          }),
          uiTranslation: Type.Object({
            x: Type.String(),
            y: Type.String(),
            z: Type.String(),
          }),
          uiEpsg: Type.String(),
        })
      ),
    })
  ),
  extensionLayers: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      href: Type.String(),
      type: Type.String(),
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
});

export const unityProjectDTO = Type.Object({
  name: Type.String(),
  id: Type.String(),
  projectSasQueryParameters: Type.String(),
  description: Type.String(),
  maximumFlyingHeight: Type.Number(),
  renderDistance: Type.Number(),
  startingPoints: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      img: Type.String(),
      description: Type.String(),
      origin: Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        z: Type.Number(),
      }),
      target: Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        z: Type.Number(),
      }),
    })
  ),
  variants: Type.Array(
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      baseLayers: Type.Array(
        Type.Object({
          url: Type.String(),
          id: Type.String(),
          name: Type.String(),
          type: Type.Union([
            Type.Literal("TILES3D"),
            Type.Literal("TERRAIN"),
            Type.Literal("IMAGERY"),
          ]),
        })
      ),
      clippingPolygons: Type.Array(
        Type.Object({
          id: Type.String(),
          affectsTerrain: Type.Boolean(),
          points: Type.Array(
            Type.Object({
              x: Type.Number(),
              y: Type.Number(),
              z: Type.Number(),
            })
          ),
        })
      ),
      models: Type.Array(
        Type.Object({
          id: Type.String(),
          attributes: Type.Record(Type.String(), Type.String()),
          url: Type.String(),
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
          rotation: Type.Object({
            x: Type.Number(),
            y: Type.Number(),
            z: Type.Number(),
            w: Type.Number(),
          }),
        })
      ),
    })
  ),
});
export type UnityProjectDTO = Static<typeof unityProjectDTO>;
