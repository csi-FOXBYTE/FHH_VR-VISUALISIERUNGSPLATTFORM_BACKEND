import sys
import os
import argparse
import requests
import mercantile
import concurrent.futures
import time
import json
import random
import warnings
from osgeo import gdal

# --- 1. STDOUT SAUBER HALTEN ---
warnings.simplefilter('ignore')

def emit_json(data):
    """Schreibt JSON auf STDOUT und flusht sofort."""
    try:
        json_str = json.dumps(data)
        sys.stdout.write(json_str + "\n")
        sys.stdout.flush()
    except Exception:
        pass

# --- 2. GDAL KONFIGURATION ---
gdal.UseExceptions()
gdal.PushErrorHandler('CPLQuietErrorHandler')
gdal.SetConfigOption('GDAL_PAM_ENABLED', 'NO')
gdal.SetConfigOption('GDAL_DEFAULT_WMS_CACHE_PATH', '/vsimem/gdalwmscache')

# --- IMPORTS PRÜFEN ---
try:
    from owslib.wms import WebMapService
    from owslib.wmts import WebMapTileService
except ImportError:
    emit_json({"status": "fatal_error", "error": "OWSLib missing"})
    sys.exit(1)

# ------------------------------------------------------------------------------
# LOGIK
# ------------------------------------------------------------------------------

def detect_service(url, layer_name):
    try:
        wms = WebMapService(url, version='1.1.1', timeout=10)
        if layer_name in wms.contents:
            return "WMS", wms.contents[layer_name].boundingBoxWGS84, None
    except: pass

    try:
        wmts = WebMapTileService(url, timeout=10)
        if layer_name in wmts.contents:
            bounds = wmts.contents[layer_name].boundingBoxWGS84
            if not bounds: bounds = (-180, -90, 180, 90)
            service_xml = f"WMTS:{url},layer={layer_name}"
            return "WMTS", bounds, service_xml
    except: pass

    return None, None, None

def parse_zoom(zoom_str):
    if '-' in zoom_str:
        s, e = map(int, zoom_str.split('-'))
        return range(s, e + 1)
    return range(int(zoom_str), int(zoom_str) + 1)

# --- WORKER: WMS ---
def fetch_wms_tile(args):
    tile, out_dir, url, layer = args
    z, x, y = tile.z, tile.x, tile.y

    # Pfad zusammenbauen (OS-spezifisch korrekt)
    path = os.path.join(out_dir, str(z), str(x), f"{y}.png")
    path = os.path.normpath(path) # Stellt sicher: C:\Users\... unter Windows

    result = {"path": path, "z": z, "x": x, "y": y, "status": "ok"}

    # Check ob existiert & > 0 Byte
    if os.path.exists(path) and os.path.getsize(path) > 0:
        result["status"] = "skipped"
        return result

    b = mercantile.bounds(tile)
    bbox = f"{b.west},{b.south},{b.east},{b.north}"
    params = {
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetMap",
        "LAYERS": layer, "STYLES": "", "SRS": "EPSG:4326",
        "BBOX": bbox, "WIDTH": "256", "HEIGHT": "256",
        "FORMAT": "image/png", "TRANSPARENT": "TRUE"
    }

    for attempt in range(3):
        try:
            r = requests.get(url, params=params, timeout=10)
            if r.status_code == 200:
                if r.headers.get('content-type') == 'image/png':
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    with open(path, 'wb') as f: f.write(r.content)
                    return result
                else:
                    raise Exception(f"Invalid Content-Type: {r.headers.get('content-type')}")
            elif r.status_code >= 500:
                time.sleep(1 + attempt)
                continue
            else:
                break
        except Exception as e:
            time.sleep(1 + attempt)
            if attempt == 2:
                result["status"] = "error"
                result["error"] = str(e)
                return result

    result["status"] = "error"
    result["error"] = "Failed after retries"
    return result

# --- WORKER: WMTS ---
def fetch_wmts_tile(args):
    tile, out_dir, gdal_source_xml = args
    z, x, y = tile.z, tile.x, tile.y

    # Pfad zusammenbauen
    path = os.path.join(out_dir, str(z), str(x), f"{y}.png")
    path = os.path.normpath(path)

    result = {"path": path, "z": z, "x": x, "y": y, "status": "ok"}

    if os.path.exists(path) and os.path.getsize(path) > 0:
        return result

    os.makedirs(os.path.dirname(path), exist_ok=True)
    tile_bounds = mercantile.xy_bounds(tile)

    for attempt in range(3):
        try:
            # This does something please dont remove it!!! the ds = None as well!!!
            ds = gdal.Warp(
                path,
                gdal_source_xml,
                format='PNG',
                outputBounds=[tile_bounds.left, tile_bounds.bottom, tile_bounds.right, tile_bounds.top],
                outputBoundsSRS='EPSG:3857',
                width=256,
                height=256,
                resampleAlg=gdal.GRA_Bilinear,
                creationOptions=["WORLDFILE=NO"]
            )
            ds = None

            if os.path.exists(path) and os.path.getsize(path) > 0:
                if os.path.exists(path + ".aux.xml"):
                    try: os.remove(path + ".aux.xml")
                    except: pass
                return result
            else:
                raise Exception("Empty result")

        except Exception as e:
            if os.path.exists(path):
                try: os.remove(path)
                except: pass

            time.sleep((attempt + 1) + random.random())

            if attempt == 2:
                result["status"] = "error"
                result["error"] = str(e).replace("\n", " ")
                return result

    return result

# ------------------------------------------------------------------------------
# MAIN
# ------------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-u", "--url", required=True)
    parser.add_argument("-l", "--layer", required=True)
    parser.add_argument("-z", "--zoom", required=True)
    parser.add_argument("-o", "--output", default="./tiles_out")
    parser.add_argument("-t", "--threads", type=int, default=4)
    args = parser.parse_args()

    # --- HIER IST DIE ÄNDERUNG ---
    # Wir wandeln den Input Pfad sofort in einen absoluten Pfad um.
    # os.path.abspath löst "./" relativ zum Current Working Directory auf.
    absolute_output_dir = os.path.abspath(args.output)

    # Analyse
    stype, bounds, wmts_source = detect_service(args.url, args.layer)
    if not stype:
        emit_json({"status": "error", "error": "Service detection failed", "progress": 0.0})
        sys.exit(1)

    # Task Erstellung
    zoom_levels = parse_zoom(args.zoom)
    tasks = []

    for z in zoom_levels:
        tiles = list(mercantile.tiles(*bounds, zooms=z))
        for t in tiles:
            # Wir übergeben nun den ABSOLUTEN Pfad an die Worker
            if stype == "WMS":
                tasks.append((t, absolute_output_dir, args.url, args.layer))
            else:
                tasks.append((t, absolute_output_dir, wmts_source))

    total = len(tasks)
    if total == 0:
        emit_json({"event": "finish", "progress": 1.0 })
        sys.exit(0)

    # Start Event
    emit_json({"event": "start"})

    worker_func = fetch_wms_tile if stype == "WMS" else fetch_wmts_tile
    completed = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.threads) as executor:
        futures = [executor.submit(worker_func, task) for task in tasks]

        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            completed += 1

            evt = {
                "progress": round(completed / total, 4),
                "filename": res["path"], # Das ist jetzt z.B. C:\Users\User\Tiles\10\2\3.png
                "status": res["status"],
            }
            if "error" in res:
                evt["error_details"] = res["error"]

            emit_json(evt)

    emit_json({"event": "finish", "progress": 1.0})

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit_json({"status": "error", "error": str(e)})
        sys.exit(1)
