import {
  createTheme,
  defaultVariantColorsResolver,
  parseThemeColor,
  type MantineColorsTuple,
  type VariantColorsResolver,
} from '@mantine/core'

const myColor: MantineColorsTuple = [
  '#f5f5f5', '#e7e7e7', '#cdcdcd', '#b2b2b2', '#9a9a9a',
  '#8b8b8b', '#848484', '#717171', '#1f1f1f', '#000000',
]

const variantColorResolver: VariantColorsResolver = (input) => {
  const colors = defaultVariantColorsResolver(input)
  const parsedColor = parseThemeColor({
    color: input.color || input.theme.primaryColor,
    theme: input.theme,
  })

  if (input.variant === 'filled' && parsedColor.isThemeColor && parsedColor.color === 'myColor') {
    return { ...colors, hover: 'var(--mantine-color-myColor-8)' }
  }

  return colors
}

export const theme = createTheme({
  colors: { myColor },
  primaryColor: 'myColor',
  primaryShade: 9,
  variantColorResolver,
  defaultRadius: 'sm',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: { fontWeight: '750' },
  components: {
    Button: { defaultProps: { fw: 700 } },
    Paper: { defaultProps: { radius: 'md' } },
  },
})
