/**
 * 효진외국어학원 — 학생명단 자동 정리 (구글 앱스스크립트)
 * =========================================================
 *
 * 이 코드가 하는 일 (한 줄 요약):
 *   맥이 보내준 "학생 CSV"와 "강사별 강의정리" 시트를 읽어서,
 *   이미 만들어 둔 명단 시트들의 "내용만" 갈아끼웁니다.
 *   → 링크(주소)는 그대로라서 직원분들 링크가 안 깨져요.
 *
 * 만들어지는 것:
 *   1) 전체학생명단 파일
 *        · "전체학생명단" 시트 : 전교생 한 표 + 아래쪽에 집계표
 *        · 반별 시트 20여 개    : 반 하나당 탭 하나
 *   2) 선생님별 명단 파일 6개
 *        · 그 선생님이 맡은 반마다 탭 하나
 */

// ── 설정: 여기 ID들만 맞으면 됩니다 ─────────────────────────────
var CONFIG = {
  ROOT_FOLDER_ID: '1nDT_0y1mVay_GC1Ql3jJoWiJMsIBqRaT',      // 효진외국어학원 폴더
  ROSTER_FOLDER_ID: '1jl-aXW-ZmoX5_3EulfRy4hY6d_KOC3LL',    // 반별 명단 폴더
  TEACHER_SHEET_ID: '1ZLAvrk_oezaVc_sufnIPIsAQSWMrjstK2vo0KzWFdYM',  // 강사별 강의정리
  UNIFIED_SHEET_ID: '1je9HJUNklRKDaDbVReUalkHXtqbnDY6ltf4LujhyglI',  // 전체학생명단
  TEACHER_FILES: {
    '원장선생님':   '1zpf1hCl3QjKkE7tODMoPRJCYcip-KpVvx9T-mYuLTN4',
    '이성현선생님': '1U13abV1jDmcxTFE7i5Jhh_BXiRzTAA8rrXD5rE6Ep4E',
    '이주영선생님': '127TY5Vg4s4K9aMc8trhTfqZl5WH_uIC_5tLugWAgMEA',
    '김영옥선생님': '1Nh0TGYKiximyELn_qJBHEpKhFiQob6UJUWk1W7AX5Tg',
    '이화민선생님': '1iH7F6kSH9R61wIhz_kvnathZzUosAI6UAVVu8MO97Lw',
    '정일주선생님': '1bdcyKxj2cgjvL3pFPkVxJxMB_h3LpUq6o3UOBLfncmw'
  },
  // 열람용 비밀 주소값 → 누구 화면인지
  // (선생님마다 다른 값. 서버가 이 값을 보고 그 선생님 반 데이터만 만들어 보냅니다)
  VIEWER_TOKENS: {
    'k_4qP41Yclm_wpms729jyvpr': '원장선생님',
    'LVttzIYVJtBKm-u03YYgdv8R': '이성현선생님',
    'ffhVmhRHz740qRGRhIICD4OU': '이주영선생님',
    'ESdWpGp9vO6WQ-PThumua0IP': '김영옥선생님',
    'QrtSrGndmbRgTV6lfLbmm2eR': '이화민선생님',
    'v-zw73LWYk9i02ZyynbdiqXJ': '정일주선생님',
    'iY3a0uXyicUQgzLiO1OlWTV6': '__ADMIN__'
  },
  AUTO_FOLDER_NAME: '_자동화',
  CSV_NAME: 'students_latest.csv',
  WEBAPP_TOKEN: 'hyojin-wALWfOfA7IvK1kK0vX_OsuOdT0hxDlRz',

  // 출석부에서 X(결석)를 눌렀을 때 결석 확인 요청을 자동으로 보낼지
  //   'off'  : 보내지 않음 (지금 설정 — 명단 화면에서 이름을 눌러야 감)
  //   'ask'  : 확인창을 띄우고, 예를 누르면 보냄
  //   'auto' : 묻지 않고 바로 보냄
  // ※ 마음이 바뀌면 이 한 줄만 고치고 새 버전으로 배포하면 됩니다.
  ABSENCE_NOTIFY: 'off',

  // 수강료 납부 표시를 어느 달부터 보여줄지 ('yyyy-MM')
  //   그 전 달은 결제선생에 옛 기록이 안 남아 있어서
  //   "기록없음"이 많아 오히려 헷갈립니다. 그래서 9월부터 켭니다.
  PAY_SHOW_FROM: '2026-09'
};

// 언어 → 반이름 뒤에 붙는 한 글자 (괄호가 없을 때만 사용)
var LANG_SUFFIX = { '일본어': '일', '중국어': '중', '독일어': '독', '프랑스어': '프' };

var TZ = 'Asia/Seoul';
var MAIN_SHEET_NAME = '전체학생명단';

// 칸 너비를 직접 정해줍니다 (단위: 점).
// 자동 맞춤은 한글 폭 계산이 잘 안 맞아서 이름이 잘리는 일이 있어요.
//              순번 전공어 반이름 담당선생님 학생명 상태 학부모 학생
var W_UNIFIED = [73,  75,   90,    120,      95,   80,  135,   135];
//              순번 학생이름 상태 보호자 학생
var W_CLASS   = [55,  87,     80,  145,   145];
// ※ 집계표는 본 표와 같은 시트라서 칸 너비를 따로 지정하면 안 됩니다.
//   (칸 하나에 너비는 하나뿐이라 나중 설정이 앞 설정을 덮어써 버려요)
//   그래서 집계표는 너비가 맞는 칸(C~H)에 놓습니다.

var HEAD_BG = '#274e13';
var HEAD_FG = '#ffffff';


// ══════════════════════════════════════════════════════════════
//  메인
// ══════════════════════════════════════════════════════════════
function updateAllRosters() {
  var started = new Date();
  var stamp = Utilities.formatDate(started, TZ, 'yyyy-MM-dd HH:mm');
  var report = [];

  var students = readStudents_();
  report.push('학생 ' + students.length + '명');

  var teacherMap = readTeacherMap_();

  // 수강료 납부 기록을 함께 읽어 "등록 / 등록대기 / 미납"을 정합니다
  var payStore = readPayments_();
  var built = buildRecords_(students, teacherMap, payStore);
  if (built.unmatched.length > 0) {
    report.push('⚠️배정표에 없는 반: ' + built.unmatched.join(', '));
  }
  if (built.baseYm) {
    var sc0 = built.statusCount;
    report.push(built.baseYm + '분: 등록 ' + sc0['등록'] + ' / 등록대기 ' + sc0['등록대기']
                + ' / 미납 ' + sc0['미납']
                + (sc0['확인필요'] ? ' / 확인필요 ' + sc0['확인필요'] : '')
                + ' / 청구전 ' + sc0['']);
  }

  // 1) 전체학생명단 파일 (한 표 + 집계 + 반별 탭)
  writeUnifiedBook_(built, stamp);
  report.push('통합명단 갱신(' + built.records.length + '명, 반 '
              + Object.keys(built.allClasses).length + '개)');

  // 2) 선생님용 웹페이지가 읽어갈 데이터 저장
  writeRosterJson_(built, stamp);

  // 3) 선생님별 파일
  var names = Object.keys(built.perTeacher).sort();
  for (var i = 0; i < names.length; i++) {
    var n = writeTeacherBook_(names[i], built.perTeacher[names[i]], stamp);
    report.push(names[i] + ' ' + n + '명');
  }

  // 4) 출석부의 학생 줄 맞추기 (새 학생 추가 / 사라진 학생 퇴원 처리)
  try {
    var att = syncAttendanceRoster_(built, stamp, payStore);
    if (att.added || att.left || att.fixed || att.purged) {
      report.push('출석부(신규 ' + att.added + '명, 퇴원 ' + att.left
                  + '명, 입학일정정 ' + att.fixed + '건'
                  + (att.purged ? ', 미등원삭제 ' + att.purged + '명' : '') + ')');
    }
  } catch (attErr) {
    report.push('⚠️출석부 갱신 실패: ' + attErr.message);
  }

  var summary = stamp + ' | 정상 | ' + report.join(' / ');
  writeAutoFile_('sheet_update_status.txt', summary);
  Logger.log(summary);
  return summary;
}


// ══════════════════════════════════════════════════════════════
//  읽기
// ══════════════════════════════════════════════════════════════
function getAutoFolder_() {
  var root = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  var it = root.getFoldersByName(CONFIG.AUTO_FOLDER_NAME);
  return it.hasNext() ? it.next() : root.createFolder(CONFIG.AUTO_FOLDER_NAME);
}

function writeAutoFile_(name, text) {
  var folder = getAutoFolder_();
  var it = folder.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(text);
  else folder.createFile(name, text, MimeType.PLAIN_TEXT);
}

/**
 * students_latest.csv 를 읽어 학생 목록으로 바꿉니다.
 * 규칙: "보호자 연락처"가 있으면 그걸로 "대표 보호자 연락처"를 덮어씁니다.
 */
function readStudents_() {
  var folder = getAutoFolder_();
  var it = folder.getFilesByName(CONFIG.CSV_NAME);
  if (!it.hasNext()) {
    throw new Error(CONFIG.CSV_NAME + ' 파일이 _자동화 폴더에 없습니다. 맥에서 다운로드가 먼저 돌아야 해요.');
  }
  var rows = Utilities.parseCsv(it.next().getBlob().getDataAsString('UTF-8'));
  if (rows.length < 2) throw new Error('CSV에 학생 데이터가 없습니다.');

  var head = rows[0], idx = {};
  for (var c = 0; c < head.length; c++) idx[String(head[c]).trim()] = c;
  function pick(row, key) {
    return (idx[key] === undefined) ? '' : String(row[idx[key]] || '').trim();
  }

  var out = [];
  for (var r = 1; r < rows.length; r++) {
    var name = pick(rows[r], '학생 이름');
    if (!name) continue;
    var rep = pick(rows[r], '대표 보호자 연락처');
    var guardian = pick(rows[r], '보호자 연락처');
    out.push({
      name: name,
      classRaw: pick(rows[r], '클래스'),
      parentPhone: guardian ? guardian : rep,
      studentPhone: pick(rows[r], '학생 연락처'),
      joinDate: pick(rows[r], '학원 입학일'),  // 출석부에서 재원 기간 판단에 씁니다
      memo: pick(rows[r], '메모')              // "[납부] 2026-09 현장카드" 같은 손기록
    });
  }
  return out;
}

/**
 * "강사별 강의정리" 시트를 읽어 반이름 → [{teacher,day,time,room}, ...] 로 정리.
 * 표 모양: 1줄 언어 / 2줄 담당선생님 / 3줄부터 [반,요일,시간,강의실] 4줄씩 반복.
 */
function readTeacherMap_() {
  var sh = SpreadsheetApp.openById(CONFIG.TEACHER_SHEET_ID).getSheets()[0];
  var v = sh.getDataRange().getValues();
  if (v.length < 6) throw new Error('강사별 강의정리 표가 너무 짧습니다.');

  var langRow = v[0], teacherRow = v[1];
  var teachers = {}, lastLang = '';
  for (var c = 1; c < Math.max(langRow.length, teacherRow.length); c++) {
    var lang = String(langRow[c] || '').trim();
    if (lang) lastLang = lang;
    var t = String(teacherRow[c] || '').trim();
    if (t && t !== '담당선생님') teachers[c] = { name: t, lang: lastLang };
  }

  var map = {};
  for (var r = 2; r + 3 < v.length; r += 4) {
    if (String(v[r][1] || '').trim() !== '반') continue;
    var banRow = v[r], dayRow = v[r + 1], timeRow = v[r + 2], roomRow = v[r + 3];
    for (var colS in teachers) {
      var col = Number(colS);
      var banRaw = String(banRow[col] || '').trim();
      if (!banRaw) continue;
      // "경기1일(분반)" 처럼 꼬리표가 붙으면 떼어냅니다 (두 선생님이 나눠 맡는 반)
      var ban = banRaw.replace(/\([^)]*\)\s*$/, '').trim();
      if (!map[ban]) map[ban] = [];
      map[ban].push({
        teacher: teachers[col].name,
        day: String(dayRow[col] || '').trim(),
        time: String(timeRow[col] || '').trim(),
        room: String(roomRow[col] || '').trim()
      });
    }
  }
  return map;
}


// ══════════════════════════════════════════════════════════════
//  가공
// ══════════════════════════════════════════════════════════════
function classToAbbrev_(classRaw) {
  var s = String(classRaw || '').trim();

  // 결제선생에서 쉬는 반은 이름 앞에 "휴)" "폐)" 를 붙입니다.
  //   이걸 안 떼면 전공어가 "휴)중국어" 가 되어 아래 LANG_SUFFIX 표에서 못 찾습니다.
  //   그러면 "휴)중국어 성외1" 이 성외1중 이 아니라 **성외1** 로 잘못 읽혀서,
  //   배정표에 없는 반이 되고 그 반 학생 전원이 명단·출석부에서 사라집니다.
  //   (2026-08-26 확인. 성외1영중은 뒤에 (영중) 이 붙어 있어 우연히 무사했습니다)
  var 쉼 = /^(휴|폐)\)\s*/.test(s);
  if (쉼) s = s.replace(/^(휴|폐)\)\s*/, '');

  var m = s.match(/^(\S+)\s+([가-힣]+?)(\d+)(?:\(([^)]+)\))?$/);
  if (!m) return null;
  var suffix = m[4] ? m[4] : (LANG_SUFFIX[m[1]] || '');
  return { abbrev: m[2] + m[3] + suffix, lang: m[1], resting: 쉼 };
}

// ══════════════════════════════════════════════════════════════
//  등록 상태 ( 등록 / 등록대기 / 미납 )
// ══════════════════════════════════════════════════════════════
//
// 놀이공원 입장권에 비유하면 이렇습니다.
//   등록대기 : 표는 받아갔는데 아직 돈을 낸 적이 "한 번도" 없는 사람 → 신규
//   미납     : 예전엔 냈는데 이번 것만 아직 안 낸 사람             → 기존 학생
//   등록     : 이번 것까지 다 낸 사람                              → 정상
//   (빈칸)   : 아직 청구서가 안 나가서 판단할 수 없는 사람
//
// 왜 '등록대기'와 '미납'을 굳이 나누나요?
//   해야 할 일이 완전히 다르기 때문입니다.
//   등록대기 → 돈이 들어오는 순간 "개강안내문"을 보내야 합니다 (신규 학생)
//   미납     → 독촉 안내를 해야 합니다 (이미 다니는 학생)

