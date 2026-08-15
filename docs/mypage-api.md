# 마이페이지 API 명세 (PM-01 ~ PM-07)

> 기능명세서 MY 섹션(PM-01~PM-07) 대응. 2026-07-24 초안, 2026-08-07 정리.

## 목차

1. [마이페이지 프로필 (PM-01)](#1-마이페이지-프로필-pm-01)
2. [저장한 콘텐츠 — 스크랩 (PM-02)](#2-저장한-콘텐츠--스크랩-pm-02)
3. [프로필 편집 (PM-03)](#3-프로필-편집-pm-03)
4. [회원 탈퇴 (AUTH-14)](#4-회원-탈퇴-auth-14)
5. [미구현 기능 및 근거](#5-미구현-기능-및-근거)

---

## 1. 마이페이지 프로필 (PM-01)

### `GET /api/users/me` 🔒

프로필 카드(닉네임, 소속, 역할 뱃지), 활동 요약(연속학습, 포인트, 리그순위), 자산 요약을 반환한다.

**Response 200**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "plain.123@gmail.com",
    "nickname": "인천인",
    "role": "USER",
    "position": "TRADER",
    "provider": "kakao",
    "school": {
      "id": 42,
      "name": "연세대학교",
      "is_verified": true
    },
    "team": {
      "id": 5,
      "name": "Investars",
      "role": "MEMBER"
    },
    "streak": {
      "consecutive_days": 8,
      "total_learning_days": 45
    },
    "points": 2450,
    "league_rank": 3,
    "asset": {
      "total_equity": 10780000,
      "return_rate": 8.42,
      "return_amount": 838000
    },
    "created_at": "2026-05-01T00:00:00.000Z"
  }
}
```

| 필드 | 설명 | 비고 |
|---|---|---|
| `school` | null if 학교 미선택 | |
| `team` | null if 팀 미소속 | |
| `league_rank` | 개인 리그 순위 | ranking 도메인 연동. Redis 미계산·학교 미설정 시 null |
| `asset` | null if 개인계좌 미생성 | 활성 시즌 기준 |
| `asset.return_rate` | % 단위 수익률 | |
| `asset.return_amount` | 원 단위 수익금액 | total_equity - initial_cash |

---

## 2. 저장한 콘텐츠 — 스크랩 (PM-02)

### `GET /api/community/posts/bookmarked` 🔒

스크랩한 게시글 목록을 반환한다. 스크랩 시간 역순.

**Response 200**

```json
{
  "success": true,
  "data": [
    {
      "id": 88,
      "title": "KOSPI 전망",
      "post_type": "STOCK_DISCUSSION",
      "stock_code": "AAPL",
      "opinion": "BUY",
      "view_count": 120,
      "like_count": 15,
      "comment_count": 3,
      "created_at": "2026-07-20T10:00:00.000Z",
      "author_nickname": "투자왕",
      "bookmarked_at": "2026-07-21T08:00:00.000Z"
    }
  ]
}
```

> **저장한 숏폼** (`GET /api/learning/shortforms/saved`)은 콘텐츠(숏폼) 시딩 후 구현 예정.

---

## 3. 프로필 편집 (PM-03)

### `PATCH /api/users/me` 🔒

닉네임 또는 학교를 수정한다. 온보딩에서는 `school_id`만 보낼 수 있다. 학교가 바뀌면 기존 학교 인증은 해제되며, 팀 소속 중에는 학교를 변경할 수 없다.

**Request Body**

```json
{ "nickname": "새닉네임", "school_id": 42 }
```

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `nickname` | string | 조건부 | 1~50자 |
| `school_id` | integer | 조건부 | 1 이상의 존재하는 학교 ID. 둘 중 한 필드는 필수 |

**Response 200** — 수정된 유저 기본 정보

```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "plain.123@gmail.com",
    "nickname": "새닉네임",
    "role": "USER",
    "school_id": 42,
    "school_is_verified": true,
    "position": "TRADER"
  }
}
```

---

## 4. 회원 탈퇴 (AUTH-14)

### `DELETE /api/users/me` 🔒

계정을 영구 삭제한다. FK CASCADE 정책에 따라 관련 데이터(계좌, 주문, 출석, 팀 멤버십, 게시글, 알림 등)가 자동 삭제된다.

**Response 200**

```json
{
  "success": true,
  "message": "회원 탈퇴가 완료되었습니다."
}
```

---

## 5. 미구현 기능 및 근거

### PM-04 학교 인증 — 인증 수단·심사 절차 미확정

기능명세서 AUTH-07에 "대학 인증 화면 제작. 인증 수단·심사 절차 `확인 필요`"로 표기. 파일 업로드/이메일 인증/학교 코드 등 방식이 결정되지 않아 구현 보류.

### PM-05 알림 설정 — 알림 발송 로직과 연동 필요

알림 카테고리별 on/off 설정은 실제 알림 발송 시 필터링 로직이 함께 구현되어야 의미가 있음. 현재 알림 발송(`createNotification`)에 설정 참조 로직이 없어 구현 보류.

### PM-06 질문 (FAQ) — 백엔드 불필요

정적 Q&A 데이터로, 프론트 하드코딩 또는 CMS 연동이 적합.

### PM-07 문의하기 — 백엔드 불필요

이메일 주소 표시 + 클립보드 복사만 하는 정적 화면.

---

## DB 변경 사항

### 기존 테이블 활용 (변경 없음)

- `PostBookmarks` — PM-02 스크랩 목록 조회에 활용 (이미 존재)
