/**
 * Mock for dw/util/UUIDUtils
 */

module.exports = {
    /**
     * Creates a UUID string
     * @returns {string} - A mock UUID string
     */
    createUUID: function () {
        // Generate a simple mock UUID for testing
        // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            // eslint-disable-next-line no-bitwise
            var r = Math.random() * 16 | 0;
            // eslint-disable-next-line no-bitwise
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
};
