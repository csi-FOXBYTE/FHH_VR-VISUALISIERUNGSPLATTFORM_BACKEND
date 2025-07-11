import {
  ContextService,
  RequestStore,
  Service,
} from "@tganzhorn/fastify-modular";
import { getSession } from "./index.js";

@Service([ContextService])
export class AuthService extends RequestStore<{
  session: Awaited<{
    user: {
      id: string;
      email: string;
      name: string | null;
      assignedGroups: {
        assignedRoles: {
          assignedPermissions: { name: string; id: string }[];
        }[];
      }[];
    };
  }> | null;
}> {
  constructor(private contextService: ContextService) {
    super({ session: null });
  }

  async getSession() {
    if (!this.contextService.ctx.request)
      throw new Error("No request present!");

    if (!this.contextService.ctx.request.headers.authorization) return null;

    if (!this.requestStore.session) {
      this.requestStore.session = await getSession(
        this.contextService.ctx.request,
        this.contextService.ctx.cache
      );
    }

    return this.requestStore.session!;
  }
}
