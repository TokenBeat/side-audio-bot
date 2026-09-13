import { randomUUID } from 'node:crypto'
import {
  Role,
  TaskState,
} from '@a2a-js/sdk'
import { AgentEvent } from '@a2a-js/sdk/server'
import { DashScopeHubModel } from './model.mjs'

const MAX_AGENT_ROUNDS = 8

// 晚晴·家后台 Agent：多步联动编排（睡前检查、离家确认等组合任务）。
// 单步设备控制在实时前台低延迟完成，不会路由到这里。
export const HUB_AGENT_PROMPT = `你是全屋智能中控「晚晴·家」的后台 Agent，负责多步联动编排任务。

规则：
- 你只会收到组合类任务，例如"睡前帮我检查一遍"（查门窗→关灯→关窗帘→空调调到睡眠温度）、"离家前检查"（确认电器全关）。
- 必须使用提供的工具真实执行，不得假装已经执行。
- 执行顺序按常识安排：先查状态（sensor_query / device_control action=query），再做动作，最后汇总结果。
- "我睡了"这类单场景直接交给前台处理；只有明确的多步组合任务才会到这里。
- 每一步用一句话汇报，最后给一段简短总结（如"门窗已关，客厅灯已关，卧室空调 26 度，晚安"）。
- 存在关键歧义时，先用一句简短中文追问。
- 不处理闲聊或未提供工具的业务。
- 最终回复简短自然，适合语音播报。`

function textPart(text) {
  return {
    content: { $case: 'text', value: String(text || '') },
    metadata: undefined,
    filename: '',
    mediaType: 'text/plain',
  }
}

function agentMessage(text, { taskId, contextId } = {}) {
  return {
    messageId: randomUUID(),
    contextId: contextId || '',
    taskId: taskId || '',
    role: Role.ROLE_AGENT,
    parts: [textPart(text)],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  }
}

function inputText(message) {
  return (message?.parts || [])
    .filter(part => part?.content?.$case === 'text')
    .map(part => part.content.value)
    .join('\n')
    .trim()
}

function statusUpdate(taskId, contextId, state, message) {
  return AgentEvent.statusUpdate({
    taskId,
    contextId,
    status: {
      state,
      timestamp: new Date().toISOString(),
      message: message ? agentMessage(message, { taskId, contextId }) : undefined,
    },
    metadata: undefined,
  })
}

function openAiTool(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || tool.title || tool.name,
      parameters: tool.inputSchema || { type: 'object', properties: {} },
    },
  }
}

function toolArguments(call) {
  try {
    return JSON.parse(call?.function?.arguments || '{}')
  } catch {
    throw new Error(`Invalid arguments for hub tool ${call?.function?.name || ''}`)
  }
}

async function runHubAgent({ objective, model, tools, signal, onToolCall }) {
  const definitions = (await tools.list({ signal })).map(openAiTool)
  const allowed = new Set(definitions.map(tool => tool.function.name))
  const messages = [
    { role: 'system', content: HUB_AGENT_PROMPT },
    { role: 'user', content: objective },
  ]
  let lastContent = ''
  let lastData = {}

  for (let round = 0; round < MAX_AGENT_ROUNDS; round += 1) {
    if (signal.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError')
    const message = await model.complete({ messages, tools: definitions, signal })
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : []
    if (!calls.length) {
      return {
        content: String(message.content || lastContent || '联动任务已处理').trim(),
        data: lastData,
      }
    }
    messages.push({
      role: 'assistant',
      content: message.content || null,
      tool_calls: calls,
    })
    for (const call of calls) {
      const name = String(call?.function?.name || '')
      if (!allowed.has(name)) throw new Error(`Hub Agent selected unknown tool: ${name}`)
      const args = toolArguments(call)
      onToolCall?.({ name, args })
      const result = await tools.call(name, args, { signal })
      lastContent = result.content
      lastData = result.data || lastData
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result.content,
      })
    }
  }
  throw new Error(`Hub Agent exceeded ${MAX_AGENT_ROUNDS} model rounds`)
}

export class HubAgentExecutor {
  constructor({ tools, model = new DashScopeHubModel() }) {
    if (!tools?.list || !tools?.call) {
      throw new TypeError('Hub Agent requires an MCP tool client')
    }
    if (!model?.complete) throw new TypeError('Hub Agent requires a chat model')
    this.tools = tools
    this.model = model
    this.controllers = new Map()
  }

  async execute(requestContext, eventBus) {
    const { taskId, contextId } = requestContext
    const task = requestContext.task || {
      id: taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        timestamp: new Date().toISOString(),
        message: undefined,
      },
      artifacts: [],
      history: [requestContext.userMessage],
      metadata: requestContext.userMessage.metadata,
    }
    eventBus.publish(AgentEvent.task(task))
    eventBus.publish(statusUpdate(
      taskId,
      contextId,
      TaskState.TASK_STATE_WORKING,
      '中控 Agent 正在编排',
    ))

    const controller = new AbortController()
    this.controllers.set(taskId, controller)
    try {
      const result = await runHubAgent({
        objective: inputText(requestContext.userMessage),
        model: this.model,
        tools: this.tools,
        signal: controller.signal,
        onToolCall: ({ name }) => eventBus.publish(statusUpdate(
          taskId,
          contextId,
          TaskState.TASK_STATE_WORKING,
          `正在执行联动：${name}`,
        )),
      })
      eventBus.publish(AgentEvent.artifactUpdate({
        taskId,
        contextId,
        artifact: {
          artifactId: randomUUID(),
          name: 'Hub result',
          description: 'Result from the home hub Agent.',
          parts: [textPart(result.content)],
          metadata: result.data,
          extensions: [],
        },
        append: false,
        lastChunk: true,
        metadata: undefined,
      }))
      eventBus.publish(statusUpdate(
        taskId,
        contextId,
        TaskState.TASK_STATE_COMPLETED,
        result.content,
      ))
    } catch (error) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError'
      eventBus.publish(statusUpdate(
        taskId,
        contextId,
        cancelled
          ? TaskState.TASK_STATE_CANCELED
          : TaskState.TASK_STATE_FAILED,
        cancelled ? '联动任务已取消' : `联动任务失败：${error?.message || error}`,
      ))
    } finally {
      this.controllers.delete(taskId)
    }
  }

  async cancelTask(taskId) {
    this.controllers.get(taskId)?.abort()
  }
}
