import { FastifyInstance, FastifyRequest } from "fastify";
import { jwtDecrypt } from "jose";
import { prisma } from "../prisma/index.js";
import { Cache } from "cache-manager";

export async function getSession(request: FastifyRequest, cache: Cache) {
  const tokenRaw = request.headers.authorization?.split(" ")[1];

  if (!tokenRaw) return null;

  try {
    const { payload } = await jwtDecrypt<{
      sessionToken: string;
      userId: string;
    }>(tokenRaw, Buffer.from(process.env.AUTH_SECRET!, "base64"), {
      audience: "urn:fhhvr",
      maxTokenAge: "60 minutes",
    });

    if (!payload.sessionToken || !payload.userId) return null;

    return await cache.wrap(
      Buffer.from(
        await crypto.subtle.digest("SHA-512", Buffer.from(tokenRaw))
      ).toString("base64"), // dont save the token just hash it and save that
      async () => await fetchSession(payload),
      60_000 // cache for 1 minute
    );
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function fetchSession({
  sessionToken,
  userId,
}: {
  sessionToken: string;
  userId: string;
}) {
  try {
    const user = await prisma.user.findFirstOrThrow({
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
                assignedPermissions: {
                  select: {
                    name: true,
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return { user, sessionToken };
  } catch {
    return null;
  }
}

export const registerAuth = async (fastify: FastifyInstance, cache: Cache) => {
  fastify.addHook("preHandler", async function (req, rep) {
    const isDocs =
      process.env.ENVIRONMENT === "development" && req.url.startsWith("/docs");

    const session = await getSession(req, cache);

    if (!session && !isDocs) return rep.status(401).send("ACCESS_DENIED");
  });
};
