# Ask Sokoni — what is still needed

## 1. Admin kill switch

**Admin → Ask Sokoni** (`/admin/assistant`).

- Turns chat off immediately (`system_settings.assistant.enabled`). Buyers see “Assistant is paused”; `POST /api/assistant/chat` returns 503.
- Voice can be switched separately. Hold-to-talk still needs a speech key (below).
- Transcript retention (default 90 days) is editable. Qatar PDPPL: keep chats only to run the helper, then delete. Buyers can also delete chats in Profile.

The flag already existed in the database. The missing piece was this admin screen and `GET/PUT /api/admin/assistant`.

## 2. Orchestrator model + API key

Tool-calling and Whisper run **only on the API host**. Never put the key in the mobile app, EAS secrets that ship in the binary, or `EXPO_PUBLIC_*` / `VITE_*`.

| Env on the API host | Purpose |
| --- | --- |
| `ASSISTANT_LLM_KEY` | Secret. OpenAI key, or any OpenAI-compatible key. Also reads `OPENAI_API_KEY` if this is empty. |
| `ASSISTANT_LLM_BASE_URL` | Optional. Default `https://api.openai.com/v1`. Azure OpenAI, Groq, Together, OpenRouter, a self-hosted vLLM, etc. |
| `ASSISTANT_LLM_MODEL` | Optional. Default `gpt-4o-mini`. Use a **tool-calling** chat model. |

**Where to get a key**

1. [OpenAI platform](https://platform.openai.com/api-keys) — create a secret key. Billing must be enabled. `gpt-4o-mini` is enough for search / add-to-cart / quote.
2. Or another OpenAI-compatible host: set `ASSISTANT_LLM_BASE_URL` to that `/v1` endpoint and `ASSISTANT_LLM_MODEL` to a tool-calling model they offer.

**On Render (or your API host):** Environment → add `ASSISTANT_LLM_KEY` → restart the API.

**Without a key:** Ask Sokoni still searches the live catalogue (including foodstuff synonyms) and quotes the cart **on the server**. It will not call a hosted model and will not transcribe voice. Buyers can type.

## 3. Languages

Picker: **English, Kiswahili, Luganda, Twi, Arabic** on login, create-account, and Profile (guests included).

The choice is stored on the device and applies on **every buyer screen** (tabs, buttons, empty states, cart, orders, bookings, alerts). Product titles, store names and prices stay as the seller listed them. Arabic is RTL; after switching to or from Arabic, close and reopen the app so layout direction applies.

## 4. Ship checklist

1. Run migration `db/migrations/032_assistant.sql`.
2. Set `ASSISTANT_LLM_KEY` on the API (optional but needed for hosted chat + voice).
3. New EAS build so `expo-av` and `expo-speech` are in the binary (`NSMicrophoneUsageDescription` / `RECORD_AUDIO` are already in `app.json`).
4. Confirm **Admin → Ask Sokoni** is on.

The helper **never places an order**. Cash on delivery is unchanged. The buyer confirms size, delivery pin and total in Checkout.
