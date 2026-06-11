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
// 5. Supabase에서 근태 기록 가져와 달력에 표시하기 (가공 로직 추가)
// ==========================================
async function fetchAttendance() {
    try {
        const { data, error } = await _supabase
            .from('attendance')
            .select(`
                id, work_date, type, check_in, check_out, leave_type, notes,
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
                // 출퇴근 시간에 따라 타이틀 예쁘게 표기
                let shiftName = "출퇴근";
                if (record.check_in === "10:00:00") shiftName = "10시~7시";
                else if (record.check_in === "08:00:00") shiftName = "8시~5시";
                else if (record.check_in === "07:00:00") shiftName = "7시~4시";

                eventTitle = `[${shiftName}] ${empName}`;
                eventColor = '#10b981'; // 근무는 초록색
            } else {
                // 휴가, 오전반차, 오후반차 표기
                eventTitle = `[${record.leave_type}] ${empName}`;
                eventColor = '#f59e0b'; // 휴가는 주황색
            }

            // 메모가 있다면 타이틀 뒤에 붙여주기
            if (record.notes) {
                eventTitle += ` (${record.notes})`;
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
// 6. [구분 종류] 선택 전환 (현재는 하나로 통합되어 비워두거나 단순 제어 가능)
// ==========================================
function toggleFormFields() {
    // 입력 칸이 간소화되어 별도로 숨길 필드가 없으므로 비워두어도 무방합니다.
}

// ==========================================
// 7. 데이터 등록(Insert) 하기 (중복 방지 로직 탑재)
// ==========================================
async function handleFormSubmit(e) {
    e.preventDefault();

    const employeeId = document.getElementById("select-employee").value;
    const selectedType = document.getElementById("select-type").value;
    const date = document.getElementById("input-date").value;
    const notes = document.getElementById("input-notes").value || null;
    
    if (!selectedType) {
        alert("구분 종류를 선택해 주세요.");
        return;
    }

    // 🚫 [중복 체크] 이 직원이 선택한 날짜에 이미 등록된 데이터가 있는지 먼저 조회
    try {
        const { data: existingRecords, error: checkError } = await _supabase
            .from('attendance')
            .select('id')
            .eq('employee_id', parseInt(employeeId))
            .eq('work_date', date);

        if (checkError) {
            console.error("중복 체크 오류:", checkError);
        }

        // 만약 조회된 결과가 한 개라도 있다면 등록을 거부합니다.
        if (existingRecords && existingRecords.length > 0) {
            alert("⚠️ 해당 직원은 이 날짜에 이미 근태(또는 휴가) 기록이 등록되어 있습니다.");
            return; // 함수를 여기서 즉시 종료하여 저장을 막음
        }
    } catch (err) {
        console.error("중복 검사 중 예외 발생:", err);
    }

    // 중복 검사를 통과했을 때만 아래 저장 로직 실행
    let insertData = {
        employee_id: parseInt(employeeId),
        work_date: date,
        notes: notes,
        type: '',
        check_in: null,
        check_out: null,
        leave_type: null
    };

    if (selectedType === "10시~7시") {
        insertData.type = "출퇴근";
        insertData.check_in = "10:00:00";
        insertData.check_out = "19:00:00";
    } else if (selectedType === "8시~5시") {
        insertData.type = "출퇴근";
        insertData.check_in = "08:00:00";
        insertData.check_out = "17:00:00";
    } else if (selectedType === "7시~4시") {
        insertData.type = "출퇴근";
        insertData.check_in = "07:00:00";
        insertData.check_out = "16:00:00";
    } else if (selectedType === "휴가") {
        insertData.type = "휴가";
        insertData.leave_type = "연차";
    } else if (selectedType === "오전") {
        insertData.type = "휴가";
        insertData.leave_type = "오전반차";
    } else if (selectedType === "오후") {
        insertData.type = "휴가";
        insertData.leave_type = "오후반차";
    }

    const { error } = await _supabase.from('attendance').insert([insertData]);

    if (error) {
        alert("저장 실패: " + error.message);
    } else {
        alert("성공적으로 기록되었습니다!");
        document.getElementById("attendance-form").reset();
        document.getElementById("input-date").value = date; 
        
        // 갱신된 데이터를 달력에 다시 그리기
        fetchAttendance();
    }
}