var STATUS_STYLE = {
  '등록':     { fg: '#188038', bg: '#e6f4ea' },
  '미납':     { fg: '#c5221f', bg: '#fce8e6' },
  '등록대기': { fg: '#b06000', bg: '#fef3e0' },
  // 청구서가 파기·취소됐는데 메모에 납부 기록이 없는 경우.
  // 상품권·현장카드로 받으셨다면 결제선생 메모에 "[납부] 2026-09 현장카드" 를 적어주세요.
  '확인필요': { fg: '#8430ce', bg: '#f3e8fd' }
};

/**
 * 지금이 "몇 월분 청구 사이클"인지 정합니다.
 *
 * 방법: 모아둔 청구 기록 중 **가장 나중 달**을 봅니다.
 *   8월 말에 9월분 청구가 시작되면 9월 기록이 생기니까, 그때부터 기준월이 9월이 됩니다.
 *   아직 9월 청구서를 못 받은 반 학생은 9월 기록이 없어서 **빈칸**이 됩니다.
 *   ("아직 청구 안 함"과 "냈음"을 구별하려는 것입니다)
 */
function 기준월_구하기(store) {
  if (!store || !store.rows) return '';
  var 최대 = '';
  var keys = Object.keys(store.rows);
  for (var i = 0; i < keys.length; i++) {
    var ym = store.rows[keys[i]].ym || '';
    if (ym > 최대) 최대 = ym;
  }
  return 최대;
}

/**
 * 결제선생 "메모"에 손으로 적어둔 **대체결제 기록**을 읽습니다.
 *
 * 왜 필요한가요?
 *   성남사랑상품권이나 현장 신용카드로 받으면 결제선생 청구서는 파기·취소됩니다.
 *   돈은 분명히 받았는데 화면에는 '파기'로 남아요.
 *   그래서 메모에 적어두신 걸 읽어서 납부로 인정합니다.
 *
 * 적는 방법 — 평소 쓰시던 그대로 적으시면 됩니다.
 *
 *     8/10 성남사랑 홍길동**** 24만원
 *     8/25 현장카드결제
 *
 *   · 맨 앞에 **결제한 날짜**(월/일)를 적습니다
 *   · "성남사랑" 이나 "현장카드" 라는 말이 들어 있어야 합니다 (상품권·현장결제도 알아봅니다)
 *   · 뒤의 이름·금액은 자유롭게 쓰셔도 되고 안 쓰셔도 됩니다
 *   · 한 줄에 하나씩, 여러 줄 쌓아두면 그대로 기록으로 남습니다
 *
 * 어느 달 수강료로 볼까요?
 *   **청구서를 보낸 날 뒤에 결제했으면 그 청구서를 낸 것**으로 봅니다.
 *   9월분 청구서를 8/16에 보냈는데 메모가 "8/20 현장카드결제" 면 → 9월분을 낸 것.
 *   같은 메모라도 "8/10" 이면 청구서보다 먼저라 9월분이 아닙니다 (8월분이겠죠).
 *   청구 기록이 아예 없으면, 결제한 달이 기준월이거나 그 직전 달이면 인정합니다.
 */
var 대체결제_낱말 = ['성남사랑', '상품권', '현장카드', '현장결제'];

/** "2026년 08월 16일 오후 6:39" → "2026-08-16" */
function 발송일_뽑기(sent) {
  var m = String(sent || '').match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return '';
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

function 메모로_납부인정(memo, ym, sent) {
  if (!memo || !ym) return false;

  var 기준연 = parseInt(ym.substring(0, 4), 10);
  var 기준달 = parseInt(ym.substring(5, 7), 10);
  var 보낸날 = 발송일_뽑기(sent);

  var 줄들 = String(memo).split(/[\r\n;,]+/);
  for (var i = 0; i < 줄들.length; i++) {
    var 줄 = 줄들[i];

    // 예전에 쓰던 "[납부] 2026-09 ..." 표기도 계속 알아봅니다
    var 옛 = 줄.match(/\[납부\][^0-9]*(20\d{2})[-\/.](\d{1,2})/);
    if (옛 && parseInt(옛[1], 10) === 기준연 && parseInt(옛[2], 10) === 기준달) return true;

    // 대체결제를 뜻하는 말이 있는 줄만 봅니다
    var 해당 = false;
    for (var w = 0; w < 대체결제_낱말.length; w++) {
      if (줄.indexOf(대체결제_낱말[w]) >= 0) { 해당 = true; break; }
    }
    if (!해당) continue;

    // 날짜 찾기 — "8/10" "8.10" "8-10" 다 됩니다.
    //   줄 안의 날짜 같은 토막을 **전부** 훑어서 말이 되는 첫 번째 것을 씁니다.
    //   (예: "26. 3월 원비 …" 는 26월이 없으니 건너뛰고 다음 것을 봅니다)
    var 날짜찾기 = /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})/g;
    var d, 결제달 = 0, 결제일 = 0;
    while ((d = 날짜찾기.exec(줄)) !== null) {
      var mm = parseInt(d[1], 10), dd = parseInt(d[2], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) { 결제달 = mm; 결제일 = dd; break; }
    }
    if (!결제달) continue;

    // 연도는 기준월의 연도로 봅니다 (12월에 낸 1월분처럼 해가 넘어가면 한 해 앞)
    var 연 = (결제달 > 기준달 + 6) ? 기준연 - 1 : 기준연;
    var 결제날 = 연 + '-' + ('0' + 결제달).slice(-2) + '-' + ('0' + 결제일).slice(-2);

    if (보낸날) {
      if (결제날 >= 보낸날) return true;      // 청구서 보낸 뒤에 냈다 → 이번 것
    } else {
      var 직전 = 기준달 === 1 ? 12 : 기준달 - 1;
      if (결제달 === 기준달 || 결제달 === 직전) return true;
    }
  }
  return false;
}

/**
 * 학생 한 명의 등록 상태를 정합니다.
 *
 * 어느 달 것을 볼까요?
 *   "오늘이 몇 월인지"가 아니라 그 학생의 **가장 최근 청구 건**을 봅니다.
 *   8월 말에 9월분 청구서를 보내는 일이 많아서, 오늘 달로 찾으면
 *   9월 청구 건을 통째로 놓쳐버리거든요.
 *
 * 신규인지는 어떻게 아나요?  → **학원 입학일**로 봅니다.
 *   "낸 기록이 없으면 신규"라고 하면 안 됩니다. 납부기록을 모으기 시작한 게
 *   2026-08 부터라, 그 전부터 다니던 학생도 전부 신규로 보이거든요.
 *   (실제로 확인해 보니 1~5월 입학생 6명이 신규로 잘못 잡혔습니다)
 *
 * @param joinDate  학원 입학일 'yyyy-MM-dd'
 * @param newFrom   이 날짜 이후 입학이면 신규로 봄 (보통 이번 달 1일)
 * @param baseYm    지금 청구 중인 달 (기준월_구하기 의 결과)
 * @param memo      결제선생 학생정보의 메모란
 */
function enrollStatusOf_(store, name, phones, joinDate, newFrom, baseYm, memo) {
  // 입학한 지 얼마 안 됐나요?
  var 신규 = !!(joinDate && newFrom && joinDate >= newFrom);
  if (!store || !store.rows) return 신규 ? '등록대기' : '';

  // 전화 뒷 4자리 (동명이인 구분용)
  var digits = [];
  for (var p = 0; p < phones.length; p++) {
    var d = String(phones[p] || '').replace(/[^0-9]/g, '');
    if (d.length >= 4) digits.push(d.slice(-4));
  }

  var mine = [], keys = Object.keys(store.rows);
  for (var i = 0; i < keys.length; i++) {
    if (store.rows[keys[i]].name === name) mine.push(store.rows[keys[i]]);
  }
  if (!mine.length) {
    // 청구 기록이 아예 없음 — 메모만 보고 판단합니다
    if (메모로_납부인정(memo, baseYm, '')) return '등록';
    return 신규 ? '등록대기' : '';
  }

  // 이름이 같은 학생이 섞여 있으면 뒷 4자리가 맞는 것만 골라냅니다
  if (digits.length) {
    var picked = [];
    for (var q = 0; q < mine.length; q++) {
      if (mine[q].last4 && digits.indexOf(mine[q].last4) >= 0) picked.push(mine[q]);
    }
    if (picked.length) mine = picked;
  }

  // 한 번이라도 낸 적이 있나? (옛 기록까지 전부 살펴봅니다)
  var everPaid = false;
  for (var j = 0; j < mine.length; j++) {
    if (mine[j].status === '수납') { everPaid = true; break; }
  }
  // 한 번이라도 냈으면 신규가 아닙니다 (입학일이 최근이어도)
  if (everPaid) 신규 = false;

  // **기준월(지금 청구 중인 달)** 것만 봅니다.
  //   지난 달 것을 보면 안 됩니다. 8월분을 낸 학생이 9월 청구서를 아직 못 받았는데도
  //   '등록'으로 보여서, 9월 등록이 끝난 것처럼 오해하게 되거든요.
  //   (2026-08-25 원장님이 실제로 발견한 문제입니다)
  var latest = null;
  for (var k = 0; k < mine.length; k++) {
    if (baseYm && mine[k].ym !== baseYm) continue;
    // 같은 달에 여러 건이면 수납된 것을 우선합니다 (파기 후 재발행 같은 경우)
    if (!latest || (latest.status !== '수납' && mine[k].status === '수납')) {
      latest = mine[k];
    }
  }

  if (!latest) {                                   // 이번 달 청구서가 아직 안 나갔습니다
    if (메모로_납부인정(memo, baseYm, '')) return '등록';
    return 신규 ? '등록대기' : '';
  }

  if (latest.status === '수납') return '등록';

  // 청구서는 나갔는데 안 냈거나(미납), 파기·취소된 경우입니다.
  // 상품권·현장카드로 받으셨다면 메모에 적혀 있을 테니 그걸 봅니다.
  if (메모로_납부인정(memo, baseYm, latest.sent)) return '등록';

  // 파기·취소인데 메모도 없으면 사람이 확인해야 합니다
  if (latest.status !== '미납') return 신규 ? '등록대기' : '확인필요';

  return 신규 ? '등록대기' : '미납';
}

/** 상태 칸에 색을 입힙니다. */
function paintStatusCol_(sh, firstRow, col, statuses) {
  if (!statuses.length) return;
  var fg = [], bg = [];
  for (var i = 0; i < statuses.length; i++) {
    var st = STATUS_STYLE[statuses[i]];
    fg.push([st ? st.fg : '#999999']);
    bg.push([st ? st.bg : '#ffffff']);
  }
  sh.getRange(firstRow, col, statuses.length, 1)
    .setHorizontalAlignment('center').setFontWeight('bold')
    .setFontColors(fg).setBackgrounds(bg);
}


function buildRecords_(students, teacherMap, payStore) {
  var records = [], perTeacher = {}, allClasses = {}, unmatchedSet = {};

  // 이번 달 1일 — 이 날 이후에 입학한 학생을 "신규"로 봅니다
  var newFrom = Utilities.formatDate(new Date(), TZ, 'yyyy-MM') + '-01';
  // 지금 몇 월분을 청구하고 있는지
  var baseYm = 기준월_구하기(payStore);

  for (var i = 0; i < students.length; i++) {
    var s = students[i];
    var parsed = classToAbbrev_(s.classRaw);
    var entries = parsed ? teacherMap[parsed.abbrev] : null;
    if (!entries || entries.length === 0) { unmatchedSet[s.classRaw] = true; continue; }

    var names = entries.map(function (e) { return e.teacher; });
    var ab = parsed.abbrev;

    // 등록 상태를 학생 자료에 직접 붙여둡니다.
    // 이러면 반별 시트·선생님별 파일도 같은 값을 그대로 씁니다
    // (아래에서 같은 s 를 그대로 담아가기 때문이에요)
    // 쉬는 반이라고 상태를 따로 비우지 않습니다.
    //   그 달 청구서가 안 나가면 어차피 빈칸이 되고,
    //   휴강 표시를 미리 해두신 경우까지 상태가 지워지면 오히려 헷갈립니다.
    s.status = enrollStatusOf_(payStore, s.name, [s.parentPhone, s.studentPhone],
                               s.joinDate, newFrom, baseYm, s.memo);

    records.push({
      // 본 표는 칸이 좁아 T 표기를 씁니다 (제목줄은 그대로 "담당선생님")
      lang: parsed.lang, abbrev: ab, teachers: names.map(shortT_).join(', '),
      name: s.name, parentPhone: s.parentPhone, studentPhone: s.studentPhone,
      status: s.status
    });

    // 반별 모음 (전체학생명단 파일의 반별 탭에 씁니다)
    if (!allClasses[ab]) {
      allClasses[ab] = { day: entries[0].day, time: entries[0].time,
                         room: entries[0].room, teachers: names, lang: parsed.lang,
                         students: [] };
    }
    allClasses[ab].students.push(s);

    // 선생님별 모음 (반을 나눠 맡으면 두 선생님 모두에게 들어갑니다)
    for (var k = 0; k < entries.length; k++) {
      var e = entries[k];
      if (!perTeacher[e.teacher]) perTeacher[e.teacher] = {};
      if (!perTeacher[e.teacher][ab]) {
        perTeacher[e.teacher][ab] =
          { day: e.day, time: e.time, room: e.room, teachers: names, students: [] };
      }
      perTeacher[e.teacher][ab].students.push(s);
    }
  }

  records.sort(function (a, b) {
    if (a.abbrev !== b.abbrev) return a.abbrev < b.abbrev ? -1 : 1;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });

  // 상태별로 몇 명인지 세어 둡니다 (집계표·보고문에 씁니다)
  var statusCount = { '등록': 0, '등록대기': 0, '미납': 0, '확인필요': 0, '': 0 };
  for (var m = 0; m < records.length; m++) {
    var c = records[m].status || '';
    if (statusCount[c] === undefined) statusCount[c] = 0;
    statusCount[c]++;
  }

  return { records: records, perTeacher: perTeacher, allClasses: allClasses,
           unmatched: Object.keys(unmatchedSet), statusCount: statusCount,
           baseYm: baseYm };
}

