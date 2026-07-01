// ==========================================
// 1. Supabase 설정 (본인의 정보를 입력하세요)
// ==========================================
const SUPABASE_URL = "https://vxvpjhaxplrqlxyyzxlo.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dnBqaGF4cGxycWx4eXl6eGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDM2MDUsImV4cCI6MjA5NjcxOTYwNX0.pfcnUPN82_OA-w3jl3Xf0Kbjsdj9t2EqV2yyCYGJ7NU"; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let calendar; 
let holidaySet = new Set();      // 공휴일 날짜 모음 ('YYYY-MM-DD')
let allEvents = [];              // 전체 근태 이벤트(필터 전 원본)
let selectedFilterIds = new Set(); // 표시할 팀원 id(문자열). 비어있으면 전체 표시
let appInitialized = false;      // 달력 최초 1회만 생성

// ==========================================
// 근태 유형 정의 (한 곳에서 관리)
// ==========================================
// selectedType(드롭다운 값) -> 저장 정보 매핑
const TYPE_MAP = {
    "9시~6시":  { type: "출퇴근", checkIn: "09:00:00", checkOut: "18:00:00" },
    "10시~7시": { type: "출퇴근", checkIn: "10:00:00", checkOut: "19:00:00" },
    "8시~5시":  { type: "출퇴근", checkIn: "08:00:00", checkOut: "17:00:00" },
    "7시~4시":  { type: "출퇴근", checkIn: "07:00:00", checkOut: "16:00:00" },
    "휴가":     { type: "휴가",   leaveType: "연차" },
    "오전":     { type: "휴가",   leaveType: "오전반차" },
    "오후":     { type: "휴가",   leaveType: "오후반차" },
    "출장":     { type: "출장" },
    "외근":     { type: "외근" },
    "교육":     { type: "교육" },
    "회의":     { type: "회의" },
    "건강검진": { type: "건강검진" },
    "기타":     { type: "기타" }
};

// type별 색상 (달력 + 범례 공통)
const TYPE_COLORS = {
    "출퇴근":   "#10b981",
    "휴가":     "#f59e0b",
    "출장":     "#3b82f6",
    "외근":     "#0ea5e9",
    "교육":     "#8b5cf6",
    "회의":     "#ec4899",
    "건강검진": "#14b8a6",
    "기타":     "#6b7280"
};

// ==========================================
// 2. 페이지 로드 - 로그인 상태에 따라 화면 결정
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // 로그인 / 로그아웃 핸들러
    document.getElementById("login-form").addEventListener("submit", handleLogin);
    document.getElementById("logout-btn").addEventListener("click", handleLogout);

    // 근태 등록
    document.getElementById("attendance-form").addEventListener("submit", handleFormSubmit);

    // 필터 전체 선택/해제 버튼
    const selAll = document.getElementById("filter-select-all");
    const clrAll = document.getElementById("filter-clear-all");
    if (selAll) selAll.addEventListener("click", () => setAllEmployeeFilter(true));
    if (clrAll) clrAll.addEventListener("click", () => setAllEmployeeFilter(false));

    // 범례 그리기
    renderLegend();

    // 기본 시작 날짜 = 오늘
    document.getElementById("input-start-date").value = toDateStr(new Date());

    // 인증 상태 확인 후 화면 결정
    initAuth();
});

// ==========================================
// 2-1. 인증 처리 (Supabase Auth)
// ==========================================
async function initAuth() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        showApp();
    } else {
        showLogin();
    }

    // 로그인/로그아웃 시 화면 자동 전환
    _supabase.auth.onAuthStateChange((_event, session) => {
        if (session) showApp();
        else showLogin();
    });
}

function showLogin() {
    document.getElementById("login-view").style.display = "flex";
    document.getElementById("app-view").style.display = "none";
    document.getElementById("logout-btn").style.display = "none";
    document.getElementById("current-user").textContent = "";

    // 다른 사람이 볼 수 없도록 달력 비우기
    if (calendar) calendar.removeAllEvents();
    allEvents = [];
}

