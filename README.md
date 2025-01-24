
# WhatsApp Cloud API Cloudflare Worker Echo Template

This cloudflare worker listens on the `/messages` [webhook](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components) from the WhatsApp Cloud API and then sends the received [message](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages) back.

It has no dependencies and just uses the built-in fetch and subtle crypto.