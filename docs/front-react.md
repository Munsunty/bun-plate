# 프로젝트 아키텍처 설계서 (SSOT)

> 이 문서는 Claude Code 구현의 단일 기준점(Single Source of Truth)이다.
> 구현 중 이 문서와 충돌하는 결정을 내리지 말 것. 변경이 필요하면 먼저 이 문서를 갱신한다.

## 스택

- 런타임/번들러/패키지매니저/테스트러너: **Bun**
- 언어: **TypeScript**
- UI: **React** (웹 전용. 표준이라서 채택 — 프레임워크가 아니라 "인터랙티브 영역의 렌더러"로만 고용한다)
- React Native: **범위 밖** (이 프로젝트에서 고려하지 않음)

## 한 줄 요약

서버가 문서 전체를 소유하는 페이지별 SSR HTML + 인터랙티브 위젯만 React island로
hydrate + 경량 전환은 서버 fragment 교체. MPA의 장점(서버가 진실, 페이지 격리,
JS 최소)과 SPA의 장점(영속 셸, 무깜빡임 전환)을 혼합하되,
RSC / Next.js / react-router 를 쓰지 않는다.

## 풀려는 본질적 문제

React의 hydration 세금: 서버가 이미 그린 화면을 클라이언트가 전부 다시 계산해
검증하는 이중 계산. 그리고 React의 소유 모델: 루트 아래 전체를 자신이 소유한다고
가정한다. 해법은 **React에게 주는 영역을 위젯 단위로 최소화**하는 것이다.
검증비용은 hydrate하는 영역에만 발생하므로, hydrate하지 않는 영역(문서/셸/페이지
정적부)의 검증비용은 0이다.

---

## 핵심 설계 원칙

1. **불필요한 것은 만들지 않는다.** 프레임워크의 범용 기능을 재현하지 않는다.
2. **정적인 것은 클라이언트로 JS를 보내지 않는다.** SSR HTML로 그리고 hydrate 대상에서 제외한다.
3. **데이터는 단방향이다.** SSR이 그린 값이 그대로 hydrate 입력이 된다. 핸드오프에 캐시/재페치를 두지 않는다.
4. **전환은 두 등급으로 나눈다.** 경량 전환만 부분 교체하고, 중량 전환은 브라우저에 위임한다.
5. **생명주기 정리는 React unmount에 위임한다.** 수동 cleanup 시스템을 만들지 않는다.
6. **클라이언트 React 루트가 소유하지 않는 DOM은 직접 조작해도 된다.** (innerHTML 교체가 합법인 이유)

---

## 아키텍처 구성요소

### 1. 페이지별 SSR HTML (서버가 문서를 소유)

- 각 페이지를 독립적으로 SSR하여 완성된 HTML을 서빙한다. (MPA 기반)
- 목적: 빠른 첫 화면(FCP), SEO, 페이지별 경량 번들.
- 서버는 `<Shell><Page/></Shell>`을 **하나의 React 트리로 1회 렌더**해 스트리밍한다.
  단, 이 트리는 서버 전용이다 — 클라이언트 React는 이 DOM의 존재를 모른다.
- 문서/셸/페이지 정적부(헤더, footer, 본문 정적 콘텐츠)는 **hydrate하지 않는다.**
  해당 컴포넌트 JS는 클라이언트로 보내지 않는다.
- 렌더링 API: `react-dom/server`의 `renderToReadableStream`.

### 2. React Islands (위젯 단위 루트)

```
문서/셸/페이지 골격   ← 서버 HTML. 클라이언트 React 관여 0. 검증비용 0.
  └─ [data-island]   ← 인터랙티브 위젯마다 독립 React 루트. hydrate 범위 = 위젯 내부만.
```

- 서버: `<Island name="todos" props={{initial}} of={Todos}/>` 래퍼가
  `<div data-island="todos" data-props="...json...">위젯 SSR HTML</div>` 마커를 출력한다.
- 클라이언트 boot: `[data-island]`를 스캔 → island 레지스트리에서 컴포넌트를 동적 import →
  `hydrateRoot(마커, <Widget {...props}/>)`. 마커 내부만 React 소유가 된다.
