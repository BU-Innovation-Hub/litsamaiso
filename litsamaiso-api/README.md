# Litsamaiso API

Node.js + TypeScript API for managing students, accounts, account confirmation, issue resolution, online elections and audit logging.

## Overview

This service supports three main workflows:

1. Institution admins import students.
2. Finance users import account spreadsheets and later resolve issues.
3. Students confirm their account details or submit corrections when their details do not match.
4. SAAD users create elections(positions & candidates) and student elect their candidates of choice.

Every request is also written to the audit log through a global audit middleware.

## Requirements

- Node.js 20+ recommended
- MongoDB
- npm

## Setup

Install dependencies:

```powershell
npm install
```

Configure environment variables:

- `MONGO_URI` or `MONGODB_URI`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`  
  Optional token lifetime, for example `1d` or `30d`
- `PASSWORD_RESET_BASE_URL`  
  Optional frontend base URL used to generate password reset links, for example `http://localhost:3000`.
- `APP_ADMIN_EMAIL`  
  Optional. If set, the app seeds an AppAdmin user on startup.
- `APP_ADMIN_PASSWORD`  
  Optional. Required with `APP_ADMIN_EMAIL`.
- `SYSTEM_INSTITUTION_NAME`  
  Optional. Used when seeding the AppAdmin account.
- `SYSTEM_INSTITUTION_EMAIL`  
  Optional. Used when seeding the AppAdmin account.

Build the project:

```powershell
npm run build
```

Run in development:

```powershell
npm run dev
```

Run the built app:

```powershell
npm start
```

## Project Structure

- `src/index.ts` - app startup, middleware, route registration
- `src/controllers/` - request handlers
- `src/routes/` - route definitions
- `src/services/` - business logic
- `src/models/` - Mongoose models
- `src/scheduler/` - jobs scheduling 
- `src/utils/` - shared helpers such as audit logging

## Roles

Seeded roles are case-insensitive:

- `AppAdmin`
- `InstitutionAdmin`
- `Finance`
- `SAAD`
- `student`

## Email Integration

- Implementation: `src/utils/email.ts` uses Nodemailer to send transactional emails (password resets, issue notifications).
- Runtime dependencies: `nodemailer` and `@types/nodemailer` are added to `package.json`.
- Required environment variables:
  - `EMAIL_SMTP_HOST` (e.g. `smtp.gmail.com`)
  - `EMAIL_SMTP_PORT` (e.g. `587`)
  - `EMAIL_SMTP_USER` (SMTP username / email)
  - `EMAIL_SMTP_PASS` (SMTP password or app-specific password)
  - `EMAIL_FROM` (From address shown on outgoing messages)

  If startup fails with a `querySrv ECONNREFUSED` error for MongoDB Atlas, the machine cannot resolve or reach the Atlas SRV record. Use a reachable MongoDB host, check your Atlas IP allowlist, or switch to a standard `mongodb://` connection string instead of `mongodb+srv://`.

- Where emails are sent from in the app:
  - When a confirmation mismatch is detected during `POST /accounts/confirm`, an `Issue` is created and Finance users are notified.
  - When a student submits `POST /accounts/resolve` (student-side), Finance users are notified of the updated or new `Issue`.
  - When Finance applies a resolution via `POST /accounts/finance-resolve`, the affected student is emailed to notify them the issue was resolved.

- Testing: set the SMTP variables in `.env` and exercise the endpoints above. For Gmail, use an app password and ensure `EMAIL_SMTP_PORT` and `EMAIL_SMTP_HOST` are correct.

## Rating & Feedback

- Purpose: Collect 1–5 star ratings and optional text feedback from users. Feedback submissions are public (no auth required). Only `AppAdmin` can view stored feedback.
- Model: `src/models/Feedback.ts` — fields: `rating` (Number, 1..5), `comment` (optional String), timestamps.
- Endpoints:
  - `POST /feedback` — public. Body: `{ "rating": 1..5, "comment": "optional text" }`. Returns `201` on success. Records audit action `feedback.submit` (or `feedback.submit.failed`).
  - `GET /feedback` — protected. Role: `AppAdmin` only. Returns an array of feedback records and records audit action `feedback.view`.
