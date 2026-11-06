# Test evidence (final run)

Files referenced in Section 2 of the project report.

| File | What it is |
|---|---|
| final-run-date.txt | Date and time of the final test run (Malaysia time) |
| api-results.json | All API test cases: condition, expected result, actual outcome, pass/fail |
| ui-results.json | All browser test cases (same fields) plus browser console messages |
| pages-results.json | Every page at desktop and phone size: console errors, sideways scrolling, load time |
| perf-results.json | API response times (mean, 95th percentile, max) |
| syntax-check.log | Syntax check of every script file and page |
| server-log-during-tests.log | Server log during the final test run (no errors) |
| fault-injection.log | The four fault scenarios, including database shutdown and recovery |
| scripts/ | Browser test, page scan and performance scripts (for reference: they need Python Playwright and use the test machine's folder paths) |

The API tests can be re-run on any computer with `npm run test:api` (see backend/tests/api-test.mjs).
