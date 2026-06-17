# Election System Lifecycle Documentation

## Purpose

This document explains the end-to-end lifecycle of elections in Litsamaiso, based primarily on the current split implementation in `litsamaiso-api` and `litsamaiso-client`. It also includes a condensed note on the older `litsamaiso-next.js` election implementation, with special attention to the face recognition flow that existed there.

The current implementation supports SAAD-managed election setup, position setup, candidate entry, candidate validation, student voting, ballot receipts, result counting, result review, result publication, and archiving. For SRC elections, the positions should be pre-seeded and attached to new elections by default. Student self-nomination is not currently exposed as a first-class API or client workflow, but the existing candidate approval model can support it with additional endpoints and UI.

## Core Roles

### SAAD

SAAD is the main election administrator in the current system. SAAD can:

- Create elections.
- Edit draft or scheduled election details.
- Use pre-seeded SRC positions by default.
- Add positions only for future expansion or exceptional cases.
- Add candidates manually.
- Upload candidate images.
- Approve or disqualify candidates.
- Schedule and publish elections.
- Recompute or review results.
- Publish final results.
- Archive completed elections.

After the voting period ends, SAAD should have read-only access to vote data and computed results. SAAD may review, validate, prepare publication, and publish final results, but must not be able to alter ballots or manually change computed totals.

### Student

Students can:

- View published, non-archived elections for their institution.
- Open a ballot only while the election is open.
- Vote once per election.
- Receive an internal vote receipt.
- View published results after SAAD publishes them.

### Institution Boundary

Most election operations are scoped to the authenticated user's institution. SAAD and students only access elections, positions, candidates, ballots, and results tied to their institution.

## Current Data Model

### Election

Stored in `litsamaiso-api/src/models/Election.ts`.

Key fields:

- `title`: election name.
- `description`: optional election explanation.
- `academicYear`: optional academic year label.
- `status`: lifecycle status.
- `startTime` and `endTime`: voting window.
- `timezone`: time zone label.
- `createdBy`: SAAD user who created the election.
- `institution`: institution that owns the election.
- `published`: controls student visibility.
- `archived`: hides the election from students.
- `resultsPublished`: controls student access to results.
- `votingRules`: flexible rules object, currently used by voting logic for `allowAbstain`.
- `securitySettings`: flexible placeholder for future security controls.
- `deletedAt` and `deletedBy`: soft-delete metadata.

Supported statuses:

- `DRAFT`
- `SCHEDULED`
- `OPEN`
- `CLOSED`
- `COUNTING`
- `RESULTS_PUBLISHED`
- `ARCHIVED`

### Position

Stored in `litsamaiso-api/src/models/Position.ts`.

Key fields:

- `electionId`: parent election.
- `title`: position name.
- `description`: optional position description.
- `maxVotesAllowed`: maximum candidates a voter may select for that position.
- `displayOrder`: ordering on the ballot.
- `isActive`: controls whether the position appears to students.
- `deletedAt` and `deletedBy`: soft-delete metadata.

### Seeded SRC Positions

SRC elections should use a predefined set of positions that remain stable across normal election cycles. These positions should be seeded into the system and applied to new SRC elections by default:

1. President
2. Vice President
3. Secretary General
4. Minister of Finance
5. Minister of Public and Stakeholder Relations
6. Minister of Sports, Culture and Recreation
7. Minister of Gender and Social Welfare
8. Minister of Academics
9. Minister of Entertainment
10. Administrative Secretary
11. Minister of Justice, Security and Infrastructure
12. Minister of Special Needs

Operational expectations:

- Normal SRC setup should not require SAAD to manually add each position.
- The management UI should default to the seeded SRC positions.
- The "Add Position" feature should still exist for future expansion, exceptional elections, or institutional changes.
- Seeded positions should preserve stable display order and sensible defaults such as `maxVotesAllowed: 1` and `isActive: true`.

### Candidate

Stored in `litsamaiso-api/src/models/Candidate.ts`.

Key fields:

- `electionId`: parent election.
- `positionId`: position being contested.
- `studentId`: optional student identifier.
- `fullName`: candidate name.
- `party`: optional party or grouping.
- `manifesto`: optional campaign statement.
- `imageUrl`: optional candidate photo.
- `approved`: whether the candidate is visible to students.
- `disqualified`: whether the candidate is excluded.
- `voteCountCached`: cached count after result computation.
- `deletedAt` and `deletedBy`: soft-delete metadata.

### Ballot

Stored in `litsamaiso-api/src/models/Ballot.ts`.

Key fields:

- `electionId`: election voted in.
- `studentId`: student who voted.
- `submittedAt`: submission time.
- `selections`: array of `{ positionId, candidateId }`.
- `ipAddress` and `userAgent`: submission metadata.
- `ballotHash`: HMAC hash of canonical ballot data.
- `receiptId`: UUID receipt for the ballot.
- `idempotencyKey`: optional client retry key.

