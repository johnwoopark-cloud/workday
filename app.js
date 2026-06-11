// 1. Supabase 설정 (본인 정보 입력)
const SUPABASE_URL = "https://xxxxxxxxx.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let calendar; // FullCalendar 인스턴스를 담을 전역 변수

document.addEventListener("DOMContentLoaded", () => {
    initCalendar();     // 달력 초기화
    fetchEmployees();   // 직원 목록 가져오기
    fetchAttendance();  // 근태 데이터 가져와서 달력에 표시
    
    document.getElementById("attendance-form").addEventListener("submit", handleFormSubmit);
    document.getElementById("input-date").value = new Date().toISOString().split('T')[0];
});

// 2. FullCalendar 초기화 함수
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', // 기본 화면은 '월(Month)' 단위 달력
        locale: 'ko',                // 한국어 설정
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay' // 월, 주, 일 버튼 기본 제공
        },
        buttonText: {
            today: '오늘',
            month: '월',
            week: '주',
            day: '일'
        },
        height: '650px',
        editable: false,
        events: [] // 초기에는 빈 값, Supabase 데이터를 가져와 채울 예정
    });
    
    calendar.render();
}

// 3. Supabase에서 근태 기록 가져와 달력에 얹기 (가장 중요)
async function fetchAttendance() {
    // attendance 조회 + 직원 이름 조인
    const { data, error } = await _supabase
        .from('attendance')
        .select(`
            id, work_date, type, check_in, check_out, leave_type,
            employees ( name )
        `);

    if (error) {
        console.error("데이터 로드 실패:", error);
        return;
    }

    // FullCalendar 규격에 맞게 데이터 가공(지도 그리기)
    const events = data.map(record => {
        const empName = record.employees ? record.employees.name : '미확인';
        
        let eventTitle = '';
        let eventColor = '#4f46e5'; // 기본 색상 (출퇴근용)

        if (record.type === '출퇴근') {
            const checkIn = record.check_in ? record.check_in.substring(0, 5) : '--:--';
            const checkOut = record.check_out ? record.check_out.substring(0, 5) : '--:--';
            eventTitle = `[출퇴근] ${empName}: ${checkIn} ~ ${checkOut}`;
            eventColor = '#10b981'; // 출퇴근은 초록색 계열
        } else {
            eventTitle = `[${record.leave_type}] ${empName}`;
            eventColor = '#f59e0b'; // 휴가는 오렌지색 계열
        }

        return {
            id: record.id,
            title: eventTitle,
            start: record.work_date, // YYYY-MM-DD
            backgroundColor: eventColor,
            borderColor: eventColor
        };
    });

    // 달력의 기존 이벤트를 모두 지우고 새 이벤트 세트 추가
    calendar.removeAllEvents();
    calendar.addEventSource(events);
}

// 4. 직원 정보 가져오기 (기존과 동일)
async function fetchEmployees() {
    const { data, error } = await _supabase
        .from('employees')
        .select('id, name')
        .order('id', { ascending: true });

    if (error) return;

    const selectEl = document.getElementById("select-employee");
    selectEl.innerHTML = data.map(emp => `<option value="${emp.id}">${emp.name}</option>`).join('');
}

// [구분] 선택 전환 (기존과 동일)
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

// 5. 데이터 저장하기 (저장 후 달력 새로고침 추가)
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
    } else {
        insertData.leave_type = document.getElementById("select-leave").value;
    }

    const { error } = await _supabase.from('attendance').insert([insertData]);

    if (error) {
        alert("저장 실패: " + error.message);
    } else {
        alert("성공적으로 기록되었습니다!");
        document.getElementById("attendance-form").reset();
        document.getElementById("input-date").value = date;
        toggleFormFields();
        
        // 저장 성공 시 달력 데이터 다시 불러와서 갱신하기 
        fetchAttendance();
    }
}
