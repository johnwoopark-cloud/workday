// ==========================================
// 1. Supabase 설정 (본인의 정보를 입력하세요)
// ==========================================
const SUPABASE_URL = "https://vxvpjhaxplrqlxyyzxlo.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dnBqaGF4cGxycWx4eXl6eGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDM2MDUsImV4cCI6MjA5NjcxOTYwNX0.pfcnUPN82_OA-w3jl3Xf0Kbjsdj9t2EqV2yyCYGJ7NU"; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let calendar; 

// ==========================================
// 2. 페이지 로드 시 실행할 이벤트들
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initCalendar();     
    fetchEmployees();   
    fetchAttendance();  
    
    document.getElementById("attendance-form").addEventListener("submit", handleFormSubmit);
    
    // 기본 시작 날짜를 오늘로 설정
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById("input-start-date").value = todayStr;
});

// ==========================================
// 3. FullCalendar 달력 초기화 함수
// ==========================================
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', 
        locale: 'ko',                
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay' 
        },
        buttonText: { today: '오늘', month: '월', week: '주', day: '일' },
        height: '650px',
        editable: false,
        events: [] 
    });
    
    calendar.render();
}

// ==========================================
// 4. Supabase에서 직원 목록 가져오기
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
                let shiftName = "출퇴근";
                if (record.check_in === "09:00:00") shiftName = "9시~6시";
                if (record.check_in === "10:00:00") shiftName = "10시~7시";
                else if (record.check_in === "08:00:00") shiftName = "8시~5시";
                else if (record.check_in === "07:00:00") shiftName = "7시~4시";

                eventTitle = `[${shiftName}] ${empName}`;
                eventColor = '#10b981'; 
            } else {
                eventTitle = `[${record.leave_type}] ${empName}`;
                eventColor = '#f59e0b'; 
            }

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

function toggleFormFields() {}

// 두 날짜 사이의 모든 날짜 리스트를 구하는 함수 (YYYY-MM-DD 형태 배열 리턴)
function getDatesStartToArr(startDate, endDate) {
    const arr = [];
    const dt = new Date(startDate);
    const endDt = new Date(endDate);
    while (dt <= endDt) {
        arr.push(new Date(dt).toISOString().split('T')[0]);
        dt.setDate(dt.getDate() + 1);
    }
    return arr;
}

// ==========================================
// 7. 데이터 등록(Insert) 하기 (시작/종료일 분할 및 동일 내용 중복 검사)
// ==========================================
async function handleFormSubmit(e) {
    e.preventDefault();

    const employeeId = document.getElementById("select-employee").value;
    const selectedType = document.getElementById("select-type").value;
    const startDate = document.getElementById("input-start-date").value;
    let endDate = document.getElementById("input-end-date").value;
    const notes = document.getElementById("input-notes").value || null;
    
    if (!selectedType) {
        alert("구분 종류를 선택해 주세요.");
        return;
    }

    if (!endDate) {
        endDate = startDate;
    }

    if (new Date(startDate) > new Date(endDate)) {
        alert("⚠️ 종료일은 시작일보다 빠를 수 없습니다.");
        return;
    }

    let targetType = '';
    let targetCheckIn = null;
    let targetCheckOut = null;
    let targetLeaveType = null;

    if (selectedType === "9시~6시") {
        targetType = "출퇴근"; targetCheckIn = "09:00:00"; targetCheckOut = "18:00:00";
    } else if (selectedType === "10시~7시") {
        targetType = "출퇴근"; targetCheckIn = "10:00:00"; targetCheckOut = "19:00:00";
    } else if (selectedType === "8시~5시") {
        targetType = "출퇴근"; targetCheckIn = "08:00:00"; targetCheckOut = "17:00:00";
    } else if (selectedType === "7시~4시") {
        targetType = "출퇴근"; targetCheckIn = "07:00:00"; targetCheckOut = "16:00:00";
    } else if (selectedType === "휴가") {
        targetType = "휴가"; targetLeaveType = "연차";
    } else if (selectedType === "오전") {
        targetType = "휴가"; targetLeaveType = "오전반차";
    } else if (selectedType === "오후") {
        targetType = "휴가"; targetLeaveType = "오후반차";
    }

    const dateList = getDatesStartToArr(startDate, endDate);

    try {
        // 해당 직원의 기간 내 기존 기록 조회
        const { data: existingRecords, error: checkError } = await _supabase
            .from('attendance')
            .select('id, work_date, type, check_in, leave_type')
            .eq('employee_id', parseInt(employeeId))
            .in('work_date', dateList);

        if (checkError) throw checkError;

        // 완전히 동일한 내용인지 확인 (차단 대상)
        for (const record of existingRecords) {
            const isExactSame =
                record.type === targetType &&
                (targetType === "출퇴근"
                    ? record.check_in === targetCheckIn          // 같은 시프트
                    : record.leave_type === targetLeaveType);    // 같은 휴가 종류

            if (isExactSame) {
                alert(`⚠️ 중복 입력 방지: 해당 직원은 ${record.work_date}에 이미 동일한 신청([${selectedType}])이 등록되어 있습니다.`);
                return;
            }
        }

        // 같은 type(출퇴근↔출퇴근, 휴가↔휴가)끼리 겹치는 기존 기록 삭제
        const idsToDelete = existingRecords
            .filter(record => record.type === targetType)
            .map(record => record.id);

        if (idsToDelete.length > 0) {
            const deletedDates = existingRecords
                .filter(r => idsToDelete.includes(r.id))
                .map(r => r.work_date)
                .join(', ');

            const confirmed = confirm(
                `⚠️ 아래 날짜에 기존 [${targetType}] 기록이 있습니다:\n${deletedDates}\n\n기존 기록을 삭제하고 새 기록으로 교체할까요?`
            );
            if (!confirmed) return;

            const { error: deleteError } = await _supabase
                .from('attendance')
                .delete()
                .in('id', idsToDelete);

            if (deleteError) throw deleteError;
        }

    } catch (err) {
        alert("처리 중 오류가 발생했습니다. 다시 시도해 주세요.");
        console.error(err);
        return;
    }

    // 새 데이터 삽입
    const insertRows = dateList.map(date => ({
        employee_id: parseInt(employeeId),
        work_date: date,
        type: targetType,
        check_in: targetCheckIn,
        check_out: targetCheckOut,
        leave_type: targetLeaveType,
        notes: notes
    }));

    const { error } = await _supabase.from('attendance').insert(insertRows);

    if (error) {
        alert("저장 실패: " + error.message);
    } else {
        alert(`${dateList.length}일간의 기록이 성공적으로 저장되었습니다!`);
        document.getElementById("attendance-form").reset();
        document.getElementById("input-start-date").value = startDate;
        toggleFormFields();
        fetchAttendance();
    }
}
