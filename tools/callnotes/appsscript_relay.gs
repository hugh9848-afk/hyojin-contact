/**
 * 효진외국어학원 · 통화기록 중계기 (구글 앱스스크립트)
 *
 * 하는 일은 두 가지뿐입니다.
 *   · 맥미니가 보낸 통화기록을 구글드라이브 파일 하나에 모아 둡니다. (doPost)
 *   · 통화기록 화면(calls.html)이 달라고 하면 내어 줍니다.        (doGet)
 *
 * ── 처음 한 번만 하는 일 ────────────────────────────────
 *  1) script.google.com 에서 '새 프로젝트' → 이 글을 통째로 붙여넣습니다.
 *  2) 아래 TOKEN 을 길고 아무도 모르는 글자로 바꿉니다. (아래 예시를 그대로 써도 됩니다)
 *  3) 배포 → 새 배포 → 유형 '웹 앱'
 *       실행 사용자        : 나
 *       액세스 권한이 있는 사용자 : 모든 사용자
 *     → 배포하면 나오는 '웹 앱 URL' 을 복사합니다.
 *  4) 그 주소를
 *       · 맥미니 설정(~/.hyojin-callnotes/config.json)의 relay_url 에
 *       · 이 저장소 config.js 의 HYOJIN_CALLS_API 에
 *     각각 넣습니다. TOKEN 도 같은 값으로 맞춥니다.
 *
 * ※ 나중에 이 글을 고치면 '배포 관리 → 연필(수정)' 로 다시 배포하세요.
 *   '새 배포' 를 누르면 주소가 바뀌어 화면이 서버를 못 찾습니다.
 *
 * ※ 주소를 아는 사람은 TOKEN 이 있어야만 내용을 볼 수 있습니다.
 *   통화 내용이 담기니 주소와 TOKEN 을 아무 데나 올리지 마세요.
 */

var TOKEN = '여기를-길고-아무도-모르는-글자로-바꾸세요';

/* 기록을 담아 둘 드라이브 파일 이름 */
var FILE_NAME = '통화기록_data.json';

/* 이만큼만 보관합니다 (오래된 것부터 버립니다) */
var KEEP = 2000;


/* ── 화면이 기록을 달라고 할 때 ───────────────────────── */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.v !== TOKEN) return out({ ok: false, msg: '열쇠가 맞지 않습니다.' }, p.callback);

  var all = readAll();
  var limit = Math.min(parseInt(p.limit, 10) || 500, KEEP);
  var recs = all.slice(Math.max(0, all.length - limit));

  /* since=2026-09-01 처럼 주면 그 뒤 것만 보냅니다 */
  if (p.since) recs = recs.filter(function (r) { return String(r.at || '') >= p.since; });

  return out({ ok: true, stamp: nowStamp(), count: recs.length, records: recs }, p.callback);
}


/* ── 맥미니가 새 기록을 보낼 때 ───────────────────────── */
function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return out({ ok: false, msg: '읽을 수 없는 내용입니다.' });
  }
  if (body.token !== TOKEN) return out({ ok: false, msg: '열쇠가 맞지 않습니다.' });

  var incoming = body.records || [];
  if (!incoming.length) return out({ ok: true, added: 0 });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return out({ ok: false, msg: '다른 작업이 끝나기를 기다리다 시간이 지났습니다.' });
  }
  try {
    var all = readAll();
    var at = {};
    all.forEach(function (r, i) { at[r.id] = i; });

    var added = 0;
    incoming.forEach(function (r) {
      if (!r || !r.id) return;
      if (at[r.id] === undefined) { all.push(r); at[r.id] = all.length - 1; added++; }
      else { all[at[r.id]] = r; }
    });

    all.sort(function (a, b) { return String(a.at) < String(b.at) ? -1 : 1; });
    if (all.length > KEEP) all = all.slice(all.length - KEEP);
    writeAll(all);
    return out({ ok: true, added: added, total: all.length });
  } finally {
    lock.releaseLock();
  }
}


/* ── 드라이브 파일 읽고 쓰기 ──────────────────────────── */
function file_() {
  var it = DriveApp.getFilesByName(FILE_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFile(FILE_NAME, '[]', MimeType.PLAIN_TEXT);
}

function readAll() {
  try {
    var t = file_().getBlob().getDataAsString('UTF-8');
    var a = JSON.parse(t || '[]');
    return Array.isArray(a) ? a : [];
  } catch (err) {
    return [];
  }
}

function writeAll(all) {
  file_().setContent(JSON.stringify(all));
}


/* ── 되돌려 주기 (화면은 JSONP 로 받아 갑니다) ────────── */
function out(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function nowStamp() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
}


/* ── 잘 되는지 확인할 때 (편집기에서 직접 실행) ───────── */
function 시험삼아_한건_넣어보기() {
  var r = {
    id: 'auto-시험-' + Date.now(),
    source: 'auto', name: '시험', cls: '', phone: '', at: '2026-01-01T09:00',
    dir: '', tag: '기타', memo: '· 중계기가 잘 도는지 보는 기록입니다', text: '',
    star: false, todo: { on: false, text: '', due: '', done: false }
  };
  var all = readAll();
  all.push(r);
  writeAll(all);
  Logger.log('지금 담긴 기록 수: ' + all.length);
}
