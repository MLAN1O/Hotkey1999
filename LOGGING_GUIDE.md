# Logging System Guide – HotkeyMyURLLikeIts1999

## 1. Overview

This document details the operation of the logging system in HotkeyMyURLLikeIts1999. The goal is to provide clear and detailed tracking of the application's operations, facilitating debugging, monitoring, and user support.

Logs are essential for diagnosing issues related to multi-monitor setups, window behavior, and hotkey interactions.

## 2. Log File Location

All logs and error reports are stored in the user's data directory.

- **Path:** `%appdata%\hotkeymyurllikeits1999`

You can access this folder quickly:
1. Press `Win + R` to open the "Run" dialog box.
2. Type `%appdata%\hotkeymyurllikeits1999` and press Enter.

### Generated Files:
- `log.txt`: The main log file with activity from the current session.
- `log_[timestamp].txt`: Old log files, automatically archived when they exceed 5MB.
- `crash_report_[timestamp].json`: Detailed reports generated in case of critical failures.

## 3. Log Format

Each entry in the `log.txt` file follows a standard format to ensure clarity and consistency.

`[timestamp] [PID] [LEVEL] Message {contextual_data}`

- **`timestamp`**: Date and time of the event (MM/DD/YYYY HH:mm:ss.SSS).
- **`PID`**: Process ID to identify a specific application session.
- **`LEVEL`**: Severity level of the log (`DEBUG`, `INFO`, `WARN`, `ERROR`).
- **`Message`**: Description of the event.
- **`{contextual_data}`**: (Optional) A JSON object with relevant additional information.

**Log Example:**
```
[08/06/2025 10:30:01.123] [PID:1234] [INFO] Hotkey triggered for profile: Main Display (ID: abc-123)
[08/06/2025 10:30:05.456] [PID:1234] [WARN] Monitor 12345678 not found, using primary display 87654321
```

## 4. Log Levels

Log levels are used to categorize the importance of each event.

| Level   | Description                                                                                      | Usage Examples                                                                      |
| :------ | :----------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| `DEBUG` | Detailed and granular information, useful only for deep code debugging.                          | `Validating monitorId=12345`, `Available displays: ...`                               |
| `INFO`  | Important events that mark the normal flow of the application.                                   | `App started`, `Window created for profile X`, `Hotkey triggered`                   |
| `WARN`  | Unexpected occurrences that do not prevent functionality but indicate a potential problem.       | `Monitor not found, using fallback`, `Duplicate hotkey detected`                    |
| `ERROR` | Failures that impact functionality and require attention.                                        | `Failed to create window for profile Y`, `Profile not found`, `Error saving settings` |

## 5. Logged Events

The logging system has been enhanced to capture the following key events:

### Application Lifecycle
- **`INFO`**: Initialization of the logger and the application.
- **`INFO`**: Setup of error handling.
- **`INFO`**: Application shutdown.

### Window Management
- **`INFO`**: Creation of a profile window, with profile ID and monitor ID.
  - `Profile window created for 'ProfileName' (ID: xyz-456) on monitor 12345678`
- **`INFO`**: Destruction of a profile window.
  - `Destroying window for profile: ProfileName`
- **`INFO`**: Closing an existing window due to the per-monitor exclusivity rule.
  - `Closing existing window on monitor 12345678 for profile: OldProfile`
- **`INFO`**: Triggering a hotkey to toggle a window's visibility.
  - `Hotkey triggered for profile: ProfileName (ID: xyz-456)`

### Monitor Management
- **`DEBUG`**: Details of the monitor validation process.
- **`WARN`**: Logged when the monitor configured for a profile is not found and a fallback monitor (usually the primary) is used.
  - `Monitor 12345678 not found, using primary display 87654321`

### Errors and Configuration
- **`ERROR`**: Failures when loading or saving `profiles.json` and `settings.json` files.
- **`ERROR`**: Errors during the creation of profile windows.
- **`ERROR`**: Attempting to interact with a profile that no longer exists.

## 6. Crash Reports

In the event of an unhandled error that causes a critical application failure, a detailed crash report is generated.

- **Location**: `%appdata%\hotkeymyurllikeits1999\crash_report_[timestamp].json`
- **Contents**:
  - `error`: Error message and full stack trace.
  - `context`: Additional information about where the error occurred.
  - `systemInfo`: Application version, platform (Windows/macOS), architecture.
  - `memoryUsage`: Memory usage at the time of the crash.
  - `processInfo`: PID and process uptime.

These reports are crucial for diagnosing and fixing complex bugs.

## 7. For Developers

To maintain consistency, always use the centralized `Logger` module.

**Module Location:** `src/Logger.js`

### How to Use the Logger
Replace all `console.log`, `console.warn`, and `console.error` calls with the logger.

```javascript
const logger = require('./Logger');

// Usage examples:
logger.debug('Granular debug information.', { details: '...' });

logger.info(`Profile ${profile.displayName} loaded successfully.`);

logger.warn('An unexpected condition occurred.', { profileId: 'abc-123' });

logger.error('Failed to process the request.', error);

// To manually generate a crash report (use sparingly):
try {
  // Code that might fail
} catch (error) {
  logger.createCrashReport(error, { context: 'During profile update' });
}
```