import { createService, GenericRouteError } from "@csi-foxbyte/fastify-toab";
import { BlobSASPermissions } from "@azure/storage-blob";
import { ProjectDTO, UnityProjectDTO } from "./project.dto.js";
import sharp from "sharp";
import {
  getAuthService,
  getBlobStorageService,
  getConfigurationService,
  getDbService,
} from "../@internals/index.js";

const projectService = createService(
  "project",
  async ({ services }) => {
    const dbService = await getDbService(services);

    const blobStorageService = await getBlobStorageService(services);
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

      function createBaseLayerHref(baseLayer: {
        type: string;
        containerName: string;
      }) {
        const url = blobStorageService.getContainerReadSASUrl(
          baseLayer.containerName
        );

        if (baseLayer.type === "TILES3D") {
          const newUrl = new URL(url);

          return `${newUrl.protocol}//${newUrl.host}${newUrl.pathname}/tileset.json${newUrl.search}`;
        } else {
          return url;
        }
      }

      const allAvailableBaseLayers = await dbService.baseLayer.findMany({
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
                  scaleX: true,
                  scaleY: true,
                  scaleZ: true,
                  translationX: true,
                  translationY: true,
                  translationZ: true,
                },
              },
            },
          },
          startingPoints: {
            select: {
              endPointX: true,
              endPointY: true,
              endPointZ: true,
              name: true,
              id: true,
              img: true,
              description: true,
              startPointX: true,
              startPointY: true,
              startPointZ: true,
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
          startPointX: true,
          startPointY: true,
          startPointZ: true,
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
                  scale: {
                    x: projectModel.scaleX,
                    y: projectModel.scaleY,
                    z: projectModel.scaleZ,
                  },
                  translation: {
                    x: projectModel.translationX,
                    y: projectModel.translationY,
                    z: projectModel.translationZ,
                  },
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
              ? createBaseLayerHref({
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
          img: startingPoint.img,
          endPoint: {
            x: startingPoint.endPointX,
            y: startingPoint.endPointY,
            z: startingPoint.endPointZ,
          },
          id: startingPoint.id,
          name: startingPoint.name,
          description: startingPoint.description,
        })),
      };
    }

    return {
      async getUnityProject(id: string): Promise<UnityProjectDTO> {
        const project = await getProject(id);

        const config = await configurationService.getConfiguration();

        return {
          description: project.description,
          id: project.id,
          myRole: "MODERATOR",
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
        await dbService.project.delete({ where: { id }});

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
            })),
          });
        }

        await dbService.startingPoint.createMany({
          data: project.startingPoints.map((s) => ({
            name: s.name,
            endPointX: s.endPoint.x,
            endPointY: s.endPoint.y,
            endPointZ: s.endPoint.z,
            img: s.img,
            startPointX: s.startPoint.x,
            startPointY: s.startPoint.y,
            startPointZ: s.startPoint.z,
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
