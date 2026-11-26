# Sarvam AI Voice Interview Platform

A production-structured Next.js full-stack platform for managing and triggering AI-powered candidate screening calls using **Sarvam AI Voice Agents**, backed by **MongoDB** with persistent connection pooling and deployable to Vercel.

---

## 🌟 Key Features

- **MongoDB Persistent Connection Pool**: Connects once on server startup via a cached `MongoClient` singleton, preventing connection exhaustion and reconnect latency on API calls.
- **Clean Architecture (No Dummy Seed Data)**: Starts completely clean; every interview created via UI or API persists in MongoDB (`interviews` collection).
- **Static Admin Authentication**: Secure HTTP-only JWT session cookie (`admin@hyrgpt.com` / `Admin@1234`) with Route Handler protection.
- **Sarvam AI Outbound Calling**: Trigger real-time telephony screening calls programmatically via Sarvam's Instant Outbound Telephony API (`POST https://apps.sarvam.ai/api/outbounds/v1/orgs/:org_id/workspaces/:workspace_id/outbounds`).
- **Dynamic Context Provider (`/api/sarvam/interview-context`)**: Sarvam Voice Agents fetch real-time candidate metadata, job descriptions, and interview questions dynamically during/before the call.
- **Lifecycle & Result Webhooks (`/api/sarvam/webhook` & `/api/sarvam/result`)**: Real-time event handling with HMAC/Secret verification, idempotency deduplication, status mapping, and turn-by-turn transcript storage.
- **Dual API Security**: Authenticate via browser session cookies or Bearer `INTERNAL_API_KEY` for Postman and automation pipelines.
- **Duplicate Call Guard**: Prevents race conditions and double-calling candidates with `409 Conflict` active status locks.
- **Dark SaaS Dashboard**: Charcoal dark mode with Orange primary (`#f97316`) and Purple secondary (`#a855f7`) accents, live metrics, confirmation modals, collapsible Q&A cards, and agent/candidate chat bubbles.

---

## 📋 Comprehensive Environment Configuration Guide

Here is an explanation of every variable in `.env.local` and exactly how to obtain/configure them:

### 1. Admin & Security Credentials

| Variable | Description | Where to get / How to configure |
| :--- | :--- | :--- |
| `ADMIN_EMAIL` | Email address for dashboard login | Set your admin email (Default: `admin@hyrgpt.com`). |
| `ADMIN_PASSWORD` | Password for dashboard login | Set a strong password (Default: `Admin@1234`). Change this in production. |
| `JWT_SECRET` | Secret key used to sign HTTP-only session JWT cookies | Any secure 32+ character random string (e.g. `openssl rand -hex 32`). |
| `INTERNAL_API_KEY` | Bearer token for Postman, automated pipelines, and external API requests | Define any secure secret string (e.g. `sarvam_dev_internal_api_key_2026`). Sent in headers as `Authorization: Bearer <INTERNAL_API_KEY>`. |

---

### 2. Sarvam AI Platform Details — Step-by-Step Instructions

To obtain your Sarvam AI voice agent credentials from [platform.sarvam.ai](https://platform.sarvam.ai/) / [dashboard.sarvam.ai](https://dashboard.sarvam.ai/):

#### `SARVAM_API_KEY` (Subscription Key)
1. Log in to [platform.sarvam.ai](https://platform.sarvam.ai/).
2. In the left sidebar or top right profile menu, click **API Keys** (or **Settings → API Keys**).
3. Click **"+ Create API Key"** / **"Generate Key"**.
4. Give it a name (e.g. `Voice Interview Agent Key`) and click **Create**.
5. Copy the generated key immediately (it is only shown once at creation time). This is passed as the `api-subscription-key` header in HTTP calls.

#### `SARVAM_AGENT_ID` (App ID)
1. In the Sarvam platform, navigate to **Voice Agents** (or **Conversations → Agents**).
2. Create a new voice agent or click on an existing one.
3. Look at the browser URL or the agent settings drawer: the identifier in `/agents/:agent_id` or under **General Settings → App ID** is your `SARVAM_AGENT_ID` (e.g. `app_01j...` or `agent_xyz`).

#### `SARVAM_AGENT_VERSION`
- Set to the published version number of your voice agent (default: `1`).

#### `SARVAM_PHONE_NUMBER` & `SARVAM_CONNECTION_ID`
1. In the Sarvam platform, navigate to **Deploy → Phone Numbers**.
2. Connect your telephony provider:
   - **Bring Your Own Telephony**: Connect your existing Exotel, Twilio, Pulse, Intalk, or Smartflo account with your credentials.
   - **Rent from Sarvam**: Rent numbers directly within the dashboard.
3. Once connected, note your **Connection ID** (`SARVAM_CONNECTION_ID`) and the assigned **Phone Number** (`SARVAM_PHONE_NUMBER`) in E.164 format (e.g., `+91804XXXXXXX`).

#### `SARVAM_ORG_ID` & `SARVAM_WORKSPACE_ID`
- In your Sarvam dashboard, navigate to **Workspace Settings**. Your Organization ID and Workspace ID are displayed in the workspace details and URL bar (`/orgs/:org_id/workspaces/:workspace_id`).

#### `SARVAM_API_BASE_URL`
- Default Sarvam Outbound API host: `https://apps.sarvam.ai`.

#### `SARVAM_WEBHOOK_SECRET`
1. Choose a secure secret passphrase (e.g. `sarvam_webhook_secret_key_2026`).
2. In Sarvam Agent settings under **Telephony / Webhooks**, configure the webhook URL: `https://<YOUR_DOMAIN>/api/sarvam/webhook`.
3. Add a custom header `x-webhook-secret: <YOUR_SECRET>` so the Next.js backend verifies that incoming status payloads originate from Sarvam.

#### `SARVAM_CONTEXT_SECRET`
1. Choose a secure secret token (e.g. `sarvam_context_secret_key_2026`).
2. In your Sarvam Voice Agent, go to **Tools → Add Tool → API Tool (On-Start Hook)**.
3. Configure the tool:
   - **Name**: `get_interview_context`
   - **When to run**: `on_start`
   - **URL**: `https://<YOUR_DOMAIN>/api/sarvam/interview-context`
   - **Method**: `POST`
   - **Headers**:
     - `Content-Type: application/json`
     - `Authorization: Bearer <YOUR_SARVAM_CONTEXT_SECRET>`
   - **Body**:
     ```json
     {
       "interview_id": "@interview_id"
     }
     ```
   - **Save reply into variables**: Enable this to map `questions`, `candidate`, and `job` into agent variables.

---

### 3. MongoDB Configuration

| Variable | Description | Where to get |
| :--- | :--- | :--- |
| `MONGO_DB` (or `MONGODB_URI`) | MongoDB connection string URI | From MongoDB Atlas dashboard: **Database → Connect → Drivers (Node.js)**. |

Example:
```env
MONGO_DB=mongodb+srv://<username>:<password>@cluster0.pbobznw.mongodb.net/sarvam
```

The application automatically connects to MongoDB upon server startup using a persistent connection pool. The database creates two collections:
- `interviews`: Stores candidate details, job description, questions, call telemetry, and transcripts.
- `processed_events`: Stores processed webhook event IDs to guarantee webhook idempotency.

---

## 🚀 Local Setup & Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env.local` file:
```bash
cp .env.example .env.local
```
Fill in your `MONGO_DB` URI, admin credentials, and Sarvam API credentials.

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

- **Login**: `admin@hyrgpt.com`
- **Password**: `Admin@1234`

---

## 📬 Postman & REST API Reference

All management APIs can be called directly from Postman or scripts using:
`Authorization: Bearer <INTERNAL_API_KEY>` or `x-api-key: <INTERNAL_API_KEY>`.

### 1. Health Check
```bash
curl -X GET "http://localhost:3000/api/health"
```
**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-08-19T13:30:00.000Z",
    "sarvamConfigured": true,
    "databaseConfigured": true,
    "version": "1.0.0"
  }
}
```

### 2. Admin Login
```bash
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@hyrgpt.com",
    "password": "Admin@1234"
  }'
