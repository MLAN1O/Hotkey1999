const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Centralized logging system that writes logs to both console and persistent file.
 * Logs are saved to userData/log.txt for user access after app closure.
 */
class Logger {
    constructor() {
        this.logLevels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };
        
        this.currentLogLevel = this.logLevels.DEBUG; // Show all logs by default
        this.logFilePath = null;
        this.initializeLogFile();
    }

    /**
     * Initialize the log file path and create the file if it doesn't exist.
     */
    initializeLogFile() {
        try {
            const userDataPath = app.getPath('userData');
            this.logFilePath = path.join(userDataPath, 'log.txt');
            
            // Create initial log entry
            const startupMessage = `\n${'='.repeat(80)}\nApplication started at ${this.getTimestamp()}\nVersion: ${app.getVersion()}\nUserData path: ${userDataPath}\n${'='.repeat(80)}\n`;
            
            // Check if log file exists and is getting too large (> 5MB)
            if (fs.existsSync(this.logFilePath)) {
                const stats = fs.statSync(this.logFilePath);
                if (stats.size > 5 * 1024 * 1024) { // 5MB
                    // Archive old log and start fresh
                    const archivePath = path.join(userDataPath, `log_${Date.now()}.txt`);
                    fs.renameSync(this.logFilePath, archivePath);
                    this.writeToFile(`Old log archived to: ${path.basename(archivePath)}\n`);
                }
            }
            
            this.writeToFile(startupMessage);
            this.info('Logger initialized successfully', { logFile: this.logFilePath });
        } catch (error) {
            console.error('Failed to initialize log file:', error);
        }
    }

    /**
     * Get formatted timestamp for log entries.
     * @returns {string} Formatted timestamp with milliseconds.
     */
    getTimestamp() {
        const now = new Date();
        const date = now.toLocaleDateString('pt-BR');
        const time = now.toLocaleTimeString('pt-BR', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        const ms = now.getMilliseconds().toString().padStart(3, '0');
        return `${date} ${time}.${ms}`;
    }

    /**
     * Write message directly to log file.
     * @param {string} message Message to write.
     */
    writeToFile(message) {
        if (this.logFilePath) {
            try {
                fs.appendFileSync(this.logFilePath, message, 'utf8');
            } catch (error) {
                console.error('Failed to write to log file:', error);
            }
        }
    }

    /**
     * Format log entry for both console and file.
     * @param {string} level Log level (DEBUG, INFO, WARN, ERROR).
     * @param {string} message Main log message.
     * @param {...any} args Additional arguments.
     * @returns {string} Formatted log entry.
     */
    formatLogEntry(level, message, ...args) {
        const timestamp = this.getTimestamp();
        const pid = process.pid;
        const formattedMessage = typeof message === 'string' ? message : JSON.stringify(message);
        
        let argsString = '';
        if (args.length > 0) {
            argsString = ' ' + args.map(arg => {
                if (typeof arg === 'object') {
                    return JSON.stringify(arg, null, 2);
                }
                return String(arg);
            }).join(' ');
        }

        return `[${timestamp}] [PID:${pid}] [${level}] ${formattedMessage}${argsString}`;
    }

    /**
     * Generic log method.
     * @param {string} level Log level.
     * @param {string} message Log message.
     * @param {...any} args Additional arguments.
     */
    log(level, message, ...args) {
        const levelNum = this.logLevels[level] || 0;
        
        if (levelNum < this.currentLogLevel) {
            return; // Skip logs below current level
        }

        const logEntry = this.formatLogEntry(level, message, ...args);
        const fileEntry = logEntry + '\n';
        
        // Write to file
        this.writeToFile(fileEntry);
        
        // Also write to console with appropriate method
        switch (level) {
            case 'ERROR':
                console.error(logEntry);
                break;
            case 'WARN':
                console.warn(logEntry);
                break;
            case 'INFO':
                console.info(logEntry);
                break;
            case 'DEBUG':
            default:
                console.log(logEntry);
                break;
        }
    }

    /**
     * Debug level logging.
     * @param {string} message Log message.
     * @param {...any} args Additional arguments.
     */
    debug(message, ...args) {
        this.log('DEBUG', message, ...args);
    }

    /**
     * Info level logging.
     * @param {string} message Log message.
     * @param {...any} args Additional arguments.
     */
    info(message, ...args) {
        this.log('INFO', message, ...args);
    }

    /**
     * Warning level logging.
     * @param {string} message Log message.
     * @param {...any} args Additional arguments.
     */
    warn(message, ...args) {
        this.log('WARN', message, ...args);
    }

    /**
     * Error level logging.
     * @param {string} message Log message.
     * @param {...any} args Additional arguments.
     */
    error(message, ...args) {
        this.log('ERROR', message, ...args);
    }

    /**
     * Set the minimum log level to display/save.
     * @param {string} level Minimum log level (DEBUG, INFO, WARN, ERROR).
     */
    setLogLevel(level) {
        if (this.logLevels.hasOwnProperty(level)) {
            this.currentLogLevel = this.logLevels[level];
            this.info(`Log level set to: ${level}`);
        } else {
            this.warn(`Invalid log level: ${level}. Available levels:`, Object.keys(this.logLevels));
        }
    }

    /**
     * Get the current log file path.
     * @returns {string} Path to the log file.
     */
    getLogFilePath() {
        return this.logFilePath;
    }

    /**
     * Create a crash report with current system state.
     * @param {Error} error Error object or error message.
     * @param {object} context Additional context information.
     */
    createCrashReport(error, context = {}) {
        const crashReport = {
            timestamp: this.getTimestamp(),
            error: {
                message: error.message || String(error),
                stack: error.stack || 'No stack trace available',
                name: error.name || 'Unknown Error'
            },
            context: context,
            system: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                electronVersion: process.versions.electron,
                appVersion: app.getVersion()
            },
            memory: process.memoryUsage()
        };

        const crashReportString = `\n${'*'.repeat(80)}\nCRASH REPORT\n${'*'.repeat(80)}\n${JSON.stringify(crashReport, null, 2)}\n${'*'.repeat(80)}\n`;
        
        this.error('CRASH REPORT GENERATED:', crashReportString);
        
        // Also save crash report to separate file
        try {
            const userDataPath = app.getPath('userData');
            const crashReportPath = path.join(userDataPath, `crash_report_${Date.now()}.json`);
            fs.writeFileSync(crashReportPath, JSON.stringify(crashReport, null, 2), 'utf8');
            this.info('Crash report saved to:', crashReportPath);
        } catch (saveError) {
            this.error('Failed to save crash report file:', saveError);
        }

        return crashReport;
    }
}

// Export singleton instance
const logger = new Logger();
module.exports = logger;