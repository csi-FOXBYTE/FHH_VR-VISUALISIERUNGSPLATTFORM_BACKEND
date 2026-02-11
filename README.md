# WebBackend (FHH VR)

Backend-Service der FHH-VR-Plattform auf Basis von Fastify + TypeScript.
Der Service stellt HTTP-Endpunkte, Hintergrundjobs (BullMQ), Datenkonvertierungen und Datenzugriff via Prisma/ZenStack bereit.

## Architektur im Überblick

- `Fastify` als HTTP-Server
- `Prisma + ZenStack` für Datenmodell und Policies
- `BullMQ` für Worker/Queues (inkl. Bull Board UI)
- `@csi-foxbyte/fastify-toab` für Service-/Controller-/Worker-Registrierung
- `esbuild + tsx` für Dev-/Build-Workflow
- `pnpm` als Package Manager

## Projektstruktur

- `src/`: Fachmodule (`*.service.ts`, `*.controller.ts`, optionale `workers/`)
- `src/@internals/index.ts`, `src/registries.ts`: von Toab generiert
- `zmodel/`: ZenStack-Quellschema (aus Frontend-Repo übernommen)
- `prisma/schema.prisma`: aus `zmodel/schema.zmodel` generiert
- `bin/`: externe Tools/Binaries für Konvertierung
- `python/` + `requirements.txt`: Python-Helfer für Konvertierungs-Workflows

## Voraussetzungen

- Node.js 20+ (im Docker/Devcontainer wird Node 23 genutzt)
- pnpm 10
- PostgreSQL
- Redis
- optional: Azure Storage, wenn Blob/Upload-Features genutzt werden
- optional: Python venv, wenn lokale Konvertierungsfunktionen genutzt werden

## Umgebungsvariablen

`dotenv` wird beim Serverstart geladen (`src/index.ts`).

| Variable | Pflicht | Zweck |
|---|---|---|
| `PORT` | Ja | HTTP-Port |
| `DATABASE_URL` | Ja | PostgreSQL-Verbindung (Prisma) |
| `REDIS_CONNECTION_STRING` | Ja | Redis-Verbindung für Queues/Events |
| `AUTH_SECRET` | Ja | Auth-/Token-Secret |
| `AZURE_STORAGE_CONNECTION_STRING` | Für Blob-/Converter-Features | Azure Blob Storage |
| `REDIS_IS_CLUSTER` | Optional | `true` für Redis-Cluster |
| `WORKER_DISABLED` | Optional | `true` deaktiviert Worker-Registrierung beim Start |
| `DISABLED_WORKERS` | Optional | `true` deaktiviert Worker-Ausführung intern |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Optional | Azure Application Insights / OTel Export |

## Schnellstart (lokal)

```bash
corepack enable pnpm
pnpm install
pnpm zenstack-generate
pnpm exec prisma generate
pnpm exec prisma db push
```

Optional für lokale Python-Converter:

```bash
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
pip install --no-cache-dir -r requirements.txt
```

Service starten:

```bash
pnpm dev
```

## Nützliche Befehle

- `pnpm dev`: inkrementeller Build nach `.dev` + Auto-Restart
- `pnpm build`: Produktionsbuild nach `.build`
- `pnpm lint`: Oxlint + ESLint
- `pnpm zenstack-generate`: generiert `prisma/schema.prisma` aus `zmodel`
- `pnpm publish:docker`: baut und pusht Image mit aktueller Version

## Laufzeit-Endpunkte

- `GET /ping`: einfacher Health-Check
- `GET /docs`: Swagger UI
- `GET /bullMQ`: Bull Board UI für Queues/Jobs

## Entwicklungs-Workflows

### 1) Datenmodell ändern (ZenStack/Prisma)

1. ZModel im Frontend-Repo aktualisieren (Source of Truth).
2. Änderungen nach `zmodel/` dieses Repos übernehmen.
3. `pnpm zenstack-generate` ausführen.
4. DB synchronisieren:
   - schnell: `pnpm exec prisma db push`
   - mit Migration: `pnpm exec prisma migrate dev --name <name>`
5. Falls nötig Prisma Client neu erzeugen: `pnpm exec prisma generate`.

### 2) Neues Feature (Service + Controller)

1. Scaffold:
   - `pnpm fastify-toab create service <name>`
   - `pnpm fastify-toab create controller <name>`
2. Logik im Service implementieren.
3. DTOs mit `@sinclair/typebox` definieren.
4. Routen im Controller definieren.
5. Generierung aktualisieren:
   - `pnpm fastify-toab rebuild`
6. Dev-Server neu starten, falls erforderlich.

### 3) Neuer Worker (BullMQ)

1. Scaffold: `pnpm fastify-toab create worker <name>`
2. Queue + Processor implementieren.
3. Registries neu generieren: `pnpm fastify-toab rebuild`
4. Nur HTTP ohne Worker testen: `WORKER_DISABLED=true`

### 4) Datenzugriff: wann `getDbService` vs. `getPrismaService`

- `getDbService`: wenn ZenStack-Policies (`@allow/@deny`) gelten sollen
- `getPrismaService`: nur wenn bewusst ohne Policy-Layer gearbeitet wird

## Docker

Lokales Image bauen:

```bash
DOCKER_BUILDKIT=1 docker build --secret id=env,src=.env -t webbackend:local .
```

Container starten:

```bash
docker run --rm -p 3000:3000 --env-file .env webbackend:local
```

## Generierte Dateien (nicht manuell bearbeiten)

- `prisma/schema.prisma` (ZenStack-Output)
- `src/registries.ts` (Toab-Output)
- `src/@internals/index.ts` (Toab-Output)

Änderungen immer an der Quelle vornehmen und danach die jeweiligen Generatoren ausführen.
