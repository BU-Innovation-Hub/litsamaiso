import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { PostHogProvider } from '@posthog/react'
import type { PostHogConfig } from 'posthog-js'
import './index.css'
import App from './App.tsx'

const posthogOptions: Partial<PostHogConfig> = {
  api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
  defaults: '2026-05-30',
  capture_pageview: 'history_change',
  capture_exceptions: true,
  enable_recording_console_log: true,
  session_recording: {
    maskAllInputs: false,
    maskInputOptions: {
      password: true,
    },
  },
  logs: {
    serviceName: 'litsamaiso-client',
    environment: import.meta.env.MODE,
    captureConsoleLogs: true,
  },
  tracing_headers: ['localhost:5000', 'litsamaiso-huu3.onrender.com'],
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogProvider
      apiKey={import.meta.env.VITE_POSTHOG_PROJECT_TOKEN}
      options={posthogOptions}
    >
      <App />
    </PostHogProvider>
    <Analytics />
  </StrictMode>,
)