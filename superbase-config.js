// supabase-config.js
// ── 여기 두 줄만 당신 프로젝트 값으로 바꾸면 됩니다. ─────────────
//   Supabase 대시보드 → Project Settings → API 에서 복사
const SUPABASE_URL = "https://vxvpjhaxplrqlxyyzxlo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dnBqaGF4cGxycWx4eXl6eGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDM2MDUsImV4cCI6MjA5NjcxOTYwNX0.pfcnUPN82_OA-w3jl3Xf0Kbjsdj9t2EqV2yyCYGJ7NU";   // anon public 키 (노출돼도 안전)
// ────────────────────────────────────────────────────────────

// 로그인 성공 후 이동할 "메인 페이지" (현재 쓰시는 페이지 파일명으로 바꾸세요)
const APP_HOME = "./index.html";

// CDN 전역(supabase.createClient)에서 클라이언트 생성.
// 전역 이름과 안 겹치도록 sb 라는 이름으로 씁니다.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