async function showApp() {
    document.getElementById("login-view").style.display = "none";
    document.getElementById("app-view").style.display = "";
    document.getElementById("logout-btn").style.display = "";

    // 로그인한 사용자 이메일 표시
    const { data: { user } } = await _supabase.auth.getUser();
    const who = document.getElementById("current-user");
    if (who && user) who.textContent = user.email;

    // 달력은 최초 1회만 생성
    if (!appInitialized) {
        await fetchHolidays();
        initCalendar();
        appInitialized = true;
    }

    fetchEmployees();
    fetchAttendance();
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-error");
    const btn = document.getElementById("login-btn");

    errEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "로그인 중…";

    const { error } = await _supabase.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = "로그인";

    if (error) {
        errEl.textContent = "로그인 실패: 이메일 또는 비밀번호를 확인해 주세요.";
        return;
    }
    document.getElementById("login-form").reset();
    // 화면 전환은 onAuthStateChange 가 처리
}

async function handleLogout() {
    await _supabase.auth.signOut();
    // 화면 전환은 onAuthStateChange 가 처리
}

// ==========================================
// 날짜/주말/공휴일 공통 함수
// ==========================================
function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function isWeekend(dateStr) {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    return day === 0 || day === 6;
}

function isHoliday(dateStr) {
    return holidaySet.has(dateStr);
}

function isBlockedDate(dateStr) {
    return isWeekend(dateStr) || isHoliday(dateStr);
}

// 출퇴근 check_in -> 시프트 이름
function shiftName(checkIn) {
    if (checkIn === "09:00:00") return "9시~6시";
    if (checkIn === "10:00:00") return "10시~7시";
    if (checkIn === "08:00:00") return "8시~5시";
    if (checkIn === "07:00:00") return "7시~4시";
    return "출퇴근";
}

