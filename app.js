// 1. Supabase 초기화 설정 (본인의 정보로 교체하세요)
const SUPABASE_URL = "https://vxvpjhaxplrqlxyyzxlo.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dnBqaGF4cGxycWx4eXl6eGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDM2MDUsImV4cCI6MjA5NjcxOTYwNX0.pfcnUPN82_OA-w3jl3Xf0Kbjsdj9t2EqV2yyCYGJ7NU"; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 페이지 로드 시 실행할 함수들
document.addEventListener("DOMContentLoaded", () => {
    fetchEmployees(); // 직원 목록 가져오기
    document.getElementById("attendance-form").addEventListener("submit", handleFormSubmit);
    // 기본 날짜를 오늘로 설정
    document.getElementById("input-date").value = new Date().toISOString().split('T')[0];
});

// [구분] 선택에 따라 입력창 전환 (출퇴근 vs 휴가)
function toggleFormFields() {
    const type = document.getElementById("select-type").value;
    if (type === "출퇴근") {
        document.getElementById("work-fields").style.display = "block";
        document.getElementById("leave-fields").style.display = "none";
    } else {
        document.getElementById("work-fields").style.display = "none";
        document.getElementById("leave-fields").style.display = "block";
    }
}

// 2. 데이터베이스에서 직원 6명 불러와 셀렉트 박스에 넣기
async function fetchEmployees() {
    const { data, error } = await _supabase
        .from('employees')
        .select('id, name')
        .order('id', { ascending: true });

    if (error) {
        console.error("직원 로드 실패:", error);
        return;
    }

    const selectEl = document.getElementById("select-employee");
    selectEl.innerHTML = data.map(emp => `<option value="${emp.id}">${emp.name}</option>`).join('');
}

// 3. 데이터 등록(Insert) 하기
async function handleFormSubmit(e) {
    e.preventDefault();

    const employeeId = document.getElementById("select-employee").value;
    const type = document.getElementById("select-type").value;
    const date = document.getElementById("input-date").value;
    
    let insertData = {
        employee_id: parseInt(employeeId),
        type: type,
        work_date: date
    };

    if (type === "출퇴근") {
        insertData.check_in = document.getElementById("input-in").value || null;
        insertData.check_out = document.getElementById("input-out").value || null;
        insertData.leave_type = null;
    } else {
        insertData.check_in = null;
        insertData.check_out = null;
        insertData.leave_type = document.getElementById("select-leave").value;
    }

    // Supabase 상에 데이터 삽입 명령
    const { error } = await _supabase
        .from('attendance')
        .insert([insertData]);

    if (error) {
        alert("저장 실패: " + error.message);
    } else {
        alert("기록이 성공적으로 저장되었습니다!");
        document.getElementById("attendance-form").reset();
        document.getElementById("input-date").value = date; // 날짜는 유지
        toggleFormFields();
        // TODO: 조회 화면 새로고침 함수 실행
    }
}

// 4. 조회 탭 전환 처리 (일/주/월)
function changeView(type) {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    if (type === 'day') {
        loadDayView();
    } else if (type === 'week') {
        loadWeekView();
    } else if (type === 'month') {
        loadMonthView();
    }
}

// 일 단위 데이터 가져오기 예시
async function loadDayView() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("view-title").innerText = `📅 ${today} 근태 현황`;

    // attendance 테이블 조회 + employees 테이블의 name 조인(Join) 요청
    const { data, error } = await _supabase
        .from('attendance')
        .select(`
            id, work_date, type, check_in, check_out, leave_type,
            employees ( name )
        `)
        .eq('work_date', today);

    if (error) {
        console.error(error);
        return;
    }

    // 데이터를 테이블 형태로 출력하는 로직을 여기에 구현합니다.
    console.log("오늘의 데이터:", data);
}
