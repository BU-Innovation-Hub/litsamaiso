export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
export const formatTime = (startHour: number, endHour: number) => `${formatHour(startHour)}–${formatHour(endHour)}`;
