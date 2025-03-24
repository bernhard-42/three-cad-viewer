import { Assistant } from '@assistant-ui/react';
import { ClaudeClient } from './claude.js';

/**
 * PromptBox component for generating CADQuery code using Claude
 */
export class PromptBox {
  /**
   * Create a new PromptBox
   * @param {HTMLElement} container - DOM element to render the prompt box in
   * @param {function} onCodeGenerated - Callback function that receives generated code
   */
  constructor(container, onCodeGenerated) {
    this.container = container;
    this.onCodeGenerated = onCodeGenerated;
    this.claudeClient = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the prompt box with an API key
   * @param {string} apiKey - Anthropic API key (optional, uses default if not provided)
   */
  initialize(apiKey) {
    if (this.isInitialized) {
      return;
    }

    // Use the provided API key or let ClaudeClient use its default
    this.claudeClient = new ClaudeClient(apiKey);
    this.isInitialized = true;
    this.render();
  }

  /**
   * Render the prompt box UI
   */
  render() {
    if (!this.isInitialized) {
      console.error("PromptBox must be initialized with an API key first");
      return;
    }

    // Create container for the Assistant UI
    const assistantContainer = document.createElement('div');
    assistantContainer.className = 'tcv_prompt_box tcv_round';
    assistantContainer.style.position = 'absolute';
    assistantContainer.style.bottom = '20px';
    assistantContainer.style.right = '20px';
    assistantContainer.style.width = '350px';
    assistantContainer.style.zIndex = '1000';
    this.container.appendChild(assistantContainer);

    // Create header
    const header = document.createElement('div');
    header.className = 'tcv_prompt_header';
    header.textContent = 'Generate CADQuery with Claude';
    assistantContainer.appendChild(header);

    // Create textarea for prompt input
    const textarea = document.createElement('textarea');
    textarea.className = 'tcv_prompt_input';
    textarea.placeholder = 'Describe the CAD model you want to create...';
    textarea.rows = 4;
    assistantContainer.appendChild(textarea);

    // Create generate button
    const generateButton = document.createElement('button');
    generateButton.className = 'tcv_prompt_button';
    generateButton.textContent = 'Generate';
    generateButton.addEventListener('click', async () => {
      const prompt = textarea.value.trim();
      if (!prompt) return;

      generateButton.disabled = true;
      generateButton.textContent = 'Generating...';

      try {
        const code = await this.claudeClient.generateCADQuery(prompt);
        this.onCodeGenerated(code);
        textarea.value = '';
      } catch (error) {
        console.error('Error generating code:', error);
        alert('Error generating code. Please try again.');
      } finally {
        generateButton.disabled = false;
        generateButton.textContent = 'Generate';
      }
    });
    assistantContainer.appendChild(generateButton);

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .tcv_prompt_box {
        background-color: var(--tcv-bg-color);
        border: 1px solid var(--tcv-border-color);
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        padding: 15px;
        font-family: sans-serif;
      }
      .tcv_prompt_header {
        font-weight: bold;
        margin-bottom: 10px;
        color: var(--tcv-font-color);
      }
      .tcv_prompt_input {
        width: 100%;
        padding: 8px;
        margin-bottom: 10px;
        border: 1px solid var(--tcv-border-color);
        border-radius: 4px;
        background-color: var(--tcv-input-bg-color);
        color: var(--tcv-font-color);
        resize: vertical;
      }
      .tcv_prompt_button {
        background-color: #4a90e2;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 16px;
        cursor: pointer;
        font-weight: bold;
      }
      .tcv_prompt_button:hover {
        background-color: #3a80d2;
      }
      .tcv_prompt_button:disabled {
        background-color: #cccccc;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }
}
