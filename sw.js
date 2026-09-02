/* 효진외국어학원 – 서비스워커
   화면 뼈대(HTML·아이콘 등)를 이 기계 안에 저장해 둬서,
   인터넷이 약하거나 끊겨도 페이지가 열리게 합니다.
   실제 자료(구글 스크립트 응답)는 저장하지 않고 그때그때 받아옵니다. */

var CACHE = 'hyojin-v2';
var ASSETS = [
  './',
  './index.html',
  './absence.html',
  './winter2027.html',
  './roster.html',
  './classes.json',
  './config.js',
  './logo.png',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './manifest.json'
];

/* 설치될 때: 위 목록을 미리 담아 둡니다 (하나쯤 실패해도 그냥 넘어감) */
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    })
  );
});

/* 새 버전이 켜질 때: 예전 버전 저장분은 비웁니다 */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 구글 스크립트 등 외부는 그대로 통과

  var isPage = req.mode === 'navigate'
            || url.pathname.endsWith('.html')
            || url.pathname.endsWith('classes.json');

  if (isPage) {
    /* 페이지와 반 목록: "인터넷 먼저, 안 되면 저장본" */
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match('./index.html');
        });
      })
    );
    return;
  }

  /* 그 밖(아이콘·로고 등): "저장본 먼저, 없으면 받아서 저장" */
  e.respondWith(
    caches.match(req).then(function (r) {
      return r || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      });
    })
  );
});
