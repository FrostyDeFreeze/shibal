require('dotenv').config()

const express = require('express')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const app = express()
const DATA_FILE = path.join(__dirname, 'data.json')
const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const MAX_GENERATION_ATTEMPTS = 1_000
const UNSAFE_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'about:', 'chrome:', 'view-source:', 'blob:'])
const RESERVED_IDS = new Set(['api', 'auth', 'shorten', 'assets', 'favicon.ico', 'robots.txt'])

function readConfig() {
	const port = Number.parseInt(process.env.PORT || '7000', 10)
	const baseUrl = normalizeBaseUrl(process.env.BASE_URL)
	const urlLength = Number.parseInt(process.env.URL_LENGTH || '3', 10)
	const apiToken = process.env.API_TOKEN?.trim()

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('PORT must be a valid TCP port')
	}

	if (!baseUrl) {
		throw new Error('BASE_URL must be a valid http(s) URL')
	}

	if (!Number.isInteger(urlLength) || urlLength < 1 || urlLength > 16) {
		throw new Error('URL_LENGTH must be an integer from 1 to 16')
	}

	if (!apiToken) {
		throw new Error('API_TOKEN is required')
	}

	return { port, baseUrl, urlLength, apiToken }
}

function normalizeBaseUrl(value) {
	const url = parseUrl(value)
	if (!url || !isHttpProtocol(url.protocol) || !url.hostname) {
		return null
	}

	return url.href.replace(/\/$/, '')
}

function normalizeUrl(value) {
	if (typeof value !== 'string') {
		return null
	}

	const input = value.trim()
	if (!input || hasUnsafeCharacters(input)) {
		return null
	}

	const bareUrl = normalizeBareUrl(input)
	if (bareUrl) {
		return bareUrl
	}

	return normalizeProtocolUrl(input)
}

function parseUrl(value) {
	if (typeof value !== 'string') {
		return null
	}

	const input = value.trim()
	if (!input || hasUnsafeCharacters(input)) {
		return null
	}

	try {
		return new URL(input)
	} catch {
		return null
	}
}

function normalizeBareUrl(input) {
	if (!shouldTryBareUrl(input)) {
		return null
	}

	const value = input.startsWith('//') ? `https:${input}` : `https://${input}`
	const url = parseUrl(value)
	if (!url || url.username || url.password || !isBareHost(url.hostname)) {
		return null
	}

	return url.href
}

function normalizeProtocolUrl(input) {
	const match = input.match(/^([a-zA-Z][a-zA-Z\d+.-]*):/)
	if (!match) {
		return null
	}

	const protocol = `${match[1].toLowerCase()}:`
	if (UNSAFE_PROTOCOLS.has(protocol)) {
		return null
	}

	const url = parseUrl(input)
	if (!url) {
		return null
	}
	if (isHttpProtocol(url.protocol) && !url.hostname) {
		return null
	}

	return url.href
}

function shouldTryBareUrl(input) {
	if (input.startsWith('//')) {
		return true
	}
	if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(input)) {
		return true
	}

	return /^(\[[^\]]+\]|[a-zA-Z0-9.-]+):\d{1,5}([/?#]|$)/.test(input)
}

function isBareHost(hostname) {
	if (hostname === 'localhost') {
		return true
	}
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
		return hostname.split('.').every(part => Number(part) >= 0 && Number(part) <= 255)
	}

	return /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9-]{2,63}$/.test(hostname)
}

function isHttpProtocol(protocol) {
	return protocol === 'http:' || protocol === 'https:'
}

function hasUnsafeCharacters(value) {
	return /[\u0000-\u001F\u007F]/.test(value)
}

const { port: PORT, baseUrl: BASE_URL, urlLength: URL_LENGTH, apiToken: API_TOKEN } = readConfig()

app.use(express.json())
app.use(express.static('public'))

function load() {
	if (!fs.existsSync(DATA_FILE)) {
		save([])
	}

	const rawData = fs.readFileSync(DATA_FILE, 'utf8')
	const data = JSON.parse(rawData)
	if (!Array.isArray(data)) {
		throw new Error('data.json must contain an array')
	}

	return data
}

function save(data) {
	const tempFile = path.join(path.dirname(DATA_FILE), `.${path.basename(DATA_FILE)}.${process.pid}.${Date.now()}.tmp`)
	fs.writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`)
	fs.renameSync(tempFile, DATA_FILE)
}

function genShort() {
	let short = ''
	for (let i = 0; i < URL_LENGTH; i++) {
		short += CODE_ALPHABET.charAt(crypto.randomInt(CODE_ALPHABET.length))
	}

	return short
}

function genUniqueShort(data) {
	const usedCodes = new Set(data.map(item => item.short))
	const codeSpace = CODE_ALPHABET.length ** URL_LENGTH
	if (usedCodes.size >= codeSpace) {
		throw new Error('Short code space is exhausted')
	}

	for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
		const short = genShort()
		if (!usedCodes.has(short) && !RESERVED_IDS.has(short)) {
			return short
		}
	}

	throw new Error('Unable to generate a unique short code')
}

function readBearerToken(req) {
	const header = req.get('authorization') || ''

	const [scheme, token, extra] = header.trim().split(/\s+/)
	if (extra || !scheme || !token || scheme.toLowerCase() !== 'bearer') {
		return null
	}

	return token
}

function tokenMatches(token) {
	if (!token) {
		return false
	}

	const provided = Buffer.from(token)
	const expected = Buffer.from(API_TOKEN)

	return provided.length === expected.length && crypto.timingSafeEqual(provided, expected)
}

function requireAuth(req, res, next) {
	if (!tokenMatches(readBearerToken(req))) {
		return res.status(401).json({ error: 'Unauthorized' })
	}

	next()
}

function isSameUrl(left, right) {
	return normalizeUrl(left) === right
}

app.post('/auth/verify', requireAuth, (_req, res) => {
	res.json({ ok: true })
})

app.post('/shorten', requireAuth, (req, res) => {
	const url = normalizeUrl(req.body?.url)
	if (!url) {
		return res.status(400).json({ error: 'Enter a valid link' })
	}

	try {
		const data = load()

		const entry = data.find(item => isSameUrl(item.url, url))
		if (entry) {
			return res.json({ url: entry.url, short: entry.short, full: entry.full })
		}

		const short = genUniqueShort(data)
		const full = `${BASE_URL}/${short}`

		data.push({ url, short, full })
		save(data)

		res.status(200).json({ url, short, full })
	} catch (e) {
		console.error(`Error shortening URL: ${e}`)
		res.status(500).json({ error: 'Unable to shorten URL right now' })
	}
})

app.get('/:short', (req, res) => {
	const short = req.params.short

	try {
		const data = load()

		const entry = data.find(item => item.short === short)
		if (entry) {
			res.redirect(entry.url)
		} else {
			res.status(404).sendFile(path.join(__dirname, 'public', '404.html'))
		}
	} catch (e) {
		console.error(`Error resolving short URL: ${e}`)
		res.status(500).json({ error: 'Unable to resolve short URL right now' })
	}
})

app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`)
})
