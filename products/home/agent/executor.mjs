import { randomUUID } from 'node:crypto'
import {
  Role,
  TaskState,
} from '@a2a-js/sdk'
import { AgentEvent } from '@a2a-js/sdk/server'
import { DashScopeHomeModel } from './model.mjs'

const MAX_AGENT_ROUNDS = 8

// 晚晴伴后台 Agent：紧急求助升级、问安收尾、提醒确认。闲聊娱乐在前台。
export const HOME_AGENT_PROMPT = `你是居家养老助手「晚晴伴」的后台 Agent，负责紧急情况与关怀任务的执行。

规则：
- 你只会收到后台任务：老人紧急求助、问安收尾、提醒确认。
- 老人表达紧急情况（救命、摔倒、胸闷、喘不上气、特别难受）时，调用 sos_manage 且 action=trigger，reason 填老人的原话摘要；工具会返回已通知的家属姓名，把它温和地转达给老人。
- 家属确认后说"女儿看到了"之类时，调用 sos_manage action=ack；老人说"没事了""处理好了"时 action=resolve。
- 问安对话自然结束或老人说"聊好了""没事了"时，调用 checkin_complete 记录心情（不错/一般/不太好）和提到的事情。
- 老人确认完成提醒（"吃了""记住了"）时，调用 reminder_confirm。
- 必须使用提供的工具真实执行，不得假装已经执行。
- 存在关键歧义时，先用一句简短中文追问。
- 不处理普通闲聊或未提供工具的业务。
- 最终回复简短、自然、口语化，适合向老人直接播报，语气安抚但不夸张。`

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
    throw new Error(`Invalid arguments for home tool ${call?.function?.name || ''}`)
  }
}

async function runHomeAgent({ objective, model, tools, signal, onToolCall }) {
  const definitions = (await tools.list({ signal })).map(openAiTool)
  const allowed = new Set(definitions.map(tool => tool.function.name))
  const messages = [
    { role: 'system', content: HOME_AGENT_PROMPT },
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
        content: String(message.content || lastContent || '任务已处理').trim(),
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
      if (!allowed.has(name)) throw new Error(`Home Agent selected unknown tool: ${name}`)
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
  throw new Error(`Home Agent exceeded ${MAX_AGENT_ROUNDS} model rounds`)
}

export class HomeAgentExecutor {
  constructor({ tools, model = new DashScopeHomeModel() }) {
    if (!tools?.list || !tools?.call) {
      throw new TypeError('Home Agent requires an MCP tool client')
    }
    if (!model?.complete) throw new TypeError('Home Agent requires a chat model')
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
      '关怀 Agent 正在处理',
    ))

    const controller = new AbortController()
    this.controllers.set(taskId, controller)
    try {
      const result = await runHomeAgent({
        objective: inputText(requestContext.userMessage),
        model: this.model,
        tools: this.tools,
        signal: controller.signal,
        onToolCall: ({ name }) => eventBus.publish(statusUpdate(
          taskId,
          contextId,
          TaskState.TASK_STATE_WORKING,
          `正在执行关怀能力：${name}`,
        )),
      })
      eventBus.publish(AgentEvent.artifactUpdate({
        taskId,
        contextId,
        artifact: {
          artifactId: randomUUID(),
          name: 'Care result',
          description: 'Result from the home care Agent.',
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
        cancelled ? '关怀任务已取消' : `关怀任务失败：${error?.message || error}`,
      ))
    } finally {
      this.controllers.delete(taskId)
    }
  }

  async cancelTask(taskId) {
    this.controllers.get(taskId)?.abort()
  }
}
