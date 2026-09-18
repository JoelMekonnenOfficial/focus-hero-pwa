#!/usr/bin/env python3
"""Pack the StarMax deploy tree into the upload bundle.

Format (as used by the in-page uploader):
    [4-byte big-endian header length][header JSON][concatenated blob bytes]
  all gzipped.

    header = {"index": [[filename, blobkey], ...],
              "order": [blobkey, ...],        # concatenation order
              "lens":  [byte_length, ...]}    # parallel to "order"

blobkey is the sha256 of the file's bytes, so byte-identical files (the
icon pairs, and index.html's mirror when it has not diverged) share a single
blob. Cloudflare reuses assets by content hash anyway.

usage: python3 tools/mkbundle.py [tree] [out]
"""
import gzip, hashlib, json, os, struct, sys

TREE = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/starmax"
OUT  = sys.argv[2] if len(sys.argv) > 2 else "/mnt/user-data/outputs/fh-deploy-bundle.gz"

def main():
    names = sorted(n for n in os.listdir(TREE)
                   if os.path.isfile(os.path.join(TREE, n)) and not n.startswith("."))
    if not names:
        sys.exit(f"no files in {TREE}")

    index, order, lens, blobs, seen = [], [], [], [], {}
    for name in names:
        data = open(os.path.join(TREE, name), "rb").read()
        key = hashlib.sha256(data).hexdigest()[:32]
        if key not in seen:
            seen[key] = True
            order.append(key)
            lens.append(len(data))
            blobs.append(data)
        index.append(["/" + name, key])

    header = json.dumps({"index": index, "order": order, "lens": lens},
                        separators=(",", ":")).encode("utf-8")
    payload = struct.pack(">I", len(header)) + header + b"".join(blobs)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with gzip.open(OUT, "wb", compresslevel=9) as fh:
        fh.write(payload)

    # Read it back and prove every file round-trips byte-for-byte. A bundle that
    # only *looks* right is how a deploy gets "verified" while serving old bytes.
    with gzip.open(OUT, "rb") as fh:
        raw = fh.read()
    hlen = struct.unpack(">I", raw[:4])[0]
    head = json.loads(raw[4:4 + hlen])
    cursor = 4 + hlen
    by_key = {}
    for key, ln in zip(head["order"], head["lens"]):
        by_key[key] = raw[cursor:cursor + ln]
        cursor += ln
    assert cursor == len(raw), f"trailing bytes: {len(raw) - cursor}"
    for name, key in head["index"]:
        original = open(os.path.join(TREE, name.lstrip("/")), "rb").read()
        assert by_key[key] == original, f"round-trip mismatch: {name}"

    # ===== THE MIRROR IS NOT ALLOWED TO ROT =====
    # manifest.webmanifest used to point start_url at ./focus-hero.html, and
    # that file was a hand-made copy of index.html that nobody remembered to
    # update. So every iOS home-screen install launched a frozen build - 10.62.5
    # was still being served from it two days and four releases later - and no
    # amount of reinstalling, cache clearing or force-quitting could fix it,
    # because the server really was serving those bytes at that path. The device
    # was innocent every single time it was blamed.
    # start_url now points at "./", but the mirror still has to match, because
    # the old path is baked into every icon already on a home screen.
    mirror = os.path.join(TREE, "focus-hero.html")
    root = os.path.join(TREE, "index.html")
    if os.path.exists(mirror):
        if open(mirror, "rb").read() != open(root, "rb").read():
            sys.exit("focus-hero.html has drifted from index.html. Every installed "
                     "home-screen app launches that file; if it is stale they launch "
                     "a stale build forever. Run: cp index.html focus-hero.html")

    print(f"{OUT}")
    print(f"  files {len(index)}  unique blobs {len(order)}  "
          f"raw {len(payload):,}B  gz {os.path.getsize(OUT):,}B")
    print("  round-trip verified: every file matches the tree byte-for-byte")

    # THE PRECACHE LIST IS NOT THE FILE LIST.
    # sw.js's PRECACHE is what the worker caches, not what is deployed. A file
    # kept deliberately unreferenced -- an old icon left behind so cached
    # installs get the image instead of a 404 -- appears nowhere in it, so a
    # tree rebuilt FROM that list silently loses it and the deploy drops it.
    # That happened once. Print the orphans every build so they stay visible.
    try:
        sw = open(os.path.join(TREE, "sw.js"), encoding="utf-8").read()
        block = sw.split("const PRECACHE = [", 1)[1].split("];", 1)[0]
        cached = {n for n in __import__("re").findall(r'"\./([^"]*)"', block) if n}
        orphans = sorted(n for n in names if n not in cached
                         and n not in ("sw.js", "index.html"))
        print(f"  precache lists {len(cached)} assets; "
              f"{len(orphans)} deployed file(s) are intentionally unreferenced:")
        for n in orphans:
            print(f"    orphan  {n}  ({os.path.getsize(os.path.join(TREE, n)):,}B)")
    except Exception as e:
        print(f"  WARNING: could not cross-check against sw.js PRECACHE ({e})")

if __name__ == "__main__":
    main()
