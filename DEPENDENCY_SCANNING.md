# Dependency Scanning & Security Auditing

## Overview

The FairDesk project uses two security tools to scan dependencies for vulnerabilities:

- **npm audit** - Built-in Node.js package auditing
- **Snyk** - Advanced dependency vulnerability scanning

## Setup

Dependencies are already installed as dev dependencies:
```json
{
  "devDependencies": {
    "snyk": "^1.1305.1",
    "npm-audit-resolver": "^3.0.0-RC.0"
  }
}
```

## Available Commands

### Run Full Audit
```bash
npm run audit
```
- Runs `npm audit --audit-level=moderate` (fails on moderate/high/critical)
- Followed by `snyk test` (detailed vulnerability analysis)

### Fix Vulnerabilities
```bash
npm run audit:fix
```
- Fixes auto-fixable vulnerabilities via npm audit
- Attempts Snyk fixes for remaining issues

### Generate Audit Report
```bash
npm run audit:report
```
- Creates `audit-report.json` with full audit details
- Useful for tracking compliance

## Vulnerability Levels

- **Low** - Minor impact, usually informational
- **Moderate** - Standard CI/CD check level (audit fails)
- **High** - Significant security risk
- **Critical** - Immediate action required

## Workflow

### Development
```bash
# Before committing
npm run audit

# If vulnerabilities found
npm run audit:fix

# Review changes
npm run audit:report
```

### CI/CD
The audit scripts should be added to your CI pipeline:
```yaml
# GitHub Actions example
- name: Security Audit
  run: npm run audit
```

### Manual Review
When `npm audit fix` cannot auto-fix:
1. Review `audit-report.json`
2. Check vulnerability details on https://snyk.io
3. Update package.json manually if needed
4. Run `npm install` to update lock file

## Current Status

```bash
$ npm audit
10 vulnerabilities (2 low, 3 moderate, 5 high)
```

### Next Steps
1. Run `npm run audit` to see detailed findings
2. Run `npm run audit:fix` to auto-fix
3. Manually address remaining vulnerabilities
4. Commit fixed dependencies

## Snyk Integration

For enhanced monitoring and automated fixes:

```bash
# Authenticate with Snyk
npx snyk auth

# Test dependencies
npm run audit

# Monitor for new vulnerabilities
npx snyk monitor
```

## Weekly Scanning

Add to your project management tasks to run weekly:
```bash
npm run audit
```

This ensures new vulnerabilities in dependencies are caught early.

## Resources

- [npm audit documentation](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [Snyk documentation](https://docs.snyk.io/)
- [OWASP: Vulnerable Dependencies](https://owasp.org/www-project-top-ten/)
