import { createService } from "@csi-foxbyte/fastify-toab";
import { jwtDecrypt } from "jose";
import { getCacheService, getPrismaService } from "../@internals/index.js";

const authService = createService(
  "auth",
  async ({ request, services }) => {
    const cache = await getCacheService(services);

    const prismaService = await getPrismaService(services);

    async function fetchSession({
      sessionToken,
      userId,
    }: {
      sessionToken: string;
      userId: string;
    }) {
      try {
        const user = await prismaService.user.findFirstOrThrow({
          where: {
            id: userId,
            sessions: {
              some: {
                sessionToken,
              },
            },
          },
          select: {
            id: true,
            email: true,
            name: true,
            assignedGroups: {
              select: {
                assignedRoles: {
                  select: {
                    assignedPermissions: true,
                  },
                },
              },
            },
          },
        });

        return { user, sessionToken };
      } catch (e) {
        console.error(e);
        return null;
      }
    }

    return {
      async getSession() {
        const tokenRaw = request.headers.authorization?.split(" ")[1];

        if (!tokenRaw) return null;

        try {
          const { payload } = await jwtDecrypt<{
            sessionToken: string;
            userId: string;
          }>(tokenRaw, Buffer.from(process.env.AUTH_SECRET!, "base64"), {
            audience: "urn:fhhvr",
            maxTokenAge: "60 minutes",
            clockTolerance: "5 minutes",
          });

          if (!payload.sessionToken || !payload.userId) return null;

          return await cache.wrap(
            Buffer.from(
              await crypto.subtle.digest("SHA-512", Buffer.from(tokenRaw))
            ).toString("base64"), // dont save the raw token just hash it and save that
            async () => await fetchSession(payload),
            30_000 // cache for 30 seconds
          );
        } catch (e) {
          console.error(e, new Date().getTime());
          return null;
        }
      },
    };
  },
  { scope: "REQUEST" }
);

export default authService;
