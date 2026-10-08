"""Bounded rectangular layouts from explicit counts; no model-generated metrics.

Counts are authoritative user constraints, not suggestions to the model. Without
area counts, planning keeps the current building. A required reception *point*
does not imply an extra reception *room* when the user did not request one.
"""
import copy
import math
import re
from collections import Counter


AREA_TYPES = ("room", "bathroom", "lobby", "reception")
WORDS = dict(zip("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(), range(21)))
WORDS.update({"no": 0, "a": 1, "an": 1, "single": 1})
WORDS.update({"thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70,
              "eighty": 80, "ninety": 90, "hundred": 100, "thousand": 1000})
COUNT_PATTERN = re.compile(
    r"(?<![\w.])(?P<count>-?\d+(?:\.\d+)?|" + "|".join(WORDS) + r")\s+"
    r"(?:(?:small|large|simple|standard)\s+)*"
    r"(?P<kind>(?:(?:guest|hotel|bed)\s+)?rooms?|bedrooms?|bathrooms?|washrooms?|"
    r"lobbies|lobby|reception(?:\s+(?:rooms?|areas?))?|(?:wireless\s+)?gateways?)\b", re.I)


def explicit_counts(prompt):
    counts = {}
    for match in COUNT_PATTERN.finditer(prompt):
        # "Monitor all five rooms" refers to existing areas rather than replacing
        # them. "Design five rooms" and a plain count list request a new layout.
        prefix = prompt[:match.start()].lower()
        if re.search(r"\b(?:" + "|".join(k for k in WORDS if k not in ('a', 'an', 'no', 'single')) + r")[ -]+$", prefix):
            raise ValueError("Use digits for compound counts, for example 21 rooms")
        if re.search(r"\b(?:all|existing|current)\s*$", prefix):
            continue
        raw = match['count'].lower()
        if '.' in raw:
            raise ValueError("Requested area/gateway count must be a non-negative integer")
        number = WORDS[raw] if raw in WORDS else int(raw)
        kind = match['kind'].lower()
        key = ("gateways" if "gateway" in kind else "bathroom" if kind.startswith(("bath", "wash"))
               else "lobby" if kind.startswith("lobb") else "reception" if kind.startswith("reception") else "room")
        if number < 0:
            raise ValueError("Requested " + key + " count must be a non-negative integer")
        count = int(number)
        if key in counts and counts[key] != count:
            raise ValueError("Conflicting " + key + " counts; specify one count for each area type")
        counts[key] = count
    if "gateways" in counts and not 1 <= counts["gateways"] <= 2:
        raise ValueError("This single-floor MVP supports one or two gateways")
    if any(key in counts for key in AREA_TYPES):
        counts = {**dict.fromkeys(AREA_TYPES, 0), **counts}
        total = sum(counts[key] for key in AREA_TYPES)
        if not 1 <= total <= 32:
            raise ValueError("Request between 1 and 32 total areas for a generated layout")
    return counts


def actual_counts(layout):
    types = Counter(room["type"] for room in layout["rooms"])
    return {**{key: types[key] for key in AREA_TYPES}, "gateways": len(layout["gateways"])}


def verify_counts(layout, requested):
    actual = actual_counts(layout)
    if any(actual[key] != value for key, value in requested.items()):
        raise ValueError("Generated design does not match the requested area/gateway counts")
    return actual


def build_layout(layout, counts):
    """Use the existing floor/scale, replace areas and walls only for count lists.

    A 16-unit gap keeps editor areas separated. Generated areas are at least
    64x64 logical units to fit markers. Area outlines are visual boundaries;
    generated layouts start without physical attenuation walls.
    """
    candidate = copy.deepcopy(layout)
    if not any(key in counts for key in AREA_TYPES):
        return candidate
    total = sum(counts[key] for key in AREA_TYPES)
    width, height = layout['floor']['width'], layout['floor']['height']
    choices = []
    for columns in range(1, total + 1):
        rows = math.ceil(total / columns)
        w, h = (width - 16 * (columns + 1)) / columns, (height - 16 * (rows + 1)) / rows
        if w >= 64 and h >= 64:
            choices.append((abs(math.log(w / h)) + .1 * (columns * rows - total), columns, rows, w, h))
    if not choices:
        raise ValueError("Requested areas do not fit this floor with 64-unit minimum sizes and 16-unit gaps")
    _, columns, _, w, h = min(choices)
    rooms = []
    names = {"room": "Room", "bathroom": "Bathroom", "lobby": "Lobby", "reception": "Reception"}
    for kind in AREA_TYPES:
        for index in range(counts[kind]):
            slot = len(rooms)
            x, y = 16 + (slot % columns) * (w + 16), 16 + (slot // columns) * (h + 16)
            room_id = f"{kind}_{index + 1}"
            rooms.append({"id": room_id, "name": f"{names[kind]} {index + 1}", "type": kind,
                          "x": x, "y": y, "width": w, "height": h})
    candidate.update(rooms=rooms, walls=[], devices=[], gateways=[])
    reception_room = next((r for kind in ('reception', 'lobby', 'room', 'bathroom')
                           for r in rooms if r['type'] == kind), rooms[0])
    candidate['reception'] = {'id': layout['reception']['id'],
        'x': reception_room['x'] + min(reception_room['width'] * .75, reception_room['width'] - 24),
        'y': reception_room['y'] + reception_room['height'] / 2}
    return candidate
