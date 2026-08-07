# 사자연성(四字鍊成)

한자 드롭을 자유롭게 이동해 오행 콤보를 만들고, 모은 글자로 사자성어를 연성하는 정적 HTML5 퍼즐 로그라이크입니다. 별도 빌드 도구나 서버 프로그램을 게임에 포함하지 않으며, 정적 파일 서버에서 바로 실행됩니다.

## 실행

이 폴더에서 다음 명령을 실행합니다.

```powershell
python -m http.server 4199 --bind 127.0.0.1
```

브라우저에서 `http://127.0.0.1:4199/`에 접속합니다. ES 모듈을 사용하므로 `index.html`을 `file://`로 직접 여는 방식보다 정적 서버 실행을 권장합니다.

## 제출판 핵심 구성

- 중심 모드 `연성행로`: 3막·15노드·9~11전투, 목표 런타임 18~24분
- 전투: 5×6 자유 이동 보드, 대각선 이동, 낙하 연쇄, 오행 상생, 적 행동 예고·페이즈 전환
- 성어: 직접 고른 고정 연성식 3개와 3~7턴마다 교체되는 순환 연성식 3개를 별도로 동시 운영
- 성장: 15종 자령, 18종 유물, 12종 이벤트, 15종 조우, 10개 문자권
- 학습 데이터: 한자 1,135자, 훈음 1,135건, 사자성어 75개를 도감·해금·런 문자 풀에 연결
- 복구: 버전형 자동 저장, 전투·보상·부활 단계 재개, 제출 버튼을 누른 뒤에만 판정하는 `福` 따라쓰기 1회 부활
- 접근성: 키보드·터치 조작, 모션 감소, 모달 포커스 트랩, 화면 읽기용 전투 의도 알림, BGM/SFX 개별 음량 저장
- 보조 모드: 퍼즐 모드와 기존 규칙을 보존한 팡팡 모드
- 디버그: 시드 복사, 노드 이동, 적 처치, 보상 호출, 문자권 변경, 게임오버·부활 진입, 데이터 검증

## 콘텐츠·밸런스 검증

```powershell
npm run check
```

검증 항목은 데이터 중복·누락·잘못된 참조, 에셋 형식, 저장 복구, 부활 판정, 전투 안전 상한, 10,000개 시드의 전략별 승률과 런 페이싱입니다.

현재 자동 시뮬레이션의 런 중앙값은 약 20분이며 10~90백분위는 약 18.7~21.2분입니다. 지연 누적, 피해 배율, 보호막, 효과 복제와 연쇄 횟수에는 상한이 있습니다.

## 제출 빌드 만들기

```powershell
npm run build:submission
```

다음 파일이 생성됩니다.

- `output/submission/sajayeonseong-html5/`: 정적 실행 폴더
- `output/submission/sajayeonseong-html5-build.zip`: 게임 빌드 ZIP
- `output/submission/SHA256SUMS.txt`: ZIP 체크섬
- `output/pdf/sajayeonseong_game_proposal_5p.pdf`: 5쪽 기획안 후보
- `output/submission/2026미니게임메이커스챌린지_참가자명_작성필요.zip`: 신청서·공개 URL을 넣기 전 제출 묶음 후보

빌드에는 실제 실행 파일만 포함되며, 원본 생성 시트·Suno 후보 음원·가공 메타데이터·테스트는 제외됩니다. 각 포함 파일의 SHA-256은 빌드 내부 `BUILD_MANIFEST.json`에서 확인할 수 있습니다.

기획안 생성 뒤 제출 묶음 후보를 다시 만들려면 `npm run build:proposal`과 `npm run build:bundle`을 차례로 실행합니다. 묶음 후보의 `GAME_URL.txt`, 참가자명, 지정 신청서·동의서는 실제 제출 전에 반드시 교체·추가해야 합니다.

공개 URL과 지정 서류가 준비된 뒤에는 `scripts/finalize-submission.py`를 사용해 URL 원격 검증, 최종 기획안 재생성, 서류 PDF 검사, 체크섬과 최종 ZIP 생성을 한 번에 수행합니다. 인자와 권리 확인 게이트는 `docs/submission/FINALIZATION.md`에 정리되어 있습니다.

## GitHub Pages 배포 준비

공식 GitHub Pages Actions 워크플로는 `.github/workflows/deploy-pages.yml`에 있습니다. `master` 푸시 시 전체 검사와 정적 제출 빌드를 다시 수행한 뒤 실행 파일만 배포합니다. 실제 공개 전에는 저장소 공개 범위·요금제·Pages 소스를 확인해야 하며, 공개 전환이나 푸시는 자동으로 수행하지 않습니다.

배포된 주소의 manifest와 모든 실행 파일을 검사하려면 다음처럼 실행합니다.

```powershell
npm run verify:pages -- https://meowthologysaga.github.io/hanjaPND/
```

최초 배포 절차와 공개 전 안전 점검은 `docs/submission/DEPLOYMENT.md`를 따릅니다.

기존 저장소를 공개하지 않고 실행 파일만 새 저장소에 배포해야 할 때는 `npm run build:pages-export`를 실행합니다. 생성되는 `output/public-pages-export`는 과거 개발 이력을 포함하지 않는 새 공개 저장소용 원본입니다.

## 데이터 구조

- `data/sajayeonseong-hanja-v2.js`: 원본 한자 1,135자·사자성어 75개
- `data/hanja-hun-eum.js`: 게임용 훈음 카탈로그
- `src/content.js`: 적·유물·이벤트·오디오 카탈로그
- `src/run-engine.js`: 시드 난수, 문자권, 경로, 효과 안전 상한, 시뮬레이션
- `src/save.js`: 저장 포맷·검증·재개 단계
- `src/revive.js`: 붓글씨 부활 판정
- `docs/design/`: 버전형 기획 문서
- `docs/submission/`: 제출 체크리스트·에셋 출처·QA 보고서

한 런에는 선택 문자권을 바탕으로 90~140자를 사용하며, 장착·순환 성어와 자령에 필요한 한자를 자동 보충합니다. 전체 1,135자는 125자씩 8권, 68자·67자짜리 확장 2권으로 나뉩니다.

## 저작권·출처

외부 데이터와 생성 에셋 출처는 `THIRD_PARTY_NOTICES.md`와 `docs/submission/ASSET_AND_LICENSE_MANIFEST.md`에 기록합니다.
