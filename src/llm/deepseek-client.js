const https = require("https");

async function callDeepSeek({ apiKey, model, prompt, system }) {
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is required for DeepSeek execution.");
  }

  const payload = JSON.stringify({
    model: model || "deepseek-v4-flash",
    messages: [
      {
        role: "system",
        content: system || "You are a precise coding agent. Return only the requested structured output."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    response_format: { type: "json_object" },
    stream: false
  });

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "api.deepseek.com",
      path: "/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`DeepSeek API error ${response.statusCode}: ${body}`));
          return;
        }

        const parsed = JSON.parse(body);
        const message = parsed.choices && parsed.choices[0] && parsed.choices[0].message;
        resolve({
          raw: parsed,
          content: message && message.content ? message.content : ""
        });
      });
    });

    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

module.exports = { callDeepSeek };
