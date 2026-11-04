export const coursePath = (course) => `/courses/${`${course.code}-${course.term}`.toLowerCase().replace(/\s+/g, '-')}`
