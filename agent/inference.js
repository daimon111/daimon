// inference — multi-provider API calls with fallbacks
// daimon: you can change MODEL params but don't remove tool support

const { OPENROUTER_KEY, GROQ_KEY, MOONSHOT_KEY, CEREBRAS_KEY, MODEL, MAX_TOKENS } = require("./config");

// provider fallback chain - tries each in order until one works
const PROVIDERS = [
  {
    name: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: OPENROUTER_KEY,
    models: [MODEL, "moonshotai/kimi-k2.5", "minimax/minimax-m2.5"],
    route: "fallback",
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/daimon111/daimon",
    }),
  },
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: GROQ_KEY,
    models: ["llama-3.3-70b-versatile"],
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    }),
  },
  {
    name: "moonshot",
    url: "https://api.moonshot.cn/v1/chat/completions",
    key: MOONSHOT_KEY,
    models: ["moonshot-v1-128k"],
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    }),
  },
  {
    name: "cerebras",
    url: "https://api.cerebras.ai/v1/chat/completions",
    key: CEREBRAS_KEY,
    models: ["llama-3.3-70b"],
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    }),
  },
];

async function inference(messages, { webSearch = false, tools = null } = {}) {
  const errors = [];
  
  for (const provider of PROVIDERS) {
    if (!provider.key) continue; // skip providers without keys
    
    try {
      const body = {
        model: provider.models[0],
        max_tokens: MAX_TOKENS,
        messages,
        temperature: 0.7,
      };

      // openrouter-specific: model fallback routing
      if (provider.route === "fallback" && provider.models.length > 1) {
        body.models = provider.models;
        body.route = "fallback";
      }

      // attach tools if provided
      if (tools) {
        body.tools = tools;
        body.tool_choice = "auto";
        body.parallel_tool_calls = true;
      }

      // plugins (openrouter only)
      if (webSearch && provider.name === "openrouter") {
        body.plugins = [{ id: "web", max_results: 5 }];
      }

      const res = await fetch(provider.url, {
        method: "POST",
        headers: provider.headers(provider.key),
        body: JSON.stringify(body),
      });
      
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`${provider.name} ${res.status}: ${errBody}`);
      }
      
      const data = await res.json();
      const choice = data.choices[0];
      
      // log which provider succeeded (useful for debugging)
      if (provider.name !== "openrouter") {
        console.log(`[inference] used fallback provider: ${provider.name}`);
      }
      
      return {
        message: choice.message,
        finishReason: choice.finish_reason,
        model: data.model,
        provider: provider.name,
      };
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
      console.log(`[inference] ${provider.name} failed: ${err.message}`);
      // continue to next provider
    }
  }
  
  // all providers failed
  throw new Error(`All inference providers failed:\n${errors.join("\n")}`);
}

module.exports = { inference };
