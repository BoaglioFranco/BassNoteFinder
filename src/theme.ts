import { createTheme, type MantineColorsTuple } from '@mantine/core'

const myColor: MantineColorsTuple = [
  '#f5f5f5', '#e7e7e7', '#cdcdcd', '#b2b2b2', '#9a9a9a',
  '#8b8b8b', '#848484', '#717171', '#656565', '#000000',
]

export const theme = createTheme({
  colors: { myColor },
  primaryColor: 'myColor',
  defaultRadius: 'sm',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: { fontWeight: '750' },
  components: {
    Button: { defaultProps: { fw: 700 } },
    Paper: { defaultProps: { radius: 'md' } },
  },
})
