const STORAGE_KEY = 'shibal:api-token'

const authView = document.getElementById('auth-view')
const appView = document.getElementById('app-view')
const authForm = document.getElementById('auth-form')
const shortenForm = document.getElementById('shorten-form')
const tokenInput = document.getElementById('token-input')
const urlInput = document.getElementById('url-input')
const authSubmit = document.getElementById('auth-submit')
const shortenSubmit = document.getElementById('shorten-submit')
const authError = document.getElementById('auth-error')
const appError = document.getElementById('app-error')
const signOutButton = document.getElementById('sign-out')
const resultView = document.getElementById('result-view')
const resultLink = document.getElementById('result-link')
const copyButton = document.getElementById('copy-button')
const toast = document.getElementById('toast')

let activeToken = ''
let toastTimer = null
let copyResetTimer = null

function getStoredToken() {
	return localStorage.getItem(STORAGE_KEY) || ''
}

function storeToken(token) {
	localStorage.setItem(STORAGE_KEY, token)
	activeToken = token
}

function clearToken() {
	localStorage.removeItem(STORAGE_KEY)
	activeToken = ''
}

function authHeaders(token = activeToken) {
	return {
		Authorization: `Bearer ${token}`
	}
}

function setLoading(button, isLoading, loadingText) {
	if (!button.dataset.defaultText) {
		button.dataset.defaultText = button.textContent
	}

	button.disabled = isLoading
	button.textContent = isLoading ? loadingText : button.dataset.defaultText
}

function setMessage(element, message) {
	element.textContent = message || ''
}

function showAuth(message = '') {
	appView.hidden = true
	authView.hidden = false
	resultView.hidden = true
	resultLink.removeAttribute('href')
	resultLink.textContent = ''
	setMessage(appError, '')
	setMessage(authError, message)
	tokenInput.value = ''
	tokenInput.focus()
}

function showApp() {
	authView.hidden = true
	appView.hidden = false
	setMessage(authError, '')
	setMessage(appError, '')
	urlInput.focus()
}

async function readJson(response) {
	try {
		return await response.json()
	} catch {
		return {}
	}
}

async function verifyToken(token) {
	const response = await fetch('/auth/verify', {
		method: 'POST',
		headers: authHeaders(token)
	})

	return response.ok
}

async function submitAuth(event) {
	event.preventDefault()

	const token = tokenInput.value.trim()
	if (!token) {
		setMessage(authError, 'Enter your API token')
		return
	}

	setMessage(authError, '')
	setLoading(authSubmit, true, 'Checking')

	try {
		const isValid = await verifyToken(token)
		if (!isValid) {
			clearToken()
			setMessage(authError, 'Invalid token')
			return
		}

		storeToken(token)
		showApp()
	} catch (e) {
		console.error(`Token verification failed: ${e}`)
		setMessage(authError, 'Unable to verify the token right now')
	} finally {
		setLoading(authSubmit, false)
	}
}

async function submitShorten(event) {
	event.preventDefault()

	const url = urlInput.value.trim()
	if (!url) {
		setMessage(appError, 'Enter a destination URL')
		return
	}

	setMessage(appError, '')
	resultView.hidden = true
	setLoading(shortenSubmit, true, 'Shortening')

	try {
		const response = await fetch('/shorten', {
			method: 'POST',
			headers: {
				...authHeaders(),
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ url })
		})

		const body = await readJson(response)
		if (response.status === 401) {
			clearToken()
			showAuth('Session expired, enter your token again')
			return
		}
		if (!response.ok) {
			setMessage(appError, body.error || 'Unable to shorten this URL')
			return
		}

		showResult(body.full)
	} catch (e) {
		console.error(`Shorten request failed: ${e}`)
		setMessage(appError, 'Unable to shorten this URL right now')
	} finally {
		setLoading(shortenSubmit, false)
	}
}

function showResult(fullUrl) {
	resultLink.href = fullUrl
	resultLink.textContent = fullUrl
	resultView.hidden = false
	copyButton.textContent = 'Copy'
	void copyShortUrl(fullUrl)
}

async function copyResult() {
	const value = resultLink.textContent
	if (!value) {
		return
	}

	await copyShortUrl(value)
}

async function copyShortUrl(value) {
	try {
		await navigator.clipboard.writeText(value)
		copyButton.textContent = 'Copied'
		showToast('Copied to clipboard')
		clearTimeout(copyResetTimer)
		copyResetTimer = setTimeout(() => {
			copyButton.textContent = 'Copy'
		}, 1800)
	} catch (e) {
		console.error(`Copy failed: ${e}`)
		showToast('Unable to copy')
	}
}

function showToast(message) {
	toast.textContent = message
	toast.classList.add('is-visible')
	clearTimeout(toastTimer)
	toastTimer = setTimeout(() => {
		toast.classList.remove('is-visible')
	}, 2600)
}

function signOut() {
	clearToken()
	showAuth()
}

async function boot() {
	const token = getStoredToken()
	if (!token) {
		showAuth()
		return
	}

	activeToken = token
	showApp()
}

authForm.addEventListener('submit', submitAuth)
shortenForm.addEventListener('submit', submitShorten)
copyButton.addEventListener('click', copyResult)
signOutButton.addEventListener('click', signOut)

boot()
