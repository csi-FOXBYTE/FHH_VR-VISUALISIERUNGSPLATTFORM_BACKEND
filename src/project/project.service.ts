import { createService, GenericRouteError } from "@csi-foxbyte/fastify-toab";
import { BlobSASPermissions } from "@azure/storage-blob";
import { ProjectDTO, UnityProjectDTO } from "./project.dto.js";
import sharp from "sharp";
import {
  getAuthService,
  getBaseLayerService,
  getBlobStorageService,
  getConfigurationService,
  getDbService,
} from "../@internals/index.js";

const projectService = createService(
  "project",
  async ({ services }) => {
    const dbService = await getDbService(services);

    const blobStorageService = await getBlobStorageService(services);
    const baseLayerService = await getBaseLayerService(services);
    const configurationService = await getConfigurationService(services);

    const authService = await getAuthService(services);

    async function getProject(id: string): Promise<ProjectDTO> {
      const permissions = new BlobSASPermissions();
      permissions.read = true;

      const session = await authService.getSession();

      const sasQueryParameters = blobStorageService.getContainerSASToken(
        `project-${id}`,
        permissions
      );

      const allAvailableBaseLayers = await dbService.baseLayer.findMany({
        where: {
          status: {
            not: {
              in: ["PENDING", "FAILED"],
            },
          },
        },
        select: {
          id: true,
          name: true,
          description: true,
          sizeGB: true,
          href: true,
          containerName: true,
          type: true,
        },
      });

      const project = await dbService.project.findFirstOrThrow({
        where: {
          id,
        },
        select: {
          id: true,
          camera: true,
          ownerId: true,
          title: true,
          img: true,
          description: true,
          extensionLayers: {
            select: {
              href: true,
              id: true,
              name: true,
              type: true,
            },
          },
          projectLayers: {
            select: {
              name: true,
              id: true,
              baseLayers: {
                select: {
                  id: true,
                },
              },
              extensionLayers: {
                select: {
                  id: true,
                },
              },
              clippingPolygons: {
                select: {
                  points: true,
                  id: true,
                  name: true,
                  affectsTerrain: true,
                },
              },
              projectModels: {
                select: {
                  attributes: true,
                  href: true,
                  name: true,
                  id: true,
                  rotationX: true,
                  rotationW: true,
                  rotationY: true,
                  rotationZ: true,
                  uiRotationEulerX: true,
                  uiRotationEulerY: true,
                  uiRotationEulerZ: true,
                  scaleX: true,
                  scaleY: true,
                  scaleZ: true,
                  uiScaleX: true,
                  uiScaleY: true,
                  uiScaleZ: true,
                  translationX: true,
                  translationY: true,
                  translationZ: true,
                  uiTranslationX: true,
                  uiTranslationY: true,
                  uiTranslationZ: true,
                  uiEpsg: true,
                },
              },
            },
          },
          startingPoints: {
            select: {
              endPointX: true,
              endPointY: true,
              endPointZ: true,
              uiEndPointX: true,
              uiEndPointY: true,
              uiEndPointZ: true,
              uiEndPointEpsg: true,
              name: true,
              id: true,
              img: true,

              description: true,
              startPointX: true,
              startPointY: true,
              startPointZ: true,
              uiStartPointX: true,
              uiStartPointY: true,
              uiStartPointZ: true,
              uiStartPointEpsg: true,
            },
          },
        },
      });

      const visualAxes = await dbService.visualAxis.findMany({
        select: {
          id: true,
          description: true,
          endPointX: true,
          endPointY: true,
          endPointZ: true,
          uiEndPointX: true,
          uiEndPointY: true,
          uiEndPointZ: true,
          uiEndPointEpsg: true,
          startPointX: true,
          startPointY: true,
          startPointZ: true,
          uiStartPointX: true,
          uiStartPointY: true,
          uiStartPointZ: true,
          uiStartPointEpsg: true,
          name: true,
        },
      });

      return {
        id: project.id,
        sasQueryParameters: sasQueryParameters.toString(),
        description: project.description,
        camera: project.camera ? JSON.stringify(project.camera) : null,
        img: project.img,
        title: project.title,
        isReadOnly: project.ownerId !== session?.user.id,
        layers:
          project.projectLayers.length !== 0
            ? project.projectLayers.map((layer) => ({
              id: layer.id,
              name: layer.name,
              includedBaseLayers: layer.baseLayers.map((l) => l.id),
              includedExtensionLayers: layer.extensionLayers.map((l) => l.id),
              clippingPolygons: layer.clippingPolygons.map(
                (clippingPolygon) => {
                  const points: { x: number; y: number; z: number }[] = [];

                  const rawPoints = clippingPolygon.points;

                  for (let i = 0; i < rawPoints.length; i += 3) {
                    points.push({
                      x: rawPoints[i],
                      y: rawPoints[i + 1],
                      z: rawPoints[i + 2],
                    });
                  }

                  return {
                    name: clippingPolygon.name,
                    id: clippingPolygon.id,
                    affectsTerrain: clippingPolygon.affectsTerrain,
                    points: points,
                  };
                }
              ),
              projectModels: layer.projectModels.map((projectModel) => ({
                id: projectModel.id,
                name: projectModel.name,
                href: projectModel.href,
                attributes: JSON.parse(projectModel.attributes),
                rotation: {
                  x: projectModel.rotationX,
                  y: projectModel.rotationY,
                  z: projectModel.rotationZ,
                  w: projectModel.rotationW,
                },
                uiRotation: {
                  x: projectModel.uiRotationEulerX,
                  y: projectModel.uiRotationEulerY,
                  z: projectModel.uiRotationEulerZ,
                },
                scale: {
                  x: projectModel.scaleX,
                  y: projectModel.scaleY,
                  z: projectModel.scaleZ,
                },
                uiScale: {
                  x: projectModel.uiScaleX,
                  y: projectModel.uiScaleY,
                  z: projectModel.uiScaleZ,
                },
                translation: {
                  x: projectModel.translationX,
                  y: projectModel.translationY,
                  z: projectModel.translationZ,
                },
                uiTranslation: {
                  x: projectModel.uiTranslationX,
                  y: projectModel.uiTranslationY,
                  z: projectModel.uiTranslationZ,
                },
                uiEpsg: projectModel.uiEpsg,
              })),
            }))
            : [
              {
                clippingPolygons: [],
                includedBaseLayers: [],
                includedExtensionLayers: [],
                id: "defaultLayer",
                name: "Default layer",
                projectModels: [],
              },
            ],
        visualAxes: visualAxes.map((visualAxis) => ({
          id: visualAxis.id,
          name: visualAxis.name,
          description: visualAxis.description,
          startPoint: {
            x: visualAxis.startPointX,
            y: visualAxis.startPointY,
            z: visualAxis.startPointZ,
          },
          endPoint: {
            x: visualAxis.endPointX,
            y: visualAxis.endPointY,
            z: visualAxis.endPointZ,
          },
        })),
        allAvailableBaseLayers: allAvailableBaseLayers.map((baseLayer) => ({
          ...baseLayer,
          href:
            baseLayer.containerName !== null
              ? baseLayerService.createBaseLayerHref({
                containerName: baseLayer.containerName!,
                type: baseLayer.type,
              })
              : baseLayer.href!,
        })),
        extensionLayers: project.extensionLayers.map((e) => ({
          id: e.id,
          href: e.href,
          type: e.type,
          name: e.name,
        })),
        startingPoints: project.startingPoints.map((startingPoint) => ({
          startPoint: {
            x: startingPoint.startPointX,
            y: startingPoint.startPointY,
            z: startingPoint.startPointZ,
          },
          uiStartPoint: {
            x: startingPoint.uiStartPointX,
            y: startingPoint.uiStartPointY,
            z: startingPoint.uiStartPointZ,
          },
          uiStartPointEpsg: startingPoint.uiStartPointEpsg,
          img: startingPoint.img,
          endPoint: {
            x: startingPoint.endPointX,
            y: startingPoint.endPointY,
            z: startingPoint.endPointZ,
          },
          uiEndPoint: {
            x: startingPoint.uiEndPointX,
            y: startingPoint.uiEndPointY,
            z: startingPoint.uiEndPointZ,
          },
          uiEndPointEpsg: startingPoint.uiEndPointEpsg,
          id: startingPoint.id,
          name: startingPoint.name,
          description: startingPoint.description,
        })),
      };
    }

    return {
      async listSharedProjects(): Promise<
        { name: string; id: string; description: string }[]
      > {
        const session = await authService.getSession();

        const projects = await dbService.project.findMany({
          where: {
            OR: [
              {
                visibleForGroups: {
                  some: {
                    assignedUsers: {
                      some: {
                        id: session?.user.id,
                      },
                    },
                  },
                },
              },
              {
                visibleForUsers: {
                  some: {
                    id: session?.user.id,
                  },
                },
              },
            ],
          },
          select: {
            title: true,
            description: true,
            id: true,
          },
        });

        return projects.map((project) => ({
          name: project.title,
          description: project.description,
          id: project.id,
        }));
      },
      async listProjects(): Promise<
        { name: string; id: string; description: string }[]
      > {
        const session = await authService.getSession();

        const projects = await dbService.project.findMany({
          where: {
            owner: {
              id: session?.user.id,
            },
          },
          select: {
            title: true,
            description: true,
            id: true,
          },
        });

        return projects.map((project) => ({
          name: project.title,
          description: project.description,
          id: project.id,
        }));
      },
      async getUnityProject(id: string): Promise<UnityProjectDTO> {
        const project = await getProject(id);

        const permissions = new BlobSASPermissions();
        permissions.read = true;

        const sasQueryParameters = blobStorageService.getContainerSASToken(
          `project-${id}`,
          permissions
        );

        const config = await configurationService.getConfiguration();

        return {
          description: project.description,
          id: project.id,
          projectSasQueryParameters: sasQueryParameters.toString(),
          maximumFlyingHeight: config.maximumFlyingHeight,
          name: project.title,
          startingPoints: project.startingPoints.map((s) => ({
            description: s.description,
            id: s.id,
            img: s.img,
            name: s.name,
            origin: s.startPoint,
            target: s.endPoint,
          })),
          variants: project.layers.map((layer) => ({
            baseLayers: layer.includedBaseLayers.map<
              UnityProjectDTO["variants"][number]["baseLayers"][number]
            >((includedBaseLayer) => {
              const baseLayer = project.allAvailableBaseLayers.find(
                (baseLayer) => baseLayer.id === includedBaseLayer
              );

              if (!baseLayer) throw new Error("No matching base layer found!");

              return {
                id: baseLayer.id,
                name: baseLayer.name,
                type: baseLayer.type as "TILES3D",
                url: baseLayer.href,
              };
            }),
            clippingPolygons: layer.clippingPolygons.map<
              UnityProjectDTO["variants"][number]["clippingPolygons"][number]
            >((c) => ({
              id: c.id,
              points: c.points,
              affectsTerrain: c.affectsTerrain,
            })),
            id: layer.id,
            models: layer.projectModels.map<
              UnityProjectDTO["variants"][number]["models"][number]
            >((m) => ({
              attributes: m.attributes,
              id: m.id,
              rotation: m.rotation,
              scale: m.scale,
              translation: m.translation,
              url: m.href,
            })),
            name: layer.name,
          })),
        };
      },
      getProject,
      async deleteProject(id: string): Promise<void> {
        // owner check
        const { ownerId } = await dbService.project.findFirstOrThrow({
          where: { id },
          select: { ownerId: true },
        });

        const session = await authService.getSession();

        if (!session || ownerId !== session.user.id)
          throw new GenericRouteError(
            "UNAUTHORIZED",
            "Not authenticated or not owner of project!"
          );

        // delete project models
        await dbService.project.delete({ where: { id } });

        await blobStorageService.deleteContainer(`project-${id}`);
      },
      async saveProject(project: ProjectDTO): Promise<void> {
        // remove all project layers
        await dbService.projectLayer.deleteMany({
          where: {
            projectId: project.id,
          },
        });

        // create project layers
        for (const layer of project.layers) {
          const { id } = await dbService.projectLayer.create({
            data: {
              name: layer.name,
              projectId: project.id,
              baseLayers: {
                connect: layer.includedBaseLayers.map((id) => ({ id })),
              },
              extensionLayers: {
                connect: layer.includedExtensionLayers.map((id) => ({ id })),
              },
            },
            select: {
              id: true,
            },
          });

          await dbService.clippingPolygon.createMany({
            data: layer.clippingPolygons.map((c) => ({
              name: c.name,
              points: c.points.flatMap((c) => [c.x, c.y, c.z]),
              projectLayerId: id,
              affectsTerrain: c.affectsTerrain,
            })),
          });

          await dbService.projectModel.createMany({
            data: layer.projectModels.map((c) => ({
              name: c.name,
              attributes: JSON.stringify(c.attributes),
              projectLayerId: id,
              href: c.href,
              rotationW: c.rotation.w,
              rotationX: c.rotation.x,
              rotationY: c.rotation.y,
              rotationZ: c.rotation.z,
              scaleX: c.scale.x,
              scaleY: c.scale.y,
              scaleZ: c.scale.z,
              translationX: c.translation.x,
              translationY: c.translation.y,
              translationZ: c.translation.z,
              uiEpsg: c.uiEpsg,
              uiRotationEulerX: c.uiRotation.x,
              uiRotationEulerY: c.uiRotation.y,
              uiRotationEulerZ: c.uiRotation.z,
              uiScaleX: c.uiScale.x,
              uiScaleY: c.uiScale.y,
              uiScaleZ: c.uiScale.z,
              uiTranslationX: c.uiTranslation.x,
              uiTranslationY: c.uiTranslation.y,
              uiTranslationZ: c.uiTranslation.z,
            })),
          });
        }

        await dbService.startingPoint.deleteMany({
          where: {
            projectId: project.id,
          },
        });

        await dbService.startingPoint.createMany({
          data: project.startingPoints.map((s) => ({
            name: s.name,
            endPointX: s.endPoint.x,
            endPointY: s.endPoint.y,
            endPointZ: s.endPoint.z,
            uiEndPointX: s.uiEndPoint.x,
            uiEndPointY: s.uiEndPoint.y,
            uiEndPointZ: s.uiEndPoint.z,
            uiEndPointEpsg: s.uiEndPointEpsg,
            img: s.img,
            startPointX: s.startPoint.x,
            startPointY: s.startPoint.y,
            startPointZ: s.startPoint.z,
            uiStartPointX: s.uiStartPoint.x,
            uiStartPointY: s.uiStartPoint.y,
            uiStartPointZ: s.uiStartPoint.z,
            uiStartPointEpsg: s.uiStartPointEpsg,
            projectId: project.id,
            description: s.description,
          })),
        });

        let img: string | null = null;

        if (project.img) {
          const [, base64] = project.img.split(",");
          const imgRaw = sharp(Buffer.from(base64, "base64"));

          let { width } = await imgRaw.metadata();

          width = Math.min(width, 800);

          const height = Math.round((width / 16) * 9);

          const buffer = await imgRaw
            .resize({
              width,
              height,
              fit: "cover",
              position: "centre",
            })
            .toFormat("jpeg")
            .toBuffer();

          img = `data:image/jpeg;base64,${buffer.toString("base64")}`;
        }

        await dbService.project.update({
          where: {
            id: project.id,
          },
          data: {
            title: project.title,
            img: img,
            camera: project.camera ? JSON.parse(project.camera) : null,
            description: project.description,
          },
        });
      },
    };
  },
  { scope: "REQUEST" }
);

export default projectService;