- **단일 React 인스턴스, 다중 위젯 루트.** (분리 빌드 마이크로 프론트엔드 아님)
- 위젯 제거 = `root.unmount()` — effect cleanup / 리스너 / 타이머 정리를 React에 위임 (원칙 5).
- 과거의 "이중 루트(영속 셸 루트 + 페이지 루트)"는 폐기했다. 셸 루트가 페이지 DOM을
  안 건드린다는 보장이 React에 없고(hoistable 주입으로 실제 깨짐), 셸은 인터랙티브가
  없으므로 애초에 hydrate할 이유가 없다. 영속 셸은 "건드리는 주체가 없음"으로 달성된다.

### 3. Island props 핸드오프 (단방향 데이터)

- 목적: SSR이 수행한 depth-0 데이터 페치 결과를 클라이언트가 재계산/재페치 없이 그대로 사용.
- 동작:
  1. SSR 시점에 페이지의 depth-0 데이터를 Service 계층에서 직접 로드 (HTTP 자기호출 없음).
  2. 그 값을 위젯 props로 그려서 HTML을 만들고, **같은 값을 `data-props`에 JSON으로 직렬화**한다.
  3. 클라이언트는 `data-props`를 파싱해 hydrate 입력으로 사용한다.
  4. 그린 데이터 == hydrate 데이터가 **구조적으로 보장**된다 (같은 직렬화 원본).
     캐시 미스/TTL/다중 인스턴스 문제가 존재하지 않는다.
- props는 JSON 직렬화 가능해야 한다 (함수/Date 불가 — 문자열로 넘긴다).
- 과거의 "화면키 캐시"(서버 echo 캐시 + X-Screen-Key 헤더)는 폐기했다. 미스 시
  hydration mismatch가 가능했고, API에 SSR 전용 분기가 침투했다. 인라인 직렬화가 상위 호환.

### 4. Hydration 규칙

- island hydrate는 **반드시 `hydrateRoot`** 사용 (fragment 교체 후 mount도 동일 —
  fragment 역시 서버가 렌더한 React 마크업이므로 hydrate로 DOM 재활용 → 깜빡임 없음).
- **비결정적 렌더(시간/랜덤/로케일 등)는 mismatch를 허용한다.** 영향 범위가 해당 island
  내부로 격리되는 것이 이 구조의 장점이다.
- 2번째 턴 이후(인터랙션에 의한 갱신)는 위젯이 정식 API fetch → 최신 데이터 반영. (일반 CSR 동작)

### 5. 페이지 전환 전략 (2등급)

- **경량 전환** (같은 셸 내에서 콘텐츠만 변경):
  1. global script가 내부 링크 클릭을 가로챈다 (`e.preventDefault()`).
  2. 해당 URL을 `?__fragment=1`로 fetch → 서버가 페이지 서브트리만 SSR한 HTML 조각 반환.
     (전환도 MPA다 — 페이지를 그리는 주체는 항상 서버)
  3. `#render` 내 기존 island 루트들 `unmount()` → `#render.innerHTML = 조각`
     (셸은 React 비소유 DOM이므로 합법, 원칙 6) → 새 조각의 island들 hydrate.
  4. `history.pushState` / `popstate` 처리.
  5. **fetch/hydrate 실패 시 `location.href` 폴백** — 죽은 클릭 금지.
- **중량 전환** (레이아웃/컨텍스트가 크게 바뀜):
  - `location.href = ...`로 **브라우저 네비게이션에 위임.** 정리는 브라우저가 전담.
- 등급은 라우트 메타 `transition: 'light' | 'heavy'`로 표기한다.

### 6. 상태 공유 (구 미결정 #1 — 확정)

- 원칙: **상태는 React 트리 밖(모듈 싱글톤)에 둔다.** React Context는 루트를 넘지 못한다.
- zustand/jotai/valtio: 모듈 스코프 스토어 → 모든 island가 자동 공유. Provider 불요.
- TanStack Query: 모듈 싱글톤 `QueryClient` 하나 + island mount 시 Provider 한 겹.
  캐시/dedupe/invalidation이 island 간 공유된다.
- 경량 전환에서는 싱글톤이 살아있으므로 상태가 유지된다 (SPA 장점).
  중량 전환은 전부 리셋된다 (MPA 의미론) — 필요 시 persist 미들웨어로 선택적 완화.

---

## 왜 기성 프레임워크가 아닌가