The system enforces one non-deleted ballot per student per election.

### Result Snapshot

Stored in `litsamaiso-api/src/models/ResultSnapshot.ts`.

Key fields:

- `electionId`: counted election.
- `generatedAt`: snapshot generation time.
- `positions`: rankings per position.
- `snapshotHash`: HMAC hash of the result snapshot payload.
- `generatedBy`: optional SAAD user who triggered counting.

Each position snapshot contains:

- `positionId`
- `rankings`: candidate vote totals, percentages, and ranks.
- `winnerId`: the top-ranked candidate.

## Lifecycle Overview

The current lifecycle is:

1. SAAD creates an election in draft.
2. SAAD configures election metadata, timing, eligible voters, and applicable positions.
3. The system applies seeded SRC positions by default.
4. SAAD adds or imports candidates to positions.
5. SAAD approves or disqualifies candidates.
6. Before the start time, voting remains locked.
7. Scheduled jobs open the election at the start time.
8. Students are notified that voting has started.
9. Students vote once during the open window.
10. Vote submission shows loading and disabled states to prevent repeated actions.
11. The system stores ballots with receipts and HMAC hashes.
12. Scheduled jobs close the election at the end time.
13. Students are notified that voting has ended and results are being processed.
14. After close, the system counts ballots and creates a result snapshot.
15. SAAD reviews results without modifying vote data or computed totals.
16. SAAD publishes immutable final results.
17. Students view published results.
18. SAAD archives the completed election.

## Election Creation

### API Flow

SAAD creates an election through:

```http
POST /elections
```

Implemented by:

- Route: `litsamaiso-api/src/routes/electionRoutes.ts`
- Controller: `createElectionHandler`
- Service: `createElection`

Required and optional inputs:

- `title`: required, minimum length 3.
- `description`: optional.
- `academicYear`: optional.
- `timezone`: optional, defaults to `UTC` in the API.
- `votingRules`: optional object.
- `securitySettings`: optional object.

On creation:

- The election is assigned to the SAAD user's institution.
- `status` is set to `DRAFT`.
- `published`, `archived`, and `resultsPublished` are set to `false`.
- For SRC elections, the seeded SRC positions should be attached automatically or made available as the default position set during setup.
- An `election.create` audit record is written.

### Client Flow

SAAD uses `litsamaiso-client/src/pages/ElectionsManagementPage.tsx`.

The create form captures:

- Election title.
- Description.
- Academic year.
- Timezone, defaulting in the UI to `Africa/Gaborone`.

The client calls:

```ts
electionService.createElection(createForm)
```

Recommended setup behavior for SRC elections:

- After creating the election shell, the system should populate the election with the seeded SRC positions automatically.
- SAAD should only need to review the default position list, not recreate it.
- The UI should expose "Add Position" as an advanced or exceptional action rather than the normal setup path.
- Eligible voters should be derived from active students in the election's institution.

## Election Configuration

### Editing Election Metadata

SAAD can update draft or scheduled elections through:

```http
PATCH /elections/:id
```

Editable fields include:

- `title`
- `description`
- `academicYear`
- `timezone`
- `votingRules`
- `securitySettings`

The API blocks edits once an election is in any frozen state:

- `OPEN`
- `CLOSED`
- `COUNTING`
- `RESULTS_PUBLISHED`
- `ARCHIVED`

This prevents late changes to the ballot after voting has started.

### Position Configuration

SAAD creates positions through:

```http
POST /elections/:electionId/positions
```

Position setup includes:

- `title`
- `description`
- `maxVotesAllowed`
- `displayOrder`

If `displayOrder` is not supplied, the API assigns the next order number after the current last position.

Students only see active positions. SAAD sees all non-deleted positions.

For normal SRC elections, this endpoint should be treated as an expansion path rather than the main setup path. The expected default is that the 12 seeded SRC positions are present automatically. SAAD should only add a position when:

- The SRC constitution changes.
- The institution runs a non-standard election.
- A temporary or special committee position is required.
- A seeded position needs to be replaced through an approved administrative process.

Recommended implementation options:

- Seed a global `DefaultPositionTemplate` collection and clone those records into each SRC election.
- Store default SRC positions in a seed script and create election-specific `Position` documents when an election is created.
- Add a `positionTemplateType` or `electionType` field so SRC elections can automatically load SRC defaults while other election types can use custom positions.

### Scheduling the Voting Window

SAAD schedules an election through:

```http
POST /elections/:id/schedule
```

Inputs:

- `startTime`
- `endTime`
- `timezone`

Validation:

