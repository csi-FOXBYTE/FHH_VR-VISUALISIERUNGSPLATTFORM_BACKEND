import { createService } from "@csi-foxbyte/fastify-toab";
import dayjs from "dayjs";
import {
  getAuthService,
  getConfigurationService,
  getDbService,
  getNotificationService,
  getPrismaService,
  getTranslationService,
} from "../@internals/index.js";
import ics from "ics";
import Handlebars from "handlebars";

const eventsService = createService(
  "events",
  async ({ services }) => {
    const HEARTBEAT_DELAY_MS = 15_000;
    const HEARTBEAT_CHECK_MS = 20_000;

    const dbService = await getDbService(services);
    const prismaService = await getPrismaService(services);
    const authService = await getAuthService(services);
    const notificationService = await getNotificationService(services);
    const configurationService = await getConfigurationService(services);
    const translationService = await getTranslationService(services);

    async function fetchAll() {
      return await dbService.event.findMany({
        select: {
          title: true,
          status: true,
          joinCode: true,
        },
      });
    }

    async function fetchStatus(id: string) {
      return await dbService.event.findFirstOrThrow({
        where: {
          id,
        },
        select: {
          joinCode: true,
          status: true,
        },
      });
    }

    async function checkHeartbeat(id: string) {
      const { heartbeatTimestamp, status } =
        await dbService.event.findFirstOrThrow({
          where: { id },
          select: { heartbeatTimestamp: true, status: true },
        });

      if (status !== "ACTIVE") return;

      if (
        dayjs(heartbeatTimestamp).isBefore(
          dayjs().subtract(HEARTBEAT_DELAY_MS, "second")
        )
      )
        return;

      await dbService.event.update({
        where: {
          id,
        },
        data: {
          status: "MISSING_HOST",
        },
      });
    }

    return {
      async createEvent({
        attendees,
        moderators,
        endTime,
        startTime,
        project,
        title,
      }: {
        endTime: string;
        startTime: string;
        title: string;
        project?: string;
        attendees: string[];
        moderators: string[];
      }) {
        const createdEvent = await dbService.event.create({
          data: {
            endTime,
            startTime,
            status: "PLANNED",
            title,
            project: project ? { connect: { id: project } } : undefined,
            attendees: {
              createMany: {
                data: Array.from(new Set(attendees.concat(moderators))).map(
                  (attendee) => ({
                    userId: attendee,
                    role: moderators.includes(attendee) ? "MODERATOR" : "GUEST",
                  })
                ),
              },
            },
            owner: {
              connect: {
                id: (await authService.getSession())?.user.id ?? "-",
              },
            },
          },
          select: {
            startTime: true,
            endTime: true,
            id: true,
            title: true,
            owner: {
              select: {
                name: true,
                id: true,
                email: true,
              },
            },
            attendees: {
              select: {
                role: true,
                user: {
                  select: {
                    name: true,
                    email: true,
                    language: true,
                  },
                },
              },
            },
          },
        });

        const config = await configurationService.getConfiguration();

        const templates = {
          DE: Handlebars.compile(config.invitationEmailDE),
          EN: Handlebars.compile(config.invitationEmailEN),
        };

        await notificationService.notify(
          createdEvent.attendees.map(({ user }) => {
            const template = templates[user.language ?? "EN"];

            const html = template({
              user: {
                name: user.name ?? user.email,
                email: user.email,
              },
              event: {
                startDate: dayjs(createdEvent.startTime).format("DD.MM.YYYY"),
                startTime: dayjs(createdEvent.startTime).format("HH:mm"),
                endDate: dayjs(createdEvent.endTime).format("DD.MM.YYYY"),
                endTime: dayjs(createdEvent.endTime).format("HH:mm"),
                title: createdEvent.title,
              },
            });

            const translator = translationService.getTranslator(
              (user.language ?? "en").toLowerCase() as "en"
            );

            const event = ics.createEvent({
              start: startTime,
              end: endTime,
              title: title,
              url: config.emailPlatformAddress,
              htmlContent: html,
              organizer: {
                email: createdEvent.owner?.email,
                name: createdEvent.owner?.name ?? undefined,
              },
              busyStatus: "BUSY",
              uid: createdEvent.id,
              alarms: [
                {
                  action: "display",
                  description: title,
                  trigger: { before: true, hours: 1 },
                },
                {
                  action: "display",
                  description: title,
                  trigger: { before: true, minutes: 15 },
                },
              ],
              status: "CONFIRMED",
              attendees: createdEvent.attendees.map(({ user, role }) => ({
                email: user.email,
                name: user.name ?? undefined,
                role:
                  role === "MODERATOR" ? "REQ-PARTICIPANT" : "OPT-PARTICIPANT",
              })),
            });

            if (!event.value || event.error) {
              console.error(event.error);
              throw new Error("Could not generate ics event!");
            }

            const eventFile = new File(
              [new Blob([event.value], { type: "text/calendar" })],
              "event.ics",
              {
                type: "text/calendar",
              }
            );

            return {
              attachments: [eventFile],
              content: html,
              from: createdEvent.owner?.email ?? "-",
              title: translator("notifications.event-invitation-title", {
                title,
              }),
              to: user.email,
            };
          })
        );

        return createdEvent;
      },

      async cancelEvent({ id }: { id: string }) {
        const cancelledEvent = await dbService.event.update({
          where: {
            id,
          },
          data: {
            status: "CANCELED",
          },
          select: {
            title: true,
            id: true,
            startTime: true,
            endTime: true,
            owner: {
              select: {
                name: true,
                email: true,
              },
            },
            attendees: {
              select: {
                role: true,
                user: {
                  select: {
                    name: true,
                    email: true,
                    id: true,
                    language: true,
                  },
                },
              },
            },
          },
        });

        const config = await configurationService.getConfiguration();

        const templates = {
          DE: Handlebars.compile(config.invitationCancelledEmailDE),
          EN: Handlebars.compile(config.invitationCancelledEmailEN),
        };

        await notificationService.notify(
          cancelledEvent.attendees.map(({ user }) => {
            const template = templates[user.language ?? "EN"];

            const html = template({
              user: {
                name: user.name ?? user.email,
                email: user.email,
              },
              event: {
                startDate: dayjs(cancelledEvent.startTime).format("DD.MM.YYYY"),
                startTime: dayjs(cancelledEvent.startTime).format("HH:mm"),
                endDate: dayjs(cancelledEvent.endTime).format("DD.MM.YYYY"),
                endTime: dayjs(cancelledEvent.endTime).format("HH:mm"),
                title: cancelledEvent.title,
              },
            });

            const translator = translationService.getTranslator(
              (user.language ?? "en").toLowerCase() as "en"
            );

            const event = ics.createEvent({
              start: cancelledEvent.startTime.toISOString(),
              end: cancelledEvent.endTime.toISOString(),
              title: cancelledEvent.title,
              url: config.emailPlatformAddress,
              htmlContent: html,
              organizer: {
                email: cancelledEvent.owner?.email,
                name: cancelledEvent.owner?.name ?? undefined,
              },
              busyStatus: "BUSY",
              uid: cancelledEvent.id,
              alarms: [
                {
                  action: "display",
                  description: cancelledEvent.title,
                  trigger: { before: true, hours: 1 },
                },
                {
                  action: "display",
                  description: cancelledEvent.title,
                  trigger: { before: true, minutes: 15 },
                },
              ],
              status: "CANCELLED",
              attendees: cancelledEvent.attendees.map(({ user, role }) => ({
                email: user.email,
                name: user.name ?? undefined,
                role:
                  role === "MODERATOR" ? "REQ-PARTICIPANT" : "OPT-PARTICIPANT",
              })),
            });

            if (!event.value || event.error) {
              console.error(event.error);
              throw new Error("Could not generate ics event!");
            }

            const eventFile = new File(
              [new Blob([event.value], { type: "text/calendar" })],
              "event.ics",
              {
                type: "text/calendar",
              }
            );

            return {
              attachments: [eventFile],
              content: html,
              from: cancelledEvent.owner?.email ?? "-",
              title: translator(
                "notifications.event-invitation-cancellation-title",
                {
                  title: cancelledEvent.title,
                }
              ),
              to: user.email,
            };
          })
        );

        return cancelledEvent;
      },

      async updateEvent({
        id,
        attendees,
        moderators,
        endTime,
        startTime,
        project,
        title,
      }: {
        id: string;
        endTime?: string;
        startTime?: string;
        project?: string | null;
        title?: string;
        attendees?: string[];
        moderators?: string[];
      }) {
        const oldEvent = await dbService.event.findFirstOrThrow({
          where: {
            id,
          },
        });

        const cleanedAttendees = Array.from(
          new Set((attendees ?? []).concat(moderators ?? []))
        );

        const updatedEvent = await prismaService.event.update({
          where: {
            id,
            status: "PLANNED",
            ownerId: (await authService.getSession())?.user.id ?? "-",
          },
          select: {
            title: true,
            id: true,
            startTime: true,
            endTime: true,
            owner: {
              select: {
                name: true,
                email: true,
              },
            },
            attendees: {
              select: {
                role: true,
                user: {
                  select: {
                    name: true,
                    email: true,
                    id: true,
                    language: true,
                  },
                },
              },
            },
          },
          data: {
            endTime,
            startTime,
            status: "PLANNED",
            title,
            project:
              project === undefined
                ? undefined
                : project === null
                ? { disconnect: {} }
                : { connect: { id: project } },
            attendees: attendees
              ? {
                  deleteMany: {
                    NOT: { userId: { in: cleanedAttendees } },
                  },
                  upsert: cleanedAttendees.map((userId) => ({
                    where: { eventId_userId: { eventId: id, userId } },
                    create: {
                      userId,
                      role: (moderators ?? []).includes(userId)
                        ? "MODERATOR"
                        : "GUEST",
                    },
                    update: {
                      role: (moderators ?? []).includes(userId)
                        ? "MODERATOR"
                        : "GUEST",
                    },
                  })),
                }
              : undefined,
          },
        });

        const config = await configurationService.getConfiguration();

        const templates = {
          DE: Handlebars.compile(config.invitationUpdatedEmailDE),
          EN: Handlebars.compile(config.invitationUpdatedEmailEN),
        };

        await notificationService.notify(
          updatedEvent.attendees.map(({ user }) => {
            const template = templates[user.language ?? "EN"];

            const html = template({
              user: {
                name: user.name ?? user.email,
                email: user.email,
              },
              event: {
                startDate: dayjs(updatedEvent.startTime).format("DD.MM.YYYY"),
                startTime: dayjs(updatedEvent.startTime).format("HH:mm"),
                endDate: dayjs(updatedEvent.endTime).format("DD.MM.YYYY"),
                endTime: dayjs(updatedEvent.endTime).format("HH:mm"),
                title: updatedEvent.title,
              },
              oldEvent: {
                startDate: dayjs(oldEvent.startTime).format("DD.MM.YYYY"),
                startTime: dayjs(oldEvent.startTime).format("HH:mm"),
                endDate: dayjs(oldEvent.endTime).format("DD.MM.YYYY"),
                endTime: dayjs(oldEvent.endTime).format("HH:mm"),
              },
            });

            const translator = translationService.getTranslator(
              (user.language ?? "en").toLowerCase() as "en"
            );

            const event = ics.createEvent({
              start: updatedEvent.startTime.toISOString(),
              end: updatedEvent.endTime.toISOString(),
              title: title,
              url: config.emailPlatformAddress,
              htmlContent: html,
              organizer: {
                email: updatedEvent.owner?.email,
                name: updatedEvent.owner?.name ?? undefined,
              },
              busyStatus: "BUSY",
              uid: updatedEvent.id,
              alarms: [
                {
                  action: "display",
                  description: title,
                  trigger: { before: true, hours: 1 },
                },
                {
                  action: "display",
                  description: title,
                  trigger: { before: true, minutes: 15 },
                },
              ],
              status: "CONFIRMED",
              attendees: updatedEvent.attendees.map(({ user, role }) => ({
                email: user.email,
                name: user.name ?? undefined,
                role:
                  role === "MODERATOR" ? "REQ-PARTICIPANT" : "OPT-PARTICIPANT",
              })),
            });

            if (!event.value || event.error) {
              console.error(event.error);
              throw new Error("Could not generate ics event!");
            }

            const eventFile = new File(
              [new Blob([event.value], { type: "text/calendar" })],
              "event.ics",
              {
                type: "text/calendar",
              }
            );

            return {
              attachments: [eventFile],
              content: html,
              from: updatedEvent.owner?.email ?? "-",
              title: translator("notifications.event-invitation-title", {
                title: updatedEvent.title,
              }),
              to: user.email,
            };
          })
        );

        return updatedEvent;
      },

      fetchAll,

      fetchStatus,

      list() {
        return prismaService.event.subscribe();
      },

      status(id: string) {
        return prismaService.event.subscribe();
      },

      async setHeartbeat(id: string) {
        await dbService.event.update({
          where: {
            id,
          },
          data: {
            heartbeatTimestamp: new Date().toISOString(),
          },
        });

        setTimeout(() => checkHeartbeat(id), HEARTBEAT_CHECK_MS);
      },

      checkHeartbeat,

      async hostSession(id: string, joinCode: string) {
        await dbService.event.update({
          where: {
            id,
          },
          data: {
            status: "ACTIVE",
            heartbeatTimestamp: new Date().toISOString(),
            joinCode,
          },
        });

        setTimeout(() => checkHeartbeat(id), HEARTBEAT_CHECK_MS);
      },

      async endSession(id: string) {
        await dbService.event.update({
          where: {
            id,
          },
          data: {
            status: "END",
            joinCode: null,
            heartbeatTimestamp: null,
          },
        });
      },

      async rehostSession(id: string, joinCode: string) {
        await dbService.event.update({
          where: {
            id,
          },
          data: {
            status: "ACTIVE",
            joinCode,
            heartbeatTimestamp: new Date().toISOString(),
          },
        });
      },
    };
  },
  { scope: "REQUEST" }
);

/*
AUTOGENERATED!
*/

export default eventsService;
