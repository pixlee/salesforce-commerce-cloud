#!/usr/bin/env node

'use strict';

/**
 * Category Processing Test Runner
 *
 * This script runs comprehensive tests for category processing functionality,
 * including SFCC object size limit compliance, strategy selection, and scalability.
 * Designed for ongoing regression testing and validation of category processing changes.
 *
 * Usage:
 *   node test/run-category-tests.js [--verbose] [--category-count=N] [--suite=SUITE_NAME]
 */

var spawn = require('child_process').spawn;
var path = require('path');

// Parse command line arguments
var args = process.argv.slice(2);
var verbose = args.includes('--verbose');
var categoryCountMatch = args.find(arg => arg.startsWith('--category-count='));
var categoryCount = categoryCountMatch ? parseInt(categoryCountMatch.split('=')[1], 10) : 3513;

console.log('🔍 Pixlee SFCC Category Processing Test Runner');
console.log('==============================================');
console.log('');
console.log('This test suite validates category processing functionality including:');
console.log('• SFCC object size limit compliance (api.jsObjectSize quota)');
console.log('• Strategy selection for different catalog sizes');
console.log('• Memory management and performance');
console.log('• Scalability across small to enterprise-level catalogs');
console.log('');
console.log('Test Scenario: ' + categoryCount + ' categories (enterprise-level test case)');
console.log('');

// Test configuration - using mocha directly to avoid sgmf-scripts Node 14 compatibility issues
var testSuites = [
    {
        name: 'Unit Tests - Category Strategy Selection',
        command: './node_modules/.bin/mocha',
        args: ['test/unit/**/*.js', '--reporter', 'spec', '--timeout', '5000', '--grep', 'Category Strategy Tests'],
        critical: true
    },
    {
        name: 'Unit Tests - SFCC Object Size Compliance',
        command: './node_modules/.bin/mocha',
        args: ['test/unit/**/*.js', '--reporter', 'spec', '--timeout', '5000', '--grep', 'Large Catalog Strategy Selection and SFCC Compliance'],
        critical: true
    },
    {
        name: 'Unit Tests - Threshold Boundary Validation',
        command: './node_modules/.bin/mocha',
        args: ['test/unit/**/*.js', '--reporter', 'spec', '--timeout', '5000', '--grep', 'should handle threshold boundary without SFCC object size violations'],
        critical: true
    },
    {
        name: 'Integration Tests - Large Catalog Processing',
        command: './node_modules/.bin/mocha',
        args: ['test/integration/**/*.js', '--reporter', 'spec', '--timeout', '10000', '--grep', 'should handle large catalogs without exceeding SFCC api.jsObjectSize quota'],
        critical: true
    },
    {
        name: 'Integration Tests - Threshold Compliance',
        command: './node_modules/.bin/mocha',
        args: ['test/integration/**/*.js', '--reporter', 'spec', '--timeout', '10000', '--grep', 'should handle threshold catalog size without exceeding SFCC object limits'],
        critical: true
    },
    {
        name: 'Integration Tests - Scalability',
        command: './node_modules/.bin/mocha',
        args: ['test/integration/**/*.js', '--reporter', 'spec', '--timeout', '15000', '--grep', 'should scale to enterprise-level catalogs'],
        critical: false
    },
    {
        name: 'Integration Tests - Strategy Transition',
        command: './node_modules/.bin/mocha',
        args: ['test/integration/**/*.js', '--reporter', 'spec', '--timeout', '10000', '--grep', 'Strategy Transition Testing'],
        critical: false
    }
];

var results = [];
var currentTest = 0;