- Both dates are required.
- `endTime` must be after `startTime`.
- The election must still be editable.
- The election should have applicable positions, defaulting to the seeded SRC positions.
- Eligible voters should be defined or derivable from active students.
- All required candidates should be prepared and approved before the election opens.

Scheduling does the following:

- Sets `startTime` and `endTime`.
- Sets `timezone`.
- Sets `status` to `SCHEDULED`.
- Sets `published` to `true`.
- Schedules background jobs to open and close the election.
- Writes an `election.schedule` audit record.

Before the start time, the election is visible only according to publication rules, but voting must remain locked. Students should not be able to submit ballots until the system clock reaches the scheduled start time and the election status becomes `OPEN`.

### Publishing Without Scheduling

SAAD can also publish through:

```http
POST /elections/:id/publish
```

If `startTime` or `endTime` is provided, this delegates to the scheduling path. If no times are provided, the election is made visible by setting `published` to `true`, while retaining its draft status.

## Nomination and Candidate Registration

### Current Implemented Flow

The current API does not expose a student-facing nomination endpoint. Candidates are entered by SAAD through:

```http
POST /elections/:electionId/positions/:positionId/candidates
```

Candidate fields:

- `fullName`
- `party`
- `manifesto`
- `studentId`
- `image`

Images are uploaded as multipart form data. The API accepts image files only and uploads the image buffer through the Cloudinary utility before storing the resulting `imageUrl`.

New candidates are created with:

- `approved: false`
- `disqualified: false`

This means candidates are not visible to students immediately after entry.

### Student Nomination Target Flow

For a full student nomination lifecycle, the current model can be extended without replacing the existing candidate collection. A student nomination flow would add:

- A nomination window per election or position.
- A student endpoint such as `POST /elections/:electionId/positions/:positionId/nominations`.
- Automatic attachment of the authenticated student's `studentId`.
- Optional manifesto and photo upload.
- Initial candidate status of `approved: false`.
- SAAD review and approval before ballot publication.

Recommended additional fields:

- `nominatedBy`
- `nominationStatus`: `SUBMITTED`, `APPROVED`, `REJECTED`, `WITHDRAWN`
- `nominationSubmittedAt`
- `reviewedBy`
- `reviewedAt`
- `reviewNotes`

## Candidate Approval and Validation

### Current Approval Flow

SAAD approves a candidate through:

```http
POST /elections/candidates/:id/approve
```

Approval sets:

- `approved: true`
- `disqualified: false`

SAAD disqualifies a candidate through:

```http
POST /elections/candidates/:id/disqualify
```

Disqualification sets:

- `disqualified: true`
- `approved: false`

Students only see candidates where:

- `approved` is `true`
- `disqualified` is `false`
- `deletedAt` is `null`

### Validation Rules

Current backend validation includes:

- Candidate `fullName` is required and must be at least 3 characters.
- Candidate position must exist within the election.
- Candidate creation is blocked after the election freezes.
- Candidate uniqueness is indexed by `electionId`, `positionId`, and `studentId` when `studentId` exists.
- Uploads must be images and are capped at 5 MB.

Recommended nomination validation additions:

- Confirm the nominated `studentId` exists in the institution.
- Confirm the student is active and eligible.
- Prevent the same student from running for conflicting positions if policy requires it.
- Validate manifesto length and file upload type/size.
- Validate candidate photo presence and quality if photos are required.
- Require all candidate approvals before scheduling or opening the election.

## Opening Elections

### Pre-Election Phase

Before the scheduled start time:

- Candidates may be prepared, imported, or approved.
- Voting remains locked even if the election has been published for visibility.
- Ballot submission endpoints must reject attempts because the election is not yet `OPEN`.
- The client should show a clear not-yet-open state, including the scheduled opening time.

### Automated Opening

When SAAD schedules an election, `scheduleElectionJobs` registers Agenda jobs:

- `election.open` at `startTime`
- `election.close` at `endTime`

When the open job runs:

- The election is loaded.
- The current time is checked against the configured window.
- The election must be `SCHEDULED` or `DRAFT`.
- The status changes to `OPEN`.
- An `election.open` audit record is written.

At activation, the system should send email notifications to all eligible students informing them that voting has started. The current API already has email utilities elsewhere in the codebase, but the election scheduler should explicitly integrate a notification step for election start.

Recommended notification content:

- Election title.
- Voting start and end times.
- Link or route to the elections page.
- Reminder that each student can vote only once.
- Support contact or issue-reporting guidance.

### Student Visibility

Students can list elections through:

```http
GET /elections
```

For students, the API filters to:

- `published: true`
- `archived: false`
- matching institution
- non-deleted elections

The client additionally checks the current time and `status` before enabling the ballot button.

### Automated Closure

When the scheduled end time is reached:

