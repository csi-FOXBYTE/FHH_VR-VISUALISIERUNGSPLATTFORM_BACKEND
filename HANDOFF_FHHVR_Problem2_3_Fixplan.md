# Handoff: FHH VR Backend - Problem 2/3 Fixplan

## Ziel

Zwei offene Punkte aus der Diagnose sollen umgesetzt werden:

1. Problem 2: `citygml-tools` startet im Linux-Container nicht wegen CRLF im Wrapper-Skript.
2. Problem 3: grosse Basisdaten sprengen den lokalen/ephemeren Container-Scratch-Speicher.

## Gepruefter Stand Problem 2

Geprueftes Image:

```text
docker.io/foxbytecsi/fhhvr-webbackend:0.2.11
digest: sha256:a3834c88aced37e095e8ae48a865cb0c1f66af97ea17f824bbe75741c9f82c63
created: 2026-03-05T16:01:45.624648592+01:00
```

Betroffene Datei im Image:

```text
/app/bin/citygml-tools-2.4.0/citygml-tools
```

Nachweis:

```text
firstLine="#!/bin/sh\r\n"
crlf=253
lf_only=0
first bytes: 23 21 2f 62 69 6e 2f 73 68 0d 0a
```

Backend-naher Start reproduziert den Fehler:

```text
shell_status=127
/bin/sh: 1: /app/bin/citygml-tools-2.4.0/citygml-tools: not found
```

Direkter Java-Aufruf funktioniert:

```text
java -cp /app/bin/citygml-tools-2.4.0/lib/* org.citygml4j.tools.CityGMLTools
```

Ergebnis: Java/JARs sind ok. Der Linux-Wrapper im Image ist wegen CRLF kaputt.

## Vorgehen Problem 2

Repo nicht aus einem Windows-Working-Tree bauen. Repo in WSL auf das native Linux-Dateisystem klonen, z. B. unter `~/src/...`, nicht unter `/mnt/c/...`.

`.gitattributes` im Backend-Repo ergaenzen:

```gitattributes
# Linux wrapper scripts must stay LF in every checkout/build context.
bin/citygml-tools-2.4.0/citygml-tools text eol=lf
*.sh text eol=lf
```

Nicht pauschal `bin/** text eol=lf` verwenden, weil unter `bin/` auch Binaries/JARs liegen koennen.

Datei normalisieren und pruefen:

```sh
dos2unix bin/citygml-tools-2.4.0/citygml-tools
git add .gitattributes bin/citygml-tools-2.4.0/citygml-tools
git ls-files --eol -- bin/citygml-tools-2.4.0/citygml-tools
```

Erwartung:

```text
i/lf w/lf attr/text eol=lf
```

Image aus WSL heraus bauen. Danach im neu gebauten Image pruefen:

```sh
docker run --rm --entrypoint node <new-image> -e "
const fs=require('fs');
const p='/app/bin/citygml-tools-2.4.0/citygml-tools';
const b=fs.readFileSync(p);
console.log(JSON.stringify(b.slice(0,b.indexOf(10)+1).toString('binary')));
console.log(Array.from(b.slice(0,12)).map(x=>x.toString(16).padStart(2,'0')).join(' '));
"
```

Erwartung:

```text
"#!/bin/sh\n"
23 21 2f 62 69 6e 2f 73 68 0a
```

Smoke-Test:

```sh
docker run --rm --entrypoint sh <new-image> -lc '
/app/bin/citygml-tools-2.4.0/citygml-tools 2>&1 | head -20
'
```

Erwartung: kein `not found` mehr. Stattdessen Usage-/Subcommand-Ausgabe von `citygml-tools`.

Optionaler Build-Hardening-Fix im Dockerfile:

```dockerfile
RUN sed -i 's/\r$//' /app/bin/citygml-tools-2.4.0/citygml-tools \
 && chmod +x /app/bin/citygml-tools-2.4.0/citygml-tools
```

Das ist nicht zwingend, wenn der WSL-Build und `.gitattributes` sauber sind, aber es macht den Build robuster gegen zukuenftige Windows-Checkouts.

## Gepruefter Stand Problem 3

Der Worker nutzt den Wert `localProcessorFolder` aus der DB-Konfiguration:

```ts
const rootPath = path.join(job.data.localProcessorFolder, job.data.id);
```

