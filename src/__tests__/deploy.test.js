'use strict';

// Structural tests for Ticket 6 — VPS / Nginx / TLS deployment artefacts.
// Validates the nginx.conf.example template contains all required directives
// before it is applied to a production server.

const path = require('path');
const fs   = require('fs');

const ROOT       = path.resolve(__dirname, '..', '..');
const NGINX_CONF = path.join(ROOT, 'deploy', 'nginx.conf.example');
const GITIGNORE  = path.join(ROOT, '.gitignore');

let conf;

beforeAll(() => {
	conf = fs.readFileSync(NGINX_CONF, 'utf8');
});

// ── .gitignore safety ────────────────────────────────────────────────────────

describe('.gitignore', () => {
	it('excludes .env so secrets are never committed', () => {
		const gi = fs.readFileSync(GITIGNORE, 'utf8');
		const lines = gi.split('\n').map(l => l.trim());
		expect(lines).toContain('.env');
	});
});

// ── nginx.conf.example exists ────────────────────────────────────────────────

describe('deploy/nginx.conf.example — file', () => {
	it('exists and is non-empty', () => {
		expect(conf.length).toBeGreaterThan(0);
	});
});

// ── TLS / HTTPS ───────────────────────────────────────────────────────────────

describe('deploy/nginx.conf.example — TLS', () => {
	it('listens on port 443 with ssl', () => {
		expect(conf).toMatch(/listen\s+443\s+ssl/);
	});

	it('references ssl_certificate', () => {
		expect(conf).toMatch(/ssl_certificate\b/);
	});

	it('references ssl_certificate_key', () => {
		expect(conf).toMatch(/ssl_certificate_key\b/);
	});

	it('redirects HTTP (80) to HTTPS with 301', () => {
		expect(conf).toMatch(/listen\s+80/);
		expect(conf).toMatch(/return\s+301\s+https/);
	});
});

// ── Security headers ──────────────────────────────────────────────────────────

describe('deploy/nginx.conf.example — security headers', () => {
	it('sets HSTS with includeSubDomains', () => {
		expect(conf).toMatch(/Strict-Transport-Security/);
		expect(conf).toMatch(/includeSubDomains/);
	});

	it('sets X-Content-Type-Options', () => {
		expect(conf).toMatch(/X-Content-Type-Options/);
	});

	it('sets X-Frame-Options', () => {
		expect(conf).toMatch(/X-Frame-Options/);
	});

	it('sets Referrer-Policy', () => {
		expect(conf).toMatch(/Referrer-Policy/);
	});
});

// ── Proxy headers ─────────────────────────────────────────────────────────────

describe('deploy/nginx.conf.example — proxy headers', () => {
	it('forwards X-Forwarded-For', () => {
		expect(conf).toMatch(/X-Forwarded-For/);
	});

	it('forwards X-Forwarded-Proto', () => {
		expect(conf).toMatch(/X-Forwarded-Proto/);
	});
});

// ── Location blocks ───────────────────────────────────────────────────────────

describe('deploy/nginx.conf.example — location blocks', () => {
	it('has a /webhook location', () => {
		expect(conf).toMatch(/location\s+\/webhook/);
	});

	it('has an /admin/ location', () => {
		expect(conf).toMatch(/location\s+\/admin\//);
	});

	it('has a /health location', () => {
		expect(conf).toMatch(/location\s+\/health/);
	});

	it('restricts /admin/ with deny all', () => {
		expect(conf).toMatch(/deny\s+all/);
	});

	it('proxies to localhost:3000', () => {
		expect(conf).toMatch(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000/);
	});
});

// ── Cutover playbook present in deploy/README.md ──────────────────────────────

describe('deploy/README.md — cutover playbook', () => {
	let readme;

	beforeAll(() => {
		readme = fs.readFileSync(path.join(ROOT, 'deploy', 'README.md'), 'utf8');
	});

	it('mentions updating the Meta webhook URL', () => {
		expect(readme).toMatch(/[Mm]eta|webhook.*URL|App Dashboard/);
	});

	it('mentions the health check smoke test', () => {
		expect(readme).toMatch(/\/health/);
	});

	it('mentions decommissioning ngrok', () => {
		expect(readme).toMatch(/ngrok/i);
	});

	it('mentions chmod 600 for .env', () => {
		expect(readme).toMatch(/chmod\s+600/);
	});
});