/**
 * "이화민선생님" → "이화민T" 로 줄입니다.
 * 칸이 좁은 표(본 표·집계표)에서만 씁니다. 실제 이름 비교에는 쓰지 않아요.
 */
function shortT_(name) {
  return String(name || '').replace(/선생님$/, 'T');
}

function sortByName_(list) {
  return list.slice().sort(function (a, b) {
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });
}


// ══════════════════════════════════════════════════════════════
//  꾸미기 도구
// ══════════════════════════════════════════════════════════════
function clearBandings_(sheet) {
  var bs = sheet.getBandings();
  for (var i = 0; i < bs.length; i++) bs[i].remove();
}

/** 칸 너비를 직접 지정합니다 (자동 맞춤은 한글이 잘려서 안 씁니다). */
function setWidths_(sheet, firstCol, widths) {
  for (var i = 0; i < widths.length; i++) {
    sheet.setColumnWidth(firstCol + i, widths[i]);
  }
}

/**
 * 표처럼 보이게 꾸밉니다.
 *  제목줄 진초록+흰글씨 / 본문 줄무늬 / 테두리 / 제목줄 고정 / 정렬 화살표
 */
function styleAsTable_(sheet, headerRow, firstCol, lastCol, lastRow, addFilter, freeze) {
  if (lastRow < headerRow) return;
  var nCols = lastCol - firstCol + 1;
  var nRows = lastRow - headerRow + 1;

  sheet.getRange(headerRow, firstCol, 1, nCols)
       .setFontWeight('bold').setBackground(HEAD_BG).setFontColor(HEAD_FG)
       .setHorizontalAlignment('center').setVerticalAlignment('middle');

  if (nRows > 1) {
    sheet.getRange(headerRow + 1, firstCol, nRows - 1, nCols)
         .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  }

  sheet.getRange(headerRow, firstCol, nRows, nCols)
       .setBorder(true, true, true, true, true, true,
                  '#b7b7b7', SpreadsheetApp.BorderStyle.SOLID);

  if (addFilter && nRows > 1) {
    var f = sheet.getFilter();
    if (f) f.remove();
    sheet.getRange(headerRow, firstCol, nRows, nCols).createFilter();
  }
  if (freeze) sheet.setFrozenRows(headerRow);
}


// ══════════════════════════════════════════════════════════════
//  반별 시트 한 장 쓰기 (전체학생명단 파일 / 선생님별 파일 공용)
// ══════════════════════════════════════════════════════════════
/**
 * 반 하나의 명단을 시트 한 장에 씁니다.
 * showTeacher 가 true면 담당선생님도 같이 적어요 (전체학생명단 파일용).
 */
function writeClassSheet_(ss, abbrev, info, stamp, showTeacher) {
  var name = abbrev.substring(0, 31);       // 시트 이름은 31자 제한
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  clearBandings_(sh);
  var f0 = sh.getFilter(); if (f0) f0.remove();

  // 1줄: 반이름 / 요일·시간 / 강의실 (+ 담당선생님)
  sh.getRange(1, 2).setValue(abbrev);
  sh.getRange(1, 3).setValue((info.day + ' ' + info.time).trim());
  sh.getRange(1, 4).setValue(info.room);
  sh.getRange(1, 2, 1, 3).setFontWeight('bold');

  // '상태' 칸이 하나 늘어서 담당·업데이트 표시도 한 칸씩 밀렸습니다
  var stampCol = 7;
  if (showTeacher && info.teachers && info.teachers.length) {
    sh.getRange(1, 6).setValue('담당: ' + info.teachers.join(', '))
      .setFontWeight('bold').setFontColor('#274e13');
    sh.setColumnWidth(6, 190);
    stampCol = 8;
  }
  sh.getRange(1, stampCol).setValue('업데이트: ' + stamp)
    .setFontStyle('italic').setFontSize(9).setFontColor('#666666');

  // 2줄: 제목줄
  sh.getRange(2, 1, 1, 5).setValues([['순번', '학생 이름', '상태', '보호자', '학생']]);

  // 3줄부터: 학생들 (이름순)
  var list = sortByName_(info.students);
  if (list.length > 0) {
    var body = list.map(function (s, k) {
      return [k + 1, s.name, s.status || '', s.parentPhone, s.studentPhone];
    });
    sh.getRange(3, 1, body.length, 5).setValues(body);
  }

  styleAsTable_(sh, 2, 1, 5, 2 + list.length, false, true);
  setWidths_(sh, 1, W_CLASS);
  if (list.length > 0) {
    sh.getRange(3, 1, list.length, 1).setHorizontalAlignment('center');
    paintStatusCol_(sh, 3, 3, list.map(function (s) { return s.status || ''; }));
  }

  return list.length;
}

/** 필요 없어진 시트를 지웁니다 (구글은 시트가 0개면 안 되므로 최소 1장은 남김). */
function removeStaleSheets_(ss, keepNames) {
  var keep = {};
  for (var i = 0; i < keepNames.length; i++) keep[keepNames[i].substring(0, 31)] = true;
  var all = ss.getSheets();
  for (var j = 0; j < all.length; j++) {
    if (!keep[all[j].getName()] && ss.getSheets().length > 1) ss.deleteSheet(all[j]);
  }
}

/** 시트 탭 순서를 정해진 순서대로 맞춥니다. */
function orderSheets_(ss, orderedNames) {
  for (var i = 0; i < orderedNames.length; i++) {
    var sh = ss.getSheetByName(orderedNames[i].substring(0, 31));
    if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); }
  }
}


// ══════════════════════════════════════════════════════════════
//  전체학생명단 파일
// ══════════════════════════════════════════════════════════════
function writeUnifiedBook_(built, stamp) {
  var ss = SpreadsheetApp.openById(CONFIG.UNIFIED_SHEET_ID);

  // ── (1) 메인 시트: 전교생 한 표 + 아래 집계표 ──────────────
  var sh = ss.getSheetByName(MAIN_SHEET_NAME);
  if (!sh) sh = ss.getSheets()[0].setName(MAIN_SHEET_NAME);
  sh.clear();
  clearBandings_(sh);
  var f0 = sh.getFilter(); if (f0) f0.remove();

  var records = built.records;
  var headers = ['순번', '전공어', '반이름', '담당선생님', '학생명', '상태', '학부모', '학생'];
  var nCol = headers.length;

  sh.getRange(1, nCol).setValue('업데이트: ' + stamp)
    .setFontStyle('italic').setFontSize(9)
    .setFontColor('#666666').setHorizontalAlignment('right');

  sh.getRange(2, 1, 1, nCol).setValues([headers]);
  if (records.length > 0) {
    var body = records.map(function (r, i) {
      return [i + 1, r.lang, r.abbrev, r.teachers, r.name, r.status,
              r.parentPhone, r.studentPhone];
    });
    sh.getRange(3, 1, body.length, nCol).setValues(body);
  }
  var lastRow = 2 + records.length;
  styleAsTable_(sh, 2, 1, nCol, lastRow, true, true);
  setWidths_(sh, 1, W_UNIFIED);
  if (records.length > 0) {
    sh.getRange(3, 1, records.length, 1).setHorizontalAlignment('center');
    paintStatusCol_(sh, 3, 6, records.map(function (r) { return r.status; }));
  }

  writeSummary_(sh, built, lastRow + 2);

  // ── (2) 반별 시트들 ────────────────────────────────────────
  var abbrevs = Object.keys(built.allClasses).sort();
  for (var i = 0; i < abbrevs.length; i++) {
    writeClassSheet_(ss, abbrevs[i], built.allClasses[abbrevs[i]], stamp, true);
  }

  removeStaleSheets_(ss, [MAIN_SHEET_NAME].concat(abbrevs));
  orderSheets_(ss, [MAIN_SHEET_NAME].concat(abbrevs));
}

/**
 * 메인 시트 아래쪽에 집계표를 씁니다.
 *   맨 위: 전체 학생수
 *   왼쪽: 반별 학생수    오른쪽: 선생님별 학생수
 */
function writeSummary_(sh, built, startRow) {
  var abbrevs = Object.keys(built.allClasses).sort();
  var teachers = Object.keys(built.perTeacher).sort();
  var total = built.records.length;

  // ── 맨 위: 제목 + 전체 인원 ──────────────────────────────
  sh.getRange(startRow, 1).setValue('■ 집계')
    .setFontWeight('bold').setFontSize(13);
  sh.getRange(startRow, 4).setValue('전체 학생수')
    .setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange(startRow, 5).setValue(total + '명')
    .setFontWeight('bold').setFontSize(13).setFontColor('#274e13');

  // 등록 상태 한 줄 요약 — 오늘 챙겨야 할 사람이 몇 명인지 바로 보이게
  var sc = built.statusCount || { '등록': 0, '등록대기': 0, '미납': 0, '확인필요': 0, '': 0 };
  sh.getRange(startRow + 1, 3)
    .setValue('▸ ' + (built.baseYm || '?') + '분 수강료 기준')
    .setFontWeight('bold').setFontColor('#666666').setFontSize(10);
  sh.getRange(startRow + 1, 4).setValue('등록대기 / 미납 / 확인필요')
    .setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange(startRow + 1, 5)
    .setValue(sc['등록대기'] + ' / ' + sc['미납'] + ' / ' + sc['확인필요'] + '명')
    .setFontWeight('bold').setFontColor('#b06000');
  sh.getRange(startRow + 2, 3)
    .setValue('   (빈칸 ' + sc[''] + '명 = 아직 그 달 청구서가 안 나간 학생)')
    .setFontSize(9).setFontColor('#999999');

  // 두 표 모두 C~E 칸을 씁니다.
  // 본 표의 C(반이름 90) D(담당선생님 120) E(학생명 95) 너비가 집계표에도 맞아서
  // 너비를 새로 정할 필요가 없어요. (새로 정하면 본 표 너비가 망가집니다)

  // ── ① 반별 집계표 ───────────────────────────────────────
  var h1 = startRow + 2;
  sh.getRange(h1, 1).setValue('① 반별 집계표')
    .setFontWeight('bold').setFontColor('#274e13');
  sh.getRange(h1, 3, 1, 3).setValues([['반이름', '담당선생님', '학생수']]);

  var left = abbrevs.map(function (ab) {
    var c = built.allClasses[ab];
    return [ab, c.teachers.map(shortT_).join(', '), c.students.length];
  });
  if (left.length) sh.getRange(h1 + 1, 3, left.length, 3).setValues(left);

  var lSum = h1 + 1 + left.length;
  sh.getRange(lSum, 3).setValue('합계').setFontWeight('bold');
  sh.getRange(lSum, 5).setValue(total).setFontWeight('bold');
  styleAsTable_(sh, h1, 3, 5, lSum, false, false);
  sh.getRange(lSum, 3, 1, 3).setBackground('#e8f0e3');

  // ── ② 선생님별 집계표 (반별 집계표 아래) ──────────────────
  var h2 = lSum + 3;
  sh.getRange(h2, 1).setValue('② 선생님별 집계표')
    .setFontWeight('bold').setFontColor('#274e13');
  sh.getRange(h2, 3, 1, 3).setValues([['담당선생님', '담당 반 수', '학생수']]);

  var tTotal = 0;
  var right = teachers.map(function (t) {
    var cm = built.perTeacher[t];
    var ks = Object.keys(cm), n = 0;
    for (var i = 0; i < ks.length; i++) n += cm[ks[i]].students.length;
    tTotal += n;
    return [shortT_(t), ks.length, n];
  });
  if (right.length) sh.getRange(h2 + 1, 3, right.length, 3).setValues(right);

  var rSum = h2 + 1 + right.length;
  sh.getRange(rSum, 3).setValue('합계').setFontWeight('bold');
  sh.getRange(rSum, 5).setValue(tTotal).setFontWeight('bold');
  styleAsTable_(sh, h2, 3, 5, rSum, false, false);
  sh.getRange(rSum, 3, 1, 3).setBackground('#e8f0e3');

  // ── ③ 두 합계가 왜 다른지 설명 ───────────────────────────
  // (한 반을 두 선생님이 나눠 맡으면, 그 반 학생이 두 분 명단에 모두 들어갑니다)
  var shared = abbrevs.filter(function (ab) {
    return built.allClasses[ab].teachers.length > 1;
  });

  if (tTotal !== total) {
    var dupCount = 0;
    for (var i = 0; i < shared.length; i++) {
      dupCount += built.allClasses[shared[i]].students.length;
    }
    sh.getRange(rSum + 2, 3)
      .setValue('※ ②의 합계(' + tTotal + '명)가 전체 학생수(' + total + '명)보다 '
                + (tTotal - total) + '명 많습니다.')
      .setFontWeight('bold').setFontSize(10).setFontColor('#994400');
    sh.getRange(rSum + 3, 3)
      .setValue('   아래 반은 두 분이 함께 맡는 공동강의라, 그 반 학생이 두 선생님 명단에 '
                + '모두 들어가기 때문입니다. 오류가 아닙니다.')
      .setFontSize(9).setFontColor('#666666');
    for (var j = 0; j < shared.length; j++) {
      var sc = built.allClasses[shared[j]];
      sh.getRange(rSum + 4 + j, 3)
        .setValue('   · ' + shared[j] + ' (' + sc.students.length + '명) — '
                  + sc.teachers.map(shortT_).join(' + '))
        .setFontSize(9).setFontColor('#666666');
    }
  }
}


// ══════════════════════════════════════════════════════════════
//  선생님별 파일
// ══════════════════════════════════════════════════════════════
function writeTeacherBook_(teacherName, classMap, stamp) {
  var id = CONFIG.TEACHER_FILES[teacherName];
  var ss;

  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    // 배정표에 새 선생님이 생긴 경우 → 파일을 새로 만들어 드립니다
    ss = SpreadsheetApp.create(teacherName + ' 학생 명단');
    DriveApp.getFileById(ss.getId())
            .moveTo(DriveApp.getFolderById(CONFIG.ROSTER_FOLDER_ID));
    writeAutoFile_('새선생님_알림.txt',
      stamp + ' | 새 선생님 파일을 만들었습니다: ' + teacherName + ' → ' + ss.getUrl());
  }

  var abbrevs = Object.keys(classMap).sort();
  var total = 0;
  for (var i = 0; i < abbrevs.length; i++) {
    total += writeClassSheet_(ss, abbrevs[i], classMap[abbrevs[i]], stamp, false);
  }

  removeStaleSheets_(ss, abbrevs);
  orderSheets_(ss, abbrevs);
  return total;
}


