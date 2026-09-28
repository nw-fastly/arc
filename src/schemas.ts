import { defineSchemaRegistry, schema } from '@pulse-compute/pulse/schema'
export interface User { id: string; name: string; tokenId: string; active: boolean }
export interface Token { id: string; label: string; value: string; active: boolean }
export interface Model { id: string; label: string; provider: string; active: boolean }
export interface Settings { users: User[]; tokens: Token[]; models: Model[] }
export interface Bootstrap { users: User[]; models: Model[]; mode: string }
export interface Message { role: 'user' | 'assistant'; content: string }
export interface Chat { userId: string; model: string; messages: Message[]; sessionId: string }
export interface Completion { model: string; messages: Message[]; stream: boolean }
export interface ErrorBody { error: string }
export default defineSchemaRegistry({ schemas: {
  'arc.Settings': schema<Settings>(), 'arc.Bootstrap': schema<Bootstrap>(),
  'arc.Chat': schema<Chat>(), 'arc.Completion': schema<Completion>(), 'arc.Error': schema<ErrorBody>(),
} })
