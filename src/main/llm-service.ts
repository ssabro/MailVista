import {
  LLMProvider,
  getActiveProviderKey,
  getAISettings,
  markProviderValidated
} from './llm-settings'
import { logger, LogCategory } from './logger'

// ============================================
// Types
// ============================================

export interface LLMRequestOptions {
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}

export interface LLMResponse {
  success: boolean
  content?: string
  error?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface EmailSummary {
  summary: string
  actionItems: string[]
  keyPoints: string[]
  sentiment?: 'positive' | 'neutral' | 'negative'
}

export interface SmartReplyDraft {
  draft: string
  tone: string
}

export type ToneType = 'formal' | 'friendly' | 'firm' | 'apologetic' | 'neutral'

export interface TranslationResult {
  translatedText: string
  sourceLanguage: string
  targetLanguage: string
}

// ============================================
// Provider Adapters
// ============================================

interface LLMAdapter {
  complete(prompt: string, options: LLMRequestOptions): Promise<LLMResponse>
  validateKey(): Promise<{ valid: boolean; error?: string }>
}

class OpenAIAdapter implements LLMAdapter {
  private apiKey: string
  // gpt-4o: 최신 멀티모달 플래그십 모델 (2024.11 업데이트)
  private model: string = 'gpt-4o'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async complete(prompt: string, options: LLMRequestOptions): Promise<LLMResponse> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            // OpenAI에서는 developer 또는 system 역할 사용 가능
            ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          max_completion_tokens: options.maxTokens || 2000,
          temperature: options.temperature ?? 0.7
        })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return {
          success: false,
          error: error.error?.message || `OpenAI API error: ${response.status}`
        }
      }

      const data = await response.json()
      return {
        success: true,
        content: data.choices[0]?.message?.content || '',
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      }
    }
  }

  async validateKey(): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      })

      if (response.ok) {
        return { valid: true }
      } else if (response.status === 401) {
        return { valid: false, error: 'Invalid API key' }
      } else {
        return { valid: false, error: `OpenAI API error: ${response.status}` }
      }
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Network error' }
    }
  }
}

class AnthropicAdapter implements LLMAdapter {
  private apiKey: string
  // claude-sonnet-4-5-20250929: Claude 4.5 Sonnet (2025년 최신)
  // claude-3-5-sonnet-latest: 자동으로 최신 3.5 Sonnet 버전 사용
  private model: string = 'claude-sonnet-4-5-20250929'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async complete(prompt: string, options: LLMRequestOptions): Promise<LLMResponse> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: options.maxTokens || 2000,
          // system 파라미터로 시스템 프롬프트 전달
          ...(options.systemPrompt && { system: options.systemPrompt }),
          messages: [{ role: 'user', content: prompt }]
        })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return {
          success: false,
          error: error.error?.message || `Anthropic API error: ${response.status}`
        }
      }

      const data = await response.json()
      return {
        success: true,
        content: data.content[0]?.text || '',
        usage: {
          promptTokens: data.usage?.input_tokens || 0,
          completionTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      }
    }
  }

  async validateKey(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Anthropic은 별도 검증 엔드포인트가 없어 최소 요청으로 검증
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })

      if (response.ok) {
        return { valid: true }
      } else if (response.status === 401) {
        return { valid: false, error: 'Invalid API key' }
      } else {
        const error = await response.json().catch(() => ({}))
        return {
          valid: false,
          error: error.error?.message || `Anthropic API error: ${response.status}`
        }
      }
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Network error' }
    }
  }
}