// ==========================================
// 대한민국 공휴일 (Nager.Date 무료 API, 키 불필요)
// ==========================================
async function fetchHolidays() {
    const thisYear = new Date().getFullYear();
    const years = [thisYear - 1, thisYear, thisYear + 1];
    try {
        for (const year of years) {
            const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`);
            if (!res.ok) continue;
            const data = await res.json();
            data.forEach(h => holidaySet.add(h.date));
        }
    } catch (err) {
        console.error("공휴일 정보 로드 실패:", err);
    }
}

// ==========================================
// 3. FullCalendar 초기화
// ==========================================
function initCalendar() {
    const calendarEl = document.getElementById('calendar');

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ko',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: ''
        },
        buttonText: { today: '오늘' },
        height: '82vh',
        expandRows: true,
        editable: false,
        events: [],

        // 주말/공휴일 칸 강조
        dayCellClassNames: function (arg) {
            return isBlockedDate(toDateStr(arg.date)) ? ['blocked-day'] : [];
        },

        // 이벤트 클릭 -> 개별 삭제
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
// 4. 직원 목록 + 필터 체크박스
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

        buildEmployeeFilter(data);
    } catch (err) {
        console.error("fetchEmployees 에러:", err);
    }
}

// 표시할 팀원 다중 선택 체크박스 생성
function buildEmployeeFilter(employees) {
    const wrap = document.getElementById("employee-filter");
    if (!wrap) return;

    if (!employees || employees.length === 0) {
        wrap.innerHTML = `<p class="filter-empty">등록된 팀원이 없습니다.</p>`;
        return;
    }

    wrap.innerHTML = employees.map(emp => `
        <label class="filter-item">
            <input type="checkbox" class="emp-filter-cb" value="${emp.id}">
            <span>${emp.name}</span>
        </label>
    `).join('');

    wrap.querySelectorAll('.emp-filter-cb').forEach(cb => {
        cb.addEventListener('change', onFilterChange);
    });
}

function onFilterChange() {
    selectedFilterIds = new Set(
        Array.from(document.querySelectorAll('.emp-filter-cb:checked')).map(cb => cb.value)
    );
    applyFilter();
}

function setAllEmployeeFilter(checked) {
    document.querySelectorAll('.emp-filter-cb').forEach(cb => { cb.checked = checked; });
    onFilterChange();
}

// 선택된 팀원만 달력에 표시 (아무도 선택 안 하면 전체)
function applyFilter() {
    const filtered = (selectedFilterIds.size === 0)
        ? allEvents
        : allEvents.filter(e => selectedFilterIds.has(String(e.extendedProps.employeeId)));

    calendar.removeAllEvents();
    calendar.addEventSource(filtered);
}

// ==========================================
// 5. 근태 기록 -> 달력 이벤트
// ==========================================
async function fetchAttendance() {
    try {
        const { data, error } = await _supabase
            .from('attendance')
            .select(`
                id, work_date, type, check_in, check_out, leave_type, notes, employee_id,
                employees ( name )
            `);

        if (error) {
            console.error("근태 데이터 로드 실패:", error);
            return;
        }

        allEvents = data.map(record => {
            const empName = record.employees ? record.employees.name : '미확인';

            let label;
            if (record.type === '출퇴근') {
                label = shiftName(record.check_in);
            } else if (record.type === '휴가') {
                label = record.leave_type; // 연차 / 오전반차 / 오후반차
            } else {
                label = record.type;        // 출장 / 외근 / 교육 / 회의 / 건강검진
            }

            let title = `[${label}] ${empName}`;
            if (record.notes) title += ` (${record.notes})`;

            const color = TYPE_COLORS[record.type] || '#4f46e5';

            return {
                id: record.id,
                title: title,
                start: record.work_date,
                backgroundColor: color,
                borderColor: color,
                extendedProps: { employeeId: record.employee_id }
            };
        });

        applyFilter();
    } catch (err) {
        console.error("fetchAttendance 에러:", err);
    }
}

// 범례 표시
function renderLegend() {
    const el = document.getElementById("legend");
    if (!el) return;
    el.innerHTML = Object.entries(TYPE_COLORS).map(([name, color]) => `
        <span class="legend-item">
            <span class="legend-dot" style="background:${color}"></span>${name}
        </span>
    `).join('');
}

function toggleFormFields() {}

// 두 날짜 사이 모든 날짜 배열
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
// 삭제 함수들
// ==========================================
async function deleteAttendanceById(id) {
    try {
        const { error } = await _supabase.from('attendance').delete().eq('id', id);
        if (error) { alert("삭제 실패: " + error.message); return; }
        alert("삭제되었습니다.");
        fetchAttendance();
    } catch (err) {
        console.error("deleteAttendanceById 에러:", err);
        alert("삭제 중 오류가 발생했습니다.");
    }
}

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
// 7. 등록 (주말/공휴일 제외 + 삭제 옵션 + 중복검사)
// ==========================================
async function handleFormSubmit(e) {
    e.preventDefault();

    const employeeId = document.getElementById("select-employee").value;
    const selectedType = document.getElementById("select-type").value;
    const startDate = document.getElementById("input-start-date").value;
    let endDate = document.getElementById("input-end-date").value;
    const notes = document.getElementById("input-notes").value || null;

    if (!selectedType) { alert("구분 종류를 선택해 주세요."); return; }
    if (!endDate) endDate = startDate;

    if (new Date(startDate) > new Date(endDate)) {
        alert("⚠️ 종료일은 시작일보다 빠를 수 없습니다.");
        return;
    }

    const dateList = getDatesStartToArr(startDate, endDate);

    // (A) 기존 내용 삭제
    if (selectedType === "삭제") {
        await deleteAttendanceByRange(employeeId, dateList, startDate, endDate);
        document.getElementById("attendance-form").reset();
        document.getElementById("input-start-date").value = startDate;
        return;
    }

    // (B) 유형 매핑
    const mapped = TYPE_MAP[selectedType];
    if (!mapped) { alert("알 수 없는 구분 종류입니다."); return; }

    const targetType = mapped.type;
    const targetCheckIn = mapped.checkIn || null;
    const targetCheckOut = mapped.checkOut || null;
    const targetLeaveType = mapped.leaveType || null;

    // (C) 주말/공휴일 제외
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
        const { data: existingRecords, error: checkError } = await _supabase
            .from('attendance')
            .select('id, work_date, type, check_in, leave_type')
            .eq('employee_id', parseInt(employeeId))
            .in('work_date', workDateList);

        if (checkError) throw checkError;

        // 완전히 동일한 내용 차단
        for (const record of existingRecords) {
            const isExactSame =
                record.type === targetType &&
                (targetType === "출퇴근" ? record.check_in === targetCheckIn
                 : targetType === "휴가" ? record.leave_type === targetLeaveType
                 : true);

            if (isExactSame) {
                alert(`⚠️ 중복 입력 방지: 해당 직원은 ${record.work_date}에 이미 동일한 신청([${selectedType}])이 등록되어 있습니다.`);
                return;
            }
        }

        // 같은 type끼리 겹치면 교체
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
