/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.json`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */


class WhatsApp {
	static apiBaseUrl = 'https://graph.facebook.com/v22.0';

	// https://developers.facebook.com/docs/whatsapp/on-premises/reference/messages#formatting
	static async sendTextMessage(env: Env, to: string, text: string) {
		if (!to || !text) {
			throw new Error('Recipient phone number and message text are required');
		}

		const payload = {
			messaging_product: 'whatsapp',
			to: to,
			type: 'text',
			text: {
				body: text,
			},
		};

		return WhatsApp._makeRequest(env, '/messages', 'POST', payload);
	}

	static async sendTemplateMessage(env: Env, to: string, templateName: string, languageCode: string, components: any[] = []) {
		if (!to || !templateName || !languageCode) {
			throw new Error('Recipient phone number, template name, and language code are required');
		}

		const payload = {
			messaging_product: 'whatsapp',
			to: to,
			type: 'template',
			template: {
				name: templateName,
				language: {
					code: languageCode,
				},
				components: components,
			},
		};

		return WhatsApp._makeRequest(env, '/messages', 'POST', payload);
	}

	static async _makeRequest(env: Env, endpoint: string, method: string, body: object) {
		const url = `${WhatsApp.apiBaseUrl}/${env.WA_PHONE_NUMBER_ID}${endpoint}`;
		const headers = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${env.WA_SYSTEM_ACCESS_TOKEN}`,
		};

		try {
			// in place of access token
			// https://stackoverflow.com/questions/72685327/how-to-get-permanent-token-for-using-whatsapp-cloud-api
			const response = await fetch(url, {
				method: method,
				headers: headers,
				body: JSON.stringify(body),
			});

			const data: any = await response.json();
			if (!response.ok) {
				throw new Error(
					`Error: ${response.status} - ${data.error?.message || 'Unknown error'}`
				);
			}

			return data;
		} catch (error) {
			console.error('WhatsApp API Request Failed:', error);
			throw error;
		}
	}
	static async verify(request: Request, env: Env): Promise<Response | string> {
		const url = new URL(request.url);
		if (request.method === 'GET') {
			if (
				url.searchParams.get('hub.mode') === 'subscribe' &&
				url.searchParams.get('hub.verify_token') === env.WA_WEBHOOK_TOKEN
			) {
				console.log(
					`webhook subscription request from ${url.href} successfully verified`,
				);
				return new Response(url.searchParams.get('hub.challenge'), { status: 200 });
			} else {
				const errorMessage = `webhook subscription request from ${url.href} has either missing or non-matching verify token`;
				console.error(errorMessage);
				return new Response(errorMessage, { status: 401 })
			}
		} else if (
			request.method === 'POST' &&
			request.headers.has('x-hub-signature-256')
		) {
			const xHubSignature = request.headers.get("x-hub-signature-256")?.replace("sha256=", "");

			if (!xHubSignature) {
				return new Response("Missing x-hub-signature-256 header", { status: 400 });
			}

			const body = await request.text();
	
			try {	
				// Function to generate the X-Hub-Signature-256 using Cloudflare's SubtleCrypto
				const generateXHub256Sig = async (payload: string, appSecret: string) => {
					const key = await crypto.subtle.importKey(
						"raw",
						new TextEncoder().encode(appSecret),
						{ name: "HMAC", hash: { name: "SHA-256" } },
						false,
						["sign"]
					);
	
					const signature = await crypto.subtle.sign(
						"HMAC",
						key,
						new TextEncoder().encode(payload)
					);
	
					return Array.from(new Uint8Array(signature))
						.map((b) => b.toString(16).padStart(2, "0"))
						.join("");
				};
	
				const generatedSignature = await generateXHub256Sig(body, env.WA_APP_SECRET);
	
				if (generatedSignature === xHubSignature) {
					console.log("x-hub-signature-256 header matches generated signature");
		
					// return new Response(JSON.stringify({ message: "Webhook verified successfully" }), {
					// 	status: 200,
					// 	headers: { "Content-Type": "application/json" },
					// });
				} else {
					console.error("Error: x-hub signature doesn't match");
					return new Response("Invalid signature", { status: 401 });
				}
			} catch (error) {
				console.error("Error processing webhook request:", error);
				return new Response("Internal Server Error", { status: 500 });
			}
			return body;
		} else {
			return new Response("Invalid request", { status: 400 });
		}
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const verResp = await WhatsApp.verify(request, env);
		if (verResp instanceof Response) return verResp;

		// Parse the body only once
		const body: any = JSON.parse(verResp);
		if (
			body?.entry?.[0]?.changes?.[0]?.field === "messages" &&
			body.entry[0].changes[0].value.messages
		) {
			const messages = body.entry[0].changes[0].value.messages;
			console.log(`Messages Object: ${JSON.stringify(messages)}`);
		
			// Check if the message is from a user (not sent by your business)
			const message = messages[0]; // Assuming only one message per webhook
			const senderId = message.from; // Sender's phone number
			const recipientId = body.entry[0].changes[0].value.metadata.phone_number_id; // Your WhatsApp Business phone number ID
		
			if (senderId !== recipientId) {
				// Handle user message
				console.log(`User sent a message: ${JSON.stringify(message)}`);
				// TODO parse all message types
				const content = message.text.body;
				try {
					// just echo
					const response = await WhatsApp.sendTextMessage(env, senderId, content);
					return new Response(JSON.stringify({ success: true, data: response }), { status: 200 });
				} catch (error: any) {
					return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
				}
			} else {
				console.log("Message was sent by the business account (self).");
			}
		}
		return new Response("Webhook received successfully", { status: 200 });
	},
} satisfies ExportedHandler<Env>;
