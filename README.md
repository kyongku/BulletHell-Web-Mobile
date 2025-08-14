# BulletHell — Mobile v3 (ready, Supabase filled)

## 이미 채워둔 값
- URL: https://pecoerlqanocydrdovbb.supabase.co
- anon key: eyJhbGciOiJI... (전체 키는 코드 상단에 포함됨)

## 배포
- GitHub Pages: 이 폴더를 리포 루트에 올리고 Settings→Pages에서 main/root로 배포
- Supabase Auth→URL Configuration
  - Site URL: `https://<user>.github.io/<repo>/`
  - Additional Redirect: `https://<user>.github.io/<repo>/ranking/`

## 참고
- SQL Editor에서 `schema_update.sql` 실행하면 유저별 최고점 뷰 `top_scores`가 생성됩니다.
