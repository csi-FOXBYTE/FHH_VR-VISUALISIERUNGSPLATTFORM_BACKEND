import { createController } from "@csi-foxbyte/fastify-toab";
import { Type } from "@sinclair/typebox";
import { on } from "events";
import { authMiddleware } from "../auth/auth.middleware.js";
import {
  eventsCreateRequestDTO,
  eventsHostRequestDTO,
  eventsUpdateRequestDTO,
} from "./events.dto.js";
import { getDbService, getEventsService } from "../@internals/index.js";
import { $Enums } from "@prisma/client";

const eventsController = createController()
  .use(authMiddleware)
  .rootPath("/events");

eventsController
  .addRoute("GET", "/")
  .output(
    Type.Array(
      Type.Object({
        id: Type.String({ description: "Event id." }),
        status: Type.String({ description: `Can be one of ${Object.keys($Enums.EVENT_STATUS).join(", ")}.` }),
        endTime: Type.String(),
        startTime: Type.String(),
        title: Type.String(),
        owner: Type.Object({
          name: Type.String(),
          email: Type.String(),
          id: Type.String(),
        }),
      })
    )
  )
  .handler(async ({ services }) => {
    const eventsService = await getEventsService(services);

    const events = await eventsService.list();

    return events.map((event) => ({
      ...event,
      endTime: event.endTime.toISOString(),
      startTime: event.startTime.toISOString(),
      owner: {
        name: event.owner?.name ?? "-",
        email: event.owner?.email ?? "-",
        id: event.owner?.id ?? "-",
      },
    }));
  });

eventsController
  .addRoute("PUT", "/")
  .body(eventsCreateRequestDTO)
  .handler(async ({ services, body }) => {
    const eventsService = await getEventsService(services);

    await eventsService.createEvent(body);
  });

eventsController
  .addRoute("PATCH", "/:id")
  .body(eventsUpdateRequestDTO)
  .handler(async ({ services, body }) => {
    const eventsService = await getEventsService(services);

    await eventsService.updateEvent(body);
  });

eventsController
  .addRoute("DELETE", "/:id")
  .params(Type.Object({ id: Type.String() }))
  .handler(async ({ services, params }) => {
    const eventsService = await getEventsService(services);

    await eventsService.cancelEvent(params);
  });

eventsController
  .addRoute("SSE", "/:id/status")
  .params(Type.Object({ id: Type.String() }))
  .output(
    Type.Object({
      id: Type.String(),
      joinCode: Type.Union([Type.Null(), Type.String()]),
      status: Type.Enum($Enums.EVENT_STATUS),
      endTime: Type.String(),
      startTime: Type.String(),
      title: Type.String(),
      role: Type.String({ description: `Can be one of ${Object.keys($Enums.EVENT_ATTENDEE_ROLES)}.` }),
      projectId: Type.Union([Type.Null(), Type.String()]),
      owner: Type.Object({
        name: Type.String(),
        email: Type.String(),
        id: Type.String(),
      }),
    })
  )
  .handler(async function* ({ services, signal, params, ctx }) {
    const eventsService = await getEventsService(services);

    const events = eventsService.status(params.id);

    const dbService = await getDbService(services);

    async function getEvent(id: string) {
      const event = await dbService.event.findFirstOrThrow({
        where: {
          id,
        },
        select: {
          id: true,
          joinCode: true,
          startTime: true,
          endTime: true,
          title: true,
          status: true,
          attendees: {
            where: {
              userId: ctx.session.user.id
            },
            select: {
              role: true,
            }
          },
          projectId: true,
          owner: {
            select: {
              name: true,
              id: true,
              email: true,
            },
          },
        },
      });

      return {
        id: event.id,
        status: event.status,
        title: event.title,
        endTime: event.endTime.toISOString(),
        startTime: event.startTime.toISOString(),
        projectId: event.projectId,
        joinCode: event.joinCode,
        role: event.attendees[0]?.role ?? "MODERATOR",
        owner: {
          name: event.owner?.name ?? "-",
          email: event.owner?.email ?? "-",
          id: event.owner?.id ?? "-",
        },
      };
    }

    yield await getEvent(params.id);

    for await (const _ of on(events, "change", { signal })) {
      yield await getEvent(params.id);
    }
  });

eventsController
  .addRoute("POST", "/:id/heartbeat")
  .params(Type.Object({ id: Type.String() }))
  .handler(async ({ services, params }) => {
    const eventsService = await getEventsService(services);

    await eventsService.setHeartbeat(params.id);
  });

eventsController
  .addRoute("POST", "/:id/host")
  .body(eventsHostRequestDTO)
  .params(Type.Object({ id: Type.String() }))
  .handler(async ({ services, params, body }) => {
    const eventsService = await getEventsService(services);

    await eventsService.hostSession(params.id, body.joinCode);
  });

eventsController
  .addRoute("POST", "/:id/end")
  .params(Type.Object({ id: Type.String() }))
  .handler(async ({ services, params }) => {
    const eventsService = await getEventsService(services);

    await eventsService.endSession(params.id);
  });

eventsController
  .addRoute("POST", "/:id/rehost")
  .body(eventsHostRequestDTO)
  .params(Type.Object({ id: Type.String() }))
  .handler(async ({ services, params, body }) => {
    const eventsService = await getEventsService(services);

    await eventsService.rehostSession(params.id, body.joinCode);
  });

export default eventsController;
