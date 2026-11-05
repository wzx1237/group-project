// renders an accessible footer with links to university accessibility and privacy policies
export function Footer() {
  return (
    <footer
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '16px',
        padding: '24px 16px',
        fontSize: '12px',
        color: '#6b7280',
      }}
    >
      <a
        href="https://umd.edu/web-accessibility"
        target="_blank"
        rel="noreferrer"
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        Accessibility
      </a>
      <span>·</span>
      <a
        href="https://umd.edu/privacy"
        target="_blank"
        rel="noreferrer"
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        Privacy
      </a>
      <span>·</span>
      <a
        href="https://it.umd.edu"
        target="_blank"
        rel="noreferrer"
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        Help
      </a>
    </footer>
  )
}
