import axios from 'axios';

/**
 * Claude API client for generating CADQuery code from natural language prompts
 */
export class ClaudeClient {
  /**
   * Create a new Claude client
   * @param {string} apiKey - Anthropic API key (default: uses the integrated API key)
   * @param {string} model - Claude model to use (default: "claude-3-5-sonnet-20240620")
   */
  constructor(apiKey = "YOUR_ANTHROPIC_API_KEY", model = "claude-3-5-sonnet-20240620") {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = "https://api.anthropic.com/v1/messages";
  }

  /**
   * Generate CADQuery code from a natural language prompt
   * @param {string} prompt - Natural language description of the CAD model to generate
   * @returns {Promise<string>} - Generated CADQuery code
   */
  async generateCADQuery(prompt) {
    try {
      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
          max_tokens: 4000,
          messages: [
            {
              role: "user",
              content: `Generate CADQuery code for the following description. 
              Return only valid Python code that can be executed in a CADQuery environment.
              Do not include any explanations, just the code:
              
              ${prompt}`
            }
          ]
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01"
          }
        }
      );

      // Extract the code from Claude's response
      return response.data.content[0].text;
    } catch (error) {
      console.error("Error generating CADQuery code:", error);
      throw error;
    }
  }
}