// ══════════════════════════════════════════════════════════════
//  실행 통로
// ══════════════════════════════════════════════════════════════

/** 매일 자동 실행을 등록합니다 (한 번만 실행하면 됩니다). */
function setupDailyTrigger() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === 'updateAllRosters') ScriptApp.deleteTrigger(ts[i]);
  }
  ScriptApp.newTrigger('updateAllRosters')
           .timeBased().atHour(7).nearMinute(20).everyDays(1).create();
  return '매일 오전 7시 20분 자동 실행이 등록되었습니다.';
}

/**
 * 웹앱(POST): 맥이 학생 CSV를 인터넷으로 직접 보내올 때 받는 창구
 *
 * 왜 이렇게 하냐면 — 맥이 예약 실행(백그라운드)으로 돌 때는
 * 구글드라이브 동기화 폴더에 파일을 쓰지 못합니다(맥 보안 정책).
 * 그래서 폴더를 거치지 않고 인터넷으로 바로 보내면 구글이 받아서 저장합니다.
 */
function doPost(e) {
  try {
    var params = (e && e.parameter) || {};

    // ── 명령 쪽지 결과 (우편함) ──
    // 열쇠 이름이 ctoken 인 이유: 옛 버전이 배포돼 있을 때 이 요청이
    // "학생명단"으로 오해받아 명단을 덮어쓰는 사고를 막기 위해서입니다.
    if (params.kind === 'cmddone') {
      if (params.ctoken !== CONFIG.WEBAPP_TOKEN) {
        return ContentService.createTextOutput('거부: 토큰 불일치')
                             .setMimeType(ContentService.MimeType.TEXT);
      }
      var cbody = (e && e.postData && e.postData.contents) || '';
      return ContentService.createTextOutput('OK: ' + 우편함_결과받기(cbody))
                           .setMimeType(ContentService.MimeType.TEXT);
    }

    var token = params.token || '';
    if (token !== CONFIG.WEBAPP_TOKEN) {
      return ContentService.createTextOutput('거부: 토큰 불일치')
                           .setMimeType(ContentService.MimeType.TEXT);
    }
    var body = (e && e.postData && e.postData.contents) || '';
    if (body.length < 20) {
      return ContentService.createTextOutput('오류: 받은 내용이 비어 있습니다')
                           .setMimeType(ContentService.MimeType.TEXT);
    }

    // 무엇을 보내온 것인지 구분합니다.
    //   kind=pay  → 수강료 납부 현황 (JSON)
    //   그 외      → 학생 명단 (CSV)
    if (params.kind === 'pay') {
      var res = receivePayments(body);
      return ContentService.createTextOutput(
        'OK: 납부현황 ' + res.total + '건 보관 (새 ' + res.added + ', 갱신 ' + res.updated + ')')
        .setMimeType(ContentService.MimeType.TEXT);
    }

    writeAutoFile_(CONFIG.CSV_NAME, body);
    var msg = updateAllRosters();
    return ContentService.createTextOutput('OK: ' + msg)
                         .setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    try {
      writeAutoFile_('sheet_update_status.txt',
        Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') + ' | 실패 | ' + err.message);
    } catch (e2) {}
    return ContentService.createTextOutput('오류: ' + err.message)
                         .setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * 웹앱(GET) — 들어온 주소에 따라 두 가지 일을 합니다.
 *
 *   ?v=열람주소값   → 그 사람 반 명단 웹페이지를 보여줍니다 (선생님/실장님용)
 *   ?token=관리주소값 → 시트를 다시 정리합니다 (원장님 전용)
 *
 * 중요: 열람 주소값마다 볼 수 있는 반이 정해져 있고,
 *       못 보는 반 데이터는 페이지에 아예 담기지 않습니다.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.api) { return absApi(e); }
  if (e && e.parameter && e.parameter.p === 'absence') {
    return absParentPage();
  }
  var params = (e && e.parameter) || {};

  // ── (가) 선생님·실장님 열람 페이지 ──
  if (params.v) {
    var who = CONFIG.VIEWER_TOKENS[params.v];
    if (!who) {
      return HtmlService.createHtmlOutput(
        '<div style="font-family:-apple-system,sans-serif;padding:40px;text-align:center">'
        + '<h2>주소가 올바르지 않습니다</h2>'
        + '<p style="color:#666">받으신 링크를 다시 확인해 주세요.</p></div>')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    return renderRosterPage_(who, params.v);
  }

  // ── (나) 맥미니가 "새 명령 쪽지 있나요?" 하고 물어본 경우 ──
  // 열쇠 이름이 ctoken 인 이유는 doPost 의 설명과 같습니다 (옛 배포에서 오작동 방지).
  if (params.kind === 'cmd' && params.ctoken === CONFIG.WEBAPP_TOKEN) {
    try {
      return ContentService.createTextOutput(JSON.stringify(우편함_대기명령()))
                           .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ 명령들: [], 오류: err.message }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── (다) 시트 다시 정리 (원장님 전용) ──
  if (params.token === CONFIG.WEBAPP_TOKEN) {
    try {
      return ContentService.createTextOutput('OK: ' + updateAllRosters())
                           .setMimeType(ContentService.MimeType.TEXT);
    } catch (err) {
      return ContentService.createTextOutput('오류: ' + err.message)
                           .setMimeType(ContentService.MimeType.TEXT);
    }
  }

  return ContentService.createTextOutput('거부: 주소가 올바르지 않습니다')
                       .setMimeType(ContentService.MimeType.TEXT);
}

// ══════════════════════════════════════════════════════════════
//  선생님용 웹페이지
// ══════════════════════════════════════════════════════════════

var JSON_NAME = 'roster_data.json';

/** 웹페이지가 읽어갈 데이터를 파일 하나로 저장해 둡니다 (매번 시트를 뒤지면 느려요). */
function writeRosterJson_(built, stamp) {
  var classes = {};
  var abbrevs = Object.keys(built.allClasses);
  for (var i = 0; i < abbrevs.length; i++) {
    var ab = abbrevs[i], c = built.allClasses[ab];
    classes[ab] = {
      day: c.day, time: c.time, room: c.room, teachers: c.teachers,
      students: sortByName_(c.students).map(function (s) {
        return { n: s.name, p: s.parentPhone, s: s.studentPhone };
      })
    };
  }
  var perTeacher = {};
  var ts = Object.keys(built.perTeacher);
  for (var j = 0; j < ts.length; j++) {
    perTeacher[ts[j]] = Object.keys(built.perTeacher[ts[j]]).sort();
  }
  var txt = JSON.stringify({
    stamp: stamp, total: built.records.length,
    classes: classes, perTeacher: perTeacher
  });
  writeAutoFile_(JSON_NAME, txt);
  try { CacheService.getScriptCache().remove('rosterJson'); } catch (e) {}
}

function readRosterJson_() {
  // 6분 동안은 기억해 둔 걸 씁니다.
  // (칸을 누를 때마다 드라이브에서 파일을 새로 읽으면 매번 0.5초씩 더 걸려요)
  var cache = CacheService.getScriptCache();
  var hit = cache.get('rosterJson');
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* 깨졌으면 새로 읽습니다 */ }
  }
  var it = getAutoFolder_().getFilesByName(JSON_NAME);
  if (!it.hasNext()) return null;
  var txt = it.next().getBlob().getDataAsString('UTF-8');
  try { cache.put('rosterJson', txt, 360); } catch (e2) { /* 너무 크면 그냥 넘어갑니다 */ }
  return JSON.parse(txt);
}

/** HTML에 넣을 때 위험한 글자를 안전하게 바꿉니다. */
function esc_(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 선생님(또는 실장님) 한 사람용 페이지를 만듭니다.
 * 핵심: 그 사람이 볼 수 있는 반 데이터"만" 골라 담습니다.
 *       못 보는 반은 페이지에 아예 들어가지 않아요.
 */
function renderRosterPage_(who, vtoken) {
  var data = readRosterJson_();
  if (!data) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px">'
      + '아직 준비된 명단이 없습니다. 잠시 후 다시 열어주세요.</p>');
  }

  var isAdmin = (who === '__ADMIN__');
  var title = isAdmin ? '실장님 — 전체 반 목록' : who + ' 반 목록';

  // 볼 수 있는 반만 추립니다
  var visible = isAdmin ? Object.keys(data.classes).sort()
                        : (data.perTeacher[who] || []);

  var slim = {};
  var totalStudents = 0;
  for (var i = 0; i < visible.length; i++) {
    var ab = visible[i];
    if (!data.classes[ab]) continue;
    slim[ab] = data.classes[ab];
    totalStudents += data.classes[ab].students.length;
  }

  var payload = JSON.stringify({ classes: slim, order: visible, admin: isAdmin,
                                 v: vtoken || '' });

  var html = ''
  + '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">'
  + '<style>'
  + '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}'
  + 'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;'
  + 'background:#f5f6f4;color:#1c1c1c}'
  + '.wrap{max-width:640px;margin:0 auto;padding:16px}'
  + 'header{background:#274e13;color:#fff;padding:18px 16px;position:sticky;top:0;z-index:5}'
  + 'header .h{max-width:640px;margin:0 auto}'
  + 'header h1{margin:0;font-size:19px}'
  + 'header .sub{opacity:.85;font-size:12px;margin-top:4px}'
  + '.card{background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:10px;'
  + 'box-shadow:0 1px 3px rgba(0,0,0,.10);cursor:pointer;display:flex;'
  + 'align-items:center;justify-content:space-between;gap:10px}'
  + '.card:active{background:#eef2ea}'
  + '.cname{font-weight:700;font-size:17px}'
  + '.cmeta{font-size:12px;color:#666;margin-top:3px}'
  + '.cnt{background:#274e13;color:#fff;border-radius:999px;padding:4px 11px;'
  + 'font-size:13px;font-weight:700;white-space:nowrap}'
  + '.back{display:inline-block;margin-bottom:12px;color:#274e13;font-weight:700;'
  + 'cursor:pointer;font-size:15px}'
  + 'table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;'
  + 'overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.10)}'
  + 'th{background:#274e13;color:#fff;font-size:13px;padding:9px 6px;text-align:left}'
  + 'td{padding:9px 6px;border-top:1px solid #eee;font-size:14px;vertical-align:middle}'
  + 'tr:nth-child(even) td{background:#fafbfa}'
  + '.num{width:34px;text-align:center;color:#888;font-size:13px}'
  + '.nm{font-weight:600;white-space:nowrap}'
  + 'a.tel{color:#1155cc;text-decoration:none;white-space:nowrap}'
  + '.lbl{font-size:11px;color:#999;display:block}'
  + '.hint{font-size:12px;color:#888;margin:14px 2px}'
  + '.nm{color:#274e13;text-decoration:underline dotted;cursor:pointer}'
  + '#toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);'
  + 'background:#222;color:#fff;padding:12px 18px;border-radius:24px;font-size:14px;'
  + 'max-width:88%;text-align:center;opacity:0;transition:opacity .25s;'
  + 'pointer-events:none;z-index:20;box-shadow:0 3px 12px rgba(0,0,0,.3)}'
  + '#toast.on{opacity:1}'
  + '.tabs{display:flex;gap:8px;margin-bottom:12px}'
  + '.tab{flex:1;text-align:center;padding:9px;border-radius:9px;background:#fff;'
  + 'font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.08)}'
  + '.tab.sel{background:#274e13;color:#fff}'
  + '.mnav{display:flex;align-items:center;justify-content:space-between;'
  + 'background:#fff;border-radius:10px;padding:8px 10px;margin-bottom:10px;'
  + 'box-shadow:0 1px 2px rgba(0,0,0,.08)}'
  + '.mnav b{font-size:16px}'
  + '.mbtn{padding:6px 13px;border-radius:8px;background:#eef2ea;color:#274e13;'
  + 'font-weight:700;cursor:pointer;font-size:15px}'
  + '.att{width:100%;border-collapse:collapse;background:#fff;font-size:13px}'
  + '.att th{background:#274e13;color:#fff;padding:6px 2px;font-size:11px;'
  + 'text-align:center;cursor:pointer;white-space:nowrap}'
  + '.att th.nmcol{text-align:left;padding-left:8px;min-width:74px}'
  + '.att td{border:1px solid #e3e3e3;padding:7px 2px;text-align:center;'
  + 'font-weight:700;cursor:pointer;min-width:42px}'
  + '.att td.nmcell{text-align:left;padding-left:8px;font-weight:600;cursor:default;'
  + 'white-space:nowrap;background:#fafbfa}'
  + '.att td.lock{cursor:not-allowed}'
  + '.tblwrap{overflow-x:auto;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.1)}'
  + '.legend{font-size:11px;color:#777;margin:10px 2px;line-height:1.7}'
  + '.chip{display:inline-block;padding:1px 7px;border-radius:5px;margin-right:3px;'
  + 'font-weight:700;color:#333}'
  + '.paytag{display:block;font-size:10px;font-weight:700;margin-top:1px}'
  + '</style></head><body>'
  + '<header><div class="h"><h1 id="ttl">' + esc_(title) + '</h1>'
  + '<div class="sub">반 ' + visible.length + '개 · 학생 ' + totalStudents + '명 · 업데이트 '
  + esc_(data.stamp) + '</div></div></header>'
  + '<div class="wrap"><div id="app"></div></div><div id="toast"></div>'
  + '<script>var D=' + payload + ';'
  + 'function esc(t){return String(t==null?"":t).replace(/[&<>"]/g,function(c){'
  + 'return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}'
  + 'function tel(p){if(!p)return "-";var d=p.replace(/[^0-9]/g,"");'
  + 'return "<a class=\\"tel\\" href=\\"tel:"+d+"\\">"+esc(p)+"</a>"}'
  + 'function nav(v,ab,ym){try{history.pushState({v:v,ab:ab,ym:ym},"")}catch(e){}}'
  + 'window.addEventListener("popstate",function(e){var st=e.state||{v:"list"};'
  + 'if(st.v=="att")att(st.ab,st.ym,1);else if(st.v=="roster")detail(st.ab,1);else list(1)});'
  + 'function list(np){var h="";if(!np)nav("list");'
  + 'if(!D.order.length){h="<p class=hint>배정된 반이 없습니다.</p>"}'
  + 'for(var i=0;i<D.order.length;i++){var ab=D.order[i],c=D.classes[ab];if(!c)continue;'
  + 'var meta=[(c.day+" "+c.time).trim(),c.room];'
  + 'if(D.admin&&c.teachers&&c.teachers.length)meta.push(c.teachers.join(", "));'
  + 'h+="<div class=card onclick=\\"detail(\'"+ab+"\')\\">"'
  + '+"<div><div class=cname>"+esc(ab)+"</div><div class=cmeta>"'
  + '+esc(meta.filter(Boolean).join(" · "))+"</div></div>"'
  + '+"<div class=cnt>"+c.students.length+"명</div></div>"}'
  + 'h+="<p class=hint>반을 누르면 명단이 열립니다.<br>명단에서 <b>전화번호</b>를 누르면 전화가 걸리고, <b>학생 이름</b>을 누르면 실장님께 결석 확인 요청이 갑니다.</p>";'
  + 'document.getElementById("app").innerHTML=h;'
  + 'window.scrollTo(0,0)}'
  + 'function detail(ab,np){var c=D.classes[ab];if(!c)return;CUR=ab;VIEW="roster";'
  + 'if(!np)nav("roster",ab);'
  + 'var meta=[(c.day+" "+c.time).trim(),c.room];'
  + 'if(c.teachers&&c.teachers.length)meta.push(c.teachers.join(", "));'
  + 'var h="<div class=back onclick=\\"list()\\">‹ 반 목록으로</div>"+tabs("roster")'
  + '+"<div style=\\"margin-bottom:10px\\"><div class=cname style=\\"font-size:20px\\">"'
  + '+esc(ab)+" <span style=\\"font-size:14px;color:#666\\">"+c.students.length+"명</span></div>"'
  + '+"<div class=cmeta>"+esc(meta.filter(Boolean).join(" · "))+"</div></div>"'
  + '+"<table><tr><th class=num>#</th><th>이름</th><th>연락처</th></tr>";'
  + 'for(var i=0;i<c.students.length;i++){var s=c.students[i];'
  + 'h+="<tr><td class=num>"+(i+1)+"</td>"'
  + '+"<td class=nm onclick=\\"absent(\'"+ab+"\',\'"+s.n+"\')\\">"+esc(s.n)+"</td>"'
  + '+"<td><span class=lbl>학부모</span>"+tel(s.p)'
  + '+"<span class=lbl style=\\"margin-top:5px\\">학생</span>"+tel(s.s)+"</td></tr>"}'
  + 'h+="</table>";'
  + 'document.getElementById("app").innerHTML=h;window.scrollTo(0,0);'
  + 'prefetch(ab)}'
  + 'var CUR=null,YM=null,VIEW="list";'
  + 'var MC={"O":"#d9ead3","영상":"#cfe2f3","X":"#f4cccc","":"#fff"};'
  + 'var CYC=["O","영상","X"];'
  + 'function ym0(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")}'
  + 'function ymShift(ym,n){var y=+ym.split("-")[0],m=+ym.split("-")[1]+n;'
  + 'while(m<1){m+=12;y--}while(m>12){m-=12;y++}'
  + 'return y+"-"+String(m).padStart(2,"0")}'
  + 'function tabs(sel){return "<div class=tabs>"'
  + '+"<div class=\\"tab "+(sel=="roster"?"sel":"")+"\\" onclick=\\"detail(CUR)\\">명단</div>"'
  + '+"<div class=\\"tab "+(sel=="att"?"sel":"")+"\\" onclick=\\"att(CUR,YM||ym0())\\">출석부</div>"'
  + '+"</div>"}'
  + 'function att(ab,ym,np,fresh){CUR=ab;YM=ym;VIEW="att";'
  + 'if(!np)nav("att",ab,ym);'
  + 'if(!fresh&&ATT&&ATT.ok&&ATT.ab==ab&&ATT.ym==ym){drawAtt(ATT);return}'
  + 'document.getElementById("app").innerHTML=tabs("att")+"<p class=hint>불러오는 중...</p>";'
  + 'google.script.run.withSuccessHandler(drawAtt)'
  + '.withFailureHandler(function(e){toast("불러오기 실패: "+e.message)})'
  + '.loadMonth(D.v,ab,ym)}'
  + 'function drawAtt(r){'
  + 'if(!r||!r.ok){document.getElementById("app").innerHTML=tabs("att")'
  + '+"<p class=hint>"+esc((r&&r.msg)||"불러오지 못했습니다")+"</p>";return}'
  + 'ATT=r;var c=D.classes[CUR]||{};'
  + 'var meta=[((c.day||"")+" "+(c.time||"")).trim(),c.room||""];'
  + 'var h="<div class=back onclick=\\"list()\\">‹ 반 목록으로</div>"+tabs("att");'
  + 'h+="<div style=\\"margin-bottom:10px\\">"'
  + '+"<div class=cname style=\\"font-size:20px\\">"+esc(CUR)+"</div>"'
  + '+"<div class=cmeta>"+esc(meta.filter(Boolean).join(" · "))+"</div></div>";'
  + 'h+="<div class=mnav><div class=mbtn onclick=\\"att(CUR,\'"+ymShift(r.ym,-1)+"\')\\">‹ 이전</div>"'
  + '+"<b>"+r.ym.replace("-","년 ")+"월</b>"'
  + '+"<div class=mbtn onclick=\\"att(CUR,\'"+ymShift(r.ym,1)+"\')\\">다음 ›</div></div>";'
  + 'if(!r.dates.length){h+="<p class=hint>이 달에는 수업일이 없습니다.</p>";'
  + 'document.getElementById("app").innerHTML=h;return}'
  + 'if(!r.students.length){h+="<p class=hint>이 달에 재원 중인 학생이 없습니다.</p>";'
  + 'document.getElementById("app").innerHTML=h;return}'
  + 'h+="<div class=tblwrap><table class=att><tr><th class=nmcol>이름</th>";'
  + 'for(var i=0;i<r.dates.length;i++){var ds=r.dates[i],dd=ds.slice(8);'
  + 'h+="<th onclick=\\"dmenu(\'"+ds+"\')\\">"+(+dd)+"일"+(r.holidays[ds]?"<br>휴강":"")+"</th>"}'
  + 'h+="</tr>";'
  + 'for(var s=0;s<r.students.length;s++){var st=r.students[s];'
  + 'h+="<tr><td class=nmcell>"+esc(st.n)+payBadge(st.pay)+"</td>";'
  + 'for(var d=0;d<st.marks.length;d++){var mk=st.marks[d];'
  + 'var hol=!!r.holidays[mk.d];'
  + 'var editable=r.isAdmin||mk.d==r.today||mk.d==r.yday;'
  + 'var lock=mk.out||(hol&&!r.isAdmin)||!editable;'
  + 'var bg=mk.out?"#efefef":(hol?"#d9d9d9":(MC[mk.m]||"#fff"));'
  + 'h+="<td class=\\""+(lock?"lock":"")+"\\" style=\\"background:"+bg+"\\""'
  + '+(lock?"":" onclick=\\"cyc(\'"+mk.d+"\',\'"+st.n+"\')\\"")+">"'
  + '+(mk.out?"":esc(mk.m))+"</td>"}'
  + 'h+="</tr>"}'
  + 'h+="</table></div>";'
  + 'h+="<div class=legend>칸을 누를 때마다 <b>출석 O → 영상 → 결석 X</b> 순서로 바뀝니다.<br>"'
  + '+"<span class=chip style=\'background:#d9ead3\'>O</span>출석 "'
  + '+"<span class=chip style=\'background:#cfe2f3\'>영상</span>영상수업 "'
  + '+"<span class=chip style=\'background:#f4cccc\'>X</span>결석 "'
  + '+"<span class=chip style=\'background:#d9d9d9\'>&nbsp;&nbsp;</span>휴강 "'
  + '+"<span class=chip style=\'background:#efefef\'>&nbsp;&nbsp;</span>재원기간 밖<br>"'
  + '+(r.hasPay?"이름 아래 <b style=\'color:#188038\'>납부</b>/<b style=\'color:#c5221f\'>미납</b> 은 그 달 수강료 상태입니다.<br>":"")'
  + '+"날짜(맨 윗줄)를 누르면 <b>일괄 출석</b>"+(r.isAdmin?" · <b>휴강 설정</b>":"")+" 을 할 수 있습니다."'
  + '+(r.isAdmin?"":"<br>선생님은 <b>오늘과 어제</b> 날짜를 고칠 수 있습니다. (다음 날 기록해도 됩니다)")+"</div>";'
  + 'document.getElementById("app").innerHTML=h;window.scrollTo(0,0)}'
  + 'function payBadge(p){if(!p)return "";'
  + 'var m={"수납":["#188038","납부"],"미납":["#c5221f","미납"],'
  + '"취소":["#999","취소"],"파기":["#999","파기"]};'
  + 'var v=m[p.st];if(!v)return "";'
  + 'return "<span class=paytag style=\\"color:"+v[0]+"\\" title=\\""'
  + '+esc(p.amt||"")+"\\">"+v[1]+"</span>"}'
  + 'function cyc(ds,nm){'
  + 'var st=null;for(var i=0;i<ATT.students.length;i++)if(ATT.students[i].n==nm)st=ATT.students[i];'
  + 'if(!st)return;var mi=-1,cur="";'
  + 'for(var d=0;d<st.marks.length;d++)if(st.marks[d].d==ds){mi=d;cur=st.marks[d].m}'
  + 'if(mi<0)return;'
  + 'var nx=CYC[(CYC.indexOf(cur)+1)%CYC.length];'
  + 'st.marks[mi].m=nx;drawAtt(ATT);'
  + 'PEND++;'
  + 'google.script.run.withSuccessHandler(function(r){PEND--;'
  + 'if(!r||!r.ok){st.marks[mi].m=cur;drawAtt(ATT);'
  + 'toast("\\u26a0\\ufe0f "+((r&&r.msg)||"저장 실패"))}'
  + 'else if(PEND===0)toast("\\u2705 저장됨")})'
  + '.withFailureHandler(function(e){PEND--;st.marks[mi].m=cur;drawAtt(ATT);'
  + 'toast("\\u26a0\\ufe0f 저장 실패: "+e.message)})'
  + '.saveMark(D.v,CUR,ds,nm,nx)}'
  + 'function dmenu(ds){'
  + 'var hol=!!ATT.holidays[ds];'
  + 'if(ATT.isAdmin){'
  + 'if(confirm(ds+"\\n\\n확인 = 빈칸 모두 출석\\n취소 = 휴강 "+(hol?"해제":"설정"))){bulk(ds)}'
  + 'else{if(confirm(ds+" 을(를) 휴강 "+(hol?"해제":"설정")+"할까요?"))hol2(ds,!hol)}'
  + '}else{if(confirm(ds+"\\n빈칸을 모두 출석으로 표시할까요?"))bulk(ds)}}'
  + 'function bulk(ds){busy=true;toast("처리 중...");'
  + 'google.script.run.withSuccessHandler(function(r){busy=false;'
  + 'toast(r&&r.ok?("\\u2705 "+r.msg):("\\u26a0\\ufe0f "+((r&&r.msg)||"실패")));'
  + 'if(r&&r.ok)att(CUR,YM,1,1)})'
  + '.withFailureHandler(function(e){busy=false;toast("실패: "+e.message)})'
  + '.bulkPresent(D.v,CUR,ds)}'
  + 'function hol2(ds,on){busy=true;toast("처리 중...");'
  + 'google.script.run.withSuccessHandler(function(r){busy=false;'
  + 'toast(r&&r.ok?(on?"\\u2705 휴강으로 설정했습니다":"\\u2705 휴강을 해제했습니다")'
  + ':("\\u26a0\\ufe0f "+((r&&r.msg)||"실패")));if(r&&r.ok)att(CUR,YM,1,1)})'
  + '.withFailureHandler(function(e){busy=false;toast("실패: "+e.message)})'
  + '.setHoliday(D.v,CUR,ds,on)}'
  + 'var ATT=null,PEND=0,PRE=null;'
  + 'function prefetch(ab){var ym=YM||ym0();'
  + 'if(ATT&&ATT.ok&&ATT.ab==ab&&ATT.ym==ym)return;'
  + 'if(PRE&&PRE.ab==ab&&PRE.ym==ym)return;'
  + 'PRE={ab:ab,ym:ym};'
  + 'google.script.run.withSuccessHandler(function(r){PRE=null;'
  + 'if(r&&r.ok&&r.ab==ab&&r.ym==ym&&VIEW!="att")ATT=r})'
  + '.withFailureHandler(function(){PRE=null})'
  + '.loadMonth(D.v,ab,ym)}'
  + 'var busy=false;'
  + 'function toast(m){var t=document.getElementById("toast");t.textContent=m;'
  + 't.className="on";setTimeout(function(){t.className=""},3200)}'
  + 'function absent(ab,nm){if(busy)return;'
  + 'if(!confirm(ab+" "+nm+" 학생의\\n결석 확인 요청을 실장님께 보낼까요?"))return;'
  + 'busy=true;toast("보내는 중...");'
  + 'google.script.run'
  + '.withSuccessHandler(function(r){busy=false;toast(r&&r.ok?("\\u2705 "+r.msg):("\\u26a0\\ufe0f "+((r&&r.msg)||"실패")))})'
  + '.withFailureHandler(function(e){busy=false;toast("\\u26a0\\ufe0f 전송 실패: "+e.message)})'
  + '.reportAbsence(D.v,ab,nm)}'
  + 'try{history.replaceState({v:"list"},"")}catch(e){}'
  + 'list(1);'
  + '<\/script></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('효진외국어학원 명단')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


/**
 * 결석 확인 요청 — 선생님이 학생 이름을 눌렀을 때 서버가 하는 일
 *
 * 보안: 화면에서 보내온 주소값을 다시 확인해서,
 *       "그 선생님이 진짜 맡은 반의 학생"일 때만 보냅니다.
 *       (화면 쪽 검사만 믿으면 남의 반 학생도 신고할 수 있게 되니까요)
 */
function reportAbsence(v, ab, studentName) {
  var who = CONFIG.VIEWER_TOKENS[v];
  if (!who) return { ok: false, msg: '주소가 올바르지 않습니다.' };

  var data = readRosterJson_();
  if (!data) return { ok: false, msg: '명단 데이터가 아직 없습니다.' };

  var allowed = (who === '__ADMIN__')
    ? Object.keys(data.classes)
    : (data.perTeacher[who] || []);
  if (allowed.indexOf(ab) < 0) {
    return { ok: false, msg: '이 반에 대한 권한이 없습니다.' };
  }

  var c = data.classes[ab];
  var st = null;
  for (var i = 0; i < c.students.length; i++) {
    if (c.students[i].n === studentName) { st = c.students[i]; break; }
  }
  if (!st) return { ok: false, msg: '학생을 찾지 못했습니다.' };

  var body = ab + ' ' + st.n + ' 학생이 출석하지 않았습니다.\n'
           + '학부모님께 결석 확인 요청 전화 부탁드립니다.\n\n'
           + '(' + ab + ' ' + st.n + ' 학부모 ' + (st.p || '-')
           + ', 학생 ' + (st.s || '-') + ')';

  var stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  var sender = (who === '__ADMIN__') ? '실장님' : who;

  // (1) 실장님께 메일로 전달
  try {
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      '[결석확인 요청] ' + ab + ' ' + st.n,
      body + '\n\n───\n요청: ' + sender + '\n시각: ' + stamp);
  } catch (err) {
    return { ok: false, msg: '전달 실패: ' + err.message };
  }

  // (2) 기록으로도 남깁니다 (나중에 카톡 연동을 붙일 때 이 큐를 씁니다)
  try {
    var f = getAutoFolder_().getFilesByName('결석요청큐.txt');
    var prev = f.hasNext() ? f.next().getBlob().getDataAsString('UTF-8') : '';
    writeAutoFile_('결석요청큐.txt',
      prev + stamp + ' | ' + sender + ' | ' + ab + ' | ' + st.n
           + ' | 학부모 ' + (st.p || '-') + ' | 학생 ' + (st.s || '-') + '\n');
  } catch (e2) { /* 기록 실패는 넘어갑니다 */ }

  return { ok: true, msg: st.n + ' 학생 결석 확인 요청을 보냈습니다.' };
}


