'use strict';

var server = require('server');

var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');

server.get(
    'Init',
    server.middleware.include,
    consentTracking.consent,
    function (req, res, next) {
        res.render('/pixlee/events/init');
        next();
    }
);

module.exports = server.exports();
