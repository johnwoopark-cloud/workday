// ==========================================
// 1. Supabase 설정 (본인의 정보를 입력하세요)
// ==========================================
const SUPABASE_URL = "https://vxvpjhaxplrqlxyyzxlo.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dnBqaGF4cGxycWx4eXl6eGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDM2MDUsImV4cCI6MjA5NjcxOTYwNX0.pfcnUPN82_OA-w3jl3Xf0Kbjsdj9t2EqV2yyCYGJ7NU"; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let calendar; 
let holidaySet = new Set(); // 공휴일 날짜 모음 ('YYYY-MM-DD' 형태)

// ==========================================
// 2. 페이지 로드 시 실행할 이벤트들
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    await fetchHolidays();  // 공휴일을 먼저 불러온 뒤 달력을 그려야 표시가 정확함
    initCalendar();     
    fetchEmployees();   
    fetchAttendance();  
    
    document.getElementById("attendance-form").addEventListener("submit", handleFormSubmit);
    
    // 기본 시작 날짜를 오늘로 설정
    const todayStr = toDateStr(new Date());
    document.getElementById("input-start-date").value = todayStr;
});

// ==========================================
// 날짜/주말/공휴일 관련 공통 함수
// ==========================================

// Date 객체를 'YYYY-MM-DD'(로컬 기준) 문자열로 변환 (시간대 오류 방지)
function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// 토요일(6) / 일요일(0) 여부
function isWeekend(dateStr) {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    return day === 0 || day === 6;
}

// 공휴일 여부
function isHoliday(dateStr) {
    return holidaySet.has(dateStr);
}

// 근태를 기록하면 안 되는 날(주말 또는 공휴일)
function isBlockedDate(dateStr) {
    return isWeekend(dateStr) || isHoliday(dateStr);
}

// ==========================================
// 대한민국 공휴일 불러오기 (Nager.Date 무료 API, 키 불필요)
// ==========================================
async function fetchHolidays() {
    // 필요한 연도를 넉넉히 불러옴 (작년~내후년)
    const thisYear = new Date().getFullYear();
    const years = [thisYear - 1, thisYear, thisYear + 1];

    try {
        for (const year of years) {
            const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`);
            if (!res.ok) continue;
            const data = await res.json();
            // data 각 항목의 date 형식이 'YYYY-MM-DD'
            data.forEach(h => holidaySet.add(h.date));
        }
    } catch (err) {
        // 공휴일 API 실패 시에도 주말 차단은 계속 동작함
        console.error("공휴일 정보 로드 실패:", err);
    }
}

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
        events: [],

        // 주말/공휴일 칸을 빨갛게 표시
        dayCellClassNames: function (arg) {
            const dateStr = toDateStr(arg.date);
            if (isBlockedDate(dateStr)) return ['blocked-day'];
            return [];
        },

        // 달력의 근태 이벤트를 클릭하면 삭제할 수 있음
        eventClick: function (info) {
            const ev = info.event;
            if (confirm(`아래 기록을 삭제할까요?\n\n${ev.title}`)) {
                deleteAttendanceById(ev.id);
            }
        }
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
                else if (record.check_in === "10:00:00") shiftName = "10시~7시";
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
    const dt = new Date(startDate + 'T00:00:00');
    const endDt = new Date(endDate + 'T00:00:00');
    while (dt <= endDt) {
        arr.push(toDateStr(dt));
        dt.setDate(dt.getDate() + 1);
    }
    return arr;
}

// ==========================================
// 근태 기록 1건 삭제 (달력 이벤트 클릭 시 사용)
// ==========================================
async function deleteAttendanceById(id) {
    try {
        const { error } = await _supabase.from('attendance').delete().eq('id', id);
        if (error) {
            alert("삭제 실패: " + error.message);
            return;
        }
        alert("삭제되었습니다.");
        fetchAttendance();
    } catch (err) {
        console.error("deleteAttendanceById 에러:", err);
        alert("삭제 중 오류가 발생했습니다.");
    }
}

// ==========================================
// 선택한 기간의 직원 기록 일괄 삭제 ('기존 내용 삭제' 옵션용)
// ==========================================
async function deleteAttendanceByRange(employeeId, dateList, startDate, endDate) {
    try {
        const { data: toDelete, error: findErr } = await _supabase
            .from('attendance')
            .select('id')
            .eq('employee_id', parseInt(employeeId))
            .in('work_date', dateList);

        if (findErr) throw findErr;

        if (!toDelete || toDelete.length === 0) {
            alert("해당 기간에 삭제할 기록이 없습니다.");
            return;
        }

        const confirmed = confirm(
            `선택한 기간(${startDate} ~ ${endDate})에서\n해당 직원의 근태 기록 ${toDelete.length}건을 삭제할까요?`
        );
        if (!confirmed) return;

        const { error: delErr } = await _supabase
            .from('attendance')
            .delete()
            .in('id', toDelete.map(r => r.id));

        if (delErr) throw delErr;

        alert(`${toDelete.length}건의 기록을 삭제했습니다.`);
        fetchAttendance();
    } catch (err) {
        console.error("deleteAttendanceByRange 에러:", err);
        alert("삭제 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
}

// ==========================================
// 7. 데이터 등록(Insert) 하기
//    - 주말/공휴일 자동 제외
//    - '기존 내용 삭제' 옵션 처리
//    - 동일 내용 중복 검사 / 같은 type 교체
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

    const dateList = getDatesStartToArr(startDate, endDate);

    // ----- (A) '기존 내용 삭제' 옵션 처리 -----
    if (selectedType === "삭제") {
        await deleteAttendanceByRange(employeeId, dateList, startDate, endDate);
        document.getElementById("attendance-form").reset();
        document.getElementById("input-start-date").value = startDate;
        return;
    }

    // ----- (B) 일반 등록: 구분 종류 매핑 -----
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

    // ----- (C) 주말/공휴일 제외 -----
    const workDateList = dateList.filter(d => !isBlockedDate(d));
    const skippedDates = dateList.filter(d => isBlockedDate(d));

    if (workDateList.length === 0) {
        alert("⚠️ 선택한 날짜가 모두 주말 또는 공휴일이라 등록할 날짜가 없습니다.");
        return;
    }

    if (skippedDates.length > 0) {
        const ok = confirm(
            `아래 ${skippedDates.length}일은 주말/공휴일이라 자동 제외됩니다:\n${skippedDates.join(', ')}\n\n` +
            `나머지 ${workDateList.length}일만 등록할까요?`
        );
        if (!ok) return;
    }

    try {
        // 해당 직원의 (근무일 한정) 기존 기록 조회
        const { data: existingRecords, error: checkError } = await _supabase
            .from('attendance')
            .select('id, work_date, type, check_in, leave_type')
            .eq('employee_id', parseInt(employeeId))
            .in('work_date', workDateList);

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

    // 새 데이터 삽입 (주말/공휴일 제외된 workDateList 기준)
    const insertRows = workDateList.map(date => ({
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
        alert(`${workDateList.length}일간의 기록이 성공적으로 저장되었습니다!`);
        document.getElementById("attendance-form").reset();
        document.getElementById("input-start-date").value = startDate;
        toggleFormFields();
        fetchAttendance();
    }
}
