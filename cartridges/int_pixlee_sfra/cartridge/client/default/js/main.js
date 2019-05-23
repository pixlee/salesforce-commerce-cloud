var processInclude = require('base/util');

require('base/main');

$(document).ready(function () {
    processInclude(require('./pixlee/events'));
});
