# Android forensic report repair

## Confirmed implementation defects

- The PDF endpoint uses Retrofit `@Streaming`, but `ForensicsActivity` consumed `ResponseBody.bytes()` in the main-thread callback. Reading a live socket there can trigger `NetworkOnMainThreadException`; buffering the whole PDF also blocks the UI.
- Android 8 and 9 always received a null download destination because the old implementation only created a MediaStore Downloads entry on Android 10+.
- The incident action passed an existing evidence SHA-256 into a repository method that hashed it again, and populated subject/sender with the content type and hash.
- Email input was trimmed in the client and line endings were normalized before hashing in the backend. The evidence fingerprint therefore did not consistently represent the submitted UTF-8 text.
- The PDF letterhead overlapped; long table values could overflow pages. The report and incident endpoint claimed certification or national portal submission that the code did not perform.

## Fixes

- Android 0.1.1 (version code 2) uses the system document picker on all supported Android versions, streams PDF bytes on a worker thread, closes resources, rejects non-PDF payloads, and attempts removal of failed partial exports.
- Export uses the last successfully analyzed email, not subsequently edited text. Analysis disables duplicate requests and clears stale results.
- Forensic requests allow 90 seconds of read time within a 120-second overall deadline. This accommodates slow processing but does not repair an unavailable server.
- Errors show the configured server and remain visible in a dialog. Approximate-location permission is recognized when preparing incident details.
- Incident requests preserve the evidence hash and actual email subject/sender. The UI makes clear that no police complaint has been filed.
- The backend creates a formal unsigned cyber incident examination report with case-reference fields, evidence identification, findings, limitations, examiner review fields, and page numbering. Backend hashing preserves submitted UTF-8 text before parsing normalization.

## Verification and deployment

- Android assembleDebug and testDebugUnitTest passed: 10 tests, including three PDF stream regression tests.
- Seven focused backend tests and bootJar passed. Local smoke checks passed for health, samples, raw analysis, EML upload, PDF export (HTTP 200, application/pdf), and truthful draft incident preparation. The three-page sample report was rendered and visually inspected.
- The original installed APK used a different signing key. With the user's explicit approval, the old app was uninstalled and the tested APK installed on the connected phone. Installed package verification returned versionName 0.1.1 and versionCode 2.
- The production URL remains `https://cybershield-backend-b7tm.onrender.com/` as requested. Health and sample requests from the development computer timed out after 55 seconds during diagnosis. This establishes a connectivity failure from this environment, not its underlying hosting cause.
- The updated phone successfully loaded the sample catalog from Render. The computer timeout therefore does not establish a production outage.
- PDF formatting and backend fixes require deployment of the changed backend. Installing the Android APK does not deploy the backend.
- No automatic update service has been added. Future APKs signed with this computer's current debug key can replace this installed debug APK using `adb install -r`; production distribution needs managed release signing.

## Manual acceptance checks

1. Confirm Render health returns HTTP 200 and `/api/v1/forensics/samples` returns the sample catalog.
2. On the phone, open **Check a suspicious email**, load a sample, and run analysis. Check error recovery if the network is unavailable.
3. Save the evidence report; choose a document destination. Verify the PDF opens, its SHA-256 matches the displayed analysis, and the app stays responsive during download.
4. Edit the input after analysis and export again: the export must still represent the analyzed message until a new analysis succeeds.
5. Prepare incident details. Confirm its reference is marked as a draft and no police submission or official receipt is claimed. Repeat with approximate location and denied location permission.
6. Repeat PDF saving on Android 8/9 and a current Android device, including picker cancellation and storage failure.

The formal report is an application-generated technical report for review/submission, not a government-issued document or a signed statutory certificate.
