#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
효진외국어학원 · 통화기록 만들기 (맥미니에서 도는 부분)

하는 일
  1) 구글드라이브로 올라온 학원폰 통화 녹음 파일(.m4a)을 지켜보다가
  2) 새 파일이 생기면 맥미니 안에서 글로 옮기고(whisper, 무료·오프라인)
  3) 파일 이름에서 상대와 통화 시각을 읽고, 학생 명단과 맞춰 반을 붙이고
  4) 핵심 문장만 골라 요약하고, "다시 연락할 일"이 있으면 집어내서
  5) 통화기록 화면이 읽을 수 있는 곳(중계기)으로 보냅니다.

쓰는 법
  python3 callnotes.py --once      한 번만 훑고 끝냅니다 (시험용)
  python3 callnotes.py --watch     계속 지켜봅니다 (맥미니가 늘 돌리는 방식)
  python3 callnotes.py --once --dry-run
                                   전사는 건너뛰고, 옆에 같은 이름의 .txt 가 있으면
                                   그걸 통화 내용으로 씁니다 (설치 전 흐름 시험용)

설정은 ~/.hyojin-callnotes/config.json 에 있습니다. (이 저장소에는 넣지 않습니다)
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HOME_DIR = Path(os.path.expanduser('~/.hyojin-callnotes'))
CONFIG_PATH = HOME_DIR / 'config.json'

DEFAULT_CONFIG = {
    # 학원폰 녹음이 올라오는 폴더 (구글드라이브 동기화 폴더 안)
    "watch_dir": "",
    # 학생 명단 (반·이름 맞추기에 씁니다)
    "classes_url": "https://hugh9848-afk.github.io/hyojin-contact/classes.json",
    # 정리된 기록을 보낼 곳 (구글 앱스스크립트 중계기). 비워 두면 맥미니 안에만 쌓입니다.
    "relay_url": "",
    "relay_token": "",
    # 글로 옮기는 도구
    "whisper_bin": "",          # 비워 두면 알아서 찾습니다
    "whisper_model": "",        # 비워 두면 models 폴더에서 찾습니다
    "ffmpeg_bin": "ffmpeg",
    "language": "ko",
    "threads": 0,               # 0 이면 whisper 기본값
    # 너무 짧은 통화(부재중 등)는 건너뜁니다
    "min_seconds": 8,
    # 파일이 다 올라왔는지 확인하는 시간(초)
    "settle_seconds": 20,
    # --watch 일 때 얼마나 자주 볼지(초)
    "interval_seconds": 60,
}

AUDIO_EXT = {'.m4a', '.mp3', '.wav', '.amr', '.3gp', '.aac', '.ogg', '.flac'}


# ════════════════════════════════════════════════════════════
#  설정·기록 보관
# ════════════════════════════════════════════════════════════

def load_config(path=CONFIG_PATH):
    cfg = dict(DEFAULT_CONFIG)
    p = Path(path)
    if p.exists():
        try:
            cfg.update(json.loads(p.read_text(encoding='utf-8')))
        except Exception as e:
            die('설정 파일을 읽지 못했습니다: %s (%s)' % (p, e))
    for key in ('watch_dir', 'whisper_bin', 'whisper_model'):
        if cfg.get(key):
            cfg[key] = os.path.expanduser(cfg[key])
    return cfg


def state_path():
    return HOME_DIR / 'state.json'


def load_state():
    p = state_path()
    if not p.exists():
        return {"done": {}}
    try:
        s = json.loads(p.read_text(encoding='utf-8'))
        s.setdefault('done', {})
        return s
    except Exception:
        return {"done": {}}


def save_state(state):
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    tmp = state_path().with_suffix('.tmp')
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding='utf-8')
    tmp.replace(state_path())


def records_dir():
    d = HOME_DIR / 'records'
    d.mkdir(parents=True, exist_ok=True)
    return d