// ══════════════════════════════════════════════════════════════
//  출석부
// ══════════════════════════════════════════════════════════════
//
// 저장 방식 (구글시트 "효진외국어학원_출석부" 파일, 반마다 시트 한 장):
//
//   1줄:  반이름 | 요일시간 | 강의실 | (업데이트 시각)
//   2줄:  '휴강'  |        |        |        | E2부터 날짜별 'Y'(휴강)
//   3줄:  순번 | 학생이름 | 입학일 | 퇴원일 | E3부터 날짜들(yyyy-MM-dd)
//   4줄~: 학생별 기록
//
// 학생을 구별하는 열쇠는 "반 + 학생이름" 입니다.
//   (출결번호는 자매가 같이 쓰는 경우가 있어 못 씁니다 — 4032번 최정은·최지은)
//   같은 반 안에서는 이름이 겹치지 않는 것을 데이터로 확인했습니다.

var ATT_PROP_KEY = 'ATTENDANCE_BOOK_ID';
var ATT_FILE_NAME = '효진외국어학원_출석부';

var ATT_FIRST_DATE_COL = 5;   // E열부터 날짜
var ATT_HEADER_ROW = 3;       // 3줄이 제목줄(날짜가 들어있는 줄)
var ATT_HOLIDAY_ROW = 2;      // 2줄이 휴강 표시줄
var ATT_FIRST_STUDENT_ROW = 4;

