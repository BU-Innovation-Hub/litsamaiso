Updated todo list

I’m tracing PostHog through the codebase now so I can summarize where it was introduced, how it’s wired, and what behavior it covers. After that I’ll turn it into a README-style writeup you can drop into the repo.

Searched for text `posthog`, 132 results

Search complete: Locate PostHog usage

I found the implementation surface: PostHog is entirely frontend-side, with initialization in the app shell and event capture spread across auth and key product pages. I’m reading the controlling files now to separate setup, identity handling, and event instrumentation.

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/package.json)

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/src/App.tsx)

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/src/context/AuthContext.tsx)

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/src/types/posthog-react.d.ts)

The core setup is clear now. I’m checking the environment and deployment wiring next so the writeup can explain not just where PostHog is used, but how it’s enabled in development/builds and whether anything server-side participates.

No matches found. Your search pattern might be excluded completely by either the search.exclude settings or .*ignore files.
If you believe that it should have results, you can check into the .*ignore files and the exclude setting (here are some excluded patterns for reference:[**/node_modules,**/bower_components,**/*.code-search]).
Then if you want to include those files you can call the tool again by setting "includeIgnoredFiles" to true.

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/.env.example#100-100), lines 100 to 119

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/docker-compose.yml)

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/Dockerfile)

I’ve confirmed the build-time injection path: PostHog stays in the frontend bundle and is fed by Vite env vars from .env and Docker build args. I’m now collecting the instrumentation points so the summary can say what events were added, not just that the SDK exists.

Searched for text `usePostHog` (`**/frontend/src/**/*.tsx`), 14 results

Searched for text `safeCapture(` (`**/frontend/src/**/*.tsx`), 14 results

Searched for text `posthog.capture(` (`**/frontend/src/**/*.tsx`), 48 results

I’ve narrowed it to the frontend app shell plus seven routed pages. I’m doing one last check for any backend or docs references so the summary can explicitly say whether PostHog touches only client code or also API/server code.

Searched for text `posthog` (`**/src/**`), 103 results

No matches found. Your search pattern might be excluded completely by either the search.exclude settings or .*ignore files.
If you believe that it should have results, you can check into the .*ignore files and the exclude setting (here are some excluded patterns for reference:[**/node_modules,**/bower_components,**/*.code-search]).
Then if you want to include those files you can call the tool again by setting "includeIgnoredFiles" to true.

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/src/pages/Posts/Posts.tsx#1-1), lines 1 to 260

I’ve got the event inventory shape. The remaining step is to pin exact source locations for the setup and a few representative event groups so the final README can point to the right files cleanly instead of hand-waving.

Analyzed usages of `posthog`, 17 results

Analyzed usages of `PostHogProvider`, 3 results

Analyzed usages of `posthog`, 17 results

Analyzed usages of `safeCapture`, 15 results

Analyzed usages of `usePostHog`, 2 results

I have the core setup references. I’m grabbing the page-level hook locations now so the README can map each analytics area back to its file, which is the main thing you asked for after “scan through the whole code.”

Analyzed usages of `usePostHog`, 2 results

Analyzed usages of `usePostHog`, 2 results

Analyzed usages of `usePostHog`, 2 results

Analyzed usages of `usePostHog`, 2 results

Analyzed usages of `usePostHog`, 2 results

Analyzed usages of `usePostHog`, 2 results

Created 2 todos

The implementation pattern is consistent, so I’m reading only the event-heavy sections now to describe the intent accurately: page views, workflow actions, success/failure pairs, and the guarded post composer events.

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/src/pages/Dashboard/Dashboard.tsx#100-100), lines 100 to 140

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/src/pages/Mentions/Mentions.tsx#200-200), lines 200 to 240

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/src/pages/Reports/Reports.tsx#110-110), lines 110 to 190

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/src/pages/Settings/Settings.tsx#200-200), lines 200 to 480

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/src/pages/Sources/Sources.tsx#150-150), lines 150 to 370

Read [](file:///c%3A/Users/Joel%20Kananelo/Documents/coding/sammy-parent/sammy/frontend/src/pages/Register/Register.tsx#50-50), lines 50 to 120

I can’t write the file in this read-only mode, but here is a README-ready section you can paste into the repo.

# PostHog Implementation

PostHog is implemented entirely in the frontend. I did not find any PostHog source usage in the backend code or in the repo docs; the analytics integration lives in the React app and is wired in at startup, then used by individual pages for event tracking.

## How It Is Added

The SDK dependencies are added in package.json and the app imports `posthog-js` plus the React provider in App.tsx. The whole app is wrapped in `<PostHogProvider>` in App.tsx so routed pages can call `usePostHog()` anywhere inside the tree.

Initialization is deferred in `PostHogInit` inside App.tsx. It calls `posthog.init(...)` with:

- `VITE_PUBLIC_POSTHOG_TOKEN`
- `VITE_PUBLIC_POSTHOG_HOST`
- `person_profiles: "identified_only"`

That last setting means PostHog only profiles users after they are identified, instead of building profiles for anonymous traffic.

## Identity And Session Handling

Authentication state is the main place where PostHog identity gets managed. In AuthContext.tsx, the app imports `posthog-js` directly and uses it to:

- capture `session_expired` when the backend returns `401` or `403`
- `reset()` PostHog when a session expires or a user logs out
- `identify()` the current user after profile refresh and after login
- `group()` analytics by company
- `register()` super properties like company and role

The auth flow tracks these events:

- `user_logged_in`
- `user_registered`
- `user_logged_out`
- `session_expired`

So PostHog is not just page analytics here; it is also tied to user identity, tenant grouping, and session lifecycle.

## Page-Level Tracking

The app uses `usePostHog()` in the main product pages to capture feature usage and conversion events.

The main page-level hook points are in:

- Dashboard.tsx
- Mentions.tsx
- Posts.tsx
- Register.tsx
- Reports.tsx
- Settings.tsx
- Sources.tsx

The event pattern is consistent:

- page views are captured when the page mounts
- important actions are tracked when a user clicks or submits
- success and failure are captured separately so funnels can be analyzed

### Event Groups

Dashboard tracks `dashboard_viewed` and `dashboard_keywords_load_started`.

Mentions tracks `mentions_viewed`, `mentions_mode_switched`, `mention_opened`, `mentions_delete_all_clicked`, `mentions_delete_all_failed`, and `mention_reply_clicked`.

Posts has the richest instrumentation. It uses a local helper, `safeCapture`, in Posts.tsx, which wraps `posthog.capture()` in a try/catch so analytics failures do not break post creation. The tracked events include:

- `post_media_attached`
- `post_media_invalid_type`
- `media_removed`
- `post_ai_generate_triggered`
- `post_ai_content_generated`
- `post_submit_attempted`
- `post_submit_error`
- `post_created`
- `post_scheduled`
- `post_recurring_created`
- `post_failed`
- `single_post_attempt`

Register tracks form validation and onboarding conversion:

- `registration_validation_error`
- `user_registered`
- `registration_failed`

Reports tracks reporting usage and export behavior:

- `reports_viewed`
- `reports_filters_changed`
- `reports_download_clicked`
- `reports_download_success`
- `reports_download_failed`

Settings tracks operational changes across the account and company config:

- `settings_viewed`
- `settings_notifications_save_clicked`
- `settings_notifications_saved`
- `settings_notifications_save_failed`
- `settings_ai_save_clicked`
- `settings_ai_saved`
- `settings_ai_save_failed`
- `settings_logo_upload_started`
- `settings_logo_uploaded`
- `settings_logo_upload_failed`
- `settings_company_save_clicked`
- `settings_company_saved`
- `settings_company_save_failed`
- `settings_keyword_add_clicked`
- `settings_keyword_added`
- `settings_keyword_add_failed`

Sources tracks OAuth and account connection flows:

- `sources_page_viewed`
- `platform_connect_started`
- `platform_oauth_redirected`
- `platform_connected`
- `platform_oauth_error`
- `linkedin_org_selected`
- `linkedin_org_selection_failed`
- `platform_disconnected`
- `platform_disconnect_failed`

## Build And Deployment Wiring

PostHog values are injected through environment variables rather than hardcoded. They are declared in .env.example, passed into Docker build args in docker-compose.yml, and forwarded in Dockerfile. That means the frontend bundle receives the PostHog token and host at build time.

## Type Support

There is a small TypeScript shim in posthog-react.d.ts so the `@posthog/react` module is accepted by the TypeScript compiler.

## Summary

In practice, PostHog was added as a client-side analytics layer for the React frontend, with three main responsibilities:

- app startup initialization and provider setup
- authenticated user identity and company grouping
- feature/event tracking across core product flows

There is no separate backend PostHog service or server-side event pipeline in this codebase.

If you want, I can next turn this into a shorter “Analytics” section for the root README, or a fuller docs page organized by feature and event name.