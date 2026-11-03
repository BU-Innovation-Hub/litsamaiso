import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { PostHogProvider } from '@posthog/react'
import type { PostHogConfig } from 'posthog-js'
import './index.css'
import App from './App.tsx'
import { deviceMemoryGb, installChunkRecovery, trackPageCrashes } from './lib/pageHealth'

const isIOSWebKit = (() => {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent || ''
  const platform = navigator.platform || ''
  return /iP(hone|ad|od)/.test(userAgent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
})()

// Recording holds a copy of the page in memory, which low-memory phones can't spare
const skipSessionRecording = isIOSWebKit || (deviceMemoryGb !== undefined && deviceMemoryGb <= 4)

installChunkRecovery()

const posthogOptions: Partial<PostHogConfig> = {
  api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
  defaults: '2026-05-30',
  capture_pageview: 'history_change',
  capture_exceptions: true,
  loaded: trackPageCrashes,
  disable_session_recording: skipSessionRecording,
  enable_recording_console_log: !skipSessionRecording,
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
