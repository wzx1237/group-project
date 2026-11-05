import { Badge } from '@/components/ui/Badge'

// renders a styled badge reflecting a course staff member role
export function RoleBadge({ role }) {
  const normalized = String(role || 'TA').toLowerCase()
  const isInstructor = normalized.includes('prof') || normalized.includes('instructor')
  const tone = isInstructor ? 'soft' : 'outline'
  const label = isInstructor ? 'Professor' : 'TA'

  return <Badge tone={tone}>{label}</Badge>
}
