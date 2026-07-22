import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const BUILD_ID = SOURCE.match(/const BUILD_ID\s*=\s*"([^"]+)"/)?.[1];
const CACHE_NAME = `focus-hero-${BUILD_ID}`;
const PRECACHE_SOURCE = SOURCE.match(/const PRECACHE\s*=\s*(\[[\s\S]*?\]);/)?.[1];
const PRECACHE = vm.runInNewContext(`(${PRECACHE_SOURCE})`);
const SCOPE = "https://focus.test/";

function cacheKey(input, ignoreSearch=false){
  const raw = typeof input === "string" ? input : input.url;
  const url = new URL(raw, SCOPE);
  if (ignoreSearch) url.search = "";
  return url.href;
}

function makeCacheStorage(){
  const stores = new Map();
  return {
    stores,
    async open(name){
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(request, response){ store.set(cacheKey(request), response.clone()); },
        async match(request, options={}){
          const wanted = cacheKey(request, !!options.ignoreSearch);
          for (const [key, response] of store){
            if (cacheKey(key, !!options.ignoreSearch) === wanted) return response.clone();
          }
          return undefined;
        }
      };
    },
    async keys(){ return Array.from(stores.keys()); },
    async delete(name){ return stores.delete(name); }
  };
}

function makeRuntime(fetchImpl){
  const listeners = new Map();
  const caches = makeCacheStorage();
  const calls = { skipWaiting:0, claim:0, messages:[] };
  const self = {
    registration:{ scope:SCOPE, showNotification(){} },
    location:new URL(SCOPE),
    clients:{
      async claim(){ calls.claim += 1; },
      async matchAll(){ return []; },
      async openWindow(){}
    },
    async skipWaiting(){ calls.skipWaiting += 1; },
    addEventListener(type, handler){
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    }
  };
  const context = {
    self, caches, fetch:fetchImpl, URL, Request, Response, Headers, Blob,
    console, setTimeout, clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename:"sw.js" });
  async function dispatch(type, data={}){
    let waited;
    let response;
    const event = Object.assign({}, data, {
      waitUntil(promise){ waited = Promise.resolve(promise); },
      respondWith(promise){ response = Promise.resolve(promise); }
    });
    for (const handler of listeners.get(type) || []) handler(event);
    if (waited) await waited;
    return response ? response : undefined;
  }
  return { caches, calls, dispatch };
}

function successfulAssetResponse(request){
  const url = new URL(typeof request === "string" ? request : request.url);
  const html = url.pathname === "/" || url.pathname.endsWith(".html");
  return new Response(html ? "<!doctype html><body>ok</body>" : "asset", {
    status:200,
    headers:{ "content-type":html ? "text/html; charset=utf-8" : "application/octet-stream" }
  });
}

test("every precache entry exists in the release tree", () => {
  assert.equal(PRECACHE.length, 19);
  for (const asset of PRECACHE){
    const relative = asset === "./" ? "index.html" : asset.replace(/^\.\//, "");
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, `missing ${asset}`);
  }
});

test("install publishes a complete cache before activating", async () => {
  const fetched = [];
  const runtime = makeRuntime(async request => {
    fetched.push(typeof request === "string" ? request : request.url);
    return successfulAssetResponse(request);
  });
  await runtime.dispatch("install");
  assert.equal(fetched.length, PRECACHE.length);
  assert.equal(runtime.caches.stores.get(CACHE_NAME)?.size, PRECACHE.length);
  assert.equal(runtime.calls.skipWaiting, 1);
});

test("failed install deletes only the incomplete new cache and preserves the old complete build", async () => {
  const runtime = makeRuntime(async request => {
    const url = typeof request === "string" ? request : request.url;
    if (url.endsWith("/progression-hub.js")) return new Response("missing", { status:503 });
    return successfulAssetResponse(request);
  });
  runtime.caches.stores.set("focus-hero-old-complete", new Map([[`${SCOPE}focus-hero.html`, new Response("old")]]));
  await assert.rejects(runtime.dispatch("install"), /Precache failed/);
  assert.equal(runtime.caches.stores.has(CACHE_NAME), false);
  assert.equal(runtime.caches.stores.has("focus-hero-old-complete"), true);
  assert.equal(runtime.calls.skipWaiting, 0);
});

test("activation removes only superseded Focus Hero caches", async () => {
  const runtime = makeRuntime(async request => successfulAssetResponse(request));
  runtime.caches.stores.set(CACHE_NAME, new Map());
  runtime.caches.stores.set("focus-hero-old", new Map());
  runtime.caches.stores.set("another-app-cache", new Map());
  await runtime.dispatch("activate");
  assert.equal(runtime.caches.stores.has(CACHE_NAME), true);
  assert.equal(runtime.caches.stores.has("focus-hero-old"), false);
  assert.equal(runtime.caches.stores.has("another-app-cache"), true);
  assert.equal(runtime.calls.claim, 1);
});

test("a server 5xx falls back to the last complete cached app shell", async () => {
  const runtime = makeRuntime(async () => new Response("server error", {
    status:503, headers:{"content-type":"text/html"}
  }));
  const cache = await runtime.caches.open(CACHE_NAME);
  await cache.put("./focus-hero.html", new Response(
    '<!doctype html><body>cached-safe<script src="./data-guard.js" defer></script></body>',
    { status:200, headers:{"content-type":"text/html"} }
  ));
  const responsePromise = await runtime.dispatch("fetch", {
    request:new Request(SCOPE, { headers:{ accept:"text/html" } })
  });
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.match(await response.text(), /cached-safe/);
});
