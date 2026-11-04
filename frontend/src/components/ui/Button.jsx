import Link from 'next/link'
import styles from './Button.module.css'

/** Figma's button. Links to /api/ files render a plain <a>, since they aren't app pages. */
export function Button({ href, variant = 'secondary', size = 'md', className, ...props }) {
  const classes = [styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ')
  if (href) {
    const Anchor = href.startsWith('/api/') ? 'a' : Link
    return <Anchor href={href} className={classes} data-button {...props} />
  }
  return <button type="button" className={classes} data-button {...props} />
}
