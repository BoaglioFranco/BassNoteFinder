import { Group, Text, type GroupProps } from '@mantine/core'
import type { ReactNode } from 'react'

interface ToolPanelHeaderProps extends Omit<GroupProps, 'children'> {
  title: string
  status?: ReactNode
}

export function ToolPanelHeader({ title, status, ...props }: ToolPanelHeaderProps) {
  return <Group
    component="header"
    justify="space-between"
    mih={{ base: 54, sm: 58 }}
    px={{ base: 'md', sm: 'lg' }}
    style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}
    {...props}
  >
    <Text component="h1" m={0} c="dark.7" fz="xs" fw={800} lts=".12em">{title}</Text>
    {status}
  </Group>
}
