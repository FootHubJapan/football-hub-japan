/**
 * スケジュール用の日付範囲（日本の一般的な週: 月曜始まり、日曜終わり。境界は JST。）
 * API-Football / Football-data 向け with YYYY-MM-DD 文字列
 */

const TZ = 'Asia/Tokyo';

function toJstYmd(d) {
    return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

function addDaysJst(ymd, n) {
    const t = new Date(`${ymd}T12:00:00+09:00`);
    t.setTime(t.getTime() + n * 864e5);
    return t.toLocaleDateString('en-CA', { timeZone: TZ });
}

function weekdayLongJst(ymd) {
    return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(
        new Date(`${ymd}T12:00:00+09:00`)
    );
}

/** 0=月曜始まり（その週の月曜からの日数） */
function daysFromMondayJst(ymd) {
    const wk = weekdayLongJst(ymd);
    const m = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };
    return m[wk] != null ? m[wk] : 0;
}

function thisWeekMondayYmd(ymdToday) {
    return addDaysJst(ymdToday, -daysFromMondayJst(ymdToday));
}

function thisWeekSundayYmd(ymdToday) {
    return addDaysJst(thisWeekMondayYmd(ymdToday), 6);
}

/**
 * 今月1日～月末（JST）の ymd
 * @param {string} ymd  JST 今日 YYYY-MM-DD
 */
function calendarMonthStartEnd(ymd) {
    const [y, m] = ymd.split('-').map(Number);
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { first, last };
}

/**
 * 先月1日～先月末（JST 暦の「今月」基準）
 */
function previousCalendarMonthStartEnd(ymd) {
    const t = new Date(`${ymd}T12:00:00+09:00`);
    t.setDate(1);
    t.setDate(0);
    const lastYmd = t.toLocaleDateString('en-CA', { timeZone: TZ });
    const [y, m] = lastYmd.split('-').map(Number);
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    return { first, last: lastYmd };
}

/**
 * @param {string} timeRange
 * @param {string|null} focusYmd  指定日があるときは他より優先（1日分）
 * @param {Date} [now]  テスト用
 */
function getScheduleRangeYmd(timeRange, focusYmd, now = new Date()) {
    if (focusYmd && /^\d{4}-\d{2}-\d{2}$/.test(focusYmd)) {
        return { from: focusYmd, to: focusYmd, label: 'day' };
    }
    const todayJst = toJstYmd(now);

    switch (timeRange) {
        case 'today':
            return { from: todayJst, to: todayJst, label: 'today' };
        case 'tomorrow': {
            const t = addDaysJst(todayJst, 1);
            return { from: t, to: t, label: 'tomorrow' };
        }
        case 'week': {
            const from = thisWeekMondayYmd(todayJst);
            const to = thisWeekSundayYmd(todayJst);
            return { from, to, label: 'week' };
        }
        case 'lastweek': {
            const thisMon = thisWeekMondayYmd(todayJst);
            const from = addDaysJst(thisMon, -7);
            const to = addDaysJst(thisMon, -1);
            return { from, to, label: 'lastweek' };
        }
        case 'month': {
            const { first, last } = calendarMonthStartEnd(todayJst);
            return { from: first, to: last, label: 'month' };
        }
        case 'lastmonth': {
            const { first, last } = previousCalendarMonthStartEnd(todayJst);
            return { from: first, to: last, label: 'lastmonth' };
        }
        case 'last3months': {
            const t = new Date(`${todayJst}T12:00:00+09:00`);
            t.setMonth(t.getMonth() - 3);
            t.setDate(1);
            const first = t.toLocaleDateString('en-CA', { timeZone: TZ });
            return { from: first, to: todayJst, label: 'last3months' };
        }
        case 'last6months': {
            const t = new Date(`${todayJst}T12:00:00+09:00`);
            t.setMonth(t.getMonth() - 6);
            t.setDate(1);
            const first = t.toLocaleDateString('en-CA', { timeZone: TZ });
            return { from: first, to: todayJst, label: 'last6months' };
        }
        default: {
            const from = thisWeekMondayYmd(todayJst);
            const to = thisWeekSundayYmd(todayJst);
            return { from, to, label: 'default_week' };
        }
    }
}

module.exports = { getScheduleRangeYmd, toJstYmd, addDaysJst, TZ };
