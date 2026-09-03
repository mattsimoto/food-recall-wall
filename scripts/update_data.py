#!/usr/bin/env python3
import json
import os
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FDA_URL = 'https://api.fda.gov/food/enforcement.json?search=status:%22Ongoing%22&limit=1000'
FSIS_URL = 'https://www.fsis.usda.gov/fsis/api/recall/v/1'
MAP_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json'
DATA_DIR = Path(__file__).resolve().parents[1] / 'data'
RECALLS_FILE = DATA_DIR / 'recalls.json'
MAP_FILE = DATA_DIR / 'us-states.json'


def fetch_json(url, attempts=3, timeout=45):
    last_error = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    'Accept': 'application/json',
                    'User-Agent': 'FoodRecallWall/1.0 (+https://github.com/mattsimoto/food-recall-wall)'
                },
            )
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.load(response)
        except Exception as exc:
            last_error = exc
            if attempt < attempts - 1:
                time.sleep(2 ** attempt)
    raise last_error


def read_existing():
    if not RECALLS_FILE.exists():
        return {'fda': [], 'fsis': [], 'generated_at': None, 'source_status': {}}
    try:
        return json.loads(RECALLS_FILE.read_text(encoding='utf-8'))
    except Exception:
        return {'fda': [], 'fsis': [], 'generated_at': None, 'source_status': {}}


def normalize_fsis_payload(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ('results', 'data', 'items'):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    previous = read_existing()
    source_status = {}

    try:
        fda_payload = fetch_json(FDA_URL)
        fda_rows = fda_payload.get('results', []) if isinstance(fda_payload, dict) else []
        source_status['FDA'] = {'ok': True, 'records': len(fda_rows)}
    except Exception as exc:
        fda_rows = previous.get('fda', [])
        source_status['FDA'] = {'ok': False, 'records': len(fda_rows), 'error': str(exc)}

    try:
        fsis_payload = fetch_json(FSIS_URL)
        fsis_rows = normalize_fsis_payload(fsis_payload)
        source_status['USDA FSIS'] = {'ok': True, 'records': len(fsis_rows)}
    except Exception as exc:
        fsis_rows = previous.get('fsis', [])
        source_status['USDA FSIS'] = {'ok': False, 'records': len(fsis_rows), 'error': str(exc)}

    try:
        map_payload = fetch_json(MAP_URL)
        MAP_FILE.write_text(json.dumps(map_payload, separators=(',', ':')), encoding='utf-8')
        source_status['MAP'] = {'ok': True}
    except Exception as exc:
        source_status['MAP'] = {'ok': MAP_FILE.exists(), 'error': str(exc)}

    output = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'source_status': source_status,
        'fda': fda_rows,
        'fsis': fsis_rows,
    }
    RECALLS_FILE.write_text(json.dumps(output, separators=(',', ':')), encoding='utf-8')

    print(json.dumps({
        'generated_at': output['generated_at'],
        'fda': len(fda_rows),
        'fsis': len(fsis_rows),
        'map_local': MAP_FILE.exists(),
        'source_status': source_status,
    }, indent=2))

    if not fda_rows and not fsis_rows:
        raise SystemExit('No recall data available from either source or previous cache.')
    if not MAP_FILE.exists():
        raise SystemExit('No local map data available.')


if __name__ == '__main__':
    main()
