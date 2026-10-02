import { defineSchemaRegistry, schema } from '@pulse-compute/pulse/schema'
export interface User { id: string; name: string; keyIds: string[]; active: boolean }
export interface Users { users: User[] }
export interface KeyInput { name: string; provider: string; model: string }
export interface Key { id: string; name: string; provider: string; model: string }
export interface Credential { id: string; name: string; provider: string; model: string; value: string }
export interface Credentials { keys: Credential[] }
export interface KeyResult { id?: string; name?: string; provider?: string; model?: string; access_token?: string }
export interface KeyPage { data?: Key[]; meta?: { next_cursor?: string | null } }
export interface KeyView { id: string; name: string; provider: string; model: string; ready: boolean }
export interface Keys { keys: KeyView[]; nextCursor: string }
export interface PageInput { cursor: string }
export interface Model { id: string; display_name: string; provider_id: string }
export interface Provider { id: string; display_name: string; models: Model[] }
export interface Providers { data?: Provider[] }
export interface Connection { id: string; name: string; models: string[]; auth_type: string }
export interface Connections { data?: Connection[] }
export interface Catalog { providers: Provider[]; connections: Connection[]; preview: boolean }
export interface PublicUser { id: string; name: string; models: Key[] }
export interface Bootstrap { users: PublicUser[]; mode: string }
export interface Message { role: 'user' | 'assistant'; content: string }
export interface Chat { userId: string; keyId: string; messages: Message[]; sessionId: string }
export interface Completion { model: string; messages: Message[]; stream: boolean }
export interface PolicyPatch {
  rpm_limit?: number | null; tpm_limit?: number | null; expires_at?: string | null
  security_enabled?: boolean; security_action?: 'log' | 'block' | 'replace'
  spend_limit_enabled?: boolean
}
export interface PolicyPreview {
  id: string; rpm_limit: number | null; tpm_limit: number | null; expires_at: string | null
  security_enabled: boolean; security_action: 'log' | 'block' | 'replace'; spend_limit_enabled: boolean; preview: boolean
}
export interface FailoverTarget { provider_connection_id: string }
export interface FailoverPolicy {
  targets: FailoverTarget[]; timeout_enabled: boolean; rate_limit_429_enabled: boolean; server_error_5xx_enabled: boolean
}
export interface ErrorBody { error: string }
export default defineSchemaRegistry({ schemas: {
  'arc.Users': schema<Users>(), 'arc.KeyInput': schema<KeyInput>(), 'arc.KeyResult': schema<KeyResult>(),
  'arc.KeyPage': schema<KeyPage>(), 'arc.Keys': schema<Keys>(), 'arc.PageInput': schema<PageInput>(),
  'arc.Providers': schema<Providers>(), 'arc.Connections': schema<Connections>(), 'arc.Catalog': schema<Catalog>(),
  'arc.Bootstrap': schema<Bootstrap>(), 'arc.Chat': schema<Chat>(), 'arc.Completion': schema<Completion>(),
  'arc.Error': schema<ErrorBody>(),
  'arc.PolicyPatch': schema<PolicyPatch>(), 'arc.PolicyPreview': schema<PolicyPreview>(), 'arc.Failover': schema<FailoverPolicy>(),
} })
