import Link from 'next/link'

export default function Header() {
  return (
    <nav className="topbar">
      <Link className="brand" href="/courses">
        Gradeflow
      </Link>
    </nav>
  )
}
