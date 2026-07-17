/* service-worker.js — 오프라인 캐싱 + 업데이트 관리
   전략:
   - 이동(navigation) 요청(HTML): network-first → 실패 시 캐시(index.html)
     → 항상 최신 화면을 우선 시도하고, 오프라인일 때만 캐시로 대체한다.
   - 그 외 정적 자산(css/js/json/png): stale-while-revalidate
     → 캐시가 있으면 즉시 응답해 빠르게 뜨고, 동시에 백그라운드에서
       네트워크로 최신 버전을 받아와 다음 로드를 위해 캐시를 갱신한다.
   - 새 서비스워커는 설치되어도 자동으로 활성화하지 않고 "대기" 상태로 머문다.
     사용자가 index.html의 업데이트 배너에서 "지금 업데이트"를 누르면
     SKIP_WAITING 메시지를 받아 즉시 활성화 + 페이지를 새로고침한다.
*/
const CACHE_VERSION = "vocab-app-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./data.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
    // 주의: 여기서 self.skipWaiting()을 호출하지 않는다.
    // 사용자가 업데이트 배너를 통해 동의할 때까지 새 워커는 "waiting" 상태로 대기한다.
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 페이지에서 "지금 업데이트" 버튼을 누르면 이 메시지를 받아 즉시 활성화한다.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = req.mode === "navigate" ||
    (req.method === "GET" && req.headers.get("accept") && req.headers.get("accept").includes("text/html"));

  if (isNavigation) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(req);
    return cached || caches.match("./index.html");
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  const networkFetch = fetch(req)
    .then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || networkFetch;
}