- Sample cURL (submit):
```bash
curl -X POST "http://<HOST>/feedback" \
  -H "Content-Type: application/json" \
  -d '{"rating":5,"comment":"Very helpful service — thank you!"}'
```
- Sample cURL (list, AppAdmin):
```bash
curl -X GET "http://<HOST>/feedback" \
  -H "Authorization: Bearer <APP_ADMIN_TOKEN>" \
  -H "Accept: application/json"
```

## Elections

- Purpose: Facilitate secure and scheduled student elections, including candidate management, voting, and automated result computation.
- Core Entities:
  - **Election**: Defines the election period and status (`DRAFT`, `PUBLISHED`, `CLOSED`, `COUNTING`, `RESULTS_PUBLISHED`).
  - **Position**: Specific roles up for election (e.g., President, Secretary) with constraints like `maxVotesAllowed`.
  - **Candidate**: Students registered to run for specific positions.
  - **Vote**: Secure and validated records of student selections.
  - **ResultSnapshot**: Computed aggregates of votes per candidate, generated when an election concludes.
- Key Workflows:
  - **Setup**: Administrators create elections, define positions, and register candidates.
  - **Scheduling**: The system utilizes `agenda` to automatically transition election states based on `startDate` and `endDate` (auto-open, auto-close, and auto-count).
  - **Voting**: Students submit their ballots. The system validates selections to prevent duplicate votes for the same candidate and ensures constraints like `maxVotesAllowed` per position are respected.
  - **Results**: Once an election is closed, background jobs safely compute the final tally and generate a `ResultSnapshot` for authorized publication.

## API Endpoints

### Authentication

`POST /auth/register`

Registers users. The payload depends on the role.

Student example:

```json
{
  "email": "name.surname@bothouniversity.com",
  "password": "SecretPassword123",
  "role": "Student",
  "studentId": "2437470"
}
```

`POST /auth/login`

Returns a JWT token.

```json
{
  "email": "admin@bothouniversity.com",
  "password": "AdminPass123"
}
```

`POST /auth/forgot-password`

Public endpoint. Sends a password reset email when the account exists.

```json
{
  "email": "admin@bothouniversity.com"
}
```

`POST /auth/reset-password`

Public endpoint. Completes the reset using the token from the email.

```json
{
  "email": "admin@bothouniversity.com",
  "token": "<token-from-email>",
  "password": "NewSecretPassword123"
}
```

### Students

`POST /students/upload`

Role: `InstitutionAdmin`

Upload a student Excel file using `multipart/form-data` with a `file` field.

Required columns in the first sheet:

- `studentId`
- `email`
- `name`
- `surname`
- `studentStatus`

Rules:

- Only rows with all required columns are imported.
- Duplicate `studentId` or `email` values within the same institution are skipped.
- `studentStatus` accepts `true`, `1`, `active`, or `yes` as active.

### Accounts

`POST /accounts/upload`

Role: `Finance`

Upload an account spreadsheet using `multipart/form-data` with a `file` field.

Required columns in the first sheet:

- `Fullnames`
- `Contract Number`
- `Course of Study`
- `Bank Name`
- `Account Number`

Optional columns:

- `Batch Number`  
  The current implementation assigns `batchNumber` on the server for each upload, based on the latest existing account batch for that institution.
- `Graduating`
- `Status`
- `Paid Date`

Rules:

- Only rows with all required fields are imported.
- Duplicate `contractNumber` or `accountNumber` values within the same institution are skipped.
- Each spreadsheet upload gets one batch number, and all records in that upload share it.

Example response:

```json
{
  "message": "Import completed",
  "result": {
    "inserted": 5,
    "skipped": 2,
    "errors": [],
    "skippedDetails": [
      { "row": 4, "reasons": ["Missing required fields: accountnumber"] },
      { "row": 7, "reasons": ["Duplicate contractNumber or accountNumber"] }
    ]
  }
}
```

`POST /accounts/confirm`

Role: `Student`

Students confirm their account details with JSON:

```json
{
  "contractNumber": "202511000516",
  "bankName": "FNB",
  "accountNumber": "63007006025",
  "graduating": true
}
```

Behavior:

- The account is matched by `contractNumber`.
- If bank name and account number match, the account is marked as confirmed.
- If there is a mismatch, an `Issue` is created or updated for the student.

`POST /accounts/resolve`

