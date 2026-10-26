# Managing IT Resources Course Project

## Draft notes

This editable draft fills every response section in the ITE367 Course Project Template. Bracketed cover details need confirmation. The team names come from an earlier capstone feedback form, which identifies a capstone adviser but does not identify the instructor for this course. The repository contains no completed user survey, measured before-and-after results, or vendor price quotations. Targets and costs below are proposals.

## Cover information

**Project title:** PHINMA University of Pangasinan Room Management System (Room Track / RORMS)  
**Team name / section:** [Confirm current team name and section]  
**Team members:** John Angelo DC. Peralta; Rufford P. Ceralde; Angel Kurt A. Pawig; Allen Francis M. Rodas; Johnrich C. Soriano  
**Instructor:** [Confirm ITE367 course instructor]  
**Date submitted:** [Enter actual submission date]

# Part A Project Charter

## A1 Project title and North Star

**Project title:** PHINMA University of Pangasinan Room Management System (Room Track / RORMS)

**North Star statement:** Give authorized university staff one reliable place to manage rooms, prepare academic schedules, assign rooms, and review reservation requests. The intended result is fewer conflicting assignments, clearer decisions, and better visibility into room use.

## A2 Problem statement

At PHINMA University of Pangasinan, staff must assign rooms to academic classes while also handling one-day room reservations. Each decision depends on room capacity and status, class and instructor schedules, operating hours, semester dates, and existing bookings. If those records are not checked together when a room is assigned or a request is approved, the same room can be allocated to overlapping activities, an unsuitable room can be selected, or staff may need to reconcile conflicting information. Such errors can disrupt classes and events and make it difficult for the Registrar, departments, and facilities staff to determine which rooms are available.

**Supporting data points to collect:**

- **Overlapping room assignments or requests:** [Enter the number found during the baseline period.] *What this data point shows:* How often different activities compete for the same room and time.
- **Reservations requiring a room or time change:** [Enter the number and percentage during the baseline period.] *What this data point shows:* How often the initial choice cannot be accommodated.
- **Time needed to confirm a room assignment or decide a request:** [Enter the median time from submission to decision.] *What this data point shows:* The amount of staff time and delay involved in coordinating room use.
- **Rooms that do not meet a request's capacity or availability requirements:** [Enter the number found during the baseline period.] *What this data point shows:* How often room suitability affects scheduling decisions.

## A3 Key stakeholders and users

| Stakeholder / user | Role or interest | Main concern |
| --- | --- | --- |
| System Administrator | Manages accounts, departments, facilities, and system oversight | Correct access, reliable records, and accountability |
| Registrar | Reviews department schedules and assigns rooms | Avoiding conflicting room and instructor assignments |
| Dean | Oversees departmental planning and recommends reservations | Accurate courses, faculty workload, and department requests |
| Program Head | Helps maintain department courses and schedules in the current prototype | Clear editing permissions and accurate program data |
| Instructor | Views schedules, checks rooms, and submits reservations | Knowing where to teach and whether a requested room is available |
| University Administrator | Oversees facilities and gives final reservation decisions in the current prototype | Room readiness, capacity, and sound approval decisions |
| University IT and privacy personnel | Operate and review the system | Security rules, backups, costs, and incident handling |
| Students | Benefit from dependable class-room assignments; no student portal is in the current scope | Classes taking place in the correct room and time |

## A4 Scope

| Inclusions (what is included) | Exclusions (what is not included) |
| --- | --- |
| Account invitation, sign-in, email verification, active-account checks, and role-specific navigation | Student accounts and a student self-service portal |
| Building and room records, capacity, amenities, status, operating hours, and room feedback | Physical occupancy sensors and building access control |
| Academic years and semester phases; department course, schedule, and summary workbooks; Excel import and export | Payroll, attendance, learning management, and student information system integration |
| Validation of departmental schedules and Registrar room plotting | A guaranteed globally optimal timetable generated without staff review |
| Single-day Standard and Extended reservations, review decisions, notifications, and personal reservation history | Recurring event reservations and payment processing |
| Dashboards, analytics, CSV reports, selected audit logs, and a controlled campus pilot | A claim of full privacy compliance or production readiness before security review and acceptance testing |

## A5 Success criteria

