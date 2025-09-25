#!/usr/bin/env node

'use strict';

/**
 * Comprehensive Test Runner for Pixlee SFCC Integration
 *
 * This script provides a unified interface for running different test suites
 * with various options and configurations.
 *
 * Usage:
 *   node test/run-tests.js [options]
 *
 * Options:
 *   --suite=SUITE_NAME     Run specific test suite (category, product, service, all)
 *   --verbose              Show detailed output
 *   --coverage             Include coverage reporting
 *   --cartridge=NAME       Run tests for specific cartridge only
 *   --integration          Run integration tests only
 *   --unit                 Run unit tests only
 *   --help                 Show this help message
 */

var spawn = require('child_process').spawn;
var path = require('path');

// Parse command line arguments
var args = process.argv.slice(2);
var options = {
    verbose: args.includes('--verbose'),
    coverage: args.includes('--coverage'),
    integration: args.includes('--integration'),
    unit: args.includes('--unit'),
    help: args.includes('--help'),
    suite: getArgValue('--suite') || 'all',
    cartridge: getArgValue('--cartridge')
};

function getArgValue(argName) {
    var arg = args.find(a => a.startsWith(argName + '='));
    return arg ? arg.split('=')[1] : null;
}

function showHelp() {
    console.log('Pixlee SFCC Integration Test Runner');
    console.log('==================================');
    console.log('');
    console.log('Usage: node test/run-tests.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --suite=SUITE_NAME     Run specific test suite:');
    console.log('                         • category    - Category processing tests');
    console.log('                         • product     - Product export tests');
    console.log('                         • service     - Service integration tests');
    console.log('                         • all         - All test suites (default)');
    console.log('');
    console.log('  --cartridge=NAME       Run tests for specific cartridge:');
    console.log('                         • int_pixlee_core  - Shared business logic');
    console.log('                         • int_pixlee_sfra  - SFRA-specific code');
    console.log('                         • int_pixlee       - SiteGenesis-specific code');
    console.log('');
    console.log('  --unit                 Run unit tests only');
    console.log('  --integration          Run integration tests only');
    console.log('  --coverage             Include coverage reporting');
    console.log('  --verbose              Show detailed output');
    console.log('  --help                 Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  node test/run-tests.js --suite=category');
    console.log('  node test/run-tests.js --cartridge=int_pixlee_core --unit    # Test shared logic');
    console.log('  node test/run-tests.js --cartridge=int_pixlee_sfra --unit    # Test SFRA code');
    console.log('  node test/run-tests.js --cartridge=int_pixlee --unit         # Test SiteGenesis code');
    console.log('  node test/run-tests.js --integration --verbose');
    console.log('  node test/run-tests.js --coverage');
    console.log('');
}

if (options.help) {
    showHelp();
    process.exit(0);
}

// Test suite configurations
var testSuites = {
    category: {
        name: 'Category Processing Tests',
        description: 'SFCC object size compliance, strategy selection, and scalability',
        runner: 'test/run-category-tests.js',
        args: options.verbose ? ['--verbose'] : []
    },

    product: {
        name: 'Product Export Tests',
        description: 'Product payload generation and export functionality',
        unit: ['test/unit/**/productExportPayload.js', 'test/unit/**/ExportProducts.js'],
        integration: ['test/integration/**/productExport*.js']
    },

    service: {
        name: 'Service Integration Tests',
        description: 'Pixlee service communication and API integration',
        unit: ['test/unit/**/PixleeService.js', 'test/unit/**/services/*.js'],
        integration: ['test/integration/**/service*.js']
    },

    all: {
        name: 'Complete Test Suite',
        description: 'All tests across all cartridges and functionality'
    }
};

function runCommand(command, args, options) {
    return new Promise(function(resolve, reject) {
        console.log('🧪 Running: ' + command + ' ' + args.join(' '));

        var proc = spawn(command, args, {
            stdio: options.verbose ? 'inherit' : 'pipe',
            cwd: path.resolve(__dirname, '..')
        });

        var output = '';
        var errorOutput = '';

        if (!options.verbose) {
            proc.stdout.on('data', function(data) {
                output += data.toString();
            });

            proc.stderr.on('data', function(data) {
                errorOutput += data.toString();
            });
        }

        proc.on('close', function(code) {
            resolve({
                code: code,
                output: output,
                errorOutput: errorOutput
            });
        });

        proc.on('error', function(err) {
            reject(err);
        });
    });
}

