#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""callnotes.py 의 '순수하게 글자만 다루는 부분' 시험.
   whisper 나 드라이브 없이도 돌아갑니다:  python3 test_callnotes.py"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import callnotes as C


TALK = """[00:00:02.000 --> 00:00:06.000]  여보세요, 안녕하세요. 김지우 엄마인데요.
[00:00:06.000 --> 00:00:09.000]  네 어머님 안녕하세요.
[00:00:09.000 --> 00:00:17.000]  이번 주 토요일에 지우가 학교 행사가 있어서 수업에 못 갈 것 같아요.
[00:00:17.000 --> 00:00:23.000]  아 그러시군요. 그럼 결석 처리하고 수업 영상 보내드릴게요.
[00:00:23.000 --> 00:00:29.000]  네 그리고 보강은 다음 주 일요일에 가능할까요?
[00:00:29.000 --> 00:00:34.000]  일정 확인해서 내일까지 연락드리겠습니다.
[00:00:34.000 --> 00:00:36.000]  네 감사합니다.
"""


class 파일이름읽기(unittest.TestCase):
    def test_삼성_한글_이름(self):
        label, at = C.parse_filename('통화 녹음 김지우 어머님_260917_182233.m4a')
        self.assertEqual(label, '김지우 어머님')
        self.assertEqual(at, '2026-09-17T18:22')

    def test_영문_이름_네자리연도(self):
        label, at = C.parse_filename('Call recording 010-1234-5678_20260917_182233.m4a')
        self.assertEqual(label, '010-1234-5678')
        self.assertEqual(at, '2026-09-17T18:22')

    def test_점과_대시로_된_날짜(self):
        label, at = C.parse_filename('녹음_박서영 어머니_2026-09-17 18-22-33.m4a')
        self.assertEqual(label, '박서영 어머니')
        self.assertEqual(at, '2026-09-17T18:22')

    def test_날짜가_없으면_None(self):
        label, at = C.parse_filename('그냥이름.m4a')
        self.assertEqual(label, '그냥이름')
        self.assertIsNone(at)

    def test_말도안되는_날짜는_버림(self):
        label, at = C.parse_filename('통화 녹음 홍길동_991399_995999.m4a')
        self.assertIsNone(at)


class 전화번호(unittest.TestCase):
    def test_휴대폰(self):
        self.assertEqual(C.find_phone('01012345678 님과 통화'), '010-1234-5678')
        self.assertEqual(C.find_phone('010 1234 5678'), '010-1234-5678')
        self.assertEqual(C.find_phone('010-1234-5678'), '010-1234-5678')

    def test_지역번호(self):
        self.assertEqual(C.find_phone('031-707-1234'), '031-707-1234')
        self.assertEqual(C.find_phone('0217881234'), '02-1788-1234')

    def test_없으면_빈칸(self):
        self.assertEqual(C.find_phone('김지우 어머님'), '')


class 학생맞추기(unittest.TestCase):
    CLASSES = {'김지우': '경기1일', '박서영': '경기1일', '이서주': '경기1일', '김가은': '경기1중'}

    def test_상대이름에서_찾기(self):
        n, c = C.match_student('김지우 어머님', '', self.CLASSES)
        self.assertEqual((n, c), ('김지우', '경기1일'))

    def test_번호만_저장된_상대는_통화내용에서_찾기(self):
        n, c = C.match_student('010-1234-5678', TALK, self.CLASSES)
        self.assertEqual((n, c), ('김지우', '경기1일'))

    def test_모르는_사람이면_빈칸(self):
        n, c = C.match_student('택배기사', '문 앞에 두고 갑니다', self.CLASSES)
        self.assertEqual((n, c), ('', ''))


class 요약(unittest.TestCase):
    def test_핵심문장을_고른다(self):
        s = C.summarize(TALK)
        self.assertIn('결석', s)
        self.assertIn('보강', s)
        self.assertNotIn('감사합니다', s.split('\n')[0])
        self.assertLessEqual(len(s.split('\n')), 5)
        for line in s.split('\n'):
            self.assertTrue(line.startswith('· '))

    def test_시간표시와_말한사람표시를_걷어낸다(self):
        s = C.summarize(TALK)
        self.assertNotIn('00:00', s)
        self.assertNotIn('-->', s)

    def test_빈_글이면_빈칸(self):
        self.assertEqual(C.summarize(''), '')
        self.assertEqual(C.summarize('   \n  \n'), '')

    def test_걸리는_낱말이_없어도_뭔가_돌려준다(self):
        s = C.summarize('날씨가 참 좋네요 그러게요 정말 그렇습니다 오랜만입니다')
        self.assertTrue(s.startswith('· '))


