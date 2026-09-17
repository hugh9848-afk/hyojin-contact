# 통화기록 자동화 — 설치 안내

학원폰(갤럭시 S22)으로 오간 전화를 **손대지 않고** 글로 남겨,
[통화기록 화면](https://hugh9848-afk.github.io/hyojin-contact/calls.html)에서 학생·반별로 찾아보게 만듭니다.

```
학원폰                    구글드라이브              맥미니(24시간)              폰·PC
전화 자동녹음      →     통화녹음 폴더      →     새 파일을 지켜보다가    →    통화기록 화면
(설정 ①)                 (자동 업로드 ②)          글로 옮기고 정리 ③④          (⑤)
```

**한 번 해두면 그 뒤로는 전화를 받고 끊는 것 말고 할 일이 없습니다.**
전사는 맥미니 안에서 돌아가므로 **비용이 들지 않고, 음성이 외부 업체로 나가지 않습니다.**

> 맥미니에서 클로드에게 "tools/callnotes/README.md 보고 통화기록 설치해줘" 라고 하면
> ③④⑦ 번(터미널로 하는 일)은 대신 해줍니다. ①②⑤⑥ 은 폰과 브라우저에서 하셔야 합니다.

---

## ① 학원폰 — 통화 자동 녹음 켜기

```
전화 › 오른쪽 위 ⋮ › 설정 › 통화 녹음 › 통화 자동 녹음  →  켜기
```

- "통화 녹음" 메뉴가 없으면 이 방법을 쓸 수 없습니다. 먼저 이것부터 확인해 주세요.
- 녹음 파일은 보통 `내장메모리/Call/` 에 `통화 녹음 홍길동_260917_182233.m4a` 같은 이름으로 쌓입니다.
  **내 파일** 앱에서 그 폴더를 열어 실제 이름이 어떤 모양인지 한 번 봐 주세요.
  (이름 꼴이 많이 다르면 알려 주세요. 읽는 규칙을 맞춰 두겠습니다.)
- 학원폰이라 업무 전화만 오는 게 전제입니다. 개인 통화가 섞이는 폰이라면 자동 녹음은 권하지 않습니다.

## ② 학원폰 — 녹음 폴더를 구글드라이브로 자동 올리기

플레이스토어에서 **Autosync for Google Drive** (만든 곳: MetaCtrl) 를 설치합니다.

```
계정 연결 → 동기화 폴더 쌍 만들기
  휴대전화 폴더 : /내장메모리/Call
  드라이브 폴더 : _자동화/통화녹음      ← 없으면 새로 만듭니다
  동기화 방식   : 업로드만 (Upload only)
  자동 동기화   : 켜기
```

- 파일 크기 제한에 걸린다는 말이 나오면 유료(1회 결제)로 풀거나 **Syncthing** 을 쓰세요.
  통화 녹음은 대개 10분에 1MB 안팎이라 보통은 걸리지 않습니다.
- 맥미니의 구글드라이브 앱이 그 폴더를 내려받도록, 드라이브 설정에서 `_자동화` 폴더가
  **오프라인 사용(미러링)** 으로 잡혀 있는지 확인하세요.

## ③ 맥미니 — 필요한 도구 깔기

```bash
brew install whisper-cpp ffmpeg

mkdir -p ~/.hyojin-callnotes/models
curl -L -o ~/.hyojin-callnotes/models/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

- 모델 파일은 1.6GB쯤 됩니다. 한 번만 받으면 됩니다.
- 맥미니가 좀 오래된 기종이라 느리면 `ggml-medium.bin` 으로 바꾸세요. (같은 주소에서 이름만 바꿔 받습니다)
- 애플 실리콘(M칩) 맥미니면 10분짜리 통화가 1~2분 안에 처리됩니다.

## ④ 맥미니 — 설정 파일 만들기

```bash
cd ~/hyojin-contact/tools/callnotes      # 이 저장소를 받아 둔 곳
python3 callnotes.py --init
open ~/.hyojin-callnotes/config.json
```

`watch_dir` 을 **②에서 만든 드라이브 폴더의 맥미니 안 경로**로 채웁니다. 예를 들면

```json
{
  "watch_dir": "~/Library/CloudStorage/GoogleDrive-계정이름/내 드라이브/_자동화/통화녹음",
  "classes_url": "https://hugh9848-afk.github.io/hyojin-contact/classes.json",
  "relay_url": "",
  "relay_token": "",
  "min_seconds": 8
}
```

`relay_url` 과 `relay_token` 은 ⑥번에서 채웁니다. 지금은 비워 두세요.

**여기까지 하고 한 번 돌려 봅니다.**

```bash
python3 callnotes.py --once
```

녹음이 몇 건 있으면 글로 옮겨 `~/.hyojin-callnotes/records/` 에 쌓입니다.
파일 하나를 열어 이름·반·요약이 제대로 잡혔는지 봐 주세요.

## ⑤ 중계기 만들기 (맥미니 → 통화기록 화면)

1. [script.google.com](https://script.google.com) → **새 프로젝트**
2. `appsscript_relay.gs` 의 내용을 통째로 붙여넣습니다.
3. 맨 위 `TOKEN` 을 길고 아무도 모르는 글자로 바꿉니다. (예: `npnde-kebmu-n6340-bt7a7`)
4. **배포 › 새 배포 › 웹 앱**
   - 실행 사용자: **나**
   - 액세스 권한이 있는 사용자: **모든 사용자**
5. 나온 **웹 앱 URL** 을 복사합니다.

> 나중에 이 글을 고치면 **배포 관리 → 연필(수정)** 로 다시 배포하세요.
> '새 배포' 를 누르면 주소가 바뀌어 화면이 서버를 못 찾습니다.

## ⑥ 주소와 열쇠 이어 붙이기

**맥미니** `~/.hyojin-callnotes/config.json`

```json
  "relay_url": "⑤에서 복사한 웹 앱 URL",
  "relay_token": "⑤에서 정한 TOKEN"
```

**저장소** `config.js`

```js
window.HYOJIN_CALLS_API = "⑤에서 복사한 웹 앱 URL";
```

고친 뒤 깃허브에 올리면 화면에 반영됩니다.

**폰에서 통화기록 화면을 열 때**는 열쇠를 한 번 붙여서 엽니다.

```
https://hugh9848-afk.github.io/hyojin-contact/calls.html?v=⑤에서 정한 TOKEN
```

한 번 열면 그 기계가 열쇠를 적어 두므로, 다음부터는 `?v=...` 없이 열어도 됩니다.
홈 화면에 추가해 두면 더 편합니다.

## ⑦ 맥미니 — 저절로 돌게 하기

```bash
cp com.hyojin.callnotes.plist ~/Library/LaunchAgents/
# 파일을 열어 /Users/kemi 와 저장소 경로를 실제 것으로 고친 뒤
launchctl load ~/Library/LaunchAgents/com.hyojin.callnotes.plist
tail -f ~/Library/Logs/hyojin-callnotes.log
```

이제 1분에 한 번씩 새 녹음을 살펴 처리합니다.

---

## 잘 되는지 보는 법

| 보고 싶은 것 | 하는 법 |
|---|---|
| 지금 무슨 일을 하고 있나 | `tail -f ~/Library/Logs/hyojin-callnotes.log` |
| 정리된 기록 하나 열어보기 | `open ~/.hyojin-callnotes/records/` |
| 어디까지 처리했나 | `~/.hyojin-callnotes/state.json` |
| 다시 처리하고 싶다 | `state.json` 에서 그 파일 이름 줄을 지우고 `--once` |
| 전사 없이 흐름만 시험 | 녹음 파일 옆에 같은 이름 `.txt` 를 두고 `--once --dry-run` |

## 잘 안 될 때

**"녹음 폴더를 찾지 못했습니다"**
→ `watch_dir` 경로가 틀렸습니다. 파인더에서 그 폴더를 터미널로 끌어다 놓으면 정확한 경로가 찍힙니다.

**"whisper 나 모델을 찾지 못했습니다"**
→ `brew install whisper-cpp` 가 됐는지, 모델 파일이 `~/.hyojin-callnotes/models/` 에 있는지 봅니다.

**이름·반이 비어 있다**
→ 전화번호만 저장된 상대입니다. 통화 내용에 학생 이름이 나오면 그걸로 찾고, 그래도 없으면 비워 둡니다.
화면에서 직접 이름을 채우면 그 뒤로는 덮어쓰지 않습니다.

**요약이 엉뚱하다**
→ 낱말(결석·보강·수강료·취소 등)을 기준으로 고르는 방식이라 통화 주제가 특이하면 빗나갑니다.
화면에서 고치면 됩니다. 자주 나오는 낱말이 있으면 알려 주세요. `callnotes.py` 의 `KEYWORDS` 에 넣겠습니다.

## 고칠 때

글자를 다루는 부분은 시험이 있습니다. 고친 뒤 꼭 돌려 보세요.

```bash
python3 test_callnotes.py
```

## 알아두실 것

- 내가 당사자인 통화를 녹음하는 것은 한국에서 문제되지 않습니다. 다만 **학원폰으로 오는 전화가 모두 녹음**되니,
  직원 개인 통화가 섞이지 않게 해주세요.
- 통화 내용에는 학부모·학생의 개인정보가 담깁니다. 중계기 주소와 열쇠(TOKEN)를 아무 데나 올리지 마세요.
  **이 저장소는 공개되어 있으므로 `config.js` 에 TOKEN 을 적지 마세요** — 주소만 넣습니다.
- 통화기록 화면의 기록은 그 기계 안에만 저장됩니다. 원본은 맥미니와 드라이브에 있으니,
  폰을 바꾸면 새 폰에서 한 번 새로고침하면 됩니다.
- 오래된 녹음·기록을 언제까지 둘지 정해 두고, 지날 때마다 지우시길 권합니다.