- The election automatically changes from `OPEN` or `SCHEDULED` to `CLOSED`.
- No further ballots are accepted.
- A count job is queued.
- Students should receive an email notification that the voting period has ended and results are being processed or will be released soon.

Recommended closure notification content:

- Election title.
- Confirmation that voting has ended.
- Notice that results are being tallied and reviewed.
- Expected publication guidance, if available.

## Voting

### Student Ballot Loading

The student voting page is `litsamaiso-client/src/pages/VotingPage.tsx`.

When a student opens a ballot, the client:

1. Loads the election.
2. Checks voting status through `GET /vote/status?electionId=...`.
3. Redirects back to the elections list if the student already voted.
4. Loads positions.
5. Loads approved candidates for each position.

### Vote Submission

Votes are submitted through:

```http
POST /elections/:electionId/vote
```

There is also a generic route:

```http
POST /vote/submit
```

The current client uses the election-specific route.

The submitted payload contains:

```json
{
  "selections": [
    {
      "positionId": "position id",
      "candidateId": "candidate id"
    }
  ],
  "idempotencyKey": "client retry key"
}
```

UX requirements during submission:

- The submit button must show a loading state while the vote is being sent.
- The submit button and ballot inputs must be disabled during submission.
- The user must receive clear success or failure feedback.
- The UI must avoid leaving the student uncertain about whether the vote was submitted.
- The client should keep idempotency support so retries do not create duplicate ballots.

### Voting Rules and Validation

The vote service validates:

- The election exists and belongs to the student's institution.
- The election status is `OPEN`.
- The current time is within `startTime` and `endTime`.
- The authenticated user has a `studentId`.
- The student exists, belongs to the institution, and has `studentStatus: true`.
- Selections are present unless abstention is allowed.
- Every selected position is active and belongs to the election.
- No duplicate candidate is selected for the same position.
- Selection count per position does not exceed `maxVotesAllowed`.
- Every selected candidate exists, belongs to the election and position, is approved, and is not disqualified.
- The student has not already voted in the election.

The current client only supports one selected candidate per position in the UI, even though the backend supports `maxVotesAllowed` greater than 1.

Vote uniqueness is enforced in multiple places:

- The client checks vote status before loading the ballot.
- The API checks for an existing ballot before creating a new one.
- The `Ballot` collection has a unique index on `{ electionId, studentId }` for non-deleted ballots.
- Duplicate key handling returns the existing receipt where possible.
- Idempotency keys protect against repeated submissions caused by refreshes, double-clicks, or network retries.

### Ballot Storage

Vote submission uses a MongoDB transaction.

Inside the transaction:

- Existing ballot by `idempotencyKey` is returned if present.
- Existing ballot by `electionId` and `studentId` blocks duplicate voting.
- A new `receiptId` is generated with `randomUUID`.
- A canonical ballot payload is HMAC-hashed with `ELECTION_HMAC_SECRET`.
- The ballot is stored with selections, receipt, hash, IP address, user agent, and optional idempotency key.

The API returns:

- `receiptId`
- `ballotHash`
- `submittedAt`

An audit event `vote.cast` is written.

## Vote Counting and Verification

### Election Closing

When the close job runs:

- The election is loaded.
- The current time must be at or after `endTime`.
- The status must be `OPEN` or `SCHEDULED`.
- The status changes to `CLOSED`.
- An `election.close` audit record is written.
- A count job is queued immediately.

After closure, the system must reject all further vote submissions. SAAD access after closure should be limited to review and publication activities; there should be no UI or API path for SAAD to edit ballots or manually change vote totals.

### Result Computation

Results are computed by `computeElectionResults`.

Manual recomputation is available to SAAD through:

```http
POST /elections/:electionId/results/recompute
```

Counting requirements:

- The election must be `CLOSED`, `COUNTING`, or `RESULTS_PUBLISHED`.
- If counting starts from `CLOSED`, the status temporarily becomes `COUNTING`.
- Only active positions are counted.
- Only approved and non-disqualified candidates are counted.
- Only non-deleted ballots are counted.

The service aggregates ballots by:

- `positionId`
- `candidateId`

For each position:

- Candidates are listed with vote totals.
- Candidates are sorted by vote count descending.
- Total votes for the position are calculated.
- Percentages are calculated as `candidateVotes / totalVotes * 100`.
- Ranks are assigned based on sorted order.
- The first candidate in the sorted list is assigned as `winnerId`.

After counting:

- A `ResultSnapshot` is created.
- The snapshot payload is HMAC-hashed with `ELECTION_HMAC_SECRET`.
- Candidate `voteCountCached` values are updated.
- Election status returns to `CLOSED` unless results were already published.
- A `results.count` audit record is written.

### Verification Characteristics

The current system has several verification mechanisms:

- One ballot per student per election is enforced by unique indexes.
- Idempotency keys reduce accidental duplicate submissions during retries.
- Ballot hashes bind election ID, student ID, receipt ID, submission time, and selections.
- Result snapshot hashes bind the generated result payload.
- Audit logs record election setup, scheduling, opening, closing, candidate decisions, vote casting, counting, and publication.

Important limitation:

- The current system stores `studentId` directly on ballots. This is useful for enforcing one vote per student and receipts, but it is not anonymous voting. If anonymity is required, a separate eligibility token or voter ledger design should be introduced.

## Result Review, Finalization, and Publication

### SAAD Review

SAAD can open results from the election management screen. The client:

1. Loads positions and candidates.
2. Attempts to load the latest result snapshot.
3. If no snapshot exists, attempts to recompute results.
4. Displays rankings per position.
5. Offers a PDF export of the displayed results.

SAAD review is intentionally limited. During this stage SAAD may:

- Confirm that the expected positions and candidates are present.
- Confirm that counting completed successfully.
- Review rankings, vote totals, percentages, and snapshot metadata.
- Export or prepare reports.
- Publish final results.

SAAD must not be allowed to:

- Modify stored ballots.
- Add or remove votes.
- Edit computed vote counts.
- Change winners manually.
- Alter result snapshots after generation.

If a problem is found, the correct path should be an auditable recomputation, investigation, or tie-resolution workflow rather than manual result editing.

### Result Publication

SAAD publishes results through:

```http
POST /elections/:id/publish-results
```

Publication requires at least one result snapshot. If no snapshot exists, the API returns an error telling SAAD to run counting first.

Publishing does the following:

- Sets `resultsPublished` to `true`.
- Sets `status` to `RESULTS_PUBLISHED`.
- Writes a `results.publish` audit record with the snapshot ID.

Published results should be treated as immutable. After publication:

- Students can view results.
- SAAD should not be able to alter the published snapshot.
- Any correction should require a formal audited process that creates a new superseding snapshot rather than editing the published one in place.
- The UI should require a confirmation prompt before publishing results.

### Student Result Viewing

Students can request results only after publication. The result API blocks student access when `resultsPublished` is false.

Available result endpoints:

```http
GET /elections/:electionId/results
GET /elections/:electionId/results/winners
GET /elections/:electionId/results/positions/:positionId
```

The student elections page shows:

- `BEING REVIEWED` when the election has ended but results are not published.
- `RESULTS PUBLISHED` when results are available.
- A results modal with position rankings after publication.

### Archiving

SAAD archives through:

```http
POST /elections/:id/archive
```

Only `CLOSED` or `RESULTS_PUBLISHED` elections can be archived.

Archiving:

- Sets `archived` to `true`.
- Sets `status` to `ARCHIVED`.
- Hides the election from students.
- Writes an `election.archive` audit record.

## System Constraints and UX Rules

### Election Constraints

The election system must enforce these rules consistently across API and client:

- Students can vote only once per election.
- Elections are time-bound and controlled by the system clock.
- Voting is blocked before the scheduled start time.
- Voting is blocked after the scheduled end time.
- Only active, eligible students may vote.
- Only approved, non-disqualified candidates appear on student ballots.
- SRC elections use seeded positions by default.
- SAAD has read-only access to vote data after the voting period ends.
- SAAD may publish results, but may not alter ballots or computed results.
- Published results are immutable after release.

### Critical Action Feedback

All async actions should provide immediate UI feedback:

- Vote submission buttons show a loading state.
- Forms disable submit buttons and relevant inputs during processing.
- Page-level loaders appear while elections, ballots, positions, candidates, or results are loading.
- Publish, archive, and result publication actions use confirmation prompts.
- Success messages confirm completed actions.
- Failure messages explain what happened and what the user can do next.

Actions that must disable duplicate interaction:

- Creating an election.
- Scheduling an election.
- Creating or importing candidates.
- Approving or disqualifying a candidate.
- Submitting a vote.
- Recomputing results.
- Publishing results.
- Archiving an election.

The user should never be left uncertain about system state. If a request is in progress, the UI should say so. If an action succeeds, the UI should refresh relevant data or navigate to a clear completion state. If an action fails, the UI should keep the user's work intact where possible.

## Current Status Transitions

```text
DRAFT
  -> SCHEDULED       via schedule
  -> DRAFT published via publish without dates

SCHEDULED
  -> OPEN            via scheduled open job

OPEN
  -> CLOSED          via scheduled close job

CLOSED
  -> COUNTING        during result computation
  -> CLOSED          after result snapshot generation
  -> RESULTS_PUBLISHED via publish results
  -> ARCHIVED        via archive

RESULTS_PUBLISHED
  -> ARCHIVED        via archive
```

## Condensed Legacy Next.js Implementation

The older `litsamaiso-next.js` implementation used a simpler, embedded election model.

### Legacy Election Model