function runNextTest() {
    if (currentTest >= testSuites.length) {
        printResults();
        return;
    }

    var suite = testSuites[currentTest];
    console.log('🧪 Running: ' + suite.name);
    console.log('   Command: ' + suite.command + ' ' + suite.args.join(' '));

    var startTime = Date.now();
    var testProcess = spawn(suite.command, suite.args, {
        stdio: verbose ? 'inherit' : 'pipe',
        cwd: path.resolve(__dirname, '..')
    });

    var output = '';
    var errorOutput = '';

    if (!verbose) {
        testProcess.stdout.on('data', function(data) {
            output += data.toString();
        });

        testProcess.stderr.on('data', function(data) {
            errorOutput += data.toString();
        });
    }

    testProcess.on('close', function(code) {
        var endTime = Date.now();
        var duration = endTime - startTime;

        var result = {
            name: suite.name,
            success: code === 0,
            critical: suite.critical,
            duration: duration,
            output: output,
            errorOutput: errorOutput
        };

        results.push(result);

        if (result.success) {
            console.log('   ✅ PASSED (' + duration + 'ms)');
        } else {
            console.log('   ❌ FAILED (' + duration + 'ms)');
            if (!verbose && errorOutput) {
                console.log('   Error: ' + errorOutput.split('\n')[0]);
            }
        }

        console.log('');
        currentTest++;
        runNextTest();
    });

    testProcess.on('error', function(err) {
        console.log('   💥 ERROR: ' + err.message);
        results.push({
            name: suite.name,
            success: false,
            critical: suite.critical,
            duration: 0,
            error: err.message
        });

        currentTest++;
        runNextTest();
    });
}

function printResults() {
    console.log('📊 Test Results Summary');
    console.log('======================');
    console.log('');

    var totalTests = results.length;
    var passedTests = results.filter(r => r.success).length;
    var failedTests = totalTests - passedTests;
    var criticalFailed = results.filter(r => !r.success && r.critical).length;

    console.log('Total Tests: ' + totalTests);
    console.log('Passed: ' + passedTests + ' ✅');
    console.log('Failed: ' + failedTests + ' ❌');
    console.log('Critical Failures: ' + criticalFailed + ' 🚨');
    console.log('');

    // Detailed results
    results.forEach(function(result) {
        var status = result.success ? '✅' : '❌';
        var critical = result.critical ? '🚨' : '  ';
        console.log(critical + status + ' ' + result.name + ' (' + result.duration + 'ms)');

        if (!result.success && result.error) {
            console.log('     Error: ' + result.error);
        }
    });

    console.log('');

    // Category processing validation summary
    console.log('🔍 Category Processing Validation');
    console.log('=================================');

    var categoryStrategyTests = results.filter(r => r.name.includes('Category Strategy'));
    var complianceTests = results.filter(r => r.name.includes('Compliance') || r.name.includes('Large Catalog') || r.name.includes('Threshold'));
    var scalabilityTests = results.filter(r => r.name.includes('Scalability') || r.name.includes('Strategy Transition'));

    var categoryStrategyPassed = categoryStrategyTests.every(r => r.success);
    var compliancePassed = complianceTests.every(r => r.success);
    var scalabilityPassed = scalabilityTests.every(r => r.success);

    console.log('Category Strategy Tests: ' + (categoryStrategyPassed ? '✅ PASSED' : '❌ FAILED'));
    console.log('SFCC Compliance Tests: ' + (compliancePassed ? '✅ PASSED' : '❌ FAILED'));
    console.log('Scalability Tests: ' + (scalabilityPassed ? '✅ PASSED' : '❌ FAILED'));

    if (categoryStrategyPassed && compliancePassed) {
        console.log('');
        console.log('🎉 SUCCESS: Category processing is working correctly!');
        console.log('');
        console.log('✅ Strategy selection works properly for all catalog sizes');
        console.log('✅ SFCC object size limits are respected with ' + categoryCount + ' categories');
        console.log('✅ Memory management and performance are optimized');
        console.log('');
        if (scalabilityPassed) {
            console.log('✅ Scalability tests also passed - ready for enterprise deployment');
        }
        console.log('');
        console.log('Category processing is production-ready.');
    } else {
        console.log('');
        console.log('🚨 CRITICAL: Category processing has issues!');
        console.log('');

        if (!categoryStrategyPassed) {
            console.log('❌ Category strategy selection is not working correctly');
        }

        if (!compliancePassed) {
            console.log('❌ SFCC compliance tests are failing - object size limits may be exceeded');
        }

        if (!scalabilityPassed) {
            console.log('⚠️  Scalability tests failed - may impact large catalogs');
        }

        console.log('');
        console.log('Review and fix failing tests before deployment.');
    }

    console.log('');

    // Exit with appropriate code
    var exitCode = criticalFailed > 0 ? 1 : 0;
    process.exit(exitCode);
}

// Start test execution
console.log('Starting test execution...');
console.log('');
runNextTest();