def log(msg):
    print('[%s] %s' % (datetime.now().strftime('%m-%d %H:%M:%S'), msg), flush=True)


def die(msg):
    print('오류: ' + msg, file=sys.stderr)
    sys.exit(1)


# ════════════════════════════════════════════════════════════
#  파일 이름에서 상대와 시각 읽기
#  (삼성 전화앱이 붙이는 이름 모양이 기기마다 조금씩 달라 여러 꼴을 봅니다)
# ════════════════════════════════════════════════════════════

_PREFIXES = ['통화 녹음', '통화녹음', 'Call recording', 'Voice recorder', '녹음', 'Call', 'REC']

_DATE_PATTERNS = [
    # 20260917_182233 / 260917_182233
    (re.compile(r'(?P<y>\d{4})(?P<m>\d{2})(?P<d>\d{2})[_\-\s]+(?P<H>\d{2})(?P<M>\d{2})(?P<S>\d{2})?'), 4),
    (re.compile(r'(?<!\d)(?P<y>\d{2})(?P<m>\d{2})(?P<d>\d{2})[_\-\s]+(?P<H>\d{2})(?P<M>\d{2})(?P<S>\d{2})?(?!\d)'), 2),
    # 2026-09-17 18-22-33 / 2026.09.17 18:22
    (re.compile(r'(?P<y>\d{4})[.\-/](?P<m>\d{1,2})[.\-/](?P<d>\d{1,2})[_\-\s]+(?P<H>\d{1,2})[.\-:](?P<M>\d{1,2})([.\-:](?P<S>\d{1,2}))?'), 4),
]


def parse_filename(filename):
    """파일 이름 -> (상대 표시, 통화 시각 'YYYY-MM-DDTHH:MM')
    읽지 못하면 시각은 None 을 돌려줍니다."""
    stem = Path(filename).stem
    stem = unicodedata.normalize('NFC', stem)

    at = None
    label_part = stem
    for pat, ylen in _DATE_PATTERNS:
        m = pat.search(stem)
        if not m:
            continue
        try:
            y = int(m.group('y'))
            if ylen == 2:
                y += 2000
            at = '%04d-%02d-%02dT%02d:%02d' % (y, int(m.group('m')), int(m.group('d')),
                                               int(m.group('H')), int(m.group('M')))
            datetime.strptime(at, '%Y-%m-%dT%H:%M')   # 말이 되는 날짜인지 확인
        except ValueError:
            at = None
            continue
        label_part = stem[:m.start()]
        break

    label = label_part
    for pre in _PREFIXES:
        if label.strip().lower().startswith(pre.lower()):
            label = label.strip()[len(pre):]
            break
    label = label.strip(' _-·,')
    label = re.sub(r'\s{2,}', ' ', label)
    return label, at


_PHONE_RE = re.compile(r'(?<!\d)(01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4})(?!\d)')


def find_phone(text):
    m = _PHONE_RE.search(text or '')
    if not m:
        return ''
    digits = re.sub(r'\D', '', m.group(1))
    if len(digits) == 11:
        return '%s-%s-%s' % (digits[:3], digits[3:7], digits[7:])
    if len(digits) == 10:
        if digits.startswith('02'):
            return '%s-%s-%s' % (digits[:2], digits[2:6], digits[6:])
        return '%s-%s-%s' % (digits[:3], digits[3:6], digits[6:])
    if len(digits) == 9 and digits.startswith('02'):
        return '%s-%s-%s' % (digits[:2], digits[2:5], digits[5:])
    return m.group(1)


# ════════════════════════════════════════════════════════════
#  학생 명단 맞추기
# ════════════════════════════════════════════════════════════