The legacy `Election` model stored:

- `title`
- `description`
- `startDate`
- `endDate`
- `isActive`
- Embedded `positions`
- Embedded `candidates` inside each position

Candidates were simple embedded records with:

- `name`
- `description`
- `imageUrl`

There was no separate `Position`, `Candidate`, `Ballot`, or `ResultSnapshot` collection.

### Legacy Creation and Management

SAAD used `components/ElectionsManagementClient.tsx` to:

- Upload a spreadsheet.
- Parse positions and candidates.
- Create elections.
- Duplicate existing elections.
- View simple statistics.

The legacy upload endpoint:

```http
POST /api/saad/upload-positions
```

Accepted `.xlsx`, `.xls`, and `.csv` files. It expected rows with:

- `Position`
- `Candidate`
- `Description` optional

It grouped candidates by position, de-duplicated candidates per position, and returned a positions array that could be saved into the embedded election document.

The current split implementation does not yet have an equivalent bulk import endpoint, so this legacy feature is a strong candidate for reimplementation.

### Legacy Voting

Legacy votes were stored in a separate `Vote` collection with:

- `userId`
- `electionId`
- `votes`: a map of `positionName -> candidateName`

A unique index on `{ userId, electionId }` prevented duplicate voting.

The voting UI required one candidate selection for every position before submission. After successful voting, users were redirected to the confirmation page.

### Legacy Statistics

The legacy stats endpoint attempted to summarize vote counts by position and candidate for SAAD, Finance, and OVC users. The intended model was simple counting from stored vote maps rather than immutable result snapshots.

Compared with the current implementation, legacy stats were less auditable because there was no dedicated result snapshot hash, no cached vote counts, and no formal result publication state.

### Legacy Face Recognition Feature

The old Next.js application included a face recognition gate around voting.

Main files:

- `components/FaceCaptureRegistration.tsx`
- `components/FaceVerificationCamera.tsx`
- `components/FaceDetectionCamera.tsx`
- `utils/faceDetection.ts`
- `app/api/face-verification/route.ts`
- `app/(root)/detection/page.tsx`

Registration flow:

1. During sign-up, students were required to capture their face.
2. The browser loaded TensorFlow.js with the WebGL backend and BlazeFace.
3. The camera captured a frame after detecting a face.
4. The client generated a descriptor from:
   - Normalized face bounding box coordinates.
   - Normalized facial landmarks.
   - Geometric ratios such as eye distance and nose-to-eye distances.
5. The face image was uploaded through the upload route.
6. The descriptor and image URL were stored on the user record as `faceDescriptor` and `faceImageUrl`.

Verification flow:

1. A student visited the detection page before voting.
2. The detection page checked that the user was authenticated and represented a valid student.
3. `FaceVerificationCamera` loaded TensorFlow.js and BlazeFace in the browser.
4. The student entered a 7-digit student ID.
5. The browser captured a fresh face descriptor.
6. The descriptor and student ID were sent to:

```http
POST /api/face-verification
```

7. The backend loaded the user by `studentId`.
8. The backend compared the fresh descriptor against the stored descriptor.
9. Matching used a weighted Euclidean distance where geometric features carried extra weight.
10. The default threshold was `0.15`, with a minimum confidence requirement of 50 percent.
11. On match, the student was redirected to `/election`.

Important limitations:

- BlazeFace detects face location and landmarks; it is not a production-grade identity embedding model.
- The descriptor was hand-built from landmarks and geometry, so it may be sensitive to camera angle, lighting, distance, and expression.
- There was no liveness detection.
- Verification trusted a client-generated descriptor, which can be tampered with by an advanced attacker.
- The flow tied face verification to student ID entry but did not create a cryptographic voting eligibility token.

Recommended modernization:

- Move identity verification behind a dedicated verification service.
- Use a proper face recognition embedding model or vetted identity provider.
- Add liveness checks.
- Generate a short-lived, signed voting authorization after successful verification.
- Store verification audit events without storing unnecessary biometric data in logs.
- Define retention and consent rules for face images and descriptors.

## Optimization Opportunities

### Seeded SRC Position Templates

SRC positions should not be recreated manually for every election. The system should include a seeding mechanism for the official SRC position list and apply it automatically when an SRC election is created.

Recommended improvements:

- Add a seed script or migration for the 12 default SRC positions.
- Clone seeded positions into each new SRC election as election-specific `Position` records.
- Keep "Add Position" available as an advanced action for exceptional cases.
- Add a "Reset to SRC defaults" action before voting starts.
- Track whether a position came from the default template or was manually added.

Benefits:

- Reduces setup time.
- Prevents missing SRC roles.
- Preserves consistent ordering across election cycles.
- Keeps future expansion possible without cluttering normal setup.

### Bulk Candidate and Position Import

