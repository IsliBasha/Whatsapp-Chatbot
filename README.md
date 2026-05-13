## WhatsApp Product Chatbot (Node.js + Express + Meta Cloud API + MySQL)

Production-ready WhatsApp chatbot that answers product price and availability questions by querying a MySQL database. Built with Node.js, Express, Axios, and the Meta WhatsApp Cloud API.

### Prerequisites
- **Node.js 18+**
- **MySQL** (local or remote)
- **Meta Developer account** with access to WhatsApp Cloud API

### Local Setup
1. Clone the repo:
   ```bash
   git clone <your-repo-url> whatsapp-bot
   cd whatsapp-bot
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment template and fill in your values:
   ```bash
   cp .env.example .env
   ```
4. Initialize the database:
   - Edit `.env` and set `DB_HOST`, `DB_USER`, `DB_PASS`.
   - Run the SQL schema:
     ```bash
     mysql -u <user> -p -h <host> < schema.sql
     ```
   - Set `DB_NAME=products_db` in `.env`.
5. Start the dev server:
   ```bash
   npm run dev
   ```

### Getting Meta WhatsApp Cloud API Credentials
1. Go to [`https://developers.facebook.com`](https://developers.facebook.com) and create an App.
2. Add the **WhatsApp** product to your app.
3. In WhatsApp > **Getting Started**, obtain:
   - **Phone Number ID** → set as `WHATSAPP_PHONE_ID`
   - **Temporary Access Token** → create a **Permanent Access Token** in Business Settings and set as `WHATSAPP_TOKEN`
4. Configure **Webhooks**:
   - Set the **Callback URL** (see ngrok section below)
   - Set the **Verify Token** (your custom string) and set `VERIFY_TOKEN` in `.env`
   - Subscribe to `messages` events for your WhatsApp app

### Running Locally with ngrok
Expose your local Express server for Meta's webhook:
```bash
ngrok http 3000
```
Copy the HTTPS forwarding URL from ngrok and paste it into your app's **WhatsApp Webhook** configuration as:
- Callback URL: `https://<your-ngrok-subdomain>.ngrok.app/webhook`
- Verify Token: the same value as `VERIFY_TOKEN` in `.env`

### Testing the Bot
Use your test phone in the WhatsApp app to send messages to your WhatsApp Business number:
- "What is the price of Widget A?"
- "Is Gadget Pro available?"
- "How much does the Premium Bundle cost?"
- "Do you have Basic Kit in stock?"

### Project Structure
```
whatsapp-bot/
├── src/
│   ├── index.js            # Express server + webhook entry point
│   ├── intentParser.js     # Parse user message intent and product name
│   ├── db.js               # MySQL connection pool + query functions
│   └── whatsapp.js         # Meta API message sender
├── schema.sql              # Database schema + seed data
├── .env.example            # Environment variable template (no real secrets)
├── .gitignore
├── package.json
└── README.md
```

### Environment Variables
Create `.env` from `.env.example`:
```
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
VERIFY_TOKEN=
DB_HOST=
DB_USER=
DB_PASS=
DB_NAME=
PORT=3000
```

### How It Works
- Incoming messages hit `POST /webhook`. We acknowledge immediately, parse intent, query MySQL, and send a WhatsApp reply via Meta API.
- `GET /webhook` is used by Meta to verify your webhook using `VERIFY_TOKEN`.

### Deploying
You can deploy to any service providing a public HTTPS URL, e.g.:
- **Railway** or **Render** (simple Node deployments)
- **VPS** (Ubuntu + Node.js + PM2 + Nginx reverse proxy)
Make sure environment variables are set, ports are open, and the webhook URL is updated in the Meta app settings.

### Scripts
```json
{
  "start": "node src/index.js",
  "dev": "nodemon src/index.js"
}
```

### Notes
- Uses `async/await` with proper error handling.
- All secrets via environment variables (no hardcoded secrets).
- Focused single-responsibility modules for DB, intent parsing, WhatsApp sending, and server.