Role: `Student`

Students submit corrected details with `multipart/form-data`:

- `correctedBankName`
- `correctedAccountNumber`
- `document`  
  Required file upload

Behavior:

- Stores the corrected values and the uploaded document on the student's `Issue` record.
- `contractNumber` is optional for this submission.
- Finance later uses the issue to apply the correction.

`POST /accounts/finance-resolve`

Role: `Finance`

Body:

```json
{
  "studentId": "2437516"
}
```

Behavior:

- Loads the student's `Issue` record.
- Reads `correctedBankName` and `correctedAccountNumber`.
- Uses the issue's `contractNumber` to find the matching account.
- Updates the account, then deletes the issue after a successful save.

If the issue does not contain `contractNumber`, the endpoint returns `400`.

`POST /accounts/load_payed_students`

Role: `Finance`

Upload a spreadsheet using `multipart/form-data` with a `file` field.

Required columns in the first sheet:

- `Fullnames`
- `Contract Number`
- `Course of Study`
- `Bank Name`
- `Account Number`
- `Status`

Behavior:

- Only rows whose spreadsheet `Status` is `paid` are processed.
- The matching account must already exist in the database with status `confirmed`.
- Matching accounts are updated to `paid` and stamped with `paidAt = now`.
- Rows that do not match, are not confirmed, or do not have `Status = paid` are skipped.

### Account Reports

`GET /reports/accounts`

Role: `AppAdmin`, `InstitutionAdmin`, `Finance`

Returns the full report bundle with all 18 account reports for the current scope.

Query params:

- `institutionId` - optional for `AppAdmin` to scope reports to one institution
- `stuckDays` - optional threshold for the stuck-confirmed report, default `14`
- `recentDays` - optional window for recent payments, default `30`

`GET /reports/accounts/:reportKey`

Role: `AppAdmin`, `InstitutionAdmin`, `Finance`

Returns one report by key. Supported keys:

- `summary`
- `status-breakdown`
- `confirmation-overview`
- `payment-overview`
- `confirmed-not-paid`
- `by-batch`
- `by-bank`
- `by-course`
- `by-graduating`
- `by-institution`
- `imports-by-day`
- `confirmations-by-day`
- `payments-by-day`
- `average-import-to-confirm`
- `average-confirm-to-pay`
- `stuck-confirmed`
- `recent-payments`
- `anomalies`

Implementation notes:

- Reports are computed from the same scoped `Account` dataset to keep counts consistent.
- `status` is normalized to lowercase when the reports are calculated.
- `confirmationDate` and `paidAt` are used for timing and operational reports.

## Audit Logging

Audit logging is enabled in two layers:

1. Global HTTP audit middleware logs every request and response.
2. Domain actions in controllers and services add business-level audit entries.

### Global HTTP audit middleware

The middleware records an audit entry for every request with these details:

- action: `http.<method>`
- path
- method
- status code
- duration
- `requestId` when available
- request body keys
- query keys
- actor metadata when the user is authenticated

It does not log full sensitive payloads.

### Domain audit actions currently used

- `account.confirm`
- `account.confirm.failed`
- `issue.submit`
- `issue.submit.failed`
- `issue.resolve.applied`
- `issue.resolve.failed`

### Audit log model

Audit entries are stored in the `AuditLog` collection.

Example query:

```js
db.auditlogs.find().sort({ createdAt: -1 }).limit(50);
```

## Useful Request Examples

Finance upload in Postman:

- Method: `POST`
- URL: `http://localhost:5000/accounts/upload`
- Headers: `Authorization: Bearer <FINANCE_JWT>`
- Body: `form-data`
  - key: `file`
  - type: `File`
  - value: your `.xlsx` file

Student resolve in Postman:

- Method: `POST`
- URL: `http://localhost:5000/accounts/resolve`
- Headers: `Authorization: Bearer <STUDENT_JWT>`
- Body: `form-data`
  - `correctedBankName`
  - `correctedAccountNumber`
  - `document` (file)

Finance resolve in Postman:

- Method: `POST`
- URL: `http://localhost:5000/accounts/finance-resolve`
- Headers: `Authorization: Bearer <FINANCE_JWT>`
- Body: `application/json`
  - `studentId`

### Elections Walkthrough