// 표시 값 — 한 번 누를 때마다 이 순서로 돌아갑니다
var MARK_CYCLE = ['O', '영상', 'X'];

var MARK_COLOR = {
  'O':    '#d9ead3',   // 출석 — 연한 초록
  '영상': '#cfe2f3',   // 영상 — 연한 파랑
  'X':    '#f4cccc',   // 결석 — 연한 빨강
  '':     '#ffffff'    // 미체크
};
var HOLIDAY_COLOR = '#d9d9d9';   // 휴강 — 회색
var OUTSIDE_COLOR = '#efefef';   // 재원기간 밖 — 더 연한 회색

var DAY_INDEX = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };


/** 출석부 파일을 엽니다 (없으면 만들어서 ID를 기억해 둡니다). */
function getAttendanceBook_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(ATT_PROP_KEY);

  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* 지워졌으면 새로 만듭니다 */ }
  }
  var ss = SpreadsheetApp.create(ATT_FILE_NAME);
  DriveApp.getFileById(ss.getId())
          .moveTo(DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID));
  props.setProperty(ATT_PROP_KEY, ss.getId());
  return ss;
}

/** 출석부 파일 주소 (실장님께 알려줄 때 씁니다) */
function getAttendanceBookUrl() {
  return getAttendanceBook_().getUrl();
}

/** 반 시트를 가져옵니다 (없으면 만들고 기본 틀을 씌웁니다). */
function getClassAttSheet_(ss, abbrev, info) {
  var name = abbrev.substring(0, 31);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(ATT_HEADER_ROW, 1, 1, 4)
      .setValues([['순번', '학생이름', '입학일', '퇴원일']])
      .setFontWeight('bold').setBackground(HEAD_BG).setFontColor(HEAD_FG);
    sh.getRange(ATT_HOLIDAY_ROW, 1).setValue('휴강').setFontWeight('bold')
      .setFontColor('#666666');
    sh.setFrozenRows(ATT_HEADER_ROW);
    sh.setFrozenColumns(2);
    sh.setColumnWidth(1, 45);
    sh.setColumnWidth(2, 100);
    sh.setColumnWidth(3, 95);
    sh.setColumnWidth(4, 95);
  }
  if (info) {
    sh.getRange(1, 1).setValue(abbrev).setFontWeight('bold');
    sh.getRange(1, 2).setValue((info.day + ' ' + info.time).trim());
    sh.getRange(1, 3).setValue(info.room);
  }
  return sh;
}

/** 시트에서 "이름 → 줄번호" 표를 만듭니다. */
/**
 * 이미 통째로 읽어온 표(grid)에서 날짜 칸 위치를 뽑습니다.
 *
 * 왜 따로 만들었나요?
 *   구글시트는 **들여다볼 때마다** 시간이 걸립니다(한 번에 0.3초쯤).
 *   예전에는 같은 시트를 세 번 따로 읽었는데(날짜줄 / 학생이름줄 / 표 전체),
 *   표 전체를 한 번만 읽으면 나머지 둘은 그 안에서 그냥 꺼내 쓸 수 있습니다.
 */
function attDateColsFromGrid_(grid) {
  var map = {};
  if (!grid || grid.length < ATT_HEADER_ROW) return map;
  var 줄 = grid[ATT_HEADER_ROW - 1];
  for (var i = ATT_FIRST_DATE_COL - 1; i < 줄.length; i++) {
    var d = String(줄[i] || '').trim();
    if (d) map[d] = i + 1;
  }
  return map;
}

/** 이미 읽어온 표에서 "학생이름 → 몇 번째 줄"을 뽑습니다. */
function attStudentRowsFromGrid_(grid) {
  var map = {};
  if (!grid) return map;
  for (var r = ATT_FIRST_STUDENT_ROW - 1; r < grid.length; r++) {
    var nm = String((grid[r] || [])[1] || '').trim();
    if (nm) map[nm] = r + 1;
  }
  return map;
}

function attStudentRows_(sh) {
  var last = sh.getLastRow();
  var map = {};
  if (last < ATT_FIRST_STUDENT_ROW) return map;
  var n = last - ATT_FIRST_STUDENT_ROW + 1;
  var names = sh.getRange(ATT_FIRST_STUDENT_ROW, 2, n, 1).getValues();
  for (var i = 0; i < n; i++) {
    var nm = String(names[i][0] || '').trim();
    if (nm) map[nm] = ATT_FIRST_STUDENT_ROW + i;
  }
  return map;
}

/** 시트에서 "날짜 → 칸번호" 표를 만듭니다. */
function attDateCols_(sh) {
  var lastCol = sh.getLastColumn();
  var map = {};
  if (lastCol < ATT_FIRST_DATE_COL) return map;
  var n = lastCol - ATT_FIRST_DATE_COL + 1;
  var vals = sh.getRange(ATT_HEADER_ROW, ATT_FIRST_DATE_COL, 1, n).getDisplayValues()[0];
  for (var i = 0; i < n; i++) {
    var d = String(vals[i] || '').trim();
    if (d) map[d] = ATT_FIRST_DATE_COL + i;
  }
  return map;
}

/** 날짜 칸이 없으면 새로 만들어 줍니다 (항상 날짜순으로 정렬되게 뒤에 붙입니다). */
function ensureDateCol_(sh, dateStr) {
  var cols = attDateCols_(sh);
  if (cols[dateStr]) return cols[dateStr];

  var keys = Object.keys(cols).sort();
  var insertAt = ATT_FIRST_DATE_COL;
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] < dateStr) insertAt = cols[keys[i]] + 1;
  }
  sh.insertColumnBefore(insertAt);
  sh.setColumnWidth(insertAt, 52);
  sh.getRange(ATT_HEADER_ROW, insertAt).setValue(dateStr)
    .setFontWeight('bold').setBackground(HEAD_BG).setFontColor(HEAD_FG)
    .setHorizontalAlignment('center').setNumberFormat('@');
  return insertAt;
}


// ── 날짜 계산 ────────────────────────────────────────────────

