// ==========================================
// 1. Supabase 설정 (여기에 본인 정보를 "한 번만" 넣으세요)
// ==========================================
const SUPABASE_URL = "https://vxvpjhaxplrqlxyyzxlo.supabase.co"; // 👈 본인 주소로 교체
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dnBqaGF4cGxycWx4eXl6eGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDM2MDUsImV4cCI6MjA5NjcxOTYwNX0.pfcnUPN82_OA-w3jl3Xf0Kbjsdj9t2EqV2yyCYGJ7NU"; // 👈 본인 Anon 키로 교체
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let calendar; // FullCalendar 인스턴스를 담을 전역 변수

// ==========================================
// 2. 페이지 로드 시 실행할 이벤트들
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initCalendar();     // 달력 초기화
    fetchEmployees();   // 직원 목록 가져오기
    fetchAttendance();  // 근태 데이터 가져와서 달력에 표시
    
    // 폼 제출 이벤트 연결
    document.getElementById("attendance-form").addEventListener("submit", handleFormSubmit);
    // 기본 날짜를 오늘로 설정
    document.getElementById("input-date").value = new Date().toISOString().split('T')[0];
});

// ==========================================
// 3. FullCalendar 달력 초기화 함수
// ==========================================
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', // 기본 화면: 월 단위 달력
        locale: 'ko',                // 한국어 설정
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay' // 월, 주, 일 버튼
        },
        buttonText: {
            today: '오늘',
            month: '월',
            week: '주',
            day: '일'
        },
        height: '650px',
        editable: false,
        events: [] // 초기에는 빈 값
    });
    
    calendar.render();
}

// ==========================================
// 4. Supabase에서 직원 목록 가져와 드롭다운에 채우기
// ==========================================
async function fetchEmployees() {
    try {
        const { data, error } = await _supabase
            .from('employees')
            .select('id, name')
            .order('id', { ascending: true });

        if (error) {
            alert("직원 명단을 가져오는데 실패했습니다: " + error.message);
            return;
        }

        const selectEl = document.getElementById("select-employee");
        if (data && data.length > 0) {
            selectEl.innerHTML = data.map(emp => `<option value="${emp.id}">${emp.name}</option>`).join('');
        } else {
            selectEl.innerHTML = `<option value="">등록된 직원이 없습니다.</option>`;
        }
    } catch (err) {
        console.error("fetchEmployees 에러:", err);
    }
}

// ==========================================
// 5. Supabase에서 근태 기록 가져와 달력에 표시하기
// ==========================================
async function fetchAttendance() {
    try {
        const { data, error } = await _supabase
            .from('attendance')
            .select(`
                id, work_date, type, check_in, check_out, leave_type,
                employees ( name )
            `);

        if (error) {
            console.error("근태 데이터 로드 실패:", error);
            return;
        }

        const events = data.map(record => {
            const empName = record.employees ? record.employees.name : '미확인';
            let eventTitle = '';
            let eventColor = '#4f46e5';

            if (record.type === '출퇴근') {
                const checkIn = record.check_in ? record.check_in.substring(0, 5) : '--:--';
                const checkOut = record.check_out ? record.check_out.substring(0, 5) : '--:--';
                eventTitle = `[출근] ${empName}: ${checkIn}~${checkOut}`;
                eventColor = '#10b981'; // 출퇴근은 초록색
            } else {
                eventTitle = `[${record.leave_type}] ${empName}`;
                eventColor = '#f59e0b'; // 휴가는 주황색
            }

            return {
                id: record.id,
                title: eventTitle,
                start: record.work_date,
                backgroundColor: eventColor,
                borderColor: eventColor
            };
        });

        calendar.removeAllEvents();
        calendar.addEventSource(events);
    } catch (err) {
        console.error("fetchAttendance 에러:", err);
    }
}

// ==========================================
// 6. [구분] 선택 전환 (출퇴근 vs 휴가 입력창 바꿈)
// ==========================================
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

// ==========================================
// 7. 데이터 등록(Insert) 하기
// ==========================================
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

    const { error } = await _supabase.from('attendance').insert([insertData]);

    if (error) {
        alert("저장 실패: " + error.message);
    } else {
        alert("성공적으로 기록되었습니다!");
        document.getElementById("attendance-form").reset();
        document.getElementById("input-date").value = date;
        toggleFormFields();
        
        // 갱신된 데이터를 달력에 다시 그리기
        fetchAttendance();
    }
}