The current SAAD workflow requires manual candidate entry per position. This is time-consuming and error-prone for elections with many candidates.

Recommended improvement:

- Add a bulk import endpoint to the current API, similar to the legacy Next.js implementation.
- Accept `.csv`, `.xlsx`, and `.xls`.
- Support columns such as:
  - `Position`
  - `Position Description`
  - `Display Order`
  - `Max Votes Allowed`
  - `Candidate Name`
  - `Student ID`
  - `Party`
  - `Manifesto`
  - `Candidate Image URL`
- Validate all rows before writing any records.
- Return a preview with row-level errors and warnings.
- Allow SAAD to confirm before import.
- Use transactions so partial imports do not leave the election in an inconsistent state.

Benefits:

- Reduces manual candidate entry.
- Reduces spelling and duplication errors.
- Makes setup faster for large elections.
- Allows election data to be prepared offline and reviewed before upload.

Risks:

- Requires strong validation and clear error reporting.
- Needs duplicate detection across existing candidates.
- Needs a policy for whether imports replace, merge, or append data.

### Setup Validation Checklist

Before scheduling or opening an election, the API should validate:

- Election has a title.
- Election has a valid time window.
- Election has the seeded SRC position set, unless it is explicitly a custom election.
- Every active position has at least one approved candidate, unless uncontested positions are allowed.
- No candidate is both approved and disqualified.
- Candidate student IDs are unique where required.
- `maxVotesAllowed` does not exceed approved candidate count unless abstention or partial voting is allowed.
- Voting rules are internally consistent.
- `ELECTION_HMAC_SECRET` is configured.
- Eligible voters are available for the institution.
- Start and end notification jobs can be scheduled.

This could be exposed as:

```http
GET /elections/:id/readiness
```

The client could show a setup checklist with blocking errors and non-blocking warnings.

### Improved Error Handling

Recommended improvements:

- Return structured validation errors with field names and row numbers.
- Standardize error response format across election, candidate, position, vote, and result endpoints.
- Show client-side inline form errors instead of relying only on toast messages.
- Prevent publish and schedule actions when setup is incomplete.
- Add clearer messages for frozen elections, duplicate student IDs, duplicate display orders, and duplicate candidate imports.

### Streamlined Publishing Workflow

The current flow separates creation, scheduling, publishing, result recomputation, result review, and result publication. This is correct but can feel scattered.

Recommended improvements:

- Create a guided SAAD workflow:
  1. Election details.
  2. Positions.
  3. Candidates.
  4. Validation.
  5. Schedule.
  6. Publish.
  7. Review results.
  8. Publish results.
- Add a status timeline to the management screen.
- Add one-click "Run readiness check".
- Add confirmation dialogs for publish, publish results, and archive.
- Show the latest result snapshot hash and generated time before publication.
- Require SAAD to acknowledge unresolved ties before results can be published.

### Election Notifications

The scheduled election lifecycle should include student notifications.

Recommended improvements:

- Send start notifications when the election becomes `OPEN`.
- Send closure notifications when the election becomes `CLOSED`.
- Record notification attempts and failures.
- Retry failed notification batches.
- Use templates that include election title, times, and next steps.
- Allow SAAD to preview notification content before scheduling.

Benefits:

- Students know when voting starts.
- Students know when voting ends and results are being processed.
- The institution has a clearer communication trail.

### Result Integrity Enhancements

Recommended improvements:

- Add an endpoint to verify a ballot receipt by recomputing its HMAC hash.
- Add an endpoint to verify a result snapshot hash.
- Store the result counting version or algorithm identifier in each snapshot.
- Store tie flags and resolution decisions in result snapshots.
- Export signed result reports with snapshot hash, generated time, and reviewer identity.

### Voting UI Improvements

The backend supports `maxVotesAllowed`, but the current student UI behaves as a single-select ballot per position.

Recommended improvements:

- Render checkboxes for positions where `maxVotesAllowed > 1`.
- Show selection counters per position.
- Support explicit abstention when `votingRules.allowAbstain` is enabled.
- Explain uncontested positions clearly.
- Show a final review screen before submission.

## Tie Resolution Strategies

The current counting service sorts candidates by vote count descending and selects the first candidate as `winnerId`. It does not explicitly detect or resolve ties. A formal tie policy should be added before final publication.

### Strategy 1: Runoff Election

Run a new election between only the tied candidates.

Pros:

- Strong democratic legitimacy.
- Clear and easy to explain.
- Avoids administrator discretion.

Cons:

- Requires more time and coordination.
- May reduce turnout.
- Needs another voting window and notification cycle.

Best for:

- High-stakes positions such as SRC president or chairperson.

### Strategy 2: Re-vote for the Tied Position

Reopen voting only for the tied position while leaving all other results unchanged.

