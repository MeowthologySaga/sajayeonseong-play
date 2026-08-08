# 사자연성 에셋·라이선스 명세

기준일: 2026-08-07
대상: 2026 미니게임 메이커스 챌린지 정적 HTML5 제출판

## 1. 런타임 에셋 목록

| 구분 | 수량 | 런타임 경로 | 제작·처리 방식 |
|---|---:|---|---|
| 자령 애니메이션 | 30종 × 4프레임 | `assets/sprites/wild/jaryeongs/` | OpenAI 이미지 생성 → 마젠타 키 제거 → 프레임 분할·중심 정렬·가장자리 QC |
| 보스 애니메이션 | 3종 × 6프레임 | `assets/sprites/wild/bosses/` | OpenAI 이미지 생성 → 마젠타 키 제거 → 프레임 분할·중심 정렬·가장자리 QC |
| 자령 한자 부적 | 30종 | `assets/ui/talismans/` | 브라우저별 글꼴 오차를 피하도록 안전영역 검증 후 PNG로 베이크 |
| 16:9 배경 | 6장 | `assets/backgrounds/` | OpenAI 이미지 생성, 메뉴·3막·승리·패배 장면용 |
| BGM | 7곡 | `assets/audio/bgm/` | Suno instrumental 생성 → 게임용 정규화 |
| 효과음 | 23개 | `assets/audio/sfx/` | Suno Sounds 후보 2개씩 비교 → 선택·트림·피크 정규화 |
| 보드·패널·버튼 | CSS 및 DOM | `styles.css`, `index.html` | 프로젝트 자체 제작. 해상도 독립형 레이아웃과 상태별 색·텍스트 병행 |

원본 시트, 후보 음원, 처리 메타데이터와 미리보기는 개발 저장소에만 보존하며 제출용 게임 ZIP에는 넣지 않습니다. 최종 포함 파일은 `BUILD_MANIFEST.json`의 SHA-256 목록으로 고정합니다.

## 2. 아트 방향

사용자가 제공한 두 참고 이미지를 공식 아트 바이블로 삼아 다음 시각 문법만 확장했습니다.

- 굵고 검은 외곽선
- 둥글고 읽기 쉬운 실루엣
- 목·화·토·금·수의 선명한 원소색
- 간결한 셀 채색과 작은 하이라이트
- 야생 자령은 부적 없음, 계약한 자령은 머리 부적으로 상태 구분

참고 이미지를 게임 파일에 복제하거나 포함하지 않았습니다. 제출 전 참가자가 해당 입력 이미지의 이용 권리를 확인해야 합니다.

## 3. 한자·사자성어 데이터

- 사용자 제공 원본: `sajayeonseong_hanja_dataset_v2.0.zip`
- 게임 카탈로그: 한자 1,135자, 사자성어 75개
- 훈음 보충: HanjaDict 0.4.1, MIT License
- 검수 상태: 모든 레코드에 `source`와 `status`를 유지하며 자동 보충값과 수동 검수값을 구분

HanjaDict의 MIT 전문은 게임 ZIP의 `THIRD_PARTY_NOTICES.md`에 포함합니다.

## 4. 생성 서비스와 제출 전 권리 확인

### OpenAI 이미지 생성

에셋은 프로젝트 전용 프롬프트와 사용자가 제공한 참고 이미지로 생성했습니다. OpenAI의 현재 정책·약관은 [OpenAI Terms & policies](https://openai.com/policies/)에서 확인합니다. 참가자는 입력 참고 이미지에 필요한 권리를 보유해야 합니다.

### Suno 오디오

Suno의 [유료 구독 권리 안내](https://help.suno.com/en/articles/9601665)와 [이용약관](https://suno.com/terms/)에 따르면, 상업 이용 가능 여부는 생성 당시 계정 등급과 약관 준수에 달려 있습니다.

제출 전 필수 확인:

- [ ] `assets/audio/catalog.json`에 기록된 모든 원본 ID가 참가자 계정에서 생성됐는지 확인
- [ ] 각 생성 시점에 Pro/Premier 등 상업 이용 가능한 유료 등급이었는지 증빙 보관
- [ ] 타인의 음원 업로드·리믹스·가사 없이 프로젝트 프롬프트로 생성됐는지 확인

## 5. 외부 런타임 요청

`index.html`은 네트워크가 있을 때 Google Fonts의 Gowun Batang과 Noto Sans KR을 요청합니다. 두 글꼴은 SIL Open Font License 계열이며 바이너리는 ZIP에 포함하지 않습니다. 네트워크가 없어도 CSS의 시스템 글꼴 대체 경로로 게임 기능과 한자 표시가 유지됩니다.
