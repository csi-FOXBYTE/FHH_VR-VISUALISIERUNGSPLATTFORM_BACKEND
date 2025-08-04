import {
  createService,
  InferService,
  ServiceContainer,
} from "@csi-foxbyte/fastify-toab";
import { getDbService } from "../db/db.service.js";
import { getBlobStorageService } from "../blobStorage/blobStorage.service.js";
import { BlobSASPermissions } from "@azure/storage-blob";
import { ProjectDTO } from "./project.dto.js";
import sharp from "sharp";

const projectService = createService(
  "project",
  async ({ services }) => {
    const dbService = await getDbService(services);

    const blobStorageService = await getBlobStorageService(services);

    return {
      async saveProject(project: ProjectDTO) {
        const enhancedClient = await dbService.getEnhancedClient();

        // remove all project models
        await enhancedClient.projectModel.deleteMany({
          where: {
            projectLayer: {
              projectId: project.id,
            },
          },
        });

        // remove all clipping polygons
        await enhancedClient.clippingPolygon.deleteMany({
          where: {
            projectLayer: {
              projectId: project.id,
            },
          },
        });

        // remove all project layers

        await enhancedClient.projectLayer.deleteMany({
          where: {
            projectId: project.id,
          },
        });

        // remove all starting points

        await enhancedClient.startingPoint.deleteMany({
          where: {
            projectId: project.id,
          },
        });

        // create project layers

        for (const layer of project.layers) {
          const { id } = await enhancedClient.projectLayer.create({
            data: {
              name: layer.name,
              projectId: project.id,
            },
            select: {
              id: true,
            },
          });

          await enhancedClient.clippingPolygon.createMany({
            data: layer.clippingPolygons.map((c) => ({
              name: c.name,
              points: c.points.flatMap((c) => [c.x, c.y, c.z]).join(","),
              projectLayerId: id,
              affectsTerrain: c.affectsTerrain,
            })),
          });

          await enhancedClient.projectModel.createMany({
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

        await enhancedClient.startingPoint.createMany({
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

        console.log(project.title)

        await enhancedClient.project.update({
          where: {
            id: project.id,
          },
          data: {
            title: project.title,
            img: img,
            description: project.description,
          },
        });
      },
      async getProject(id: string) {
        const enhancedClient = await dbService.getEnhancedClient();

        const permissions = new BlobSASPermissions();
        permissions.read = true;

        const sasQueryParameters = blobStorageService.getContainerSASToken(
          `project-${id}`,
          permissions
        );

        const allAvailableBaseLayers = await enhancedClient.baseLayer.findMany({
          where: {
            href: {
              not: null,
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

        const project = await enhancedClient.project.findFirstOrThrow({
          where: {
            id,
          },
          select: {
            id: true,
            title: true,
            img: true,
            description: true,
            includedBaseLayers: {
              select: {
                id: true,
              },
            },
            projectLayers: {
              select: {
                name: true,
                id: true,
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

        const visualAxes = await dbService.rawClient.visualAxis.findMany({
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
          img: project.img,
          title: project.title,
          layers:
            project.projectLayers.length !== 0
              ? project.projectLayers.map((layer) => ({
                  id: layer.id,
                  name: layer.name,
                  clippingPolygons: layer.clippingPolygons.map(
                    (clippingPolygon) => {
                      const points: { x: number; y: number; z: number }[] = [];

                      const rawPoints = clippingPolygon.points
                        .split(",")
                        .map((p) => parseFloat(p));

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
          allAvailableBaseLayers: allAvailableBaseLayers
            .filter((baseLayer) => baseLayer.href !== null)
            .map((baseLayer) => ({
              ...baseLayer,
              containerName: baseLayer.containerName
                ? blobStorageService.getContainerReadSASUrl(
                    baseLayer.containerName
                  )
                : null,
              href: baseLayer.href!,
            })),
          includedBaseLayers: project.includedBaseLayers.map(
            (baseLayer) => baseLayer.id
          ),
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
      },
    };
  },
  { scope: "REQUEST" }
);

/*
AUTOGENERATED!
*/

export { projectService };
export type ProjectService = InferService<typeof projectService>;
export function getProjectService(deps: ServiceContainer) {
  return deps.get<ProjectService>(projectService.name);
}
