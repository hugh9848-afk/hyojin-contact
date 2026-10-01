import re,subprocess,sys,time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
NAME=re.compile(r'^(퇴\))?\s*(경기|과천|성외|안양)\d')
LOG=Path.home()/'kakao_정리기록.txt'
A=sys.argv[1:]
LIMIT=int(A[A.index('--limit')+1]) if '--limit' in A else 0
LIST='--list' in A
EVERY=int(A[A.index('--check')+1]) if '--check' in A else 15
MODE=['c']
def sh(*a):
    return subprocess.run(['adb',*a],capture_output=True,text=True,timeout=40)
def _p(s):
    i=s.find('<hierarchy'); j=s.rfind('</hierarchy>')
    if i<0 or j<0: return None
    try: return ET.fromstring(s[i:j+12])
    except Exception: return None
def dump():
    for m in (MODE[0],'f','s'):
        try:
            if m in ('c','f'):
                cmd=['adb','exec-out','uiautomator','dump']+(['--compressed'] if m=='c' else [])+['/dev/tty']
                o=subprocess.run(cmd,capture_output=True,timeout=40).stdout.decode('utf-8','replace')
            else:
                sh('shell','uiautomator','dump','/sdcard/__k.xml')
                o=sh('shell','cat','/sdcard/__k.xml').stdout
            x=_p(o)
            if x is not None:
                if MODE[0]!=m: MODE[0]=m
                return x
        except Exception: pass
    return None
def items(r):
    o=[]
    if r is None: return o
    for n in r.iter('node'):
        t=(n.get('text') or '').strip() or (n.get('content-desc') or '').strip()
        if not t: continue
        m=re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',n.get('bounds') or '')
        if m:
            a,b,c,d=map(int,m.groups()); o.append((t,(a+c)//2,(b+d)//2))
    return o
def find(r,w):
    for t,x,y in items(r):
        if t==w: return (x,y)
    return None
def tap(p,w=0.5):
    sh('shell','input','tap',str(p[0]),str(p[1])); time.sleep(w)
def back(w=0.45):
    sh('shell','input','keyevent','4'); time.sleep(w)
def scroll():
    m=re.search(r'(\d+)x(\d+)',sh('shell','wm','size').stdout)
    w,h=(int(m.group(1)),int(m.group(2))) if m else (1080,2340)
    sh('shell','input','swipe',str(w//2),str(int(h*.62)),str(w//2),str(int(h*.28)),'400'); time.sleep(0.9)
def stop(why,r):
    print('\n[멈춤] '+why)
    print('화면 글자: '+' / '.join(sorted({t for t,_,_ in items(r)})[:30]))
    sys.exit(1)
if '\tdevice' not in sh('devices').stdout:
    print('폰이 안 붙었습니다'); sys.exit(1)
POS={}
def same(name,r):
    """상태메시지가 붙어 두 줄로 읽히는 경우가 있어 양쪽으로 견줍니다"""
    for t,_,_ in items(r):
        if len(t)>=4 and (t.startswith(name) or name.startswith(t)): return True
    return False
def one(name,xy,chk):
    """돌려주는 값: True 성공 / False 이름이 달라 그만둠"""
    tap(xy)
    r=dump()
    if not same(name,r):
        for _ in range(2):
            c=find(r,'닫기')
            if c: tap(c,0.4)
            else: back()
            r=dump()
            if find(r,'더보기') is None: break
        return False
    p=find(r,'더보기')
    if not p:
        if chk or '더보기' not in POS: stop('"더보기"를 못 찾았습니다 — %s'%name,r)
        p=POS['더보기']
    POS['더보기']=p
    tap(p)
    r=dump(); act=find(r,'친구 삭제')
    if not act: stop('"친구 삭제"를 메뉴에서 못 찾았습니다 — %s'%name,r)
    tap(act)
    if chk or '확인' not in POS:
        r=dump(); POS['확인']=find(r,'삭제') or find(r,'확인')
    if POS.get('확인'): tap(POS['확인'],0.45)
    if chk or '닫기' not in POS:
        r=dump(); POS['닫기']=find(r,'닫기')
        if POS['닫기']: tap(POS['닫기'],0.4)
        elif find(r,'1:1채팅') or find(r,'친구추가') or find(r,'더보기'): back()
    else:
        if POS['닫기']: tap(POS['닫기'],0.4)
        else: back()
    return True
done=0; seen=set(); prev=None; t0=time.time()
while True:
    r=dump()
    sig='|'.join(t for t,_,_ in items(r))
    cand=[(t,x,y) for t,x,y in items(r) if NAME.match(t)]
    if LIST:
        rows={}
        for t,x,y in cand:
            k=round(y/20.0)
            if k not in rows or len(t)<len(rows[k]): rows[k]=t
        for t in rows.values():
            if t not in seen:
                seen.add(t); print('  %-22s (%d)'%(t,len(seen)))
        if sig==prev: print('\n맨 아래에 닿았습니다'); break
        prev=sig; scroll(); continue
    if not cand:
        if sig==prev: print('\n더 찾을 사람이 없습니다'); break
        prev=sig; scroll(); continue
    prev=None
    rows={}
    for t,x,y in cand:                      # 한 줄에서 여러 글자가 읽히면 짧은 쪽(= 순수한 이름)을 씁니다
        k=round(y/20.0)
        if k not in rows or len(t)<len(rows[k][0]): rows[k]=(t,(x,y),y)
    batch=[(t,xy) for t,xy,_ in sorted(rows.values(), key=lambda e:-e[2])]   # 아래쪽부터
    for name,xy in batch:
        done+=1
        chk=(done%EVERY==1)
        ok=one(name,xy,chk)
        if not ok:
            done-=1
            print('   (자리가 어긋나 목록을 다시 읽습니다)')
            break
        with LOG.open('a',encoding='utf-8') as f:
            f.write('%s  삭제  %s\n'%(datetime.now().strftime('%m-%d %H:%M:%S'),name))
        print('[%d]%s %-22s %.1f초/명'%(done,'*' if chk else ' ',name,(time.time()-t0)/done))
        if LIMIT and done>=LIMIT: break
    if LIMIT and done>=LIMIT:
        print('\n%d명 처리하고 멈췄습니다'%done); break
if LIST: print('찾은 사람: %d명'%len(seen))
else: print('\n처리: %d명  (%.1f분)  기록: %s'%(done,(time.time()-t0)/60,LOG))