/** 'yyyy-MM' 과 요일('토')로 그 달의 수업일들을 뽑습니다. */
function classDatesInMonth_(dayLabel, ym) {
  var out = [];
  var di = DAY_INDEX[String(dayLabel || '').trim()];
  if (di === undefined) return out;

  var y = Number(ym.split('-')[0]), m = Number(ym.split('-')[1]);
  var d = new Date(y, m - 1, 1);
  while (d.getMonth() === m - 1) {
    if (d.getDay() === di) {
      out.push(Utilities.formatDate(d, TZ, 'yyyy-MM-dd'));
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function todayStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}


// ── 매일 명단 갱신 때 함께 도는 부분 ─────────────────────────

/**
 * 결제선생 명단을 기준으로 출석부의 학생 줄을 맞춥니다.
 *   · 새로 등록된 학생 → 줄 추가 (입학일 기록)
 *   · 명단에서 사라진 학생 → 퇴원일 기록 (줄은 남겨둠, 과거 기록 보존)
 *   · 다시 돌아온 학생 → 퇴원일 지움
 */
/**
 * 이 학생이 **한 번도 등원하지 않고 사라진 사람**인지 봅니다.
 *
 * 두 가지 경우를 구별하려는 겁니다.
 *
 *   남지민 학생 — 5월부터 다니다가 8월에 그만둠
 *      → 출석부에 **남겨야** 합니다. 그동안의 출석 기록이 있으니까요.
 *
 *   문규원 학생 — 8월에 신규 접수했지만 끝내 수강료를 안 내서 등록 무산.
 *                 수업에 나온 적이 아예 없음
 *      → 출석부에서 **지웁니다.** 남겨둘 기록이 없고, 선생님만 헷갈립니다.
 *
 * 아래 네 가지를 **전부** 만족할 때만 지웁니다. 하나라도 아니면 남겨둡니다.
 *   1) 퇴원일이 적혀 있다
 *   2) 출석 표시(O·X·영상)가 하나도 없다   → 나온 적 없음
 *   3) 수납한 기록이 한 번도 없다          → 끝내 등록 안 됨 (실제 재원 0일)
 *   4) 입학일이 PAY_HISTORY_FROM 이후다    → 아래 설명
 *
 * 4번이 왜 필요한가요?
 *   "낸 적 없음"만으로 판단하면 **남지민 학생도 지워집니다.**
 *   우리가 납부 기록을 모으기 시작한 게 2026-08 이라, 5월부터 다니던 남지민 학생도
 *   기록상으로는 "낸 적 없음"으로 보이거든요. 실제로는 매달 내고 다녔는데요.
 *   그래서 **기록을 모으기 시작한 뒤에 입학한 학생만** 판단합니다.
 *   그 전에 입학한 학생은 우리가 알 수 없으니 그냥 남겨둡니다.
 *
 * 넷을 다 걸면 실수로 지우는 일이 거의 없습니다.
 *   예전 학생은 4번에서, 돈 낸 학생은 3번에서, 출석이 찍힌 학생은 2번에서 걸러집니다.
 */
// 이 날짜 이후 입학한 학생만 "낸 적 없음"을 믿을 수 있습니다
// (그 전 기록은 결제선생에 안 남아 있어서 우리가 못 봤습니다)
var PAY_HISTORY_FROM = '2026-08-01';

function 등원한적_없는_퇴원자인가(payStore, 이름, 입학일, 퇴원일, 출석표시들) {
  if (!퇴원일) return false;                       // 1) 퇴원 안 했으면 대상 아님

  for (var i = 0; i < 출석표시들.length; i++) {     // 2) 출석 표시가 하나라도 있으면 남김
    if (String(출석표시들[i] || '').trim()) return false;
  }

  if (payStore && payStore.rows) {                 // 3) 낸 적 있으면 남김
    var keys = Object.keys(payStore.rows);
    for (var k = 0; k < keys.length; k++) {
      var r = payStore.rows[keys[k]];
      if (r.name === 이름 && r.status === '수납') return false;
    }
  }

  // 4) 입학일을 모르거나, 납부 기록을 모으기 전에 입학했으면 판단하지 않습니다
  if (!입학일 || 입학일 < PAY_HISTORY_FROM) return false;

  return true;
}


function syncAttendanceRoster_(built, stamp, payStore) {
  var ss = getAttendanceBook_();
  var today = todayStr_();
  var abbrevs = Object.keys(built.allClasses).sort();

  // 파일을 처음 만들 때 딸려오는 빈 기본 시트를 치웁니다
  var blank = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) {
    ss.deleteSheet(blank);
  }
  var added = 0, left = 0, fixed = 0, 미등원삭제 = 0;

  for (var i = 0; i < abbrevs.length; i++) {
    var ab = abbrevs[i];
    var info = built.allClasses[ab];
    var sh = getClassAttSheet_(ss, ab, info);
    var rows = attStudentRows_(sh);

    // 지금 명단에 있는 학생들
    var current = {};
    var list = sortByName_(info.students);
    for (var k = 0; k < list.length; k++) {
      var s = list[k];
      current[s.name] = true;
      if (!rows[s.name]) {
        var r = sh.getLastRow() + 1;
        if (r < ATT_FIRST_STUDENT_ROW) r = ATT_FIRST_STUDENT_ROW;
        sh.getRange(r, 2).setValue(s.name);
        sh.getRange(r, 3).setValue(s.joinDate || today).setNumberFormat('@');
        rows[s.name] = r;
        added++;
      } else {
        var rr = rows[s.name];
        // 입학일을 결제선생 값과 계속 맞춥니다.
        // (결제선생에서 빈칸이던 입학일을 나중에 채우면 여기도 따라옵니다)
        if (s.joinDate) {
          var cur = String(sh.getRange(rr, 3).getDisplayValue() || '').trim();
          if (cur !== s.joinDate) {
            sh.getRange(rr, 3).setValue(s.joinDate).setNumberFormat('@');
            fixed++;
          }
        }
        // 돌아온 학생이면 퇴원일을 지웁니다
        if (String(sh.getRange(rr, 4).getValue() || '').trim()) {
          sh.getRange(rr, 4).clearContent();
        }
      }
    }

    // 명단에서 사라진 학생 → 퇴원 처리
    var names = Object.keys(rows);
    for (var j = 0; j < names.length; j++) {
      if (current[names[j]]) continue;
      var cell = sh.getRange(rows[names[j]], 4);
      if (!String(cell.getValue() || '').trim()) {
        cell.setValue(today).setNumberFormat('@');
        left++;
      }
    }

    // ── 한 번도 안 나온 채 사라진 학생 줄은 아예 지웁니다 ──────
    //   (아래에서부터 지워야 줄 번호가 안 밀립니다)
    var 끝줄 = sh.getLastRow(), 끝칸 = sh.getLastColumn();
    if (끝줄 >= ATT_FIRST_STUDENT_ROW) {
      var 개수 = 끝줄 - ATT_FIRST_STUDENT_ROW + 1;
      var 전체 = sh.getRange(ATT_FIRST_STUDENT_ROW, 1, 개수,
                             Math.max(끝칸, 4)).getDisplayValues();
      var 지울줄 = [];
      for (var d = 0; d < 개수; d++) {
        var 행 = 전체[d];
        var 이름d = String(행[1] || '').trim();
        if (!이름d) continue;
        var 출석칸 = 행.slice(4);      // 5번째 칸부터가 날짜별 출석 표시
        if (등원한적_없는_퇴원자인가(payStore, 이름d, String(행[2] || '').trim(),
                                     String(행[3] || '').trim(), 출석칸)) {
          지울줄.push(ATT_FIRST_STUDENT_ROW + d);
        }
      }
      for (var e = 지울줄.length - 1; e >= 0; e--) {
        sh.deleteRow(지울줄[e]);
        미등원삭제++;
      }
    }

    // 순번 다시 매기기
    var lastRow = sh.getLastRow();
    var 퇴원수 = 0;
    if (lastRow >= ATT_FIRST_STUDENT_ROW) {
      var cnt = lastRow - ATT_FIRST_STUDENT_ROW + 1;
      var nums = [];
      for (var q = 0; q < cnt; q++) nums.push([q + 1]);
      sh.getRange(ATT_FIRST_STUDENT_ROW, 1, cnt, 1).setValues(nums)
        .setHorizontalAlignment('center');

      // ── 퇴원한 학생 줄은 흐리게 + 취소선 ──────────────────
      //
      // 왜 줄을 아예 지우지 않나요?
      //   달 중간에 그만둔 학생의 그 달 출석 기록까지 사라지기 때문입니다.
      //   그래서 기록은 남기고, 대신 **한눈에 "그만둔 사람"으로 보이게** 합니다.
      //   (2026-08-25: 문규원 학생이 퇴원 처리됐는데도 다른 학생과 똑같이 보여
      //    "업데이트가 안 된 것 아니냐"는 오해가 있었습니다)
      var 퇴원값 = sh.getRange(ATT_FIRST_STUDENT_ROW, 4, cnt, 1).getDisplayValues();
      var 색 = [], 줄 = [];
      for (var z = 0; z < cnt; z++) {
        var 나감 = !!String(퇴원값[z][0] || '').trim();
        if (나감) 퇴원수++;
        var c = 나감 ? '#b7b7b7' : '#000000';
        var l = 나감 ? 'line-through' : 'none';
        색.push([c, c, c, c]);
        줄.push([l, l, l, l]);
      }
      var 정보칸 = sh.getRange(ATT_FIRST_STUDENT_ROW, 1, cnt, 4);
      정보칸.setFontColors(색);
      정보칸.setFontLines(줄);
    }

    // 제목줄 옆에 재원/퇴원 인원을 적어둡니다
    sh.getRange(1, 5).setValue(
      퇴원수 ? ('재원 ' + list.length + '명 · 퇴원 ' + 퇴원수 + '명')
             : ('재원 ' + list.length + '명'))
      .setFontSize(9).setFontColor(퇴원수 ? '#b06000' : '#666666');

    sh.getRange(1, 6).setValue('업데이트: ' + stamp)
      .setFontStyle('italic').setFontSize(9).setFontColor('#666666');
  }

  return { added: added, left: left, fixed: fixed, purged: 미등원삭제 };
}


// ── 화면에서 부르는 함수들 ───────────────────────────────────

/** 이 사람이 이 반을 볼 수 있는지 확인하고, 실장님인지 알려줍니다. */
function attCheck_(v, ab) {
  var who = CONFIG.VIEWER_TOKENS[v];
  if (!who) return { ok: false, msg: '주소가 올바르지 않습니다.' };
  var data = readRosterJson_();
  if (!data) return { ok: false, msg: '명단 데이터가 아직 없습니다.' };

  var isAdmin = (who === '__ADMIN__');
  var allowed = isAdmin ? Object.keys(data.classes) : (data.perTeacher[who] || []);
  if (allowed.indexOf(ab) < 0) return { ok: false, msg: '이 반에 대한 권한이 없습니다.' };

  return { ok: true, who: who, isAdmin: isAdmin, cls: data.classes[ab] };
}

/**
 * 그 날짜를 이 사람이 고칠 수 있는지
 *   실장님 : 언제든
 *   선생님 : 수업 당일 + 그 다음날까지 (하루 여유)
 */
/** 어제 날짜를 'yyyy-MM-dd' 로 돌려줍니다. */
function 어제날짜_() {
  var y = new Date();
  y.setDate(y.getDate() - 1);
  return Utilities.formatDate(y, TZ, 'yyyy-MM-dd');
}

function canEditDate_(isAdmin, dateStr) {
  if (isAdmin) return true;
  var today = todayStr_();
  if (dateStr === today) return true;
  // 어제 수업분을 오늘 기록하는 것도 허용합니다
  return dateStr === 어제날짜_();
}

/**
 * 한 달치 출석부를 화면에 보내줍니다.
 * ym: 'yyyy-MM'
 */
function loadMonth(v, ab, ym) {
  var chk = attCheck_(v, ab);
  if (!chk.ok) return chk;

  // 화면에 보여주기만 할 때는 **시트에 아무것도 쓰지 않습니다.**
  //   예전에는 열 때마다 1줄(반이름·시간·강의실)을 다시 써넣었는데,
  //   쓰기는 읽기보다 훨씬 느려서 페이지가 그만큼 늦게 떴습니다.
  //   그 1줄은 매일 새벽 명단 갱신 때 어차피 다시 채워집니다.
  var ss = getAttendanceBook_();
  var sh = getClassAttSheet_(ss, ab, null);
  var dates = classDatesInMonth_(chk.cls.day, ym);

  // 표를 **한 번만** 읽고, 날짜칸·학생줄은 그 안에서 꺼내 씁니다
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var grid = (lastRow >= ATT_FIRST_STUDENT_ROW && lastCol >= 1)
    ? sh.getRange(1, 1, lastRow, lastCol).getDisplayValues() : [];
  var dateCols = attDateColsFromGrid_(grid);
  var rows = attStudentRowsFromGrid_(grid);

  // 휴강 여부
  var holidays = {};
  for (var d0 = 0; d0 < dates.length; d0++) {
    var c0 = dateCols[dates[d0]];
    if (c0 && grid.length >= ATT_HOLIDAY_ROW) {
      var hv = String(grid[ATT_HOLIDAY_ROW - 1][c0 - 1] || '').trim();
      if (hv) holidays[dates[d0]] = true;
    }
  }

  var monthStart = ym + '-01';
  var monthEnd = ym + '-31';
  var students = [];
  var names = Object.keys(rows);

  // 그 달 수강료 납부 현황
  //   설정한 달(PAY_SHOW_FROM)보다 이전은 표시하지 않습니다.
  //   옛 달은 결제선생에 기록이 안 남아 있어 "기록없음"만 잔뜩 보이거든요.
  var showPay = !CONFIG.PAY_SHOW_FROM || ym >= CONFIG.PAY_SHOW_FROM;
  var payStore = showPay ? readPayments_() : null;
  var rosterCls = chk.cls || {};
  var phoneOf = {};
  if (rosterCls.students) {
    for (var pi = 0; pi < rosterCls.students.length; pi++) {
      var rs = rosterCls.students[pi];
      phoneOf[rs.n] = [rs.p, rs.s];
    }
  }

  for (var i = 0; i < names.length; i++) {
    var nm = names[i], r = rows[nm];
    var joined = String(grid[r - 1][2] || '').trim();
    var leftOn = String(grid[r - 1][3] || '').trim();

    // 이 달에 재원 기간이 하나도 안 걸치면 화면에서 숨깁니다
    if (joined && joined > monthEnd) continue;
    if (leftOn && leftOn < monthStart) continue;

    var marks = [];
    for (var d = 0; d < dates.length; d++) {
      var ds = dates[d], col = dateCols[ds];
      var val = (col && grid[r - 1]) ? String(grid[r - 1][col - 1] || '').trim() : '';
      var outside = (joined && ds < joined) || (leftOn && ds > leftOn);
      marks.push({ d: ds, m: val, out: outside });
    }
    var pay = payStore ? findPayment_(payStore, ym, nm, phoneOf[nm] || []) : null;
    students.push({
      n: nm, join: joined, left: leftOn, marks: marks,
      pay: pay ? { st: pay.status, amt: pay.amount } : null
    });
  }

  students.sort(function (a, b) { return a.n < b.n ? -1 : (a.n > b.n ? 1 : 0); });

  return {
    ok: true, ym: ym, ab: ab, isAdmin: chk.isAdmin,
    day: chk.cls.day, time: chk.cls.time, room: chk.cls.room,
    today: todayStr_(), yday: 어제날짜_(), dates: dates, holidays: holidays, students: students,
    hasPay: !!payStore
  };
}

/**
 * 칸 하나를 바꿉니다 (한 번 누를 때마다 O → 영상 → X → O).
 *
 * 속도 주의: 구글시트는 한 번 들여다볼 때마다 시간이 걸립니다.
 *   그래서 시트 전체를 "한 번에" 읽어와 메모리에서 확인하고,
 *   쓰기도 딱 필요한 만큼만 합니다. (예전엔 10번 왔다갔다 했어요)
 */
function saveMark(v, ab, dateStr, studentName, mark) {
  var chk = attCheck_(v, ab);
  if (!chk.ok) return chk;
  if (!canEditDate_(chk.isAdmin, dateStr)) {
    return { ok: false, msg: '선생님은 수업 당일과 다음날까지만 고칠 수 있습니다.' };
  }
  if (MARK_CYCLE.indexOf(mark) < 0 && mark !== '') {
    return { ok: false, msg: '알 수 없는 표시입니다.' };
  }

  var ss = getAttendanceBook_();
  var sh = getClassAttSheet_(ss, ab, null);   // null = 머리글을 다시 쓰지 않음(빠르게)

  // ① 시트를 한 번에 통째로 읽습니다
  var lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), ATT_FIRST_DATE_COL);
  var grid = sh.getRange(1, 1, Math.max(lastRow, ATT_FIRST_STUDENT_ROW), lastCol).getDisplayValues();

  // ② 학생 줄 찾기
  var r = -1;
  for (var i = ATT_FIRST_STUDENT_ROW - 1; i < grid.length; i++) {
    if (String(grid[i][1] || '').trim() === studentName) { r = i + 1; break; }
  }
  if (r < 0) return { ok: false, msg: '학생을 찾지 못했습니다.' };

  // ③ 재원 기간 확인
  var joined = String(grid[r - 1][2] || '').trim();
  var leftOn = String(grid[r - 1][3] || '').trim();
  if ((joined && dateStr < joined) || (leftOn && dateStr > leftOn)) {
    return { ok: false, msg: '재원 기간이 아닌 날짜입니다.' };
  }

  // ④ 날짜 칸 찾기 (없으면 만듭니다)
  var col = -1;
  for (var c = ATT_FIRST_DATE_COL - 1; c < lastCol; c++) {
    if (String(grid[ATT_HEADER_ROW - 1][c] || '').trim() === dateStr) { col = c + 1; break; }
  }
  if (col < 0) {
    col = ensureDateCol_(sh, dateStr);
  } else {
    // 휴강인 날은 실장님만 건드릴 수 있습니다
    var hv = String(grid[ATT_HOLIDAY_ROW - 1][col - 1] || '').trim();
    if (hv && !chk.isAdmin) return { ok: false, msg: '휴강인 날은 바꿀 수 없습니다.' };
  }

  // ⑤ 쓰기 (두 번만)
  var cell = sh.getRange(r, col);
  cell.setValue(mark).setHorizontalAlignment('center');
  cell.setBackground(MARK_COLOR[mark] || '#ffffff');

  return { ok: true, m: mark };
}

