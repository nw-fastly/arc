import type { PulseFetchInit, PulseFetchOperation } from '@pulse-compute/runtime'

// Temporary compatibility for @pulse-compute/runtime@1.0.0-beta.5.
// ARC targets Native only; its harness and Viceroy smoke verify these methods.
// The JavaScript runtime is not covered. Remove when upstream types include them.
// Restrict the extension to the schema-backed JSON requests used by ARC.
type NativePolicyFetchInit = Omit<Extract<PulseFetchInit, { readonly json: unknown }>, 'method' | 'schema'> & {
  readonly method: 'PATCH' | 'PUT'
  readonly schema: string
}

declare module '@pulse-compute/runtime' {
  interface PulseExecutionContext {
    fetch(url: string, init: NativePolicyFetchInit): PulseFetchOperation
  }
}