def load_classes(url, cache_hours=12):
    """classes.json 을 받아 {학생이름: 반이름} 으로 만듭니다. 못 받으면 지난번 것을 씁니다."""
    cache = HOME_DIR / 'classes.json'
    fresh = False
    if cache.exists():
        age = time.time() - cache.stat().st_mtime
        fresh = age < cache_hours * 3600
    if url and not fresh:
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                data = r.read()
            HOME_DIR.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(data)
        except Exception as e:
            log('명단을 새로 받지 못했습니다(%s). 지난번 것을 씁니다.' % e)
    if not cache.exists():
        return {}
    try:
        j = json.loads(cache.read_text(encoding='utf-8'))
    except Exception:
        return {}
    out = {}
    for ab, info in (j.get('classes') or {}).items():
        for name in (info.get('students') or []):
            key = re.sub(r'\(.*?\)', '', str(name)).strip()
            if key and key not in out:
                out[key] = ab
    return out


def match_student(label, text, classes):
    """상대 표시와 통화 내용에서 우리 학생 이름을 찾습니다. -> (이름, 반)"""
    if not classes:
        return '', ''
    names = sorted(classes.keys(), key=len, reverse=True)
    hay_label = unicodedata.normalize('NFC', label or '')
    for n in names:
        if len(n) >= 2 and n in hay_label:
            return n, classes[n]
    hay_text = unicodedata.normalize('NFC', (text or '')[:1500])
    for n in names:
        if len(n) >= 2 and n in hay_text:
            return n, classes[n]
    return '', ''


# ════════════════════════════════════════════════════════════
#  요약 — 중요해 보이는 문장만 골라 냅니다
#  (통화기록 화면(calls.html)에 있는 규칙과 같습니다)
# ════════════════════════════════════════════════════════════

KEYWORDS = [
    ('결석', 4), ('빠지', 3), ('보강', 4), ('환불', 4), ('수강료', 4), ('납부', 3), ('결제', 3),
    ('등록', 3), ('상담', 2), ('시험', 3), ('내신', 3), ('숙제', 2), ('교재', 2), ('영상', 2),
    ('취소', 4), ('변경', 4), ('연기', 3), ('요청', 3), ('부탁', 3), ('문의', 2), ('일정', 3),
    ('지각', 2), ('조퇴', 2), ('연락', 2), ('방학', 2), ('특강', 2), ('선생님', 1), ('레벨', 2),
    ('반 ', 1), ('퇴원', 4), ('휴원', 4), ('시간표', 3), ('출석', 2),
]

DATE_RE = re.compile(r'(\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*일|\d{1,2}\s*시(\s*\d{1,2}\s*분)?'
                     r'|오늘|내일|모레|이번\s*주|다음\s*주|주말|[월화수목금토일]요일)')

_SPEAKER_RE = re.compile(r'^\s*(나|저|본인|상대|상대방|발신자|수신자|통화자\s*\d*|화자\s*\d*|참석자\s*\d*)\s*[:：]\s*')
_STAMP_RE = re.compile(
    r'^\s*[\[(]?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?'
    r'(?:\s*-+>\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)?[\])]?\s*')


def clean_line(line):
    t = _STAMP_RE.sub('', str(line))
    t = _SPEAKER_RE.sub('', t)
    return t.strip()


def split_sentences(text):
    out = []
    for line in str(text or '').replace('\r', '').split('\n'):
        c = clean_line(line)
        if not c:
            continue
        for piece in re.split(r'(?:[.!?。]|다\.)\s+', c):
            t = piece.strip()
            if t:
                out.append(t)
    return out


def summarize(text, limit=5):
    ss = split_sentences(text)
    if not ss:
        return ''
    scored = []
    for i, t in enumerate(ss):
        sc = 0
        for kw, w in KEYWORDS:
            if kw in t:
                sc += w
        if DATE_RE.search(t):
            sc += 3
        if len(t) < 6:
            sc -= 3
        if len(t) > 90:
            sc -= 1
        if sc > 0:
            scored.append((sc, i, t))
    if scored:
        scored.sort(key=lambda x: (-x[0], x[1]))
        pick = sorted(scored[:limit], key=lambda x: x[1])
        return '\n'.join('· ' + t for _, _, t in pick)
    longest = sorted(enumerate(ss), key=lambda x: -len(x[1]))[:3]
    return '\n'.join('· ' + t for _, t in sorted(longest, key=lambda x: x[0]))