Default laut Prisma-Schema:

```text
localProcessorFolder String @default("./processor")
```

Das Dockerfile setzt:

```dockerfile
WORKDIR /app
USER nodeuser
```

Damit zeigt `./processor` effektiv auf `/app/processor`, sofern die DB-Konfiguration nicht abweicht.

In diesem Arbeitsordner liegen waehrend der Pipeline grosse Zwischenstaende:

- heruntergeladenes Zip
- entpackte Quelldaten
- CityJSON/Preprocessing-Ergebnisse
- Tile-Datenbank
- erzeugte Tiles

Bei Azure Container Apps zaehlt lokaler Container-/Replica-Speicher gegen das ephemere Storage-Limit. Bei >1 vCPU sind das 8 GiB pro Replica. Das reicht fuer 10-20 GB Rohdaten nicht.

## Vorgehen Problem 3 ohne Code-Aenderung

No-Code-Fix ist moeglich, wenn `localProcessorFolder` auf einen echten Mount zeigt oder der erwartete Pfad selbst uebermountet wird.

Praeferenz:

```text
Mount: /mnt/scratch
localProcessorFolder: /mnt/scratch
```

Alternative fuer minimalen Eingriff:

```text
Mount direkt auf /app/processor
localProcessorFolder bleibt ./processor
```

Azure Container Apps:

- Azure Files Volume mounten.
- Kein `EmptyDir` fuer grosse Daten verwenden; das bleibt ephemer und zaehlt gegen das Limit.
- Neue Revision deployen.
- `localProcessorFolder` auf den Mount setzen, falls nicht direkt `/app/processor` uebermountet wird.

App Service Linux Container:

- Nicht irgendeinen freien Host-Ordner erwarten.
- Entweder `/home/scratch` mit `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true` und ausreichender Quota nutzen.
- Oder Azure Storage/Azure Files als Mount einrichten und `localProcessorFolder` darauf setzen.

## Mount-Permissions fuer nodeuser

Im Image laeuft die App als:

```text
user: nodeuser
uid: 1001
group: nodejs
gid: 1001
```

Der Scratch-Mount muss fuer UID/GID 1001 beschreibbar sein.

Minimaltest im laufenden Container:

```sh
id
df -h /mnt/scratch
touch /mnt/scratch/write-test
rm /mnt/scratch/write-test
```

Wenn `Permission denied` kommt, Mount-Optionen/ACLs korrigieren.

Bei Linux-/SMB-Mounts sind typische Mount-Optionen:

```text
uid=1001,gid=1001,dir_mode=0775,file_mode=0664
```

Alternativ kann ein init/root-Schritt den Mount-Unterordner vorbereiten, falls die Plattform das erlaubt:

```sh
mkdir -p /mnt/scratch
chown 1001:1001 /mnt/scratch
chmod 775 /mnt/scratch
```

## Achtung zu User Override

Den Container von aussen dauerhaft als anderen User laufen zu lassen ist nicht konsequenzfrei.

Risiken:

- Node-Prozess verliert Zugriff auf Dateien, die im Image fuer `nodeuser:nodejs` vorbereitet wurden.
- `/app/.venv`, `/app/node_modules`, `/app/bin` und Home-Verzeichnis koennen andere Besitz-/Rechteannahmen haben.
- Als root laufen waere ein Security-Rueckschritt.
- Andere UID kann mit App-Service-/Container-Apps-Mounts funktionieren, ist aber ein neuer Betriebszustand und muss komplett getestet werden.

Empfehlung: `USER nodeuser` beibehalten und den Mount fuer UID/GID 1001 beschreibbar machen.

## Reihenfolge

1. Repo in WSL native FS klonen.
2. `.gitattributes` setzen und Wrapper auf LF normalisieren.
3. Image in WSL bauen.
4. Image lokal auf LF und `citygml-tools` Smoke-Test pruefen.
5. Neues Image deployen.
6. Problem 2 mit kleinem/1,4-GB-Datensatz verifizieren.
7. Scratch-Mount fuer Problem 3 einrichten.
8. `localProcessorFolder` auf Mount setzen oder `/app/processor` uebermounten.
9. Schreibtest als `nodeuser`.
10. Grossen Datensatz testen und `df -h`/`du -sh` ueberwachen.
