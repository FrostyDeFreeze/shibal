# <p style="text-align: center;">Shibal</p>

Private URL shortener on Node.js and Express

![Auth](./docs/screenshots/auth.png)
![App](./docs/screenshots/app.png)

## Purpose

Shibal creates compact public redirects and stores them in a JSON file. It is built for private use: creating links requires an API token, while opening a short link is public to anyone who has it

## Features

- Private writes and public redirects: creating links requires a token, following links does not
- Short links with configurable id length
- No database: links are stored in `data.json`
- URL deduplication: shortening the same normalized URL returns the existing short link
- Bare URLs are supported: `example.com` is normalized to `https://example.com/`
- Protocol URLs are supported, including magnet links
- Unsafe protocols are blocked: `javascript:`, `data:`, `file:`, and similar values
- Token-gated UI for creating links
- Open Graph/Twitter metadata
- Atomic `data.json` writes through temp file + rename

## Deployment

Requires Node.js 18+

```bash
git clone https://github.com/FrostyDeFreeze/shibal
cd shibal
npm i
cp .env.example .env
npm start
```

Minimal `.env`:

```env
PORT=7000
BASE_URL=http://localhost:7000
API_TOKEN=super-secret-token

URL_LENGTH=3
```

For production, run the service behind a reverse proxy and set `BASE_URL` to the public URL

Data lives in `data.json`

Back up this file to preserve short links

## API

Protected endpoints use this header:

```http
Authorization: Bearer <API_TOKEN>
```

API errors use this format:

```json
{
	"error": "Enter a valid link"
}
```

| Method | Endpoint       | Access  | Description                                                                  | Body                                    | Response                                                                                     |
| ------ | -------------- | ------- | ---------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `POST` | `/auth/verify` | Private | Checks that the token is valid                                               | -                                       | `{ "ok": true }`                                                                             |
| `POST` | `/shorten`     | Private | Creates a short link or returns the existing one for the same normalized URL | `{ "url": "https://example.com/page" }` | `{ "url": "https://example.com/page", "short": "aB3", "full": "http://localhost:7000/aB3" }` |
| `GET`  | `/:short`      | Public  | Redirects to the original URL                                                | -                                       | `302` redirect, or the HTML `404` page when the short link is not found                      |
