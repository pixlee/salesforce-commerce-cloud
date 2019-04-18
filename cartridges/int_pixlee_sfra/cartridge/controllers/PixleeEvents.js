'use strict';

var server = require('server');

var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');

server.get(
    'Include',
    server.middleware.include,
    consentTracking.consent,
    function (req, res, next) {
        res.render('/pixlee/events/include');
        next();
    }
);

module.exports = server.exports();
