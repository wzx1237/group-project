import { AuthProvider } from '@/context/AuthContext';
import { CourseProvider } from '@/context/CourseContext';
import { GradingSessionProvider } from '@/context/GradingSessionContext';
import '@/exam-distribution/styles.css';
import './globals.css';

export const metadata = {
  title: {
    default: 'Gradeflow',
    template: '%s | Gradeflow',
  },
  description:
    'Web based exam grading platform.',
  icons: {
    icon: '/logo.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-to-content-link">
          Skip to main content
        </a>

        <AuthProvider>
          <CourseProvider>
            <GradingSessionProvider>
              <div id="main-content" className="app-shell">
                {children}
              </div>
            </GradingSessionProvider>
          </CourseProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
