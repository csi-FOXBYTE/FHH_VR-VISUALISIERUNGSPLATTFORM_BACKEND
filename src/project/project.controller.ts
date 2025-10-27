import { createController, GenericRouteError } from "@csi-foxbyte/fastify-toab";
import { authMiddleware } from "../auth/auth.middleware.js";
import { Type } from "@sinclair/typebox";
import { projectDTO, unityProjectDTO } from "./project.dto.js";
import { getProjectService } from "../@internals/index.js";

const projectController = createController()
  .use(authMiddleware)
  .rootPath("/project");

projectController
  .addRoute("GET", "/:id")
  .params(Type.Object({ id: Type.String() }))
  .output(projectDTO)
  .handler(async ({ params, services }) => {
    const projectService = await getProjectService(services);

    try {
      return await projectService.getProject(params.id);
    } catch (e) {
      console.error(e);
      throw new GenericRouteError("BAD_REQUEST", "Project not found.");
    }
  });

projectController
  .addRoute("DELETE", "/:id")
  .params(Type.Object({ id: Type.String() }))
  .handler(async ({ services, params }) => {
    const projectService = await getProjectService(services);

    await projectService.deleteProject(params.id);
  });

projectController
  .addRoute("GET", "/list")
  .output(
    Type.Array(
      Type.Object({
        id: Type.String(),
        name: Type.String(),
        description: Type.String(),
      })
    )
  )
  .handler(async ({ services }) => {
    const projectService = await getProjectService(services);

    return await projectService.listProjects();
  });

projectController
  .addRoute("GET", "/listShared")
  .output(
    Type.Array(
      Type.Object({
        id: Type.String(),
        name: Type.String(),
        description: Type.String(),
      })
    )
  )
  .handler(async ({ services }) => {
    const projectService = await getProjectService(services);

    return await projectService.listSharedProjects();
  });

projectController
  .addRoute("POST", "/:id")
  .body(projectDTO)
  .params(Type.Object({ id: Type.String() }))
  .handler(async ({ body, services }) => {
    const projectService = await getProjectService(services);

    return await projectService.saveProject(body);
  });

projectController
  .addRoute("GET", "/:id/unity")
  .params(Type.Object({ id: Type.String() }))
  .output(unityProjectDTO)
  .handler(async ({ services, params }) => {
    const projectService = await getProjectService(services);

    return await projectService.getUnityProject(params.id);
  });

export default projectController;
