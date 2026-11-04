export async function fetchCoursesForStaff() {}
export async function fetchCourseRoster(courseId) {}
export async function uploadRosterCsv(courseId, csvFile) {}
export async function upsertStudentRecord(courseId, studentData) {}
export async function updateStudentEnrollmentStatus(courseId, uid, status) {} // 'enrolled' | 'dropped'
export async function addCourseTA(courseId, identifier, role) {}
export async function removeCourseTA(courseId, graderId) {}