function runTestSuite() {
    console.log('🔍 Pixlee SFCC Integration Test Runner');
    console.log('======================================');
    console.log('');
    console.log('Suite: ' + options.suite);
    if (options.cartridge) console.log('Cartridge: ' + options.cartridge);
    if (options.unit) console.log('Type: Unit tests only');
    if (options.integration) console.log('Type: Integration tests only');
    if (options.coverage) console.log('Coverage: Enabled');
    console.log('');

    var suite = testSuites[options.suite];
    if (!suite) {
        console.error('❌ Unknown test suite: ' + options.suite);
        console.log('Available suites: ' + Object.keys(testSuites).join(', '));
        process.exit(1);
    }

    console.log('📋 ' + suite.name);
    if (suite.description) {
        console.log('   ' + suite.description);
    }
    console.log('');

    var results = [];

    function processResults() {
        // Summary
        console.log('📊 Test Results Summary');
        console.log('======================');

        var passed = results.filter(function(r) { return r.success; }).length;
        var failed = results.length - passed;

        console.log('Total: ' + results.length);
        console.log('Passed: ' + passed + ' ✅');
        console.log('Failed: ' + failed + ' ❌');
        console.log('');

        results.forEach(function(result) {
            var status = result.success ? '✅' : '❌';
            console.log(status + ' ' + result.name);
        });

        console.log('');

        if (failed === 0) {
            console.log('🎉 All tests passed! Ready for deployment.');
        } else {
            console.log('🚨 ' + failed + ' test suite(s) failed. Review and fix before deployment.');
        }

        process.exit(failed > 0 ? 1 : 0);
    }

    function runCommandSequence(commands, index) {
        if (index >= commands.length) {
            processResults();
            return;
        }

        var cmd = commands[index];
        console.log('🧪 Running: ' + cmd.name);

        runCommand(cmd.cmd, cmd.args, options)
            .then(function(result) {
                results.push({ name: cmd.name, success: result.code === 0 });

                if (result.code === 0) {
                    console.log('   ✅ PASSED');
                } else {
                    console.log('   ❌ FAILED');
                    if (!options.verbose && result.errorOutput) {
                        console.log('   Error: ' + result.errorOutput.split('\n')[0]);
                    }
                }
                console.log('');

                runCommandSequence(commands, index + 1);
            })
            .catch(function(error) {
                console.error('💥 Test runner error:', error.message);
                process.exit(1);
            });
    }

    if (options.suite === 'category') {
        // Use specialized category test runner
        var categoryArgs = options.verbose ? ['--verbose'] : [];
        runCommand('node', ['test/run-category-tests.js'].concat(categoryArgs), options)
            .then(function(result) {
                results.push({ name: 'Category Processing', success: result.code === 0 });
                processResults();
            })
            .catch(function(error) {
                console.error('💥 Test runner error:', error.message);
                process.exit(1);
            });

    } else if (options.suite === 'all') {
        // Run all test types
        var commands = [];

        if (!options.integration) {
            // Use mocha directly to avoid sgmf-scripts Node 14 compatibility issues
            var unitPattern = 'test/unit/**/*.js';
            if (options.cartridge) {
                unitPattern = 'test/unit/' + options.cartridge + '/**/*.js';
            }
            var unitArgs = ['--reporter', 'spec', '--timeout', '5000', unitPattern];
            commands.push({ name: 'Unit Tests', cmd: './node_modules/.bin/mocha', args: unitArgs });
        }

        if (!options.unit) {
            // Use mocha directly to avoid sgmf-scripts Node 14 compatibility issues
            var integrationPattern = 'test/integration/**/*.js';
            if (options.cartridge) {
                integrationPattern = 'test/integration/' + options.cartridge + '/**/*.js';
            }
            var integrationArgs = ['--reporter', 'spec', '--timeout', '10000', integrationPattern];
            commands.push({ name: 'Integration Tests', cmd: './node_modules/.bin/mocha', args: integrationArgs });
        }

        if (options.coverage) {
            commands.push({ name: 'Coverage Report', cmd: 'npm', args: ['run', 'cover'] });
        }

        // Run category tests as part of all tests
        commands.push({ name: 'Category Processing', cmd: 'node', args: ['test/run-category-tests.js'] });

        runCommandSequence(commands, 0);

    } else {
        // Run specific test suite
        var commands = [];

        if (suite.unit && !options.integration) {
            // Use mocha directly to avoid sgmf-scripts Node 14 compatibility issues
            var unitArgs = ['--reporter', 'spec', '--timeout', '5000'].concat(suite.unit);
            commands.push({ name: 'Unit Tests', cmd: './node_modules/.bin/mocha', args: unitArgs });
        }

        if (suite.integration && !options.unit) {
            // Use mocha directly to avoid sgmf-scripts Node 14 compatibility issues
            var integrationArgs = ['--reporter', 'spec', '--timeout', '10000'].concat(suite.integration);
            commands.push({ name: 'Integration Tests', cmd: './node_modules/.bin/mocha', args: integrationArgs });
        }

        runCommandSequence(commands, 0);
    }
}

// Start test execution
runTestSuite();