Pros:

- Less disruptive than a full runoff election.
- Keeps unaffected positions finalized.
- Clear audit trail if implemented as a separate election phase.

Cons:

- Requires additional ballot logic.
- Students may be confused if some positions are final while one is reopened.
- Campaign conditions may change after initial results are known.

Best for:

- Multi-position elections where only one office is tied.

### Strategy 3: Predefined Weighted Criteria

Use rules defined before voting starts, such as:

- Candidate with higher nomination endorsement count.
- Candidate with higher prior eligibility score.
- Candidate with fewer disciplinary flags.
- Candidate with higher academic standing, if policy allows.

Pros:

- Fast resolution.
- Can be automated.
- Avoids another voting round.

Cons:

- Can feel less democratic.
- Criteria may be sensitive or controversial.
- Must be disclosed before voting starts to be legitimate.

Best for:

- Low-stakes positions or institutions with approved constitutional rules for tie breaking.

### Strategy 4: Admin Decision Rules

SAAD or an authorized election committee resolves the tie according to documented policy.

Pros:

- Flexible.
- Handles unusual cases.
- Can include human review of eligibility, complaints, or disqualifications.

Cons:

- Highest risk of perceived bias.
- Requires strong audit logs and sign-off.
- Should not be used without prior policy approval.

Best for:

- Exceptional cases where automated rules cannot apply.

### Strategy 5: Randomized Resolution With Auditability

Use a transparent random draw, such as a cryptographically seeded random selection among tied candidates.

Pros:

- Fast.
- Neutral if the process is transparent.
- Easy to audit if the seed and algorithm are published.

Cons:

- May feel arbitrary.
- Poor fit for high-stakes leadership positions.
- Must be explicitly allowed by election rules before voting.

Best for:

- Low-stakes or committee positions where a random tie-break is constitutionally accepted.

### Strategy 6: Shared Position or Power-Sharing

Allow tied candidates to share a role or split a term, if institution policy supports it.

Pros:

- Avoids disenfranchising voters.
- Can reduce conflict.
- Useful for representative committees.

Cons:

- Not suitable for roles requiring one accountable office holder.
- May conflict with constitutions or role definitions.
- Requires operational planning.

Best for:

- Committee memberships, delegate roles, or non-executive positions.

### Recommended Tie Policy for Litsamaiso

Recommended default:

1. Detect ties during counting.
2. Mark tied positions in the result snapshot.
3. Block result publication while unresolved ties exist, unless the policy allows publishing non-tied positions.
4. Let SAAD choose an approved tie resolution path.
5. Record the tie resolution method, actor, timestamp, notes, and affected candidates.
6. Generate a new result snapshot after resolution.

Recommended data additions:

- `tieStatus`: `NONE`, `UNRESOLVED`, `RESOLVED`
- `tiedCandidateIds`
- `tieResolutionMethod`
- `tieResolutionNotes`
- `tieResolvedBy`
- `tieResolvedAt`
- `resolutionSnapshotId`

## Recommended Future End-to-End Workflow

The ideal mature lifecycle should be:

1. SAAD creates an election shell.
2. The system applies the seeded SRC positions by default.
3. SAAD imports or creates candidates.
4. SAAD optionally adds exceptional custom positions.
5. SAAD opens a nomination window if student self-nomination is enabled.
6. Students submit nominations or candidate registrations.
7. SAAD validates candidates.
8. SAAD resolves nomination issues.
9. SAAD runs an election readiness check.
10. SAAD schedules and publishes the election.
11. The system keeps voting locked until the start time.
12. At the start time, the election opens and students are notified.
13. Optional identity verification issues a short-lived voting authorization.
14. Students vote once during the open period.
15. Ballots are stored with receipt and hash verification.
16. Vote submission uses loading and disabled states to prevent repeated actions.
17. At the end time, the election closes and students are notified.
18. Results are counted into a signed snapshot.
19. Ties are detected and resolved according to policy.
20. SAAD reviews final results without modifying votes or computed totals.
21. SAAD publishes immutable results to students.
22. Election records are archived.

## Summary

The current Litsamaiso election system has a solid foundation for managed institutional elections: role-based access, institution scoping, election statuses, ballot receipts, HMAC-backed ballot and result hashes, audit logs, and a clear SAAD review-and-publish flow. For SRC elections, the next important alignment is to treat the 12 SRC positions as seeded defaults instead of requiring normal manual position creation.

The main gaps are seeded-position automation, student self-nomination, bulk candidate import, setup readiness validation, start/end email notifications, explicit tie handling, richer result verification endpoints, stricter post-voting immutability, and a production-grade identity verification design if face recognition is reintroduced. The old Next.js implementation provides useful inspiration for spreadsheet import and face verification, but those features should be modernized before being adopted into the current API/client architecture.