class GoogleAdapter implements LLMAdapter {
  private apiKey: string
  // gemini-2.5-flash: 최신 안정 버전 (가격 대비 성능 최고)
  // gemini-2.0-flash: 이전 버전 (1M 토큰 컨텍스트)
  // gemini-1.5-flash: 레거시 버전
  private model: string = 'gemini-2.5-flash'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async complete(prompt: string, options: LLMRequestOptions): Promise<LLMResponse> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`

      // Gemini API는 systemInstruction 파라미터로 시스템 프롬프트 지원
      const requestBody: Record<string, unknown> = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options.maxTokens || 2000,
          temperature: options.temperature ?? 0.7
        }
      }

      // 시스템 프롬프트가 있으면 systemInstruction으로 전달
      if (options.systemPrompt) {
        requestBody.systemInstruction = {
          parts: [{ text: options.systemPrompt }]
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        const errorMessage = error.error?.message || `Gemini API error: ${response.status}`

        // 할당량 초과 에러에 대한 명확한 메시지
        if (errorMessage.includes('quota') || errorMessage.includes('Quota')) {
          return {
            success: false,
            error: 'API 할당량이 초과되었습니다. Google AI Studio에서 결제 설정을 확인하세요.'
          }
        }

        return {
          success: false,
          error: errorMessage
        }
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

      return {
        success: true,
        content: text,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount || 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata?.totalTokenCount || 0
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      }
    }
  }

  async validateKey(): Promise<{ valid: boolean; error?: string }> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      const response = await fetch(url)

      if (response.ok) {
        return { valid: true }
      } else if (response.status === 400 || response.status === 401) {
        return { valid: false, error: 'Invalid API key' }
      } else {
        const error = await response.json().catch(() => ({}))
        return {
          valid: false,
          error: error.error?.message || `Gemini API error: ${response.status}`
        }
      }
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Network error' }
    }
  }
}

// ============================================
// Factory
// ============================================

function getAdapter(provider: LLMProvider, apiKey: string): LLMAdapter {
  switch (provider) {
    case 'openai':
      return new OpenAIAdapter(apiKey)
    case 'anthropic':
      return new AnthropicAdapter(apiKey)
    case 'google':
      return new GoogleAdapter(apiKey)
  }
}

// ============================================
// Prompts
// ============================================

const PROMPTS = {
  summary: `You are an email analysis assistant. Analyze the following email and provide:
1. A brief summary (2-3 sentences)
2. Key points (bullet points)
3. Action items/TODOs mentioned in the email
4. Overall sentiment (positive/neutral/negative)

IMPORTANT: Respond with ONLY a valid JSON object, no markdown, no code blocks, no explanations.
The JSON must have this exact structure:
{"summary": "your summary here", "keyPoints": ["point1", "point2"], "actionItems": ["action1", "action2"], "sentiment": "positive"}

If there are no key points or action items, use empty arrays [].

Email content:`,

  smartReply: `You are an email composition assistant. Generate a professional reply based on the original email and the user's instructions.

Original email:
{email}

User's instructions: {instructions}

Write a complete, well-formatted reply. Use appropriate greetings and closings.`,

  toneConversion: `You are a text tone conversion assistant. Convert the following text to a {tone} tone while preserving the core message.

Tone descriptions:
- formal: Professional, respectful, uses formal language
- friendly: Warm, casual, approachable
- firm: Direct, assertive, clear boundaries
- apologetic: Sincere apology, empathetic, understanding
- neutral: Balanced, objective, straightforward

Original text:
{text}

Convert to {tone} tone:`,

  translation: `You are a professional translator. Translate the following text to {targetLanguage}.
Maintain the original formatting, tone, and meaning as closely as possible.

Text to translate:
{text}

Translation:`,

  emailQA: `You are an email assistant. Answer the user's question based on the email content provided.

Email content:
{email}

User's question: {question}

Provide a clear and concise answer based only on the information in the email. If the answer cannot be determined from the email content, say so.`
}

// ============================================
// Cache
// ============================================

interface CacheEntry {
  result: unknown
  timestamp: number
}

const cache = new Map<string, CacheEntry>()

function getCacheKey(operation: string, ...args: unknown[]): string {
  return `${operation}:${JSON.stringify(args)}`
}

function getFromCache<T>(key: string, maxAge: number): T | null {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.timestamp < maxAge) {
    return entry.result as T
  }
  cache.delete(key)
  return null
}

function setCache(key: string, result: unknown): void {
  cache.set(key, { result, timestamp: Date.now() })
}

// ============================================
// Service Functions
// ============================================

export async function validateApiKey(
  provider: LLMProvider,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  const adapter = getAdapter(provider, apiKey)
  return adapter.validateKey()
}

export async function validateAndSaveApiKey(
  accountEmail: string,
  provider: LLMProvider,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  const result = await validateApiKey(provider, apiKey)
  if (result.valid) {
    markProviderValidated(accountEmail, provider, true)
  }
  return result
}

// 언어 코드를 언어 이름으로 변환
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ko: '한국어 (Korean)',
  ja: '日本語 (Japanese)',
  zh: '中文 (Chinese)'
}

export async function summarizeEmail(
  accountEmail: string,
  emailContent: string,
  language?: string
): Promise<{ success: boolean; summary?: EmailSummary; error?: string }> {
  const settings = getAISettings(accountEmail)
  const targetLanguage = language || 'en'

  // Check cache (언어도 캐시 키에 포함)
  const cacheKey = getCacheKey('summary', emailContent.substring(0, 500), targetLanguage)
  if (settings.cacheEnabled) {
    const cached = getFromCache<EmailSummary>(cacheKey, settings.cacheDuration)
    if (cached) {
      return { success: true, summary: cached }
    }
  }

  const providerInfo = getActiveProviderKey(accountEmail)
  if (!providerInfo) {
    return { success: false, error: 'No active LLM provider configured' }
  }

  const adapter = getAdapter(providerInfo.provider, providerInfo.apiKey)

  // 언어 지시 추가
  const languageName = LANGUAGE_NAMES[targetLanguage] || targetLanguage
  const languageInstruction =
    targetLanguage !== 'en'
      ? `\n\nIMPORTANT: Write all text values (summary, keyPoints, actionItems) in ${languageName}. The JSON keys must remain in English.`
      : ''

  const prompt = PROMPTS.summary + languageInstruction + '\n\n' + emailContent

  const response = await adapter.complete(prompt, {
    temperature: 0.3,
    maxTokens: 2000 // 한국어 등 다국어 응답을 위해 충분히 확보
  })

  if (!response.success) {
    return { success: false, error: response.error }
  }

  try {
    // Parse JSON response
    let content = response.content || ''

    // 마크다운 코드 블록 제거 (```json ... ``` 또는 ``` ... ```)
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      content = codeBlockMatch[1].trim()
    }

    // JSON 추출 시도 순서:
    // 1. 전체 content가 JSON인 경우
    // 2. 중괄호 균형을 맞춰 JSON 추출
    let jsonString: string | null = null

    // 방법 1: 전체 content를 먼저 시도 (trim 후)
    const trimmedContent = content.trim()
    if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
      jsonString = trimmedContent
    }

    // 방법 2: 중괄호 균형을 맞춰 JSON 추출
    if (!jsonString) {
      const firstBrace = content.indexOf('{')
      if (firstBrace !== -1) {
        let braceCount = 0
        let inString = false
        let escapeNext = false

        for (let i = firstBrace; i < content.length; i++) {
          const char = content[i]

          if (escapeNext) {
            escapeNext = false
            continue
          }

          if (char === '\\') {
            escapeNext = true
            continue
          }

          if (char === '"') {
            inString = !inString
            continue
          }

          if (!inString) {
            if (char === '{') braceCount++
            else if (char === '}') {
              braceCount--
              if (braceCount === 0) {
                jsonString = content.substring(firstBrace, i + 1)
                break
              }
            }
          }
        }
      }
    }

    // JSON 파싱 시도 (잘린 JSON 복구 포함)
    const parseJsonWithRecovery = (str: string): EmailSummary | null => {
      // 1차 시도: 그대로 파싱
      try {
        return JSON.parse(str) as EmailSummary
      } catch {
        // 2차 시도: 잘린 JSON 복구
        let recovered = str

        // 불완전한 문자열 닫기 (열린 " 찾기)
        const lastQuote = recovered.lastIndexOf('"')
        const beforeLastQuote = recovered.substring(0, lastQuote)
        const quoteCount = (beforeLastQuote.match(/(?<!\\)"/g) || []).length
        if (quoteCount % 2 === 0) {
          // 마지막 "가 열린 상태면 문자열 내용 제거하고 닫기
          const openQuoteIndex = recovered.lastIndexOf('"')
          if (openQuoteIndex > 0) {
            recovered = recovered.substring(0, openQuoteIndex) + '""'
          }
        }

        // 필요한 닫는 괄호 추가
        let brackets = 0
        let braces = 0
        let inString = false
        let escapeNext = false

        for (const char of recovered) {
          if (escapeNext) {
            escapeNext = false
            continue
          }
          if (char === '\\') {
            escapeNext = true
            continue
          }
          if (char === '"') {
            inString = !inString
            continue
          }
          if (!inString) {
            if (char === '{') braces++
            else if (char === '}') braces--
            else if (char === '[') brackets++
            else if (char === ']') brackets--
          }
        }

        // 닫는 괄호 추가
        recovered += ']'.repeat(Math.max(0, brackets))
        recovered += '}'.repeat(Math.max(0, braces))

        try {
          return JSON.parse(recovered) as EmailSummary
        } catch {
          return null
        }
      }
    }

    if (jsonString) {
      const summary = parseJsonWithRecovery(jsonString)

      if (!summary) {
        logger.error(LogCategory.LLM, 'Failed to parse JSON even after recovery', {
          preview: jsonString.substring(0, 300)
        })
        return { success: false, error: 'Failed to parse summary response' }
      }

      // 필수 필드 검증
      if (typeof summary.summary !== 'string') {
        logger.error(LogCategory.LLM, 'Invalid summary format: missing summary field')
        return { success: false, error: 'Invalid summary format' }
      }

      // 기본값 설정
      summary.keyPoints = Array.isArray(summary.keyPoints) ? summary.keyPoints : []
      summary.actionItems = Array.isArray(summary.actionItems) ? summary.actionItems : []

      if (settings.cacheEnabled) {
        setCache(cacheKey, summary)
      }
      return { success: true, summary }
    }

    logger.error(LogCategory.LLM, 'Failed to extract JSON from response', {
      preview: content.substring(0, 300)
    })
    return { success: false, error: 'Failed to parse summary response' }
  } catch (parseError) {
    logger.error(LogCategory.LLM, 'JSON parse error', {
      error: parseError instanceof Error ? parseError.message : String(parseError),
      preview: response.content?.substring(0, 300)
    })
    return { success: false, error: 'Failed to parse summary response' }
  }
}

export async function generateSmartReply(
  accountEmail: string,
  emailContent: string,
  instructions: string
): Promise<{ success: boolean; draft?: SmartReplyDraft; error?: string }> {
  const providerInfo = getActiveProviderKey(accountEmail)
  if (!providerInfo) {
    return { success: false, error: 'No active LLM provider configured' }
  }

  const adapter = getAdapter(providerInfo.provider, providerInfo.apiKey)
  const prompt = PROMPTS.smartReply
    .replace('{email}', emailContent)
    .replace('{instructions}', instructions)

  const response = await adapter.complete(prompt, {
    temperature: 0.7,
    maxTokens: 2000
  })

  if (!response.success) {
    return { success: false, error: response.error }
  }

  return {
    success: true,
    draft: {
      draft: response.content || '',
      tone: 'professional'
    }
  }
}

export async function convertTone(
  accountEmail: string,
  text: string,
  targetTone: ToneType
): Promise<{ success: boolean; converted?: string; error?: string }> {
  const providerInfo = getActiveProviderKey(accountEmail)
  if (!providerInfo) {
    return { success: false, error: 'No active LLM provider configured' }
  }

  const adapter = getAdapter(providerInfo.provider, providerInfo.apiKey)
  const prompt = PROMPTS.toneConversion.replace('{text}', text).replace(/\{tone\}/g, targetTone)

  const response = await adapter.complete(prompt, {
    temperature: 0.5,
    maxTokens: 2000
  })

  if (!response.success) {
    return { success: false, error: response.error }
  }

  return { success: true, converted: response.content }
}

export async function translateText(
  accountEmail: string,
  text: string,
  targetLanguage: string
): Promise<{ success: boolean; translation?: TranslationResult; error?: string }> {
  const settings = getAISettings(accountEmail)

  // Check cache
  const cacheKey = getCacheKey('translate', text.substring(0, 200), targetLanguage)
  if (settings.cacheEnabled) {
    const cached = getFromCache<TranslationResult>(cacheKey, settings.cacheDuration)
    if (cached) {
      return { success: true, translation: cached }
    }
  }

  const providerInfo = getActiveProviderKey(accountEmail)
  if (!providerInfo) {
    return { success: false, error: 'No active LLM provider configured' }
  }

  const adapter = getAdapter(providerInfo.provider, providerInfo.apiKey)
  const prompt = PROMPTS.translation
    .replace('{text}', text)
    .replace('{targetLanguage}', targetLanguage)

  const response = await adapter.complete(prompt, {
    temperature: 0.3,
    maxTokens: 4000
  })

  if (!response.success) {
    return { success: false, error: response.error }
  }

  const result: TranslationResult = {
    translatedText: response.content || '',
    sourceLanguage: 'auto',
    targetLanguage
  }

  if (settings.cacheEnabled) {
    setCache(cacheKey, result)
  }

  return { success: true, translation: result }
}

export async function askAboutEmail(
  accountEmail: string,
  emailContent: string,
  question: string
): Promise<{ success: boolean; answer?: string; error?: string }> {
  const providerInfo = getActiveProviderKey(accountEmail)
  if (!providerInfo) {
    return { success: false, error: 'No active LLM provider configured' }
  }

  const adapter = getAdapter(providerInfo.provider, providerInfo.apiKey)
  const prompt = PROMPTS.emailQA.replace('{email}', emailContent).replace('{question}', question)

  const response = await adapter.complete(prompt, {
    temperature: 0.3,
    maxTokens: 1000
  })

  if (!response.success) {
    return { success: false, error: response.error }
  }

  return { success: true, answer: response.content }
}

// Clear cache (can be called periodically or on demand)
export function clearLLMCache(): void {
  cache.clear()
}