_TODO_RE = re.compile(
    r'(?:연락|전화|알려|보내|전달|준비|예약|잡아|찾아|맞춰)\s*[가-힣]{0,2}'
    r'(?:드리|드릴|겠습|겠어|겠네|할게|줄게|볼게)'
    r'|확인(?:해서|하고|해\s*보고|해\s*볼|하겠)'
    r'|다시\s*(?:전화|연락)')


# 무슨 일로 건 전화인지 짐작합니다 (통화기록 화면의 유형과 같은 이름)
TAG_RULES = [
    ('결석', ['결석', '못 가', '못가', '못 와', '빠지', '빠질', '결석계', '아파서']),
    ('보강', ['보강', '보충', '따로 수업']),
    ('수납', ['수강료', '납부', '결제', '환불', '청구', '입금', '카드', '계좌']),
    ('상담', ['상담', '레벨', '등록', '테스트', '배치', '다니고 싶', '알아보', '수업 듣']),
    ('문의', ['문의', '궁금', '여쭤', '여쭈', '물어보']),
]


def guess_tag(text):
    t = str(text or '')
    best, best_score = '상담', 0
    for tag, words in TAG_RULES:
        sc = sum(t.count(w) for w in words)
        if sc > best_score:
            best, best_score = tag, sc
    return best if best_score else '기타'


def detect_todo(text):
    """'~해서 연락드리겠습니다' 처럼 내가 하기로 한 말을 집어냅니다."""
    best = ''
    for t in split_sentences(text):
        if len(t) < 6 or len(t) > 80:
            continue
        if _TODO_RE.search(t):
            best = t            # 통화 뒤쪽에서 한 약속이 대개 진짜 약속입니다
    return best


# ════════════════════════════════════════════════════════════
#  글로 옮기기 (whisper)
# ════════════════════════════════════════════════════════════

def find_whisper(cfg):
    if cfg.get('whisper_bin'):
        return cfg['whisper_bin']
    for cand in ('whisper-cli', 'whisper-cpp', 'main', 'whisper'):
        path = which(cand)
        if path:
            return path
    return ''


def which(name):
    for d in os.environ.get('PATH', '').split(os.pathsep):
        p = Path(d) / name
        if p.exists() and os.access(str(p), os.X_OK):
            return str(p)
    return ''


def find_model(cfg):
    if cfg.get('whisper_model'):
        return cfg['whisper_model']
    d = HOME_DIR / 'models'
    if d.exists():
        for pref in ('large-v3-turbo', 'large-v3', 'medium', 'small', 'base'):
            for f in sorted(d.glob('ggml-%s*.bin' % pref)):
                return str(f)
    return ''


def audio_seconds(cfg, path):
    """ffmpeg 로 길이를 잽니다. 못 재면 None."""
    try:
        out = subprocess.run([cfg.get('ffmpeg_bin') or 'ffmpeg', '-i', str(path)],
                             capture_output=True, text=True, timeout=60).stderr
        m = re.search(r'Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)', out)
        if m:
            return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    except Exception:
        pass
    return None