```

### 3. Create Interview (Persists to MongoDB)
```bash
curl -X POST "http://localhost:3000/api/interviews" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sarvam_dev_internal_api_key_2026" \
  -d '{
    "candidate": {
      "id": "candidate-001",
      "name": "Ramakanthakar",
      "phone": "+911234567890",
      "email": "ramakanthakar@example.com"
    },
    "job": {
      "id": "react-dev-001",
      "title": "React.js Developer",
      "description": "Frontend developer skilled in React.js, Next.js, and TypeScript."
    },
    "questions": [
      {
        "id": "q1",
        "question": "Tell me about your experience with React.js."
      },
      {
        "id": "q2",
        "question": "What is the difference between useState and useRef in React?"
      }
    ]
  }'
```

### 4. List Interviews (MongoDB Query with Pagination & Filters)
```bash
curl -X GET "http://localhost:3000/api/interviews?page=1&limit=20&status=completed" \
  -H "Authorization: Bearer sarvam_dev_internal_api_key_2026"
```

### 5. Get Single Interview Details
```bash
curl -X GET "http://localhost:3000/api/interviews/int_react_001" \
  -H "Authorization: Bearer sarvam_dev_internal_api_key_2026"
```

### 6. Trigger Outbound Call
```bash
curl -X POST "http://localhost:3000/api/interviews/int_react_001/trigger" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sarvam_dev_internal_api_key_2026" \
  -H "Idempotency-Key: idemp_call_001"
```

### 7. Sarvam Context Tool Endpoint
```bash
curl -X POST "http://localhost:3000/api/sarvam/interview-context" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sarvam_dev_context_secret" \
  -d '{
    "interview_id": "int_react_001"
  }'
```

### 8. Sarvam Webhook Event
```bash
curl -X POST "http://localhost:3000/api/sarvam/webhook" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: sarvam_dev_webhook_secret" \
  -d '{
    "attempt_id": "att_mock_123456",
    "status": "connected",
    "duration": 185.4,
    "channel_info": {
      "channel_type": "v2v",
      "channel_provider": "exotel",
      "agent_phone_number": "+918040001122"
    },
    "webhook_config": {
      "url": "http://localhost:3000/api/sarvam/webhook",
      "metadata": {
        "interview_id": "int_react_001"
      }
    },
    "interaction_transcript": [
      { "role": "agent", "en_text": "Hello Ramakanthakar, are you ready for the interview?" },
      { "role": "user", "en_text": "Yes, I am ready!" }
    ]
  }'
```

---

## 🚢 Deploying to Vercel

1. Push this repository to GitHub.
2. Import the repository in [Vercel](https://vercel.com).
3. Set the Environment Variables in Vercel Project Settings:
   - `MONGO_DB`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `JWT_SECRET`
   - `INTERNAL_API_KEY`
   - `SARVAM_API_KEY`
   - `SARVAM_AGENT_ID`
   - `SARVAM_PHONE_NUMBER`
   - `SARVAM_API_BASE_URL` (`https://apps.sarvam.ai`)
   - `SARVAM_WEBHOOK_SECRET`
   - `SARVAM_CONTEXT_SECRET`
   - `APP_URL` (`https://your-project.vercel.app`)
4. Deploy! Next.js automatically deploys the serverless functions and dashboard.