이 아키텍처는 Islands Architecture(Astro가 대중화)이며 발상 자체는 기성 노선이다.
차별점은 아키텍처가 아니라 **제약 조합**이다 — 아래 4개를 동시에 만족하는 기성품이 없다:

1. **Bun 단일 프로세스**: SSR + API(Elysia) + DB(bun:sqlite)가 한 서버. (Astro는 Vite/Node 중심 + 어댑터)
2. **end-to-end 타입**: Eden treaty로 위젯과 API가 스키마 하나를 공유.
3. **컴파일러 마법 0**: 평범한 TSX + 명시적 라우트 맵. 글루 전체가 수백 줄.
4. **React 19 표준 그대로**: Preact(Fresh)도 Qwik도 아님.

재검토 신호: 라우트 맵에 중첩/동적 패턴 증가, 페이지당 island 5개 이상으로 경계 관리
부담 증가, 원칙 1을 어기는 범용 기능 재현 시작 — 이때 Astro 전환을 다시 평가한다.

---

## 명시적으로 만들지 않을 것 (Non-Goals)

다음은 의도적으로 구현하지 않는다. "있으면 좋을까?" 싶어도 추가하지 말 것.

- ❌ **RSC (React Server Components)** — 번들러 통합 비용 회피. 정적부 JS 감축은 island 경계로 달성.
- ❌ **Next.js** — 불필요한 범용 기능이 response 경로에 오버헤드로 작용.
- ❌ **react-router** — 필요한 라우팅은 경량/중량 전환의 얇은 global script로 직접 처리.
- ❌ **다층 캐싱 시스템 / 자동 무효화** — 핸드오프는 인라인 직렬화로 끝. 캐시 자체가 없다.
- ❌ **파일시스템 라우팅 규약** — 명시적 라우트 맵을 코드로 둔다.
- ❌ **이미지/폰트 최적화 프레임워크화** — `/api/image` 변환기 수준까지만. 그 이상은 CDN/엣지에 위임.
- ❌ **수동 cleanup 생명주기 시스템** — React unmount에 위임.
- ❌ **분리 빌드 마이크로 프론트엔드** — island는 같은 번들/단일 React로 한다.

---

## Bun 빌드 관련 확정 사실 (중요)

- `Bun.build()` JS API 단독으로는 `"use client"` 기준 server/client 그래프 분할을 **하지 않는다.**
  일반 `splitting: true`는 공유 코드/동적 import 기준일 뿐 지시어를 보지 않는다.
- 본 설계는 RSC를 쓰지 않으므로 위 제약은 문제되지 않는다. 클라이언트 번들은
  **단일 boot 엔트리** + island 컴포넌트의 동적 import 청크로 일반 빌드한다.
- `naming`을 문자열로 주면 **엔트리포인트에만 적용**된다. splitting 청크까지
  `assets/` 아래에 두려면 객체 형태(`{entry, chunk, asset}`)로 줘야 한다. (실제 404 사고 이력)
- 프로덕션 빌드는 sourcemap을 내보내지 않는다 (원본 소스 유출 방지).

---

## 미결정 (구현 진행하며 확정할 것)

1. **island props의 타입 안전 직렬화** — 현재는 `JSON.stringify` + 수동 타입 일치.
   props 스키마를 Elysia `t.*`와 공유할지 추후 결정.
2. **정적/인터랙티브 혼합도** — 페이지당 island 수가 실제로 많아지면 경계 관리 부담 재평가.

---

## 검증 체크리스트

- [ ] 정적 영역(셸/footer/페이지 골격)의 컴포넌트 JS가 클라이언트 번들에 포함되지 않는다.
- [ ] 첫 진입 시 hydration mismatch 에러가 없다 (island 내부의 비결정적 부분 제외).
- [ ] `data-props`로 그린 값과 hydrate 입력이 동일하다 (재페치 없음 — 네트워크 탭에서 확인).
- [ ] 정적 페이지(About)는 `<script>`가 전혀 없다.
- [ ] 경량 전환 시 흰 화면 깜빡임이 없고, fragment 응답에 셸이 포함되지 않는다.
- [ ] 경량 전환 반복 시 좀비 리스너/메모리 누수가 없다 (island unmount 확인).
- [ ] 경량 전환 실패(오프라인/배포로 인한 청크 회전) 시 풀 네비게이션으로 폴백한다.
- [ ] 중량 전환은 브라우저 네비게이션으로 처리된다.
