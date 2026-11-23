// An academic year is two consecutive years, written 2026/2027. Each has two semesters.

export const MIN_START_YEAR = 2000;
export const MAX_START_YEAR = 2099;

export const isAcademicYear = (value: string) => {
  const match = /^(\d{4})\/(\d{4})$/.exec(value);
  return Boolean(match) && Number(match?.[2]) === Number(match?.[1]) + 1;
};

export const academicYearOf = (startYear: number) => `${startYear}/${startYear + 1}`;

// 2026 for 2026/2027, or this calendar year if the value isn't an academic year
export const startYearOf = (value: string) => (isAcademicYear(value) ? Number(value.slice(0, 4)) : new Date().getFullYear());

export const nextAcademicYear = (value: string) => academicYearOf(startYearOf(value) + 1);

// 2026/27, for places with little room
export const shortAcademicYear = (startYear: number) => `${startYear}/${String(startYear + 1).slice(-2)}`;

export const currentStartYear = () => new Date().getFullYear();
