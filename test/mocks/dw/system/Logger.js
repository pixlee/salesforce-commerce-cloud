'use strict';

/**
 * Mock for dw.system.Logger
 * Based on SFRA7 patterns with enhanced logging capabilities for testing
 */

// Global log storage for test verification
var globalLogs = {
    debug: [],
    info: [],
    warn: [],
    error: []
};

/**
 * Logger constructor
 * @param {string} category - Logger category
 */
function Logger(category) {
    this.category = category || 'default';
}

Logger.prototype.debug = function (message) {
    var logEntry = {
        level: 'debug',
        category: this.category,
        message: message,
        timestamp: new Date()
    };
    globalLogs.debug.push(logEntry);
};

Logger.prototype.info = function (message) {
    // Handle SFCC-style format strings with additional arguments
    var formattedMessage = message;
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            var placeholder = '{' + (i - 1) + '}';
            formattedMessage = formattedMessage.replace(new RegExp('\\{' + (i - 1) + '\\}', 'g'), arguments[i]);
        }
    }

    var logEntry = {
        level: 'info',
        category: this.category,
        message: formattedMessage,
        timestamp: new Date()
    };
    globalLogs.info.push(logEntry);
};

Logger.prototype.warn = function (message) {
    // Handle SFCC-style format strings with additional arguments
    var formattedMessage = message;
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            var placeholder = '{' + (i - 1) + '}';
            formattedMessage = formattedMessage.replace(new RegExp('\\{' + (i - 1) + '\\}', 'g'), arguments[i]);
        }
    }

    var logEntry = {
        level: 'warn',
        category: this.category,
        message: formattedMessage,
        timestamp: new Date()
    };
    globalLogs.warn.push(logEntry);
};

Logger.prototype.error = function (message) {
    var logEntry = {
        level: 'error',
        category: this.category,
        message: message,
        timestamp: new Date()
    };
    globalLogs.error.push(logEntry);
};

// Static methods
Logger.getLogger = function (category) {
    return new Logger(category);
};

Logger.debug = function (message) {
    var logger = new Logger('root');
    logger.debug(message);
};

Logger.info = function (message) {
    var logger = new Logger('root');
    logger.info.apply(logger, arguments);
};

Logger.warn = function (message) {
    var logger = new Logger('root');
    logger.warn.apply(logger, arguments);
};

Logger.error = function (message) {
    var logger = new Logger('root');
    logger.error(message);
};

// Test utilities
Logger.__testUtils = {
    clearLogs: function () {
        globalLogs.debug = [];
        globalLogs.info = [];
        globalLogs.warn = [];
        globalLogs.error = [];
    },

    getLogs: function (level) {
        if (level) {
            return globalLogs[level] ? globalLogs[level].slice() : [];
        }
        return {
            debug: globalLogs.debug.slice(),
            info: globalLogs.info.slice(),
            warn: globalLogs.warn.slice(),
            error: globalLogs.error.slice()
        };
    },

    getLogMessages: function (level) {
        var logs = this.getLogs(level);
        if (level) {
            return logs.map(function (log) { return log.message; });
        }
        var messages = {};
        Object.keys(logs).forEach(function (key) {
            messages[key] = logs[key].map(function (log) { return log.message; });
        });
        return messages;
    }
};

module.exports = Logger;
