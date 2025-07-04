import { Service } from "@tganzhorn/fastify-modular";
import dayjs from "dayjs";
import {
  from,
  interval,
  map,
  merge,
  mergeMap,
  Observable,
  startWith,
} from "rxjs";
import { DbService } from "../db/db.service.js";
import { AuthService } from "../auth/auth.service.js";

@Service([DbService, AuthService])
export class EventsService {
  private static readonly HEARTBEAT_DELAY_MS = 15_000;
  private static readonly HEARTBEAT_CHECK_MS = 20_000;

  constructor(private dbService: DbService, private authService: AuthService) {}

  async createEvent({
    attendees,
    endTime,
    startTime,
    status,
    title,
  }: {
    endTime: string;
    startTime: string;
    status: string;
    title: string;
    attendees: string[];
  }) {
    await (
      await this.dbService.client
    ).event.create({
      data: {
        endTime,
        startTime,
        status,
        title,
        owner: {
          connect: {
            email: (await this.authService.getSession()).user.email,
          },
        },
        attendees: {
          createMany: {
            data: attendees.map((attendee) => ({ userId: attendee })),
          },
        },
      },
    });
  }

  async updateEvent({
    id,
    attendees,
    endTime,
    startTime,
    status,
    title,
  }: {
    id: string;
    endTime?: string;
    startTime?: string;
    status?: string;
    title?: string;
    attendees?: string[];
  }) {
    return await (
      await this.dbService.client
    ).event.update({
      data: {
        endTime,
        startTime,
        status,
        title,
        attendees: attendees
          ? {
              deleteMany: {},
              createMany: {
                data: attendees.map((attendee) => ({ userId: attendee })),
              },
            }
          : undefined,
      },
      where: {
        id,
      },
    });
  }

  async fetchAll() {
    return await (
      await this.dbService.client
    ).event.findMany({
      select: {
        title: true,
        status: true,
        joinCode: true,
      },
    });
  }

  async fetchStatus(id: string) {
    return await (
      await this.dbService.client
    ).event.findFirstOrThrow({
      where: {
        id,
      },
      select: {
        joinCode: true,
        status: true,
      },
    });
  }

  list(): Observable<string> {
    return merge(
      this.dbService.subscriberClient.event
        .subscribe({ operations: ["*"] })
        .pipe(
          startWith(null),
          mergeMap(() =>
            from(
              this.fetchAll().then(
                (events) => `data: ${JSON.stringify(events)}\n`
              )
            )
          )
        ),
      interval(5_000).pipe(map(() => `:ok\n`))
    );
  }

  status(id: string): Observable<string> {
    return merge(
      this.dbService.subscriberClient.event
        .subscribe({ operations: ["*"] })
        .pipe(
          startWith(null),
          mergeMap(() =>
            from(
              this.fetchStatus(id).then(
                (event) => `data: ${JSON.stringify(event)}\n`
              )
            )
          )
        ),
      interval(5_000).pipe(map(() => `:ok\n`))
    );
  }

  async setHeartbeat(id: string) {
    await (
      await this.dbService.client
    ).event.update({
      where: {
        id,
      },
      data: {
        heartbeatTimestamp: new Date().toISOString(),
      },
    });

    setTimeout(() => this.checkHeartbeat(id), EventsService.HEARTBEAT_CHECK_MS);
  }

  async checkHeartbeat(id: string) {
    const { heartbeatTimestamp, status } = await (
      await this.dbService.client
    ).event.findFirstOrThrow({
      where: { id },
      select: { heartbeatTimestamp: true, status: true },
    });

    if (status !== "ACTIVE") return;

    if (
      dayjs(heartbeatTimestamp).isBefore(
        dayjs().subtract(EventsService.HEARTBEAT_DELAY_MS, "second")
      )
    )
      return;

    await (
      await this.dbService.client
    ).event.update({
      where: {
        id,
      },
      data: {
        status: "MISSING_HOST",
      },
    });
  }

  async hostSession(id: string, joinCode: string) {
    await (
      await this.dbService.client
    ).event.update({
      where: {
        id,
      },
      data: {
        status: "ACTIVE",
        heartbeatTimestamp: new Date().toISOString(),
        joinCode,
      },
    });

    setTimeout(() => this.checkHeartbeat(id), EventsService.HEARTBEAT_CHECK_MS);
  }

  async endSession(id: string) {
    await (
      await this.dbService.client
    ).event.update({
      where: {
        id,
      },
      data: {
        status: "END",
        joinCode: null,
        heartbeatTimestamp: null,
      },
    });
  }

  async rehostSession(id: string, joinCode: string) {
    await (
      await this.dbService.client
    ).event.update({
      where: {
        id,
      },
      data: {
        status: "ACTIVE",
        joinCode,
        heartbeatTimestamp: new Date().toISOString(),
      },
    });
  }
}
