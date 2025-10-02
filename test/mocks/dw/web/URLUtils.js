/**
 * Mock for dw.web.URLUtils
 * Based on SFRA7 patterns with enhanced functionality for Pixlee testing
 */

module.exports = {
    /**
     * Creates an HTTP URL for a given action
     * @param {string} action - The action name (e.g., 'Product-Show')
     * @param {...*} args - Additional arguments (param name, param value pairs)
     * @returns {string} - Mock URL
     */
    http: function (action) {
        var args = Array.prototype.slice.call(arguments, 1);
        var url = 'http://test-site.com/' + (action || 'default');

        // Handle parameter pairs
        if (args.length >= 2) {
            var params = [];
            for (var i = 0; i < args.length; i += 2) {
                if (args[i] && args[i + 1]) {
                    params.push(args[i] + '=' + encodeURIComponent(args[i + 1]));
                }
            }
            if (params.length > 0) {
                url += '?' + params.join('&');
            }
        }

        return url;
    },

    /**
     * Creates an HTTPS URL for a given action
     * @param {string} action - The action name
     * @param {...*} args - Additional arguments
     * @returns {string} - Mock HTTPS URL
     */
    https: function () {
        var httpUrl = this.http.apply(this, arguments);
        return httpUrl.replace('http://', 'https://');
    },

    /**
     * Creates a URL for a given action (protocol-relative)
     * @param {string} action - The action name
     * @param {...*} args - Additional arguments
     * @returns {string} - Mock URL
     */
    url: function () {
        var httpUrl = this.http.apply(this, arguments);
        return httpUrl.replace('http://', '//');
    },

    /**
     * Creates a static URL for assets
     * @param {string} path - The asset path
     * @returns {string} - Mock static URL
     */
    staticURL: function (path) {
        return 'https://test-site.com/static/' + (path || 'default.css');
    },

    /**
     * Creates an absolute URL
     * @param {string} action - The action name
     * @param {...*} args - Additional arguments
     * @returns {string} - Mock absolute URL
     */
    abs: function () {
        return this.http.apply(this, arguments);
    },

    /**
     * Creates a home URL
     * @returns {string} - Mock home URL
     */
    home: function () {
        return 'https://test-site.com/';
    },

    /**
     * Creates an absolute static URL for assets
     * @param {string} path - The asset path
     * @returns {string} - Mock absolute static URL
     */
    absStatic: function (path) {
        return 'https://test-site.com/static/' + (path || 'default.css');
    }
};
