import styles from './Avatar.module.css'

const initialsOf = (name) =>
  name
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

export function Avatar({ name, initials, className }) {
  return (
    <span className={[styles.avatar, className].filter(Boolean).join(' ')} title={name}>
      {initials ?? initialsOf(name)}
    </span>
  )
}