def transcribe(cfg, path):
    """녹음 파일 -> 글. 실패하면 빈 글자를 돌려줍니다."""
    whisper = find_whisper(cfg)
    model = find_model(cfg)
    if not whisper or not model:
        log('whisper 나 모델을 찾지 못했습니다. README 의 설치 순서를 봐 주세요.')
        return ''
    with tempfile.TemporaryDirectory() as td:
        wav = str(Path(td) / 'a.wav')
        try:
            subprocess.run([cfg.get('ffmpeg_bin') or 'ffmpeg', '-y', '-i', str(path),
                            '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav],
                           capture_output=True, timeout=600, check=True)
        except Exception as e:
            log('소리 파일을 바꾸지 못했습니다: %s' % e)
            return ''
        out_base = str(Path(td) / 'out')
        cmd = [whisper, '-m', model, '-f', wav, '-l', cfg.get('language') or 'ko',
               '-otxt', '-of', out_base, '--no-prints']
        if cfg.get('threads'):
            cmd += ['-t', str(cfg['threads'])]
        try:
            subprocess.run(cmd, capture_output=True, timeout=3600, check=True)
        except subprocess.CalledProcessError as e:
            # 옛 판에는 --no-prints 가 없습니다. 한 번 더 해 봅니다.
            try:
                subprocess.run([c for c in cmd if c != '--no-prints'],
                               capture_output=True, timeout=3600, check=True)
            except Exception:
                log('글로 옮기지 못했습니다: %s' % e)
                return ''
        except Exception as e:
            log('글로 옮기지 못했습니다: %s' % e)
            return ''
        txt = Path(out_base + '.txt')
        if not txt.exists():
            return ''
        return tidy_transcript(txt.read_text(encoding='utf-8', errors='replace'))


def tidy_transcript(text):
    """[00:00:00.000 --> ...] 같은 시간표시를 걷어내고 빈 줄을 정리합니다."""
    lines = []
    for line in str(text).replace('\r', '').split('\n'):
        line = re.sub(r'^\s*\[[\d:.\s\->]+\]\s*', '', line).strip()
        if line:
            lines.append(line)
    return '\n'.join(lines).strip()


# ════════════════════════════════════════════════════════════
#  기록 만들기 · 보내기
# ════════════════════════════════════════════════════════════

def record_id(path):
    stem = re.sub(r'[^0-9A-Za-z가-힣]+', '-', Path(path).stem).strip('-')
    return 'auto-' + stem[:60]


def build_record(cfg, path, text, classes):
    label, at = parse_filename(Path(path).name)
    if not at:
        at = datetime.fromtimestamp(Path(path).stat().st_mtime).strftime('%Y-%m-%dT%H:%M')
    phone = find_phone(label) or find_phone(text)
    name, cls = match_student(label, text, classes)
    if not name:
        name = '' if _PHONE_RE.fullmatch(label.replace(' ', '')) else label
    todo_text = detect_todo(text)
    return {
        "id": record_id(path),
        "source": "auto",
        "name": name,
        "role": "학부모",
        "cls": cls,
        "phone": phone,
        "at": at,
        "dir": "",
        "tag": guess_tag(text),
        "memo": summarize(text),
        "text": text,
        "star": False,
        "todo": {"on": bool(todo_text), "text": todo_text, "due": "", "done": False},
        "file": Path(path).name,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec='seconds'),
    }


