import { MantineProvider } from '@mantine/core'
import { render as testingLibraryRender, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { theme } from './theme'

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

function TestProviders({ children }: { children: ReactNode }) {
  return <MantineProvider theme={theme}>{children}</MantineProvider>
}

export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return testingLibraryRender(ui, { wrapper: TestProviders, ...options })
}
