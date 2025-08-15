# BulletHell — Mobile (Pattern Skins + Gacha + Boss Rewards)

## 핵심
- 350×350 / 모바일 조이스틱 / HUD(HP바 + 현재/최대 HP + 점수 + Gold)
- HP: 시작 100, **30초마다 MaxHP +10**
- 힐팩: 핑크 하트 **영구 유지**, 회복 = MaxHP 10% + 7
- 탄막: 탄속은 점수 비례 증가 → **10,000점 고정**, 스폰은 **12,000점 고정**
- 보스: **3,000점마다** 페이즈, **3번째부터 (보스번호−2)×10 Gold** 지급
- 가챠: 100G/회, 확률 **N70/R20/E7.5/L2/GOD0.5**
- 스킨: 등급별 **스트라이프/그라디언트** 패턴 (이미지 불필요)
- 계정/랭크/패치노트: Supabase Auth + scores + profiles + updates

## 설치
1) Supabase SQL Editor에서 `schema_update.sql` 실행  
2) 이 폴더의 파일을 정적 호스팅 루트(깃허브 페이지 등)에 업로드  
3) 캐시 갱신: 주소 뒤 `?v=1` 등 붙여 새로고침
