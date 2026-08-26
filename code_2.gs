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