def post_relay(cfg, records):
    url = cfg.get('relay_url')
    if not url:
        return False
    body = json.dumps({"token": cfg.get('relay_token', ''), "records": records},
                      ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=body,
                                 headers={'Content-Type': 'text/plain;charset=utf-8'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.loads(r.read().decode('utf-8', 'replace'))
        if not resp.get('ok'):
            log('중계기가 거절했습니다: %s' % resp.get('msg'))
            return False
        return True
    except Exception as e:
        log('중계기로 보내지 못했습니다: %s' % e)
        return False


# ════════════════════════════════════════════════════════════
#  훑기
# ════════════════════════════════════════════════════════════

def pending_files(cfg, state):
    d = Path(cfg['watch_dir'])
    if not d.is_dir():
        die('녹음 폴더를 찾지 못했습니다: %s\n   설정 파일(%s)의 watch_dir 을 확인해 주세요.'
            % (d, CONFIG_PATH))
    out = []
    for p in sorted(d.rglob('*')):
        if not p.is_file() or p.suffix.lower() not in AUDIO_EXT:
            continue
        key = p.name
        st = p.stat()
        done = state['done'].get(key)
        if done and done.get('size') == st.st_size:
            continue
        # 아직 올라오는 중인 파일은 건드리지 않습니다
        if time.time() - st.st_mtime < cfg.get('settle_seconds', 20):
            continue
        out.append(p)
    return out


def process_one(cfg, path, classes, dry_run=False):
    secs = audio_seconds(cfg, path)
    if secs is not None and secs < cfg.get('min_seconds', 8):
        log('%s — %d초짜리라 건너뜁니다.' % (path.name, secs))
        return None
    if dry_run:
        side = path.with_suffix('.txt')
        text = side.read_text(encoding='utf-8', errors='replace').strip() if side.exists() else ''
        if not text:
            log('%s — 옆에 .txt 가 없어 건너뜁니다 (dry-run).' % path.name)
            return None
        text = tidy_transcript(text)
    else:
        log('%s — 글로 옮기는 중%s' % (path.name, (' (%d초)' % secs) if secs else ''))
        text = transcribe(cfg, path)
        if not text:
            return None
    rec = build_record(cfg, path, text, classes)
    (records_dir() / (rec['id'] + '.json')).write_text(
        json.dumps(rec, ensure_ascii=False, indent=1), encoding='utf-8')
    return rec


def scan(cfg, state, dry_run=False):
    classes = load_classes(cfg.get('classes_url'))
    files = pending_files(cfg, state)
    if not files:
        return 0
    log('새 녹음 %d개' % len(files))
    made = []
    for p in files:
        try:
            rec = process_one(cfg, p, classes, dry_run=dry_run)
        except Exception as e:
            log('%s — 처리 중 문제: %s' % (p.name, e))
            continue
        st = p.stat()
        state['done'][p.name] = {"size": st.st_size, "at": datetime.now().isoformat(timespec='seconds'),
                                 "id": rec['id'] if rec else ''}
        save_state(state)
        if rec:
            made.append(rec)
            log('  → %s %s %s' % (rec['at'], rec['name'] or '(이름 모름)', rec['cls'] or ''))
    if made and cfg.get('relay_url'):
        if post_relay(cfg, made):
            log('%d건을 통화기록으로 보냈습니다.' % len(made))
    return len(made)


def main():
    ap = argparse.ArgumentParser(description='통화 녹음을 글로 옮겨 통화기록으로 보냅니다.')
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--once', action='store_true', help='한 번만 훑습니다')
    g.add_argument('--watch', action='store_true', help='계속 지켜봅니다')
    ap.add_argument('--dry-run', action='store_true', help='전사를 건너뛰고 옆의 .txt 를 씁니다')
    ap.add_argument('--config', default=str(CONFIG_PATH))
    ap.add_argument('--init', action='store_true', help='설정 파일 본보기를 만듭니다')
    args = ap.parse_args()

    if args.init:
        HOME_DIR.mkdir(parents=True, exist_ok=True)
        if Path(args.config).exists():
            die('이미 있습니다: %s' % args.config)
        Path(args.config).write_text(
            json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2), encoding='utf-8')
        print('만들었습니다: %s\nwatch_dir 을 채워 주세요.' % args.config)
        return

    cfg = load_config(args.config)
    if not cfg.get('watch_dir'):
        die('설정 파일(%s)에 watch_dir 이 비어 있습니다.' % args.config)
    state = load_state()

    if args.watch:
        log('지켜보기 시작 — %s' % cfg['watch_dir'])
        while True:
            try:
                scan(cfg, state, dry_run=args.dry_run)
            except SystemExit:
                raise
            except Exception as e:
                log('훑는 중 문제: %s' % e)
            time.sleep(max(10, int(cfg.get('interval_seconds', 60))))
    else:
        n = scan(cfg, state, dry_run=args.dry_run)
        log('끝났습니다. 새로 만든 기록 %d건' % n)


if __name__ == '__main__':
    main()