class 후속조치(unittest.TestCase):
    def test_약속한_말을_집어낸다(self):
        t = C.detect_todo(TALK)
        self.assertIn('연락드리겠습니다', t)

    def test_약속이_없으면_빈칸(self):
        self.assertEqual(C.detect_todo('네 알겠습니다. 안녕히 계세요.'), '')


class 기록만들기(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / '통화 녹음 김지우 어머님_260917_182233.m4a'
        self.path.write_bytes(b'x')

    def tearDown(self):
        self.tmp.cleanup()

    def test_한_건이_제대로_만들어진다(self):
        rec = C.build_record({}, self.path, C.tidy_transcript(TALK), 학생맞추기.CLASSES)
        self.assertEqual(rec['name'], '김지우')
        self.assertEqual(rec['cls'], '경기1일')
        self.assertEqual(rec['at'], '2026-09-17T18:22')
        self.assertEqual(rec['source'], 'auto')
        self.assertTrue(rec['id'].startswith('auto-'))
        self.assertTrue(rec['todo']['on'])
        self.assertIn('결석', rec['memo'])
        self.assertIn('여보세요', rec['text'])
        self.assertNotIn('-->', rec['text'])

    def test_같은_파일은_늘_같은_번호(self):
        a = C.build_record({}, self.path, '가', {})
        b = C.build_record({}, self.path, '나', {})
        self.assertEqual(a['id'], b['id'])

    def test_이름을_모르면_날짜는_파일시각으로(self):
        p = Path(self.tmp.name) / '이름없음.m4a'
        p.write_bytes(b'x')
        rec = C.build_record({}, p, '내용', {})
        self.assertRegex(rec['at'], r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$')


class 명단읽기(unittest.TestCase):
    def test_괄호를_떼고_이름만_남긴다(self):
        tmp = tempfile.TemporaryDirectory()
        old = C.HOME_DIR
        try:
            C.HOME_DIR = Path(tmp.name)
            (C.HOME_DIR / 'classes.json').write_text(json.dumps({
                "classes": {"경기1일": {"students": ["박서영(ib)", "김지우", "강예원(영상)"]}}
            }, ensure_ascii=False), encoding='utf-8')
            m = C.load_classes('')           # 주소를 안 주면 저장해 둔 것만 씁니다
            self.assertEqual(m['박서영'], '경기1일')
            self.assertEqual(m['강예원'], '경기1일')
            self.assertEqual(m['김지우'], '경기1일')
        finally:
            C.HOME_DIR = old
            tmp.cleanup()

class 유형짐작(unittest.TestCase):
    def test_결석(self):
        self.assertEqual(C.guess_tag('토요일에 결석할 것 같아요 수업 영상 부탁드려요'), '결석')

    def test_수납(self):
        self.assertEqual(C.guess_tag('이번 달 수강료 언제까지 납부하면 되나요 카드로 결제됩니다'), '수납')

    def test_신규상담(self):
        self.assertEqual(C.guess_tag('중국어 수업 상담 받고 싶은데요 중3이고 다니고 싶어 해요'), '상담')

    def test_아무것도_안_걸리면_기타(self):
        self.assertEqual(C.guess_tag('네 안녕히 계세요'), '기타')


class 후속조치_더(unittest.TestCase):
    def test_드릴게요_꼴도_잡는다(self):
        self.assertIn('연락', C.detect_todo('상담 일정 잡아서 연락드릴게요'))
        self.assertIn('보내', C.detect_todo('결석 처리하고 수업 영상 보내드릴게요'))

    def test_인사말은_약속이_아니다(self):
        self.assertEqual(C.detect_todo('네 알겠습니다 안녕히 계세요 감사합니다'), '')

    def test_마지막_약속을_고른다(self):
        t = C.detect_todo('영상 보내드릴게요\n일정 확인해서 내일까지 연락드리겠습니다')
        self.assertIn('연락드리겠습니다', t)

if __name__ == '__main__':
    unittest.main(verbosity=2)
