# Logging System - HotkeyMyURLLikeIts1999

## Log File Location

The application now saves all logs persistently to the file:

```
C:\Users\[YOUR_USERNAME]\AppData\Roaming\hotkeymyurllikeits1999\log.txt
```

### How to Access Logs

1. **Via Windows Explorer:**
   - Press `Win + R`
   - Type: `%appdata%\hotkeymyurllikeits1999`
   - Press Enter
   - Open the `log.txt` file

2. **Via Command Prompt:**
   ```cmd
   type "%appdata%\hotkeymyurllikeits1999\log.txt"
   ```

3. **Via PowerShell:**
   ```powershell
   Get-Content "$env:APPDATA\hotkeymyurllikeits1999\log.txt" -Tail 50
   ```

## Log Format

Each log entry contains:
- **Timestamp**: Date and time with milliseconds (Brazilian format)
- **PID**: Process ID to identify sessions
- **Level**: DEBUG, INFO, WARN, ERROR
- **Message**: Log content
- **Data**: JSON objects when applicable

### Log Example:
```
[05/08/2025 20:25:58.870] [PID:9768] [INFO] Logger initialized successfully {
  "logFile": "C:\\Users\\yourname\\AppData\\Roaming\\hotkeymyurllikeits1999\\log.txt"
}
[05/08/2025 20:25:59.030] [DEBUG] validateMonitorPosition: Validating monitorId=2528732444
[05/08/2025 20:25:59.031] [DEBUG] Available displays: 2528732444(27G2G4), 2779098405(TSB LEDTV)
```

## Implemented Features

### ✅ Persistent Logging
- All logs are automatically saved to `log.txt` file
- Logs remain available after closing the application
- File is created in user-specific userData folder

### ✅ Size Management
- Log files larger than 5MB are automatically archived
- System creates timestamped backup before starting new log
- Prevents log file from growing indefinitely

### ✅ Log Levels
- **DEBUG**: Detailed information for debugging (validateMonitorPosition, etc.)
- **INFO**: Important system events (initialization, etc.)
- **WARN**: Warnings that don't prevent functionality
- **ERROR**: Errors requiring attention

### ✅ Crash Reports
- Critical errors automatically generate detailed reports
- Crash reports are saved as separate JSON files
- Includes system information, memory usage, and stack trace

## Captured Information

The logging system captures:
- **Monitor Management**: Monitor validation, fallbacks, found IDs
- **Window Lifecycle**: Creation, destruction, window updates
- **Profile Management**: Loading, validation, profile correction
- **Error Handling**: Window creation failures, configuration issues
- **System Information**: App version, platform, memory usage

## For Developers

### Using the Logger in Code:
```javascript
const logger = require('./Logger');

// Different levels
logger.debug('Debug information', { data: value });
logger.info('Important event');
logger.warn('Warning about something');
logger.error('Critical error', error);

// Automatic crash report
logger.createCrashReport(error, { context: 'additional info' });
```

### File Locations:
- **Main log**: `%appdata%\hotkeymyurllikeits1999\log.txt`
- **Crash reports**: `%appdata%\hotkeymyurllikeits1999\crash_report_[timestamp].json`
- **Archived logs**: `%appdata%\hotkeymyurllikeits1999\log_[timestamp].txt`

---

This logging system was implemented to facilitate debugging of multi-monitor issues and provide detailed information for issue resolution.