These are **pilot acceptance targets**, not results already achieved.

| Criterion | Measure or target |
| --- | --- |
| Valid academic room assignments | No overlapping room assignments in the approved pilot timetable; every scripted conflict case is detected before approval |
| Safe reservation decisions | No conflicting request is approved in the pilot test set, including Standard and Extended requests |
| Correct permissions | Every unauthorized read or write in the agreed role matrix is denied by tested server rules or authorized functions |
| Usable role workflows | At least 90% of participants complete their assigned critical tasks without assistance |
| User acceptance | Mean score of at least 4.0 out of 5 for the shared usability questions, with results reported separately by role and N/A excluded |
| Efficiency | At least 25% lower median completion time for selected room-finding and approval tasks compared with the baseline collected in Week 1 |
| Release quality | No unresolved high-severity defect at pilot launch; build and relevant automated checks pass |

## A6 Course modules applied

| Module area | How it applies to our project |
| --- | --- |
| ☑ Data Collection & Sampling (Modules 1–4) | Inventory rooms and scheduling records; observe existing tasks; recruit users across the six current roles; record task times, errors, and questionnaire responses. |
| ☑ Documentation & Data Organization (Module 6) | Maintain a data dictionary, role matrix, workflow diagrams, test cases, issue log, and structured room, course, schedule, and reservation records. |
| ☑ Security & Data Handling (Modules 7–9) | Review personal-data collection, access rules, file uploads, retention, audit events, and account permissions before the pilot. |
| ☑ Pattern Analysis / Clustering (Module 10) | Use descriptive analytics to identify peak reservation periods, heavily used rooms, and uneven demand. No clustering model is claimed as implemented. |
| ☑ Decision-Making / Optimization (Module 11) | Apply conflict checks, capacity and availability filters, and room recommendations to support staff decisions. Staff retain final review. |
| ☑ Proposal Writing (Module 12) | Present the problem, alternatives, evidence, costs, risks, implementation plan, and explicit approval request in this proposal. |

## A7 Team roles and workflow

The assignments below are **proposed**; the team should replace them with its actual division of work.

| Team member | Proposed role | Responsibility |
| --- | --- | --- |
| John Angelo DC. Peralta | Coordinator and client liaison | Confirm scope, arrange stakeholder reviews, track decisions and milestones |
| Rufford P. Ceralde | Data and security lead | Review schema, access rules, privacy controls, and test data |
| Angel Kurt A. Pawig | Interface and workflow lead | Verify role tasks, responsive screens, and usability fixes |
| Allen Francis M. Rodas | Integration and testing lead | Check scheduling and reservation paths, automated tests, and defects |
| Johnrich C. Soriano | Documentation and UAT lead | Maintain requirements, run questionnaires, summarize results, and prepare handover |

**Workflow:** Hold a weekly team review, record changes in a shared task list, require a second person to review critical scheduling or security changes, and obtain client sign-off on scope and pilot acceptance results.

# Part B Solution Design Document

## B1 Problem and solution overview

**Problem summary:** Academic classes and one-day reservations compete for the same campus rooms. Before assigning a room or approving a request, staff must check its capacity, status, available hours, class schedule, and existing bookings. When this information is difficult to review together, overlapping or unsuitable room assignments can disrupt classes and events, and users may be unsure of a request's status.

**Proposed solution:** RORMS provides a shared building and room directory, department schedule workbooks, Registrar room assignment, and a room reservation workflow. Department staff prepare class schedules; the Registrar checks conflicts and assigns rooms; eligible users request available rooms; and the Dean, Registrar, and University Administrator review requests in sequence. Role-specific views, status updates, and reports help staff see which rooms are assigned, available, or requested.

## B2 User flow and system architecture

**System flow:**

1. An authorized invitation creates a staff membership. The user signs in and verifies their email.
2. The interface displays the pages and actions for the accepted membership role.
3. Administrators maintain buildings, rooms, departments, and academic years. Department editors maintain courses, schedules, and workload summaries.
4. Schedule validation identifies incomplete data and overlapping instructors or rooms. The Registrar reviews department schedules and explicitly approves room plotting.
5. An eligible user searches available rooms and submits a single-day reservation. The request begins as Pending.
6. The Dean recommends or declines first, the Registrar reviews next, and the University Administrator makes the final decision. The requester sees status and notifications.
7. Dashboards, analytics, reports, and selected audit events help staff review operations and investigate changes.