This section provides the endpoints and payloads in chronological order required to test an election from start to finish.

> **Note:** All endpoints below (except Login) require a JWT token in the request header: `Authorization: Bearer <your_jwt_token>`

#### 1. Authentication Phase

Log in as both the Admin (SAAD) and any students to obtain their JWT tokens.

**1.1 Admin Login**

`POST /auth/login`

```json
{
  "email": "saad@bothouniversity.com",
  "password": "StrongPassword123",
  "rememberMe": false
}
```

**1.2 Student Login**

`POST /auth/login`

Repeat for each student (e.g. Khothatso, Thato, Mpho), saving each token for use in the voting phase.

```json
{
  "email": "kh*****@bothouniversity.com",
  "password": "**********",
  "rememberMe": false
}
```

#### 2. Setup Phase

Role: `SAAD`

**2.1 Create an Election**

`POST /elections`

Save the returned `election._id` as `<ELECTION_ID>`.

```json
{
  "title": "SRC Presidential Elections 2026",
  "description": "General elections to elect the next SRC President.",
  "academicYear": "2026/2027",
  "timezone": "Africa/Gaborone",
  "votingRules": {
    "allowAbstain": false
  },
  "securitySettings": {
    "requireFaceAuth": false
  }
}
```

**2.2 Create a Position**

`POST /elections/<ELECTION_ID>/positions`

```json
{
  "title": "President",
  "description": "The President of the Student Representative Council",
  "maxVotesAllowed": 1,
  "displayOrder": 1
}
```

**2.3 Create Candidates**

`POST /elections/<ELECTION_ID>/positions/<POSITION_ID>/candidates`

> **Note:** This endpoint uses `multipart/form-data`. Configure the Body tab accordingly in Postman.

Form-data fields:

- `fullName`: "John Doe"
- `party`: "Student Alliance"
- `manifesto`: "I promise to bring better wifi."
- `studentId`: "STU2026001"
- `image`: Optional file upload

**2.4 Approve Candidate**

`POST /elections/candidates/<CANDIDATE_ID>/approve`

Candidates must be approved before they are eligible for voting. No request body required.

#### 3. Scheduling Phase

Role: `SAAD`

**3.1 Schedule the Election**

`POST /elections/<ELECTION_ID>/schedule`

> **Tip:** Set `startTime` to the past or present to open voting immediately. The Agenda background worker will transition the election status within 5 seconds.

```json
{
  "startTime": "2026-05-28T14:00:00+02:00",
  "endTime": "2026-05-28T20:00:00+02:00",
  "timezone": "Africa/Gaborone"
}
```

#### 4. Voting Phase

Role: `Student`

**4.1 Check Available Elections**

`GET /elections`

Confirm the target election is visible and its status is `OPEN`. No request body required.

**4.2 Cast a Vote**

`POST /elections/<ELECTION_ID>/vote`

Replace `<POSITION_ID>` and `<CANDIDATE_ID>` with the IDs created during the setup phase.

```json
{
  "selections": [
    {
      "positionId": "<POSITION_ID>",
      "candidateId": "<CANDIDATE_ID>"
    }
  ],
  "idempotencyKey": "vote-req-12345"
}
```

#### 5. Results Phase

After voting ends (or `endTime` passes), the system automatically closes the election and computes results.

**5.1 Publish Results**

Role: `SAAD`

`POST /elections/<ELECTION_ID>/publish-results`

No request body required.

**5.2 View Results**

Role: `SAAD`, `Student`

`GET /elections/<ELECTION_ID>/results`

No request body required.

**5.3 View Winners**

Role: `SAAD`, `Student`

`GET /elections/<ELECTION_ID>/results/winners`

No request body required.

## Important Notes

- `Account` has unique indexes on `institution + contractNumber` and `institution + accountNumber`.
- Student document uploads are stored as base64 in the database. For production, object storage is a better long-term choice.
- `req.user` is attached by `requireAuth` and `requireRole` enforces role access.
- Controllers now guard against undefined `req.body` before destructuring.

## Troubleshooting

- If uploads fail, confirm the request uses `multipart/form-data` and the file field name is correct.
- If a route returns `Forbidden`, confirm the JWT belongs to the correct role.
- If the server still shows old behavior, restart the dev process so it loads the latest compiled code.