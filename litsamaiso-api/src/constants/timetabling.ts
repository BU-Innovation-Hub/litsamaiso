// The teaching week timetables are built on. Times are whole hours on a 24-hour clock.
export const TEACHING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 19;

// A lecturer with more than one class in a day needs at least this long between them
export const MIN_LECTURER_GAP_HOURS = 2;

export const MAX_SESSION_HOURS = 4;
export const MAX_SESSIONS_PER_WEEK = 5;
export const SEMESTERS = [1, 2] as const;