**Diagram, described in text:**

`Staff member → Firebase Authentication → React role-aware interface → Firestore records for users, memberships, facilities, academic years, workbooks, schedules, and reservations`

`Firestore changes and authorized actions → Cloud Functions → notifications, lifecycle updates, and selected audit logs`

`Firestore records → dashboards, calendars, room search, analytics, and CSV reports`

The current implementation has two schedule collections, `schedule` and `schedules`, used by different workbook paths. Their consumers must be reconciled so class assignments and reservation checks use a consistent view.

## B3 Security and compliance integration

RORMS handles staff names, email addresses, schedules, reservation details, profile images, and uploaded evidence. The relevant Philippine privacy framework is the [Data Privacy Act of 2012](https://privacy.gov.ph/data-privacy-act/) and its [implementing rules](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/). The table identifies controls to verify or complete; it does **not** claim that RORMS already complies. The current local Firestore and Storage rules allow broad access to many records and files, so role-specific screens alone cannot protect them.

| Security control or measure | Threat or requirement addressed | Compliance framework |
| --- | --- | --- |
| Require invited, verified, active accounts and accepted memberships; enforce role permissions on the server as well as in the interface | Unapproved users or roles accessing staff and reservation data | Data Privacy Act Section 20: appropriate technical security measures |
| Deny database access by default, then grant only the reads and writes each role or record owner needs; test rejected requests | Unauthorized reading, alteration, or deletion of personal records | Data Privacy Act Section 20: protection against unlawful access and processing |
| Restrict uploaded profile images and reservation evidence to authorized users; validate file type and size at the storage boundary | Exposure of personal images or evidence and unsafe uploads | Data Privacy Act Section 20: technical protection of personal information |
| Publish a privacy notice, identify the lawful basis and purpose for each data category, collect only necessary fields, and set retention and deletion periods | Unclear, excessive, or indefinite processing of personal information | Data Privacy Act Sections 11, 12, and 16: privacy principles, lawful processing, and the right to be informed |
| Limit audit-log access, record significant administrative decisions, and establish incident monitoring and response procedures | Untraceable changes, misuse, or an undetected data incident | Data Privacy Act Section 20 and its implementing rules: organizational and technical security measures |

GDPR and PCI-DSS are examples in the template. The project files do not establish EU-targeted data processing or payment-card handling, so this proposal does not assign those frameworks without a separate applicability review.

## B4 User feedback plan

Invite representatives of each approved user role to complete realistic tasks with approved test data, such as finding a room, editing a department schedule, plotting a room, or reviewing a reservation. After each session, give participants the shared and role-specific questions in the existing UAT questionnaire, then ask what was confusing or missing. Add System Administrator questions because the current questionnaire has no dedicated section for that role.

Record each participant's role and device, whether each task was completed, time taken, errors, 1–5 ratings, N/A responses, and written comments. Summarize results by role and task, excluding N/A from score averages. Prioritize issues that prevent task completion or cause incorrect decisions, make the changes, and ask affected users to repeat those tasks. Use anonymized direct quotations only with the participant's permission.

**Results to insert after testing:** [Number of participants by role]; [task completion rate]; [average rating by role, excluding N/A]; [common issues]; [anonymized user quotation, if permitted]; [change made and retest result]. No completed UAT responses or quotations are recorded in the project files yet.

## B5 Scalability and maintenance

The current application uses Firestore for live records and workbook snapshots, Firebase Storage for uploaded files, and Cloud Functions for selected background work. Workbook revisions, conflict handling, and local caching help manage larger department files and simultaneous editors. For sustained use, assign a university system owner, monitor storage and function usage, schedule exports or backups, document semester rollover, maintain an incident and defect process, and review rules and dependencies regularly. Increase pilot data gradually and measure load and cost before campus-wide use.

## B6 Real-world constraints

| Constraint | What can realistically be done? |
| --- | --- |
| Time | Use a six-week hardening and pilot plan for the existing prototype; postpone noncritical additions. |
| Resources (skills, tools, data) | Reuse React, TypeScript, Firebase, and the existing Excel templates. Use synthetic or authorized institutional records; obtain IT help for rules and deployment. |
| Stakeholders (who approves or uses it) | Confirm the role scope and workflows with the client, Registrar, department representatives, University Administrator, and IT/privacy personnel. |
| Sustainability (maintained after the course) | Deliver source documentation, account and deployment procedures, test cases, data ownership, and an assigned university maintainer. |

## B7 Implementation considerations

Confirm the official project title and six-role scope against the earlier four-role feedback. Reconcile the two schedule collections and make standard reservation approval checks authoritative at the server or transaction level. Review the broad fallback Firestore and Storage rules before using real personal data. Check that tightening rules will still permit the application’s current direct-write workflows. Test concurrent saves, Excel imports, missing room data, parallel sections, Philippine-time semester boundaries, desktop and mobile layouts, and recovery from network failure. The Dean personal teaching timetable and dedicated equipment-issue ticket workflow should not be represented as finished features.

# Part C Technical Proposal

## C1 Executive summary

Approve a controlled pilot of the PHINMA University of Pangasinan Room Management System. The existing prototype brings facility records, departmental schedules, room plotting, reservations, and reporting into one staff workflow. A six-week completion phase will reconcile conflicting data paths, strengthen access controls, test the six current roles, and measure whether the system reduces conflicts and task time. Pilot use of real records should begin only after the security and acceptance gates in this proposal are met.

## C2 Problem statement and background

The university needs a reliable way to coordinate rooms used by classes and one-day reservations. The earlier capstone feedback called for a client-specific system, buildings with rooms and floors, room assignment as well as reservation, and reports showing assignments by room and instructor. The repository now contains a substantial prototype with those broad workflows, but its documentation, security rules, and some data consumers do not fully agree.

The current code uses six roles; earlier feedback named four. Compact schedule workbooks and another workbook path save to different schedule collections. Some reservation actions check conflicts in the interface, while the local database and file rules allow broader direct access than the role-aware screens imply. These are concrete implementation issues to resolve before a pilot. No measured pre-system conflict rate, processing time, completed UAT score, or financial return appears in the available material. Week 1 will establish the baseline.

## C3 Proposed solution

Use RORMS as the foundation for a university-owned room management service. Staff maintain rooms and academic terms; departments prepare schedules in workbook-style screens; the Registrar assigns rooms; eligible users request one-day reservations; designated reviewers decide requests in sequence; and users receive status information. Reports and analytics make room use and assignments visible. Complete server-side permissions and consistent schedule/reservation checks, then pilot with approved data and role-based tasks.

**Alternatives considered**

| Option | Pros and cons | Why not chosen |
| --- | --- | --- |
| Continue with separate spreadsheets, messages, and manual approval | Low new software cost; familiar tools. Staff must reconcile versions and check conflicts manually. | It does not provide one current view of room assignments and reservations. |
| Adopt a generic room-booking product | May be quicker for simple bookings; may require fees and process changes. | The client also needs academic terms, department schedules, Registrar plotting, and campus-specific reporting. |
| Extend the existing RORMS prototype | Reuses implemented workflows and project knowledge; requires security and integration work. | **Chosen**, subject to the pilot gates and approved scope. |

## C4 Justification and benefits

**Evidence available and to be collected:** The repository provides working source, data structures, tests, Excel templates, role-specific screens, dashboards, and an unfilled UAT questionnaire. Earlier feedback provides qualitative direction, but no completed survey or measured outcome. During the pilot, compare the same scripted tasks before and after use, count conflicts detected and prevented, record decision time, and summarize questionnaire scores. Show room-use charts and a workflow diagram alongside the measured results.

**User impact:** A shared room directory and clear request status should reduce repeated checking between offices. Department editors and the Registrar can review the same saved schedules, while instructors can find rooms and follow their requests. The size of any time saving will be reported only after baseline and pilot measurement.

**Security / compliance:** Verified accounts, membership checks, private notices, and selected logged operations are present in code. Broad fallback database and storage rules are a release risk. The pilot requires reviewed rules, denied-access tests, an approved privacy notice and retention approach, and designated data ownership. This proposal does not certify legal compliance.

**Business case:** The prototype avoids starting from zero and uses existing devices and student development time. Benefits can be estimated after testing as: **time saved per task × number of tasks**, alongside avoided conflict rework. A monetary ROI cannot be calculated responsibly until staff time, incident frequency, and actual cloud charges are known.

## C5 Implementation plan

| Phase | Proposed timeline | Work and output |
| --- | --- | --- |
| Scope and baseline | Week 1 | Confirm title, roles, client tasks, data owner, current task times, and pilot dataset |
| Security and data alignment | Weeks 2–3 | Restrict rules, reconcile schedule consumers, make approval conflict checks authoritative, and update affected tests |
| Integration verification | Week 4 | Run builds and relevant automated checks; test concurrent edits, imports, reservations, notifications, and reports |
| Role-based UAT | Week 5 | Test desktop and mobile tasks with representatives of each approved role; collect ratings and comments |
| Fixes and handover | Week 6 | Resolve severe findings, repeat failed tasks, document operation and costs, and seek pilot sign-off |

## C6 Budget and resources

The following is an **illustrative pilot spending ceiling**, not a vendor quotation or amount already spent.

| Item | Description | Cost (₱) |
| --- | --- | ---: |
| Existing development tools and student labor | Existing equipment and project work contributed in kind | 0 |
| Cloud usage allowance | Capped allowance for pilot hosting, database, storage, and functions; verify actual billing first | 2,000 |
| UAT logistics | Connectivity, printing, or participant materials | 1,000 |
| Contingency | Approved minor pilot expenses | 1,000 |
| **Total proposed cash ceiling** | Subject to client and course approval | **4,000** |

**Team and resource requirements:** Five student team members; access to the existing code and authorized Firebase project; a Registrar representative; Dean and instructor participants; a University Administrator or facilities representative; and an IT/privacy reviewer. Use approved test records until access and privacy checks pass.

## C7 Risks and mitigations

| Risk | Likelihood / impact | Mitigation |
| --- | --- | --- |
| Broad Firestore or Storage rules expose or allow changes to records | High / high | Review and tighten rules; test allowed and denied actions before pilot data is entered |
| The two schedule collections produce inconsistent availability or reports | Medium / high | Define one authoritative schedule view and test both workbook paths and reservation consumers |
| Simultaneous requests approve the same room | Medium / high | Recheck conflicts in an authoritative transaction or trusted function immediately before approval |
| Imported workbooks contain missing rooms, TBA values, or incorrect faculty data | High / medium | Validate imports, show actionable errors, and require department review before plotting |
| A concurrent save overwrites another editor’s work | Medium / high | Exercise revision checks, merge prompts, recovery, and multi-user test cases |
| Client role scope differs from the earlier four-role feedback | High / medium | Obtain written approval of the current six-role matrix or revise it before UAT |
| Cloud interruption or unexpected usage charges | Medium / medium | Monitor usage, set a pilot spending limit, document recovery, and retain exports or backups |
| Users struggle with workbook and approval screens | Medium / medium | Run role-specific UAT, fix critical tasks, and provide short operating instructions |

## C8 Conclusion and call to action

Approve **the six-week controlled pilot plan and a cash ceiling of ₱4,000**, designate the client and IT/privacy reviewers, and confirm whether the current six roles are within the approved scope. Authorize the team to use an approved pilot dataset and run role-based acceptance testing. Permit live institutional use only after access-rule tests, schedule and reservation conflict tests, and critical UAT tasks meet the agreed acceptance targets.

The template has no separate Part D body to fill; “Pitch and Defense” appears only in its opening sequence.

## Sources used for this draft

- Supplied template: `C:\Users\asiro\Downloads\ITE367 Course_Project_Template (MIT).docx`
- Earlier capstone feedback form: `C:\Users\asiro\Downloads\Capstone-Feedback-Verification-G3.docx`
- [System roles](SYSTEM_ROLES.md)
- [Firestore collection notes](FIRESTORE_COLLECTIONS.md)
- [UAT questionnaire](UAT_QUESTIONNAIRES.md)
- [Application entry](frontend/src/App.tsx)
- [Reservation review page](frontend/src/pages/tabs/ManageReservationsPage.tsx)
- [Cloud Functions](functions/src/index.ts)
- [Firestore rules](firestore.rules)
- [Storage rules](storage.rules)