/** 빈칸만 모두 출석(O)으로 채웁니다. */
function bulkPresent(v, ab, dateStr) {
  var chk = attCheck_(v, ab);
  if (!chk.ok) return chk;
  if (!canEditDate_(chk.isAdmin, dateStr)) {
    return { ok: false, msg: '지난 날짜는 실장님만 고칠 수 있습니다.' };
  }

  var ss = getAttendanceBook_();
  var sh = getClassAttSheet_(ss, ab, null);   // null = 머리글을 다시 쓰지 않음(빠르게)

  // 표를 **한 번만** 읽습니다.
  //   예전에는 학생 한 명당 시트를 3번씩 들여다봤습니다(이미 표시됐나 / 입학일 / 퇴원일).
  //   20명이면 60번을 왔다갔다 해서 몇 초씩 걸렸어요.
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var grid = (lastRow >= ATT_FIRST_STUDENT_ROW && lastCol >= 1)
    ? sh.getRange(1, 1, lastRow, lastCol).getDisplayValues() : [];

  var cols = attDateColsFromGrid_(grid);
  if (cols[dateStr] && grid.length >= ATT_HOLIDAY_ROW) {
    var hv = String(grid[ATT_HOLIDAY_ROW - 1][cols[dateStr] - 1] || '').trim();
    if (hv) return { ok: false, msg: '휴강인 날은 일괄 처리할 수 없습니다.' };
  }

  var col = ensureDateCol_(sh, dateStr);
  var rows = attStudentRowsFromGrid_(grid);
  var names = Object.keys(rows);

  // 채울 줄을 먼저 모아두고, 마지막에 **한 번에** 씁니다
  var 채울줄 = [];
  for (var i = 0; i < names.length; i++) {
    var r = rows[names[i]];
    var 줄 = grid[r - 1] || [];
    if (String(줄[col - 1] || '').trim()) continue;      // 이미 표시된 건 그대로 둡니다

    var joined = String(줄[2] || '').trim();
    var leftOn = String(줄[3] || '').trim();
    if ((joined && dateStr < joined) || (leftOn && dateStr > leftOn)) continue;
    채울줄.push(r);
  }

  // 줄 번호가 이어지는 덩어리끼리 묶어서 씁니다 (왔다갔다 횟수를 줄이려고)
  채울줄.sort(function (a, b) { return a - b; });
  var i2 = 0;
  while (i2 < 채울줄.length) {
    var 시작 = 채울줄[i2], 끝 = 시작;
    while (i2 + 1 < 채울줄.length && 채울줄[i2 + 1] === 끝 + 1) { i2++; 끝 = 채울줄[i2]; }
    var 개수 = 끝 - 시작 + 1;
    var 값 = [];
    for (var k = 0; k < 개수; k++) 값.push(['O']);
    sh.getRange(시작, col, 개수, 1).setValues(값)
      .setHorizontalAlignment('center').setBackground(MARK_COLOR['O']);
    i2++;
  }

  return { ok: true, msg: 채울줄.length + '명을 출석으로 표시했습니다.',
           filled: 채울줄.length };
}

/** 휴강 설정/해제 — 실장님만 */
function setHoliday(v, ab, dateStr, on) {
  var chk = attCheck_(v, ab);
  if (!chk.ok) return chk;
  if (!chk.isAdmin) return { ok: false, msg: '휴강은 실장님만 설정할 수 있습니다.' };

  var ss = getAttendanceBook_();
  var sh = getClassAttSheet_(ss, ab, null);   // null = 머리글을 다시 쓰지 않음(빠르게)
  var col = ensureDateCol_(sh, dateStr);

  var lastRow = sh.getLastRow();
  var cnt = Math.max(0, lastRow - ATT_FIRST_STUDENT_ROW + 1);

  if (on) {
    sh.getRange(ATT_HOLIDAY_ROW, col).setValue('휴강')
      .setHorizontalAlignment('center').setFontSize(9).setFontColor('#666666');
    if (cnt > 0) {
      sh.getRange(ATT_FIRST_STUDENT_ROW, col, cnt, 1).setBackground(HOLIDAY_COLOR);
    }
  } else {
    sh.getRange(ATT_HOLIDAY_ROW, col).clearContent();
    if (cnt > 0) {
      // 휴강 해제 → 각 칸의 값에 맞는 색으로 되돌립니다
      var vals = sh.getRange(ATT_FIRST_STUDENT_ROW, col, cnt, 1).getDisplayValues();
      var bg = [];
      for (var i = 0; i < cnt; i++) {
        bg.push([MARK_COLOR[String(vals[i][0] || '').trim()] || '#ffffff']);
      }
      sh.getRange(ATT_FIRST_STUDENT_ROW, col, cnt, 1).setBackgrounds(bg);
    }
  }
  return { ok: true, on: !!on };
}


// ══════════════════════════════════════════════════════════════
//  수강료 납부 현황
// ══════════════════════════════════════════════════════════════
//
// 맥이 결제선생에서 긁어와 보내주면, 여기에 쌓아두고 출석부에 표시합니다.
// 쌓아두는 이유: 결제선생은 최근 것만 보여줘서, 지난 달 기록은
//               우리가 갖고 있지 않으면 사라집니다.

var PAY_JSON_NAME = 'payments.json';

/** 맥이 보내온 납부 현황을 기존 것과 합쳐 저장합니다. */
function mergePayments_(incoming) {
  var store = readPayments_() || { rows: {} };

  var added = 0, updated = 0;
  for (var i = 0; i < incoming.length; i++) {
    var r = incoming[i];
    if (!r || !r.name || !r.ym) continue;
    // 같은 청구서인지 가리는 이름표.
    //   발송일시를 꼭 넣어야 합니다. 한 학생에게 같은 달에 청구서를 두 장 보내는 일이
    //   실제로 있어요(파기하고 다시 보내는 경우). 발송일시를 빼면 뒤엣것이 앞엣것을
    //   덮어써서, 수납된 청구서가 파기된 청구서에 가려집니다.
    //   (2026-08-25 확인: 나윤서 학생이 수납 1건 + 파기 1건인데 파기만 남았습니다)
    var key = r.name + '|' + (r.last4 || '') + '|' + r.ym + '|' + (r.sent || '');
    if (store.rows[key]) updated++; else added++;
    store.rows[key] = {
      name: r.name, last4: r.last4 || '', ym: r.ym,
      status: r.status || '', amount: r.amount || '',
      sent: r.sent || '', paid: r.paid || ''
    };
  }

  writeAutoFile_(PAY_JSON_NAME, JSON.stringify(store));
  try { CacheService.getScriptCache().remove('paymentsJson'); } catch (e) {}
  return { added: added, updated: updated, total: Object.keys(store.rows).length };
}

function readPayments_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('paymentsJson');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var it = getAutoFolder_().getFilesByName(PAY_JSON_NAME);
  if (!it.hasNext()) return null;
  var txt = it.next().getBlob().getDataAsString('UTF-8');
  try { cache.put('paymentsJson', txt, 360); } catch (e2) {}
  try { return JSON.parse(txt); } catch (e3) { return null; }
}

/**
 * 그 달, 그 학생의 납부 상태를 찾습니다.
 *
 * 동명이인 처리:
 *   이름이 같은 학생이 두 반에 있을 수 있어요(박시연·이시연).
 *   그럴 땐 전화 뒷 4자리를 대조해서 진짜 그 학생 것만 고릅니다.
 */
function findPayment_(store, ym, name, phones) {
  if (!store || !store.rows) return null;

  var cands = [];
  var keys = Object.keys(store.rows);
  for (var i = 0; i < keys.length; i++) {
    var r = store.rows[keys[i]];
    if (r.ym === ym && r.name === name) cands.push(r);
  }
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];

  // 뒷 4자리로 골라냅니다
  for (var j = 0; j < cands.length; j++) {
    var l4 = cands[j].last4;
    if (!l4) continue;
    for (var k = 0; k < phones.length; k++) {
      var digits = String(phones[k] || '').replace(/[^0-9]/g, '');
      if (digits.length >= 4 && digits.slice(-4) === l4) return cands[j];
    }
  }
  return cands[0];   // 못 고르면 첫 번째 것
}

/** 웹앱(POST)에서 부르는 통로 — 맥이 납부 현황을 보내올 때 */
function receivePayments(jsonText) {
  var parsed = JSON.parse(jsonText);
  var list = parsed.payments || [];
  return mergePayments_(list);
}


// ══════════════════════════════════════════════════════════════
//  출석 기록 지우기 (시험 삼아 찍은 것 정리용)
// ══════════════════════════════════════════════════════════════
//
// 쓰는 법: 함수 목록에서 아래 `테스트출석_지우기` 를 골라 실행하면 됩니다.
//         (지울 반과 달은 그 함수 안에 적혀 있습니다)
//
// 지우는 것: 그 반, 그 달의 **출석 표시(O·영상·X)만** 지웁니다.
// 그대로 두는 것: 학생 줄, 입학일·퇴원일, 휴강 표시, 다른 달 기록

/**
 * 한 반의 특정 달 출석 표시를 지웁니다.
 * @param {string} abbrev  반이름 약어 (예: '경기1중')
 * @param {string} ym      'yyyy-MM' (예: '2026-08')
 */
function 출석표시_지우기(abbrev, ym) {
  var ss = getAttendanceBook_();
  var sh = ss.getSheetByName(String(abbrev).substring(0, 31));
  if (!sh) return '그런 이름의 반 시트가 없습니다: ' + abbrev;

  var cols = attDateCols_(sh);                 // 날짜 → 몇 번째 칸
  var 지울칸 = [];
  var keys = Object.keys(cols);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(ym) === 0) 지울칸.push(cols[keys[i]]);
  }
  if (!지울칸.length) return abbrev + ' ' + ym + ' : 지울 날짜 칸이 없습니다.';

  var 끝줄 = sh.getLastRow();
  if (끝줄 < ATT_FIRST_STUDENT_ROW) return abbrev + ' : 학생 줄이 없습니다.';
  var 줄수 = 끝줄 - ATT_FIRST_STUDENT_ROW + 1;

  var 지운개수 = 0;
  for (var c = 0; c < 지울칸.length; c++) {
    var rng = sh.getRange(ATT_FIRST_STUDENT_ROW, 지울칸[c], 줄수, 1);
    var 값 = rng.getDisplayValues();
    for (var r = 0; r < 값.length; r++) if (String(값[r][0] || '').trim()) 지운개수++;
    rng.clearContent();
  }
  var 결과 = abbrev + ' ' + ym + ' : 날짜 ' + 지울칸.length + '칸에서 출석표시 '
             + 지운개수 + '개를 지웠습니다.';
  Logger.log(결과);
  return 결과;
}

/** 일회용 — 경기1중 2026년 8월 시험 출석기록 지우기 (2026-08-26 요청) */
function 테스트출석_지우기() {
  return 출석표시_지우기('경기1중', '2026-08');
}


// ══════════════════════════════════════════════════════════════
//  일회용 — 반을 두 선생님이 나눠 맡도록 바꾸기
// ══════════════════════════════════════════════════════════════
//
// 왜 필요한가요?
//   "강사별 강의정리" 시트에서 한 반이 한 선생님 칸에만 적혀 있으면,
//   그 선생님 명단에만 학생이 들어갑니다.
//   두 분이 나눠 맡으면 두 칸 모두에 같은 반을 적어야 해요.
//   (같은 교실에서 시간만 나눠 맡는 경우도 마찬가지입니다.
//    학생은 두 선생님 수업을 다 듣게 되니까요)
//
// 쓰는 법: 함수 목록에서 골라 한 번만 실행하면 됩니다.
//         두 번 실행해도 안전합니다(이미 되어 있으면 그냥 넘어감).

/** 과천1일을 원장선생님도 함께 맡도록 바꿉니다 (2026-08-30~). */
function applyGwacheon1IlSplit() {
  return shareClassWithTeacher_('과천1일', '원장선생님');
}

/**
 * className 반을 targetTeacher 칸에도 똑같이 적어 넣습니다.
 *   · 반 이름이 있는 줄을 찾아, 그 아래 요일/시간/강의실까지 함께 복사합니다.
 *   · 대상 선생님 칸이 이미 차 있으면 건드리지 않고 알려줍니다.
 */
function shareClassWithTeacher_(className, targetTeacher) {
  var sh = SpreadsheetApp.openById(CONFIG.TEACHER_SHEET_ID).getSheets()[0];
  var v = sh.getDataRange().getValues();

  // ① 선생님 칸 번호 찾기 (2줄에 이름들이 있습니다)
  var teacherRow = -1;
  for (var r = 0; r < Math.min(v.length, 6); r++) {
    for (var c = 0; c < v[r].length; c++) {
      if (String(v[r][c] || '').trim() === '담당선생님') { teacherRow = r; break; }
    }
    if (teacherRow >= 0) break;
  }
  if (teacherRow < 0) return '실패: "담당선생님" 줄을 찾지 못했습니다.';

  var targetCol = -1;
  for (var c2 = 0; c2 < v[teacherRow].length; c2++) {
    if (String(v[teacherRow][c2] || '').trim() === targetTeacher) { targetCol = c2; break; }
  }
  if (targetCol < 0) return '실패: "' + targetTeacher + '" 칸을 찾지 못했습니다.';

  // ② 그 반이 적힌 자리 찾기 ("과천1일(A)" 처럼 꼬리표가 붙어 있어도 찾습니다)
  var srcRow = -1, srcCol = -1;
  for (var r2 = teacherRow + 1; r2 < v.length; r2++) {
    if (String(v[r2][1] || '').trim() !== '반') continue;
    for (var c3 = 2; c3 < v[r2].length; c3++) {
      var raw = String(v[r2][c3] || '').trim();
      if (!raw) continue;
      if (raw.replace(/\([^)]*\)\s*$/, '').trim() === className) {
        srcRow = r2; srcCol = c3; break;
      }
    }
    if (srcRow >= 0) break;
  }
  if (srcRow < 0) return '실패: "' + className + '" 반을 찾지 못했습니다.';

  // ③ 이미 되어 있으면 그냥 끝냅니다
  var already = String(v[srcRow][targetCol] || '').trim();
  if (already) {
    if (already.replace(/\([^)]*\)\s*$/, '').trim() === className) {
      return '이미 되어 있습니다: ' + className + ' → ' + targetTeacher;
    }
    return '중단: ' + targetTeacher + ' 칸의 그 자리에 이미 "' + already + '"(이)가 있습니다.';
  }

  // ④ 반이름 + 요일 + 시간 + 강의실을 그대로 복사 (같은 교실, 같은 시간)
  var copied = [];
  for (var k = 0; k < 4; k++) {
    if (srcRow + k >= v.length) break;
    var val = v[srcRow + k][srcCol];
    sh.getRange(srcRow + 1 + k, targetCol + 1).setValue(val);
    copied.push(String(val || ''));
  }

  // 화면용 데이터도 새로 만들어야 하니 기억해 둔 것을 지웁니다
  try { CacheService.getScriptCache().remove('rosterJson'); } catch (e) {}

  return '완료: ' + className + ' 을(를) ' + targetTeacher
       + ' 칸에도 넣었습니다 [' + copied.join(' / ') + ']'
       + ' — 이제 updateAllRosters 를 실행하세요.';
}
